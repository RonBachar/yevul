// The client transport for POST /ai/receipt, stage 5, docs/roadmap.md: "OCR
// לקבלות, אותו Worker, אותה מכסה חודשית משותפת עם הקול".
//
// **voiceClient.ts's sibling, and it keeps every promise that file makes.** It
// is the only place in the client that knows /ai/receipt's wire contract — the
// query string it takes, the raw bytes it wants in the body, and every status
// and reason code it can answer with. It reads no environment: the worker URL
// and the access token are parameters, so this module runs identically in the
// mobile app, the web app and a test. fetch is injected for the reason it is
// injected everywhere in this feature: a test that forgets the mock does not
// compile, rather than quietly spending a farmer's scan.
//
// **It photographs nothing.** The camera and the gallery are expo-image-picker,
// a native dependency that lives in the mobile app. This layer takes image bytes
// it is handed, which is also what makes it testable without a camera.
//
// **There is no retry here either**, and for the identical reason: the quota is
// consumed server side before OpenRouter is called and there is no refund path
// (see the gate call in backend/worker/src/receipt.ts). Retrying is a choice the
// farmer makes on a screen, out of a result that tells him it is worth making.
//
// ============================================================
// Three things differ from voice, and they are the same three the endpoint's own
// header names — from the client's side.
//
// **1. The 403 is two answers, not one, and that is why this module exists at
// all.** gate() can refuse a receipt for two unrelated reasons that share a
// status: `paid plan required`, which is an offer to upgrade, and
// `no active farm`, which is something broken the farmer cannot fix. voiceClient
// collapses every 403 into ourBug because on that route only the second one is
// reachable. Repeating that here would tell a free-tier farmer who has just
// photographed an invoice that "something went wrong at our end", when in fact
// nothing went wrong and there is a product to sell him. The reason code is the
// only thing that separates them, so this is the one place in the client that
// reads an error body's `error` field for meaning rather than for the log.
//
// **2. There is no `format` parameter.** Voice takes one because m4a, mp3 and
// aac cannot be told apart cheaply and the recorder is the one that knows. The
// endpoint detects an image's format from its magic bytes (detectImageFormat in
// the Worker's openrouter.ts), so there is nothing for this client to declare
// and no way for it to mislabel a file. The query string carries `today` and
// nothing else.
//
// **3. There is no transcript.** The farmer is looking at the photograph he just
// took; see the header of receipt.ts for why the schema does not ask for one.
// ============================================================

import { parseReceipt, type ReceiptParsed } from './receipt';
import {
  asRecord,
  describeError,
  readJson,
  reasonCode,
  VOICE_MESSAGE_KEYS,
  type VoiceFetch,
  type VoiceFetchInit,
  type VoiceFetchResponse,
} from './voiceClient';

// ============================================================
// The transport types.
//
// **Aliases of voiceClient's, and deliberately not a second declaration.** Both
// endpoints take raw bytes and answer with a JSON body, so the shape of the
// fetch they need is one shape, not two that happen to match today. Aliasing
// means the mobile edge can hand the same wrapped platform fetch to either
// route without a cast, and that the day the shape changes it changes once.
// The receipt-side names exist so a reader of this file is not asked why a
// receipt is uploaded through something called a voice fetch.
// ============================================================

export type ReceiptFetchInit = VoiceFetchInit;
export type ReceiptFetchResponse = VoiceFetchResponse;
export type ReceiptFetch = VoiceFetch;

export type ReceiptExtractionInput = {
  // The Worker's base URL, with or without a trailing slash. Injected, never
  // read from an environment here. See the header of this file.
  workerUrl: string;
  // The Supabase session access token, i.e. session.access_token from
  // useAuthSession. Injected for the same reason as the URL.
  accessToken: string;
  // YYYY-MM-DD in the device's timezone. Use deviceToday() from voiceClient.ts —
  // it is the same field, on the same Worker, for the same reason, and a second
  // implementation of "what day is it here" is how the two routes end up
  // resolving a date differently.
  today: string;
  // The photograph, as bytes. JPEG, PNG or WEBP; the endpoint reads the format
  // off the first bytes and answers 400 unsupported_format for anything else,
  // which this module maps to a sentence the farmer can act on.
  image: ArrayBuffer;
};

// ============================================================
// The result.
//
// **The discriminant is what the farmer should do next**, exactly as in
// voiceClient.ts, because that is the only distinction a screen can get wrong in
// a way he notices. Seven statuses collapse into seven next steps:
//
//   retryNow          Nobody answered. The network threw, or the Worker answered
//                     502 because OpenRouter did not answer it. A minute later
//                     might genuinely work.
//   photographAgain   Somebody answered, we were billed for the answer, and the
//                     answer is unusable (422, both reason codes). Waiting does
//                     not help; a straighter, better-lit photograph might.
//   upgradePlan       403 paid plan required. **The reason this file is not a
//                     copy of voiceClient.** Nothing is broken: receipts are a
//                     paid feature (prd.md section 9) and this farm is on the
//                     free tier. He is shown the offer, not an apology.
//   outOfScans        429. The month's shared allowance is gone. Nothing to try,
//                     and attaching the photograph to a typed expense still
//                     works.
//   fixPhoto          The image itself is the problem, and he can fix all three:
//                     no bytes at all (400 empty_image), too many (413), or a
//                     file this endpoint cannot read (400 unsupported_format,
//                     which is what an iPhone HEIC or a PDF invoice lands on).
//                     Three sentences, because they send him three different
//                     ways.
//   signIn            401. The session is gone or was never sent.
//   ourBug            Nothing he did caused it and nothing he does fixes it:
//                     500 (our deploy is misconfigured), 400 invalid_today (this
//                     client built the request wrong), **403 no active farm**,
//                     403 with a reason we do not recognise, and any answer
//                     whose body is not the shape the endpoint promises.
//
// **A malformed 200 is ourBug and not retryNow**, the same quota decision voice
// makes: the scan was already paid for by the time the body came back, so
// sending him round again would spend a second one on a fault that is ours.
// ============================================================

export type ReceiptNextStep =
  'retryNow' | 'photographAgain' | 'upgradePlan' | 'outOfScans' | 'fixPhoto' | 'signIn' | 'ourBug';

// **The Worker's PAID_PLAN_REQUIRED, second copy.** packages/shared must not
// depend on backend/worker, so the literal is written out here exactly as
// VOICE_AUDIO_FORMATS is a second copy of the Worker's AUDIO_FORMATS. The cost
// of the two drifting is bounded and visible: a 403 whose reason we no longer
// recognise falls through to ourBug, which is the safe side to fail on — we
// would rather apologise for a bug we do not have than offer a farmer an upgrade
// he may already have paid for.
export const RECEIPT_PAID_PLAN_REASON = 'paid plan required';

// The module hands back keys, never prose; the Hebrew lives in i18n.ts.
//
// **Two of these are voice's own keys and not copies of its sentences.**
// "we could not connect just now" and "something broke at our end, it is not
// your fault" say the identical thing whether he spoke or photographed, and a
// second Hebrew string with the same meaning is a second string to keep in step.
// Everything else is receipt-specific, because every other sentence either names
// the recording or names the camera.
export const RECEIPT_MESSAGE_KEYS = {
  retryNow: VOICE_MESSAGE_KEYS.retryNow,
  ourBug: VOICE_MESSAGE_KEYS.ourBug,
  photographAgain: 'receipt.error.photographAgain',
  upgradePlan: 'receipt.error.paidPlan',
  outOfScans: 'receipt.error.outOfScans',
  noPhoto: 'receipt.error.noPhoto',
  tooLarge: 'receipt.error.tooLarge',
  unsupportedFile: 'receipt.error.unsupportedFile',
  signIn: 'receipt.error.signIn',
} as const;

export type ReceiptSuccess = {
  ok: true;
  // Always kind 'expense'. ReceiptParsed is Extract<VoiceParsed, {kind:'expense'}>,
  // so this hands straight to the step 9 confirmation panel with no narrowing.
  parsed: ReceiptParsed;
};

export type ReceiptFailure = {
  ok: false;
  nextStep: ReceiptNextStep;
  messageKey: string;
  // **Never shown to anyone.** The endpoint's reason code when it sent one, or a
  // client side code when it did not. For logs and for tests.
  reason: string;
  // null when no answer arrived at all.
  status: number | null;
};

export type ReceiptClientResult = ReceiptSuccess | ReceiptFailure;

function failure(
  nextStep: ReceiptNextStep,
  messageKey: string,
  reason: string,
  status: number | null,
): ReceiptFailure {
  return { ok: false, nextStep, messageKey, reason, status };
}

function ourBug(reason: string, status: number | null): ReceiptFailure {
  return failure('ourBug', RECEIPT_MESSAGE_KEYS.ourBug, reason, status);
}

// ============================================================
// Building the request.
//
// encodeURIComponent and not URLSearchParams, for the reason voiceClient gives:
// URLSearchParams is a platform global and packages/shared declares none.
// ============================================================

function receiptUrl(input: ReceiptExtractionInput): string {
  const base = input.workerUrl.replace(/\/+$/, '');
  return `${base}/ai/receipt?today=${encodeURIComponent(input.today)}`;
}

// ============================================================
// Status to next step. Every status the endpoint documents, plus the ones only
// something between us and it can produce.
// ============================================================

function mapErrorStatus(status: number, code: string): ReceiptFailure {
  if (status === 400) {
    // **Two of the three 400s are his to act on, where voice has one.**
    // empty_image means we sent no bytes at all. unsupported_format means the
    // file is a PDF, a HEIC or a GIF — all of which a farmer genuinely holds,
    // all of which attachReceipt stores happily, and none of which this endpoint
    // reads. Both are fixed by pointing the camera at the paper again.
    // invalid_today is the only one he cannot touch: `today` is built by this
    // client from the device clock, so a rejection means we built it wrong.
    if (code === 'empty_image') {
      return failure('fixPhoto', RECEIPT_MESSAGE_KEYS.noPhoto, code, status);
    }
    if (code === 'unsupported_format') {
      return failure('fixPhoto', RECEIPT_MESSAGE_KEYS.unsupportedFile, code, status);
    }
    return ourBug(code, status);
  }

  if (status === 401) return failure('signIn', RECEIPT_MESSAGE_KEYS.signIn, code, status);

  // **The split this whole module exists for.** Both 403s come out of gate.ts
  // and share a status; only the reason code tells them apart, and they send the
  // farmer to two different screens. Anything else with a 403 — including a body
  // a proxy stripped the reason out of — stays ourBug, because an upgrade offer
  // we cannot substantiate is worse than an apology.
  if (status === 403) {
    if (code === RECEIPT_PAID_PLAN_REASON) {
      return failure('upgradePlan', RECEIPT_MESSAGE_KEYS.upgradePlan, code, status);
    }
    return ourBug(code, status);
  }

  if (status === 413) {
    return failure('fixPhoto', RECEIPT_MESSAGE_KEYS.tooLarge, code, status);
  }

  // 422, both reason codes. The model answered and we paid for the answer, so
  // the photograph has to be taken again rather than sent again.
  if (status === 422) {
    return failure('photographAgain', RECEIPT_MESSAGE_KEYS.photographAgain, code, status);
  }

  // **429 on this route is worth reading twice.** Receipts require an
  // entitlement, and gate() passes a null limit for an entitled farm, so the
  // counter cannot actually refuse one — which means today a 429 here is only
  // reachable through gate.ts's known mapping of a failed Supabase RPC onto this
  // status (recorded in the stage 5 step 10 commit). It is still mapped as the
  // contract states rather than as that bug behaves: the fix belongs in the
  // Worker, and the day stage 7 puts a real cap on a paid plan this sentence
  // becomes literally true with no code change here.
  if (status === 429) {
    return failure('outOfScans', RECEIPT_MESSAGE_KEYS.outOfScans, code, status);
  }

  // 500 is only ever server_misconfigured, and a missing environment variable
  // will still be missing in a minute. 502 is OpenRouter not answering, which is
  // exactly the kind of thing that resolves on its own.
  if (status === 500) return ourBug(code, status);
  if (status === 502) return failure('retryNow', RECEIPT_MESSAGE_KEYS.retryNow, code, status);

  // 503, 504 and the rest of the gateway family. The endpoint never sends these,
  // so they come from Cloudflare or from something between us and it.
  if (status > 500) return failure('retryNow', RECEIPT_MESSAGE_KEYS.retryNow, code, status);

  // Anything else, a 404 from a wrong base URL included, is a client or a deploy
  // that does not match this code.
  return ourBug(code, status);
}

// ============================================================
// The call.
// ============================================================

export async function requestReceiptExtraction(
  input: ReceiptExtractionInput,
  fetchImpl: ReceiptFetch,
): Promise<ReceiptClientResult> {
  let response: ReceiptFetchResponse;
  try {
    response = await fetchImpl(receiptUrl(input), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        // The image is the raw request body, not base64 inside a JSON envelope:
        // base64 inflates the upload by about a third, and a receipt photograph
        // is already the largest thing this app sends over rural cellular.
        // Android's fetch additionally requires a Content-Type to take an
        // ArrayBuffer body at all — see the investigation in the mobile edge.
        'Content-Type': 'application/octet-stream',
      },
      body: input.image,
    });
  } catch (error) {
    // The request never arrived, so nothing was billed and no quota moved. This
    // is the one failure where trying again really is free, and it is still the
    // farmer who decides to.
    return failure('retryNow', RECEIPT_MESSAGE_KEYS.retryNow, describeError(error), null);
  }

  const body = await readJson(response);

  if (response.status !== 200) return mapErrorStatus(response.status, reasonCode(body));

  // ---- A 200 still has to prove it is one of ours. ----

  if (!body.read) return ourBug('response_not_json', response.status);

  const payload = asRecord(body.value);
  if (payload === null) return ourBug('response_not_an_object', response.status);

  // **Checked even though there is only one kind this route can produce.** The
  // answer's own kind is the endpoint's claim about what it validated; accepting
  // a body labelled 'journal' as an expense because we only ever ask for one
  // would validate whichever fields happened to line up.
  if (payload.kind !== 'expense') return ourBug('kind_mismatch', response.status);

  const parsed = parseReceipt(payload.value);
  if (!parsed.ok) return ourBug('value_invalid', response.status);

  return { ok: true, parsed: parsed.value };
}
