// The client transport for POST /ai/voice, stage 5, docs/roadmap.md.
//
// This module is the exact mirror of backend/worker/src/voice.ts, and it is the
// only place in the client that knows that endpoint's wire contract: the query
// string it takes, the raw bytes it wants in the body, and every status and
// reason code it can answer with. A screen talking to the endpoint directly
// would be a second copy of that contract, and the two would drift the first
// time the Worker gains a status.
//
// **It records nothing.** Recording is expo-audio, a native dependency, and a
// later step. This layer takes audio bytes it is handed, which is also what
// makes it testable without a microphone.
//
// **Zero configuration, like the rest of packages/shared.** The worker base URL
// and the Supabase access token are parameters, never process.env,
// import.meta.env or expo-constants. This package runs identically in the
// mobile app, the web app and the Worker itself, and a module that reads an
// environment is a module that runs in only one of them. fetch is injected for
// exactly the reason the Worker injects it: a test that forgets a mock must not
// be able to reach the network, and here that means it does not compile.
//
// **There is no retry in this layer, deliberately.** The quota is consumed
// server side, before OpenRouter is called, and there is no refund path (see
// the comment above the gate call in backend/worker/src/voice.ts). A blind
// retry from here is therefore a second charge against the farmer's ten
// monthly recordings for one recording he made once. Retrying is a choice the
// farmer makes on a screen, out of a result that tells him it is worth making,
// and never something this layer does behind his back.
//
// **The request is not pre-validated against the endpoint's own rules.** The
// endpoint is the authority on what a valid request is, it rejects malformed
// ones for free and before the quota, and a second copy of those rules here
// would be one more thing to keep in sync for no gain.

import { formatLocalDateOnly } from './safeHarvestDate';
import { parseVoiceResult, type VoiceKind, type VoiceParsed } from './voice';

// ============================================================
// Today, in the device's timezone.
//
// **This is the whole reason `today` is a client supplied field.** The Worker
// runs in UTC, so after 21:00 Israel time in summer it is already on tomorrow's
// date, and a farmer saying "yesterday" at 22:00 would have the model resolve
// it one day off. The wrong day would then land in his books.
//
// **Not toISOString().** That converts to UTC and reintroduces the exact bug
// the field exists to prevent: at 23:30 local the UTC day is already tomorrow,
// and at 00:30 local it is still yesterday. Reading the local getters is the
// entire point, and that is all formatLocalDateOnly does — it lives in
// safeHarvestDate.ts, beside the UTC formatter it must not be confused with,
// and it is the one implementation of this in the repo.
//
// What stays here is the *reason* the voice contract needs it, which is not
// obvious from the helper's own file. `now` is a parameter with a default so
// this stays pure and testable; callers just write deviceToday().
// ============================================================

export function deviceToday(now: Date = new Date()): string {
  return formatLocalDateOnly(now);
}

// ============================================================
// The transport types.
//
// Narrow on purpose, exactly what this module sends and reads and nothing more,
// the same choice FetchInit makes in backend/worker/src/openrouter.ts. A full
// fetch signature would force every test mock to supply fields nobody here
// touches, and would hide what is actually on the wire. A real fetch satisfies
// these structurally, so the mobile caller can pass the platform one straight
// in, and a caller on a platform whose fetch cannot take an ArrayBuffer body
// can wrap it here rather than anywhere else.
// ============================================================

export type VoiceFetchInit = {
  method: string;
  headers: Record<string, string>;
  // The audio is the raw request body, not base64 inside a JSON envelope.
  // base64 inflates the upload by about a third, and these farmers are on rural
  // cellular where that third is measured in seconds of waiting.
  body: ArrayBuffer;
};

export type VoiceFetchResponse = {
  status: number;
  json: () => Promise<unknown>;
};

export type VoiceFetch = (url: string, init: VoiceFetchInit) => Promise<VoiceFetchResponse>;

// The formats the endpoint accepts in `format`. **The authoritative list is
// AUDIO_FORMATS in backend/worker/src/openrouter.ts**, and this is a second
// copy of it only because packages/shared must not depend on the Worker. The
// day a format is added there and not here, the client simply cannot ask for
// it; the day one is removed there and not here, the endpoint answers 400
// invalid_format, which this module maps to "our bug" precisely because a
// client asking for a format the server does not know is a client that got
// ahead of its server.
export const VOICE_AUDIO_FORMATS = ['m4a', 'mp3', 'wav', 'ogg', 'flac', 'webm', 'aac'] as const;

export type VoiceAudioFormat = (typeof VOICE_AUDIO_FORMATS)[number];

export type VoiceExtractionInput = {
  // The Worker's base URL, with or without a trailing slash. Injected, never
  // read from an environment here. See the header of this file.
  workerUrl: string;
  // The Supabase session access token, i.e. session.access_token from
  // useAuthSession. Injected for the same reason as the URL.
  accessToken: string;
  kind: VoiceKind;
  // YYYY-MM-DD in the device's timezone. Use deviceToday().
  today: string;
  audio: ArrayBuffer;
  // Omitted means "whatever the endpoint's default is". **There is deliberately
  // no default value here**, because there is already one in the Worker, and a
  // second copy would be a second thing to change the day it moves. The
  // parameter exists at all because whoever holds the file is who knows its
  // format.
  format?: VoiceAudioFormat;
};

// ============================================================
// The result.
//
// **The discriminant is what the farmer should do next, not the status code**,
// because that is the only distinction the screen actually needs and the only
// one it can get wrong in a way he notices. Six statuses collapse into six next
// steps, and grouping them here rather than in the screen means a new status
// from the Worker is one edit in one file.
//
// The grouping, and why each status lands where it does:
//
//   retryNow         Nobody answered. The network threw, or the Worker answered
//                    502 because OpenRouter did not answer it. Trying again in
//                    a minute genuinely might work.
//   recordAgain      Somebody answered, we were billed for the answer, and the
//                    answer is unusable (422, both reason codes). Waiting does
//                    not help; saying it differently might.
//   outOfRecordings  429. The month's allowance is gone. Nothing to try, and
//                    the manual forms still work.
//   fixRecording     The audio itself is the problem: no bytes at all (400
//                    empty_audio) or too many (413). The farmer can fix this,
//                    and it is the one bucket that carries two sentences,
//                    because "we heard nothing" and "that was too long" send
//                    him in opposite directions.
//   signIn           401. The session is gone or was never sent. Not a failure
//                    of the recording, and not something a retry fixes.
//   ourBug           Nothing the farmer did caused it and nothing he does fixes
//                    it: 500 (our deploy is misconfigured), 400 on kind, today
//                    or format (this client built the request wrong), 403 (we
//                    let a user with no farm reach a screen that needs one),
//                    and any answer whose body is not the shape the endpoint
//                    promises.
//
// **A malformed 200 is in ourBug and not in retryNow, and that is a quota
// decision.** The quota was already spent by the time the body came back, so
// telling the farmer to try again would spend a second recording out of ten on
// a fault that is ours and that will repeat.
// ============================================================

export type VoiceNextStep =
  'retryNow' | 'recordAgain' | 'outOfRecordings' | 'fixRecording' | 'signIn' | 'ourBug';

// The module hands back keys, never prose. The Hebrew lives in i18n.ts with
// every other string the farmer reads, and the screen calls t() on this.
export const VOICE_MESSAGE_KEYS = {
  retryNow: 'voice.error.retryNow',
  recordAgain: 'voice.error.recordAgain',
  outOfRecordings: 'voice.error.outOfRecordings',
  noSound: 'voice.error.noSound',
  tooLong: 'voice.error.tooLong',
  signIn: 'voice.error.signIn',
  ourBug: 'voice.error.ourBug',
} as const;

export type VoiceSuccess = {
  ok: true;
  parsed: VoiceParsed;
  // Display data, "this is what we heard", not a field of the record. null when
  // the endpoint had none to give.
  transcript: string | null;
};

export type VoiceFailure = {
  ok: false;
  nextStep: VoiceNextStep;
  messageKey: string;
  // **Never shown to anyone.** The endpoint's reason code when it sent one, or
  // a client side code when it did not. For logs and for tests, exactly like
  // `reason` on VoiceParseResult.
  reason: string;
  // null when no answer arrived at all.
  status: number | null;
};

export type VoiceClientResult = VoiceSuccess | VoiceFailure;

function failure(
  nextStep: VoiceNextStep,
  messageKey: string,
  reason: string,
  status: number | null,
): VoiceFailure {
  return { ok: false, nextStep, messageKey, reason, status };
}

function ourBug(reason: string, status: number | null): VoiceFailure {
  return failure('ourBug', VOICE_MESSAGE_KEYS.ourBug, reason, status);
}

// ============================================================
// Building the request.
// ============================================================

// **encodeURIComponent and not URLSearchParams.** URLSearchParams is a platform
// global, not an ECMAScript one, and packages/shared declares no environment
// globals on purpose (see the packages block in eslint.config.js). The three
// values are short scalars from closed sets and a validated date, so building
// the string by hand costs nothing and keeps this package environment free.
function voiceUrl(input: VoiceExtractionInput): string {
  const base = input.workerUrl.replace(/\/+$/, '');
  const params = [
    `kind=${encodeURIComponent(input.kind)}`,
    `today=${encodeURIComponent(input.today)}`,
  ];
  // Absent means absent. Sending an explicit format when the caller did not ask
  // for one would move the default from the Worker to here.
  if (input.format !== undefined) params.push(`format=${encodeURIComponent(input.format)}`);
  return `${base}/ai/voice?${params.join('&')}`;
}

// ============================================================
// Reading the answer. **Everything below treats the response body as hostile**,
// exactly as the Worker treats the model's output. A 200 is a claim about the
// transport, not a promise about the content: the endpoint could be a version
// ahead of this client, or the answer could have come from a captive portal or
// a proxy rather than from us at all.
// ============================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readJson(
  response: VoiceFetchResponse,
): Promise<{ read: true; value: unknown } | { read: false }> {
  try {
    return { read: true, value: await response.json() };
  } catch {
    return { read: false };
  }
}

// The endpoint's error bodies are always { error: code }. A body without one is
// not from the endpoint, and the caller only needs a stable string for the log.
function reasonCode(body: { read: true; value: unknown } | { read: false }): string {
  if (!body.read) return 'no_reason_body';
  const code = asRecord(body.value)?.error;
  return typeof code === 'string' && code.trim() !== '' ? code : 'no_reason_code';
}

// transcript is display data, so a value of the wrong type is dropped rather
// than treated as a broken contract. It never reaches the database and the
// farmer confirms the record anyway, which is not true of a single other field.
function readTranscript(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================
// Status to next step. Every status the endpoint documents, plus the ones only
// something between us and it can produce.
// ============================================================

function mapErrorStatus(status: number, code: string): VoiceFailure {
  if (status === 400) {
    // **Only one of the four 400s is the farmer's to act on.** empty_audio
    // means we sent no bytes: the microphone gave us nothing, and recording
    // again is exactly the right move. invalid_kind, invalid_today and
    // invalid_format all mean this client built the request wrong, which he can
    // do nothing about.
    if (code === 'empty_audio') {
      return failure('fixRecording', VOICE_MESSAGE_KEYS.noSound, code, status);
    }
    return ourBug(code, status);
  }

  // 401 is its own step because its fix is neither recording nor waiting.
  if (status === 401) return failure('signIn', VOICE_MESSAGE_KEYS.signIn, code, status);

  // 403 is "no active farm". The farmer cannot create himself a farm from a
  // recording screen, so from where he stands this is our bug and not his.
  if (status === 403) return ourBug(code, status);

  if (status === 413) {
    return failure('fixRecording', VOICE_MESSAGE_KEYS.tooLong, code, status);
  }

  // 422, both reason codes. The model answered and we paid for the answer, so
  // the recording has to be made again rather than sent again.
  if (status === 422) {
    return failure('recordAgain', VOICE_MESSAGE_KEYS.recordAgain, code, status);
  }

  if (status === 429) {
    return failure('outOfRecordings', VOICE_MESSAGE_KEYS.outOfRecordings, code, status);
  }

  // **500 and 502 part ways here, which is the reason the Worker keeps them
  // apart.** 500 is only ever server_misconfigured, and a missing environment
  // variable will still be missing in a minute. 502 is OpenRouter not
  // answering, which is exactly the kind of thing that resolves on its own.
  if (status === 500) return ourBug(code, status);
  if (status === 502) return failure('retryNow', VOICE_MESSAGE_KEYS.retryNow, code, status);

  // 503, 504 and the rest of the gateway family. The endpoint never sends
  // these, so they come from Cloudflare or from something between us and it,
  // and they mean the same thing 502 does.
  if (status > 500) return failure('retryNow', VOICE_MESSAGE_KEYS.retryNow, code, status);

  // Anything else, a 404 from a wrong base URL included, is a client or a
  // deploy that does not match this code.
  return ourBug(code, status);
}

// ============================================================
// The call.
// ============================================================

export async function requestVoiceExtraction(
  input: VoiceExtractionInput,
  // A parameter and not the global, for the same reason it is one in
  // backend/worker/src/openrouter.ts: a test that forgets the mock does not
  // compile, rather than quietly spending a farmer's monthly allowance.
  fetchImpl: VoiceFetch,
): Promise<VoiceClientResult> {
  let response: VoiceFetchResponse;
  try {
    response = await fetchImpl(voiceUrl(input), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: input.audio,
    });
  } catch (error) {
    // The request never arrived, so nothing was billed and no quota moved.
    // This is the one failure where trying again really is free, and it is
    // still the farmer who decides to.
    return failure('retryNow', VOICE_MESSAGE_KEYS.retryNow, describeError(error), null);
  }

  const body = await readJson(response);

  if (response.status !== 200) return mapErrorStatus(response.status, reasonCode(body));

  // ---- A 200 still has to prove it is one of ours. ----

  if (!body.read) return ourBug('response_not_json', response.status);

  const payload = asRecord(body.value);
  if (payload === null) return ourBug('response_not_an_object', response.status);

  // **kind is checked before value is parsed, and that order matters.**
  // parseVoiceResult validates against the kind it is given, so handing it the
  // requested kind without first checking the answer's own would validate an
  // expense body as a journal and quietly accept whichever fields happened to
  // line up.
  if (payload.kind !== input.kind) return ourBug('kind_mismatch', response.status);

  const parsed = parseVoiceResult(input.kind, payload.value);
  if (!parsed.ok) return ourBug('value_invalid', response.status);

  return { ok: true, parsed: parsed.value, transcript: readTranscript(payload.transcript) };
}
