import type { ReceiptFetch, VoiceFetch } from '@yevul/shared';

// The mobile edge of the AI Worker: where its address comes from, and what
// `fetch` this app hands to requestVoiceExtraction and requestReceiptExtraction.
//
// **Both of these exist because packages/shared refuses to.** voiceClient.ts and
// receiptClient.ts are zero-configuration by design — they read no environment
// and capture no global fetch, so the same modules run in the mobile app, the
// web app and the Worker's own tests. That decision has to be paid for
// somewhere, and this file is where: the URL is read here, the platform fetch is
// wrapped here, and nothing about React Native leaks back into the shared
// package.
//
// **It was voiceTransport.ts until step 11, and the rename is the honest name.**
// EXPO_PUBLIC_WORKER_URL was never the voice endpoint's address; it is the
// Worker's, and receipts post to the same host with the same bearer token
// through the same platform fetch. A second file holding a second copy of that
// URL is exactly how a build ends up with the microphone configured and the
// camera not.

// ============================================================
// The Worker's address.
//
// **process.env.EXPO_PUBLIC_*, matching src/lib/supabase.ts exactly.** That is
// how every other public value in this app is configured (docs/env.md), and
// Expo's Babel plugin inlines the literal at build time, which is why it has to
// be written out as a whole member expression and never destructured or built
// from a string.
//
// **Unlike supabase.ts, a missing value here does not throw.** Supabase is the
// app: without it there is no session, no data and nothing to render, so
// failing at import is the honest outcome. The Worker is one feature. A build
// that forgot EXPO_PUBLIC_WORKER_URL should still open, still list plots, and
// still let a farmer type an expense in by hand — it should simply not offer
// him a microphone or a receipt scan. So the value is null, both affordances
// are hidden, and the rest of the app never notices. Attaching a photograph to
// an expense he typed keeps working either way: that path never touches the
// Worker.
// ============================================================

// **An empty value counts as absent, and `?? null` alone does not do that.**
// A `.env` carrying a bare `EXPO_PUBLIC_WORKER_URL=` is the normal state of a
// checkout that has not been configured yet, and it inlines as `""`, which is
// neither null nor undefined. Left as-is it would pass the `!== null` check
// that gates the microphone and the scanner, so every recording would be
// offered, paid for with the farmer's time, and then posted to `/ai/voice` with
// no host at all. Absent and blank are the same fact and are treated the same.
//
// The member expression stays written out in full because Expo's Babel plugin
// substitutes the literal at build time and cannot follow a destructure.
const configuredWorkerUrl = process.env.EXPO_PUBLIC_WORKER_URL;

export const workerUrl: string | null =
  configuredWorkerUrl !== undefined && configuredWorkerUrl.trim() !== ''
    ? configuredWorkerUrl.trim()
    : null;

// ============================================================
// The fetch that carries the bytes.
//
// **The question this file had to answer: does React Native's fetch actually
// send an ArrayBuffer body, or does it stringify it?** The previous step left
// fetchImpl as the seam to wrap precisely because nobody had checked. It was
// checked, on the versions this app pins, and the answer is that it sends it:
//
//   1. RN 0.81 polyfills fetch with whatwg-fetch 3.6.20. Its _initBody keeps
//      the original object on `_bodyInit` for anything matching
//      `ArrayBuffer.prototype.isPrototypeOf(body)`, and `xhr.send(_bodyInit)`
//      hands that object straight to RN's XMLHttpRequest. The stringify branch
//      (`Object.prototype.toString.call(body)`, which would put the literal
//      text "[object ArrayBuffer]" on the wire) is only reached when
//      `support.arrayBuffer` is false, i.e. when ArrayBuffer is not a global.
//      In Hermes it is.
//   2. RN's convertRequestBody turns an ArrayBuffer into `{base64: ...}`.
//   3. Both native sides decode that back to bytes before sending:
//      RCTNetworking.mm builds an NSData from the base64 string, and Android's
//      NetworkingModule builds an OkHttp body from it. **Android requires a
//      Content-Type for that branch**, which voiceClient.ts always sets to
//      application/octet-stream.
//
// So no body wrapper is needed and none is written. **A receipt photograph goes
// through the identical path**: an ArrayBuffer is an ArrayBuffer, and
// receiptClient.ts sets the same application/octet-stream Content-Type that
// Android's base64 branch requires. Nothing above changes for images.
//
// What is written is the one thing RN's fetch genuinely does not give us:
//
// **A timeout.** fetch never gives up on its own. These farmers are on rural
// cellular, where a stalled upload does not fail, it hangs, and the panel would
// sit on "מעבד..." until the app is killed. An abort surfaces as a thrown fetch,
// which both transports map to retryNow — and correctly, because a request that
// never arrived spent no quota.
//
// The same AbortController is the caller's cancel handle: useVoiceRecording and
// useReceiptScan abort it when the sheet closes, so a farmer who walks away is
// not still uploading.
// ============================================================

// Sixty seconds is far longer than a two megabyte upload needs on any working
// connection and short enough that a dead one is admitted while he is still
// standing there. Two minutes of audio is about 1.9MB, and the Worker refuses
// anything over 4MB.
export const VOICE_UPLOAD_TIMEOUT_MILLIS = 60_000;

// **Twice the voice timeout, because the endpoint accepts twice the bytes.**
// backend/worker/src/receipt.ts caps an image at 8MB against voice's 4MB, and
// its own comment says why: client-side compression is the *next* roadmap item,
// so what actually arrives today is an uncompressed photograph off a phone.
// Holding this at sixty seconds would abort a real receipt on a slow link and
// report it as "we could not connect", which is a lie about a request that was
// still climbing. The day the compression step lands and the byte cap comes back
// down, this number comes down with it.
export const RECEIPT_UPLOAD_TIMEOUT_MILLIS = 120_000;

// One implementation, two exported names. The two routes differ in exactly one
// number, and a second copy of the body-passthrough investigation above is the
// last thing this file needs.
function createUploadFetch(controller: AbortController, timeoutMillis: number): VoiceFetch {
  return async (url, init) => {
    const timer = setTimeout(() => controller.abort(), timeoutMillis);
    try {
      const response = await fetch(url, {
        method: init.method,
        headers: init.headers,
        // Passed through untouched. See the investigation above: converting it
        // to a Blob or a base64 string here would only add a copy of the bytes
        // that the platform is about to make anyway.
        body: init.body,
        signal: controller.signal,
      });
      // Narrowed to the two members VoiceFetchResponse promises. The body is
      // fully buffered by the time whatwg-fetch resolves this promise, so
      // reading json() after the timer is cleared is safe.
      return { status: response.status, json: () => response.json() };
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createVoiceFetch(controller: AbortController): VoiceFetch {
  return createUploadFetch(controller, VOICE_UPLOAD_TIMEOUT_MILLIS);
}

// ReceiptFetch is an alias of VoiceFetch in packages/shared, which is what lets
// one wrapper serve both. The separate name is for the reader, not the compiler.
export function createReceiptFetch(controller: AbortController): ReceiptFetch {
  return createUploadFetch(controller, RECEIPT_UPLOAD_TIMEOUT_MILLIS);
}
