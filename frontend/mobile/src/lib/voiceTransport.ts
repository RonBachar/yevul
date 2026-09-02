import type { VoiceFetch } from '@yevul/shared';

// The mobile edge of POST /ai/voice: where the Worker's address comes from, and
// what `fetch` this app hands to requestVoiceExtraction.
//
// **Both of these exist because packages/shared refuses to.** voiceClient.ts is
// zero-configuration by design — it reads no environment and captures no global
// fetch, so that the same module runs in the mobile app, the web app and the
// Worker's own tests. That decision has to be paid for somewhere, and this file
// is where: the URL is read here, the platform fetch is wrapped here, and
// nothing about React Native leaks back into the shared package.

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
// him a microphone. So the value is null, the mic affordances are hidden, and
// the rest of the app never notices.
// ============================================================

// **An empty value counts as absent, and `?? null` alone does not do that.**
// A `.env` carrying a bare `EXPO_PUBLIC_WORKER_URL=` is the normal state of a
// checkout that has not been configured yet, and it inlines as `""`, which is
// neither null nor undefined. Left as-is it would pass the `!== null` check
// that gates the microphone, so every recording would be offered, paid for
// with the farmer's time, and then posted to `/ai/voice` with no host at all.
// Absent and blank are the same fact and are treated the same.
//
// The member expression stays written out in full because Expo's Babel plugin
// substitutes the literal at build time and cannot follow a destructure.
const configuredWorkerUrl = process.env.EXPO_PUBLIC_WORKER_URL;

export const workerUrl: string | null =
  configuredWorkerUrl !== undefined && configuredWorkerUrl.trim() !== ''
    ? configuredWorkerUrl.trim()
    : null;

// ============================================================
// The fetch that carries the audio.
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
// So no body wrapper is needed and none is written. What is written is the one
// thing RN's fetch genuinely does not give us:
//
// **A timeout.** fetch never gives up on its own. These farmers are on rural
// cellular, where a stalled upload does not fail, it hangs, and the panel would
// sit on "מעבד..." until the app is killed. Sixty seconds is far longer than a
// two megabyte upload needs on any working connection and short enough that a
// dead one is admitted while he is still standing there. An abort surfaces as a
// thrown fetch, which requestVoiceExtraction already maps to retryNow — and
// correctly, because a request that never arrived spent no quota.
//
// The same AbortController is the caller's cancel handle: useVoiceRecording
// aborts it when the sheet closes, so a farmer who walks away is not still
// uploading.
// ============================================================

export const VOICE_UPLOAD_TIMEOUT_MILLIS = 60_000;

export function createVoiceFetch(controller: AbortController): VoiceFetch {
  return async (url, init) => {
    const timer = setTimeout(() => controller.abort(), VOICE_UPLOAD_TIMEOUT_MILLIS);
    try {
      const response = await fetch(url, {
        method: init.method,
        headers: init.headers,
        // Passed through untouched. See the investigation above: converting it
        // to a Blob or a base64 string here would only add a copy of the audio
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
