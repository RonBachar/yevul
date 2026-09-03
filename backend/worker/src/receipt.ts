// The POST /ai/receipt endpoint, stage 5, docs/roadmap.md: "OCR לקבלות, אותו
// Worker, אותה מכסה חודשית משותפת עם הקול" — receipt OCR, the same Worker, the
// same shared monthly quota as voice.
//
// This is voice.ts's sibling, and almost everything in that file's header is
// true here too: the order of operations is the subject, the request is hostile
// input, a missing environment variable becomes a 500 rather than an obscure 401
// from the provider, and the distinct failure shapes stay distinct statuses
// because they are the only information the client has to tell the farmer
// whether to photograph again, wait, or upgrade.
//
// **Three things differ from voice, and only one of them is cosmetic.**
//
// **1. Receipts are a paid feature in full, so the gate is stricter.** prd.md
// section 9: "הקבלות הן פיצ'ר בתשלום במלואו. במסלול החינמי אין צילום, אין
// סריקה ואין ארכיון", and line 121 repeats it — available on paid plans only.
// Voice is different in kind: the free tier may record, ten times a month, and
// the eleventh is a 429. A receipt from a free tier farm is not the eleventh of
// anything, it is a feature he does not have, and it must be refused **without
// touching the counter**. gate() is asked for that with requireEntitlement, so
// the refusal happens between loading the farm and consuming the quota rather
// than after — see the comment above GateOptions in gate.ts. The refusal carries
// its own reason code, distinct from the gate's existing "no active farm", so
// the client can tell "upgrade" from "something is broken"; those are two
// different screens and a shared 403 would make the app guess between them.
//
// **2. The quota is the same counter, not a second one.** docs/roadmap.md is
// explicit that OCR shares the monthly allowance with voice, and prd.md appendix
// A.5 already said the three voice schemas share one. Nothing here implements
// that: it falls out of calling the same gate(), which calls the same
// consume_ai_quota with the same farm id. There is no receipt counter to keep in
// step with the voice one, which is the point.
//
// **3. The image format is detected, not declared.** Voice takes `format` from
// the client because m4a, mp3 and aac cannot be told apart cheaply and the
// recorder is the one that knows. An image needs no such trust — see
// detectImageFormat in openrouter.ts — and detecting it here closes the failure
// where a client mislabels a PNG, the provider answers 400, and the farmer has
// spent a scan to discover it. So the query string carries `today` and nothing
// else, and the image is the raw request body for the same reason the audio is:
// base64 inside a JSON envelope inflates the upload by a third, and these
// farmers are on rural cellular where that third is seconds of waiting.

import { isCalendarDate } from '@yevul/shared/src/safeHarvestDate';
import { parseReceipt } from '@yevul/shared/src/receipt';
import {
  callLogger,
  fail,
  json,
  missingConfigNames,
  readConfig,
  usageFields,
  LOGGED_CONTENT_CHARS,
} from './aiEndpoint';
import { gate, type Env } from './gate';
import { detectImageFormat, extractReceipt, type FetchLike, type ImageFormat } from './openrouter';

// ============================================================
// Limits.
// ============================================================

// **A memory and upload ceiling, and not a cost ceiling — that is the whole
// difference from voice's 4MB.** For audio the price scales with the length of
// the recording, so the cap there is directly a cap on the bill. An image does
// not work that way: the provider resizes it to a fixed tile budget before
// charging for it, so a 2MB photograph and an 8MB photograph of the same
// receipt cost within a rounding error of each other. The bill is already
// bounded by that flat per-image token cost and by the monthly quota, so raising
// the byte cap does not raise the ceiling on what a farm can spend.
//
// **8MB, and it is a ceiling on what this Worker can hold rather than on what a
// receipt should weigh.** This handler holds the bytes, then a base64 string
// about a third larger, then that string again inside the JSON request body:
// roughly 3.5x the upload, so about 30MB at the cap, comfortably inside a
// Worker's 128MB. At 32MB it would not be.
//
// **Client side compression has now shipped, and the number deliberately did not
// move.** The client resizes to 1600 pixels on the long edge before uploading
// (packages/shared/src/receiptImage.ts), which puts an ordinary receipt in the
// low hundreds of kilobytes — two orders of magnitude under this. An earlier
// version of this comment said the cap should come back down once that landed.
// It should not, and the reason is that compression is best effort on a device
// we do not control:
//
//   - the resize can fail, and when it does the client deliberately uploads the
//     original rather than losing the farmer's receipt (see compressedOrOriginal);
//   - a phone in the field runs whatever build it last updated to, and this
//     audience does not update promptly, so an uncompressed client is a client
//     that exists for months after the compressed one ships;
//   - the ceiling is not a cost control in the first place. The provider resizes
//     an image to a fixed tile budget before charging for it, so a 2MB and an 8MB
//     photograph of the same receipt cost within a rounding error of each other.
//     Tightening this saves nothing.
//
// So lowering it would convert the fallback path from "slower and heavier" into
// "refused", and it would refuse hardest on the oldest phone — the one most
// likely to have failed the resize in the first place. 413 stays what it always
// was: the last line of defence, not the normal path.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// ============================================================
// Request validation. **Everything here is hostile input**, and all of it is
// checked before any I/O happens and before the gate is asked anything.
// ============================================================

type RequestError = { status: 400 | 413; code: string };

type ParsedRequest = {
  today: string;
  format: ImageFormat;
  image: ArrayBuffer;
};

async function parseRequest(request: Request): Promise<ParsedRequest | RequestError> {
  const params = new URL(request.url).searchParams;

  // **The same prompt injection surface voice has, and the same fix.** `today`
  // is interpolated straight into the Hebrew instruction text that goes to the
  // model (receiptInstructionText in openrouter.ts), so an unvalidated value
  // lets any client append arbitrary instructions to our prompt. isCalendarDate
  // accepts nothing but YYYY-MM-DD, which leaves no room for injected text at
  // all, and it also rejects a date that rolled over (2026-02-31), which would
  // give the model a nonexistent day to bound the receipt's date against.
  const today = params.get('today');
  if (today === null || !isCalendarDate(today)) return { status: 400, code: 'invalid_today' };

  // **Content-Length is a courtesy, not the authority.** The header is client
  // supplied and may be absent on a chunked upload or simply wrong, so it can
  // only ever reject early, never accept. The real check is on the bytes
  // actually read, below.
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return { status: 413, code: 'image_too_large' };
  }

  const image = await request.arrayBuffer();
  if (image.byteLength === 0) return { status: 400, code: 'empty_image' };
  if (image.byteLength > MAX_IMAGE_BYTES) return { status: 413, code: 'image_too_large' };

  // **Last, and deliberately after the size check.** Reading magic bytes off a
  // buffer is free, but rejecting an oversized upload for its size is the more
  // useful answer than rejecting it for its format, and a 40MB PDF should be
  // told it is too large rather than sent away to be converted.
  //
  // A PDF and a HEIC both land here. Both are things a farmer might genuinely
  // hold — attachReceipt in packages/shared stores either one happily — and
  // neither is something this endpoint can read; see the IMAGE_FORMATS comment
  // in openrouter.ts for why each is excluded. One reason code covers all of
  // them, because from the client's side the answer is the same: this file
  // cannot be scanned, attach it without OCR or send a photograph instead.
  const format = detectImageFormat(image);
  if (format === null) return { status: 400, code: 'unsupported_format' };

  return { today, format, image };
}

function isRequestError(value: ParsedRequest | RequestError): value is RequestError {
  return 'code' in value;
}

const logCall = callLogger('ai_receipt');

// ============================================================
// The handler.
// ============================================================

export async function handleReceipt(
  request: Request,
  env: Env,
  // **fetch is a parameter and not the global**, for the reason it is one
  // everywhere in this feature: a test that forgets to inject a mock does not
  // compile, rather than quietly billing a real credit card. index.ts passes the
  // real one. gate() still uses the global fetch to reach Supabase, which costs
  // nothing and is what its own tests already stub.
  fetchImpl: FetchLike,
): Promise<Response> {
  // ---- 1. The request shape. Free, and no farmer pays for a bad upload. ----
  const parsed = await parseRequest(request);
  if (isRequestError(parsed)) return fail(parsed.code, parsed.status);

  // ---- 2. The deploy. Also free, and also before the quota. ----
  const config = readConfig(env);
  if (config === null) {
    logCall({ outcome: 'misconfigured', missing: missingConfigNames(env) });
    return fail('server_misconfigured', 500);
  }

  // ---- 3. The gate: auth, farm, **entitlement**, atomic quota consumption. ----
  //
  // requireEntitlement is what makes this endpoint paid-only, and asking gate()
  // for it rather than checking `entitled` on the result afterwards is the
  // difference between refusing a free tier farmer and charging him a month of
  // voice recordings for the refusal. gate() consumes the quota as part of its
  // own work and there is no way to give it back.
  //
  // Its statuses pass through untouched, exactly as they do in voice.ts:
  // re-mapping them here would only create a second place to keep in sync.
  const allowed = await gate(request, env, { requireEntitlement: true });
  if (!allowed.ok) return fail(allowed.reason, allowed.status);

  // ---- 4. OpenRouter. From here on, money has been spent. ----
  //
  // **Quota is consumed before this call and is not refunded when it fails**,
  // the same deliberate decision voice.ts documents and for the same reasons:
  // consume_ai_quota only increments, a decrement path is an abuse surface, and
  // the cost of the gap is one lost scan in the rare case OpenRouter is down.
  //
  // parsed is passed as-is: its three fields are exactly ReceiptRequest, and
  // spreading it into a fresh object would only hide the day they stop matching.
  const call = await extractReceipt(config, parsed, fetchImpl);

  if (!call.ok && call.failure === 'upstream') {
    // **502 and not 500.** We are the gateway and the failure is upstream of us.
    // To the client that is "try again in a minute", where a 500 from us would
    // mean "trying again will not help".
    logCall({
      outcome: 'upstream_failure',
      farmId: allowed.farmId,
      upstreamStatus: call.status,
      reason: call.reason,
    });
    return fail('upstream_unavailable', 502);
  }

  if (!call.ok) {
    // **422 and not 502.** The model answered, we were billed for the answer,
    // and the answer is unusable. The farmer's next move is a better photograph
    // rather than waiting.
    logCall({
      outcome: 'model_not_json',
      farmId: allowed.farmId,
      ...usageFields(call.usage),
      contentLength: call.content.length,
      contentPrefix: call.content.slice(0, LOGGED_CONTENT_CHARS),
    });
    return fail('model_output_unusable', 422);
  }

  // ---- 5. Validation of what the model actually returned. ----
  //
  // Same 422 as above, on purpose: from the client's point of view "not JSON at
  // all" and "JSON with an invented total in it" are the same event, a paid
  // answer that cannot be used. They are separate reason codes in the log
  // because to us they are different model faults.
  const record = parseReceipt(call.raw);
  if (!record.ok) {
    logCall({
      outcome: 'validation_failed',
      farmId: allowed.farmId,
      ...usageFields(call.usage),
      reason: record.reason,
    });
    return fail('model_output_invalid', 422);
  }

  logCall({
    outcome: 'ok',
    farmId: allowed.farmId,
    ...usageFields(call.usage),
    imageBytes: parsed.image.byteLength,
    imageFormat: parsed.format,
  });

  // **kind is 'expense', and the response deliberately looks like the voice
  // one minus the transcript.** A receipt produces the record the step 9
  // confirmation sheet already knows how to confirm; see the header of
  // packages/shared/src/receipt.ts. There is no transcript because the receipt
  // schema does not ask for one — the farmer is looking at the photograph he
  // just took, and a field that is structurally always null would be a promise
  // to fill it one day.
  return json({ kind: record.value.kind, value: record.value.value }, 200);
}
