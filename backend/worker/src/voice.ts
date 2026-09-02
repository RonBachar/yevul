// The POST /ai/voice endpoint, stage 5, docs/roadmap.md: "OpenRouter
// integration, Hebrew transcription, then an LLM that returns structured JSON
// matching one of the three schemas: expense, task, journal".
//
// Every layer below this one already exists and is tested in isolation. This
// file is the wiring, and it owns exactly the three things none of them can:
//
//   1. It decides what a request must look like **before a single cent is
//      spent**, treating the query string and the body as hostile input.
//   2. It turns a missing environment variable into a 500 with a clear reason,
//      instead of an obscure 401 from the provider halfway down the chain.
//      Env declares OPENROUTER_MODEL and OPENROUTER_MODEL_FALLBACK as optional
//      on purpose (see the comment on Env in gate.ts): the type describes what
//      wrangler actually injects, and the wiring layer is where absence becomes
//      a decision.
//   3. It keeps the three failure shapes that gate, extractVoice and
//      parseVoiceResult already distinguish as three distinct HTTP statuses.
//      Collapsing them would throw away the only information the client has to
//      tell the farmer whether to record again, wait, or call for help.
//
// **The order of operations is the point of this file, not an implementation
// detail.** Shape validation and config validation both run BEFORE gate().
// gate() consumes a month of quota atomically and there is no way to give it
// back, so a malformed request or a misconfigured deploy must never cost a
// farmer one of his ten monthly recordings. See the comment above the call.
//
// **The audio is the raw request body, and the metadata is in the query
// string**, not base64 inside a JSON envelope. base64 inflates the audio by
// about a third on the wire, and this app's users are on rural cellular where
// that third is measured in seconds of waiting. The Worker reads
// `await request.arrayBuffer()` and hands the bytes straight to extractVoice,
// which does the base64 conversion once, on the way out to OpenRouter.

import { isCalendarDate } from '@yevul/shared/src/safeHarvestDate';
import { parseVoiceResult, VOICE_KINDS, type VoiceKind } from '@yevul/shared/src/voice';
import { gate, type Env } from './gate';
import {
  AUDIO_FORMATS,
  extractVoice,
  type AudioFormat,
  type FetchLike,
  type OpenRouterConfig,
  type VoiceUsage,
} from './openrouter';

// ============================================================
// Limits.
// ============================================================

// **A cost ceiling, not hygiene.** Step 5 measured the real price on the
// primary model: six seconds of audio cost $0.00134, and the price scales with
// the length of the audio. The request body is entirely under the client's
// control, so an unbounded upload is an unbounded bill.
//
// expo-audio's RecordingPresets.HIGH_QUALITY, which is what the app records
// with on both platforms, encodes at 128 kbps, i.e. 16KB per second. A two
// minute recording is therefore about 1.9MB. 4MB is roughly double that: it
// accepts every recording a farmer will realistically make, plus headroom for
// a higher-bitrate encode on some future device, while capping one call at
// about four minutes of audio, roughly $0.05 at the measured rate. Ten of
// those is the entire free monthly quota, so the worst case a single farm can
// bill in a month stays bounded and small.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// The default matches openrouter.ts: RecordingPresets.HIGH_QUALITY produces m4a
// on both platforms and nothing in the pipeline converts it. The parameter
// exists because whoever holds the file is who knows its format.
const DEFAULT_AUDIO_FORMAT: AudioFormat = 'm4a';

// A parse failure returns the model's raw text so this layer can log it, and
// that text contains the farmer's own words. Only a bounded prefix is written
// to the log: enough to tell a response truncated at max_tokens from a model
// that ignored the schema entirely, which are two completely different faults,
// without retaining a full transcript in Cloudflare's log stream.
const LOGGED_CONTENT_CHARS = 200;

// ============================================================
// The response.
//
// **Reason codes are machine readable and stable**, because the client picks
// which Hebrew sentence to show the farmer from them. A human-readable string
// here would mean the mobile app matching on prose.
// ============================================================

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fail(code: string, status: number): Response {
  return json({ error: code }, status);
}

// ============================================================
// Request validation. **Everything here is hostile input**: the query string
// and the body both come from a client we do not control, and all of it is
// checked before any I/O happens.
// ============================================================

type RequestError = { status: 400 | 413; code: string };

type ParsedRequest = {
  kind: VoiceKind;
  today: string;
  format: AudioFormat;
  audio: ArrayBuffer;
};

function parseKind(value: string | null): VoiceKind | null {
  // The cast is on the list and not on the value: widening the readonly tuple
  // to string[] lets an arbitrary string be tested against it without ever
  // claiming it is a VoiceKind before the check passes.
  return value !== null && (VOICE_KINDS as readonly string[]).includes(value)
    ? (value as VoiceKind)
    : null;
}

function parseFormat(value: string | null): AudioFormat | null | undefined {
  // Absent is legitimate and means the default. An unknown string is not the
  // default, it is a client bug or a probe, and it gets rejected.
  if (value === null) return null;
  return (AUDIO_FORMATS as readonly string[]).includes(value) ? (value as AudioFormat) : undefined;
}

async function parseRequest(request: Request): Promise<ParsedRequest | RequestError> {
  const params = new URL(request.url).searchParams;

  const kind = parseKind(params.get('kind'));
  if (kind === null) return { status: 400, code: 'invalid_kind' };

  // **This is the prompt injection fix that step 4 deferred to this step.**
  // `today` is interpolated straight into the Hebrew instruction text that goes
  // to the model (see instructionText in openrouter.ts), so an unvalidated
  // value lets any client append arbitrary instructions to our prompt. It is
  // not merely a format check: isCalendarDate accepts nothing but YYYY-MM-DD,
  // which leaves no room for injected text at all. It also rejects dates that
  // rolled over (2026-02-31), which would make the model resolve "yesterday"
  // against a day that does not exist.
  const today = params.get('today');
  if (today === null || !isCalendarDate(today)) return { status: 400, code: 'invalid_today' };

  const format = parseFormat(params.get('format'));
  if (format === undefined) return { status: 400, code: 'invalid_format' };

  // **Content-Length is checked first as a courtesy, not as the authority.**
  // The header is client-supplied and may be absent on a chunked upload or
  // simply wrong, so it can only ever reject early, never accept. The real
  // check is on the bytes actually read, below.
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    return { status: 413, code: 'audio_too_large' };
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) return { status: 400, code: 'empty_audio' };
  if (audio.byteLength > MAX_AUDIO_BYTES) return { status: 413, code: 'audio_too_large' };

  return { kind, today, format: format ?? DEFAULT_AUDIO_FORMAT, audio };
}

function isRequestError(value: ParsedRequest | RequestError): value is RequestError {
  return 'code' in value;
}

// ============================================================
// Environment configuration.
//
// The three values are optional on Env because that is the truth about what
// wrangler injects, and a var deleted from wrangler.toml simply does not exist
// at runtime. Here is where absence becomes an answer.
// ============================================================

function readConfig(env: Env): OpenRouterConfig | null {
  const { OPENROUTER_API_KEY: apiKey, OPENROUTER_MODEL: model } = env;
  const fallbackModel = env.OPENROUTER_MODEL_FALLBACK;

  if (!apiKey || !model || !fallbackModel) return null;
  return { apiKey, model, fallbackModel };
}

// The names of the missing vars go to the log, never to the response. This
// check runs before gate, so an unauthenticated caller can reach it, and there
// is no reason to tell that caller how our deploy is wired.
function missingConfigNames(env: Env): string[] {
  return [
    env.OPENROUTER_API_KEY ? null : 'OPENROUTER_API_KEY',
    env.OPENROUTER_MODEL ? null : 'OPENROUTER_MODEL',
    env.OPENROUTER_MODEL_FALLBACK ? null : 'OPENROUTER_MODEL_FALLBACK',
  ].filter((name): name is string => name !== null);
}

// ============================================================
// Server side accounting.
//
// **The cost and the model id never go to the client.** They are our books,
// not the farmer's business, and shipping them would also tell anyone holding
// a token exactly which provider to price against. They go to console.log
// instead, which is what `wrangler tail` streams, so the cost of a real call
// is observable the moment it happens.
//
// **Nothing on the success path logs the transcript or the audio.** That is the
// farmer speaking, and it has no place in an operational log. The one exception
// is a parse failure, where a bounded prefix of the model's raw text is logged
// because it is the only way to tell the two failure modes apart. See
// LOGGED_CONTENT_CHARS above.
// ============================================================

function logCall(fields: Record<string, unknown>): void {
  // One JSON line per call, so `wrangler tail` output stays greppable and a log
  // drain can parse it later without a format change.
  console.log(JSON.stringify({ event: 'ai_voice', ...fields }));
}

function usageFields(usage: VoiceUsage): Record<string, unknown> {
  return { model: usage.model, costUsd: usage.costUsd };
}

// ============================================================
// The handler.
// ============================================================

export async function handleVoice(
  request: Request,
  env: Env,
  // **fetch is a parameter and not the global, for the same reason it is in
  // openrouter.ts**: a test that forgets to inject a mock does not compile,
  // rather than quietly billing a real credit card. index.ts passes the real
  // one. Note that gate() still uses the global fetch to reach Supabase, which
  // costs nothing and is what its own tests already stub.
  fetchImpl: FetchLike,
): Promise<Response> {
  // ---- 1. The request shape. Free, and no farmer pays for a typo. ----
  const parsed = await parseRequest(request);
  if (isRequestError(parsed)) return fail(parsed.code, parsed.status);

  // ---- 2. The deploy. Also free, and also before the quota. ----
  //
  // **A misconfigured deploy must not burn a single farmer's allowance.** If
  // this check sat after gate(), the first ten farmers to try after a bad
  // deploy would each lose their whole month to a call that never left the
  // Worker. Checking it here costs one object lookup and the failure is ours,
  // not theirs.
  const config = readConfig(env);
  if (config === null) {
    logCall({ outcome: 'misconfigured', missing: missingConfigNames(env) });
    return fail('server_misconfigured', 500);
  }

  // ---- 3. The gate: auth, farm, atomic quota consumption. ----
  //
  // Its statuses pass through untouched. 401, 403 and 429 already mean exactly
  // what the client needs them to mean, and its reason strings are stable, so
  // re-mapping them here would only create a second place to keep in sync.
  const allowed = await gate(request, env);
  if (!allowed.ok) return fail(allowed.reason, allowed.status);

  // ---- 4. OpenRouter. From here on, money has been spent. ----
  //
  // **Quota is consumed before this call and is not refunded when it fails.**
  // That is a deliberate decision, not an oversight: consume_ai_quota only
  // increments, so a refund means a new migration and a decrement path, and a
  // decrement path is exactly the kind of thing that turns into an abuse
  // surface the day something else can reach it. Against that, the cost of the
  // gap is one lost recording out of ten in a month, in the rare case where
  // OpenRouter itself is down. Building an untested refund against a failure
  // mode we have never actually observed in production would be the more
  // expensive mistake. Recorded in docs/open-items.md so it does not quietly
  // become permanent.
  //
  // parsed is passed as-is: its four fields are exactly VoiceRequest, and
  // spreading it into a fresh object would only hide the day they stop matching.
  const call = await extractVoice(config, parsed, fetchImpl);

  if (!call.ok && call.failure === 'upstream') {
    // **502 and not 500.** We are the gateway here and the failure is upstream
    // of us, which is precisely what 502 means. The distinction matters to the
    // client: 502 is "try again in a minute", while a 500 from us would mean
    // "trying again will not help".
    logCall({
      outcome: 'upstream_failure',
      farmId: allowed.farmId,
      kind: parsed.kind,
      upstreamStatus: call.status,
      reason: call.reason,
    });
    return fail('upstream_unavailable', 502);
  }

  if (!call.ok) {
    // **422 and not 502.** The model answered, we were billed for the answer,
    // and the answer is unusable. That is a different fact from "nobody
    // answered", and the farmer's next move is different too: record again,
    // rather than wait.
    logCall({
      outcome: 'model_not_json',
      farmId: allowed.farmId,
      kind: parsed.kind,
      ...usageFields(call.usage),
      contentLength: call.content.length,
      contentPrefix: call.content.slice(0, LOGGED_CONTENT_CHARS),
    });
    return fail('model_output_unusable', 422);
  }

  // ---- 5. Validation of what the model actually returned. ----
  //
  // Same 422 as above, and on purpose: from the client's point of view "not
  // JSON at all" and "JSON with an invented date in it" are the same event, a
  // paid answer that cannot be used. They are separate reason codes in the log
  // because to us they are different model faults.
  const record = parseVoiceResult(parsed.kind, call.raw);
  if (!record.ok) {
    logCall({
      outcome: 'validation_failed',
      farmId: allowed.farmId,
      kind: parsed.kind,
      ...usageFields(call.usage),
      reason: record.reason,
    });
    return fail('model_output_invalid', 422);
  }

  logCall({
    outcome: 'ok',
    farmId: allowed.farmId,
    kind: parsed.kind,
    ...usageFields(call.usage),
    audioBytes: parsed.audio.byteLength,
  });

  // transcript is display data and not a field of the record, "this is what we
  // heard". It ships even when it is null, so the client has one response shape
  // to read instead of two.
  return json(
    { kind: record.value.kind, transcript: call.transcript, value: record.value.value },
    200,
  );
}
