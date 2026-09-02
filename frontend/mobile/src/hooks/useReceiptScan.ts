import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  cameraPermissionDecision,
  deviceToday,
  requestReceiptExtraction,
  RECEIPT_MESSAGE_KEYS,
  type ReceiptFailure,
  type ReceiptNextStep,
  type ReceiptSuccess,
} from '@yevul/shared';
import { createReceiptFetch } from '../lib/aiTransport';

// The camera, stage 5 step 11, docs/roadmap.md: "OCR לקבלות, אותו Worker, אותה
// מכסה חודשית משותפת עם הקול".
//
// **useVoiceRecording's sibling, and it keeps the same two promises.** It is the
// only place in this feature that imports expo-image-picker, so there is one
// place a permission or a file handle can leak and one place to read when it
// does. And it decides nothing that could be tested: which statuses mean what is
// receiptClient.ts, what a denied permission means is voiceRecording.ts, and both
// have tests, because frontend/mobile has no test runner.
//
// ============================================================
// **Three things differ from the microphone, and none of them is cosmetic.**
//
// **1. There is no AppState teardown here, and adding one would break the
// feature outright.** useVoiceRecording discards a recording the moment the app
// is backgrounded, because the phone takes the microphone away when a call
// arrives and what is left on disk is half a sentence. The camera is the
// opposite: on Android `launchCameraAsync` starts the system camera *as another
// activity*, so this app is backgrounded every single time a farmer takes a
// photograph. A listener that reset on background would cancel the scan he just
// started, every time, on one platform only.
//
// **2. Nothing here is time-limited, so there is no tick and no cap.** A
// recording has a two-minute ceiling because bytes scale with seconds. A
// photograph is one file; the only ceiling is the endpoint's 8MB, and that is
// answered with a 413 the farmer can act on.
//
// **3. The picked file is kept after the upload succeeds.** The recording is
// finished with once it has been sent — the record is what matters and the audio
// is not stored anywhere. The photograph is the opposite: prd.md section 9 is
// that the accountant needs the document and not only the number, so the file
// has to survive until the farmer confirms the expense and it can be attached to
// the row. `done` therefore carries the image alongside the extraction.
// ============================================================

// What the picker handed back, kept so the same file can be attached to the
// expense after it is written. The uri is a local file:// path; the mime is what
// attachReceipt turns into the storage extension.
export type PickedReceipt = { uri: string; mimeType: string };

export type ReceiptScanState =
  | { status: 'idle' }
  // The system camera or gallery UI is up. Distinct from idle because a second
  // press must not open a second picker behind the first, and distinct from
  // uploading because nothing has been sent and nothing has been paid for.
  | { status: 'choosing' }
  // He said no to the camera once and the phone will not ask again. **Not an
  // error state**, exactly as with the microphone: nothing is broken, he made a
  // choice, and the screen that answers it is a way into the phone's settings.
  // The gallery still works, and so does every manual form.
  | { status: 'camera-blocked' }
  | { status: 'uploading' }
  | { status: 'done'; success: ReceiptSuccess; image: PickedReceipt }
  | { status: 'error'; failure: ReceiptFailure };

export type ReceiptScanController = {
  state: ReceiptScanState;
  takePhoto: () => void;
  pickFromGallery: () => void;
  // Back to idle from a result, a failure, or a blocked camera. Also the way the
  // panel throws away an extraction the farmer does not want.
  reset: () => void;
};

// **0.7, the same as the receipt ExpenseSheet already attaches.** The picker
// re-encodes at this quality, which is the only compression in the pipeline
// today — client-side compression is the next roadmap item and this is not it.
// Lower would start eating the small print on a thermal till receipt, which is
// the one thing the model has to read; higher would push an ordinary photograph
// towards the endpoint's 8MB ceiling for no gain, since the provider downsamples
// to a fixed tile budget before looking at it.
const IMAGE_QUALITY = 0.7;

// **No crop step.** allowsEditing puts a mandatory framing screen between the
// shutter and the result on both platforms, and the endpoint reads a whole
// receipt perfectly well. An extra screen on a two-tap flow is the kind of thing
// this product has already cut once, deliberately (see the expense form).
//
// Built per call rather than held as a module constant, because
// ImagePickerOptions declares mediaTypes as a mutable array: a frozen object
// would not typecheck, and a shared mutable one is a picker configuration any
// caller could quietly edit.
function pickerOptions(): ImagePicker.ImagePickerOptions {
  return {
    mediaTypes: ['images'],
    quality: IMAGE_QUALITY,
    allowsEditing: false,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The same shape requestReceiptExtraction returns, for the failures that happen
// before there is a request to fail. `status` is null for exactly the reason it
// is null there: no answer arrived, because nothing was asked.
function localFailure(
  nextStep: ReceiptNextStep,
  messageKey: string,
  reason: string,
): ReceiptFailure {
  return { ok: false, nextStep, messageKey, reason, status: null };
}

// **Reading the file with fetch, and not with expo-file-system.** The same route
// useVoiceRecording reads its m4a through and the same route ExpenseSheet
// already reads a picked receipt through: RN resolves a file:// URI through its
// own networking stack, and Response.arrayBuffer() goes through FileReader,
// which RN implements. It is not a new bet, and it saves a native dependency for
// one read.
//
// The file is deliberately read twice over the life of a scan — once as bytes to
// send, and later as a Blob to attach — rather than held in memory in between. A
// receipt photograph is megabytes, the two reads are minutes apart, and keeping
// a buffer alive across a confirmation screen the farmer may sit on is how a
// low-end phone runs out of room.
async function readImageBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

export function useReceiptScan({
  workerUrl,
  accessToken,
}: {
  workerUrl: string;
  // From the Supabase session. Injected here rather than read inside
  // packages/shared, and null when the session has gone.
  accessToken: string | null;
}): ReceiptScanController {
  const [state, setState] = useState<ReceiptScanState>({ status: 'idle' });

  // **Refs and not state, for the reason useVoiceRecording gives**: a press, a
  // returning picker and an upload all race each other, and a stale closure
  // would let an abandoned attempt write over a live one.
  const aliveRef = useRef(true);
  // Bumped on every attempt and on every teardown. A continuation whose attempt
  // is no longer the current one has been abandoned and must not write.
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function commit(attempt: number, next: ReceiptScanState): void {
    if (!aliveRef.current || attemptRef.current !== attempt) return;
    // Every state the farmer can act out of releases the press guard. Doing it
    // here rather than at each call site is what makes it impossible to leave
    // both buttons dead after a path nobody thought about.
    if (next.status !== 'choosing' && next.status !== 'uploading') busyRef.current = false;
    setState(next);
  }

  // **No async path may end in an unhandled rejection.** Each one ends in a
  // native call that can throw, and a throw nobody catches leaves busyRef set:
  // both buttons go dead, silently, with no way back short of closing the sheet.
  function guard(attempt: number, work: Promise<void>): void {
    void work.catch((error: unknown) => {
      commit(attempt, {
        status: 'error',
        failure: localFailure('ourBug', RECEIPT_MESSAGE_KEYS.ourBug, describeError(error)),
      });
    });
  }

  async function resolveCameraPermission(): Promise<'granted' | 'ask' | 'blocked'> {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return 'granted';
    // **Asked only when the phone will actually ask.** Calling request on a
    // blocked permission resolves instantly with the same denial and teaches the
    // farmer that the button does nothing.
    if (cameraPermissionDecision(current) === 'blocked') return 'blocked';
    return cameraPermissionDecision(await ImagePicker.requestCameraPermissionsAsync());
  }

  async function upload(attempt: number, image: PickedReceipt): Promise<void> {
    if (accessToken === null) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('signIn', RECEIPT_MESSAGE_KEYS.signIn, 'no_access_token'),
      });
      return;
    }

    commit(attempt, { status: 'uploading' });

    let bytes: ArrayBuffer;
    try {
      bytes = await readImageBuffer(image.uri);
    } catch (error) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('ourBug', RECEIPT_MESSAGE_KEYS.ourBug, describeError(error)),
      });
      return;
    }
    if (!aliveRef.current || attemptRef.current !== attempt) return;

    // **This costs nothing out of the farm's allowance.** A body the Worker
    // never receives cannot consume the quota gate() spends, and a picker that
    // handed back a zero-byte file is exactly the request that would have.
    if (bytes.byteLength === 0) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('fixPhoto', RECEIPT_MESSAGE_KEYS.noPhoto, 'empty_image_file'),
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const result = await requestReceiptExtraction(
      { workerUrl, accessToken, today: deviceToday(), image: bytes },
      createReceiptFetch(controller),
    );
    abortRef.current = null;

    commit(
      attempt,
      result.ok ? { status: 'done', success: result, image } : { status: 'error', failure: result },
    );
  }

  async function pick(attempt: number, from: 'camera' | 'gallery'): Promise<void> {
    if (from === 'camera') {
      const decision = await resolveCameraPermission();
      if (!aliveRef.current || attemptRef.current !== attempt) return;
      if (decision === 'blocked') {
        commit(attempt, { status: 'camera-blocked' });
        return;
      }
      if (decision !== 'granted') {
        // He dismissed the system dialog without choosing. The phone will ask
        // again, so the screen goes back to what it was and nothing is said.
        commit(attempt, { status: 'idle' });
        return;
      }
    }

    // **The gallery is not asked for a permission, and that is not an
    // oversight.** Both platforms now hand back a system picker that runs out of
    // process and returns only what the farmer chose, so there is nothing to
    // grant. It is also what ExpenseSheet's existing attach button already does.
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions())
        : await ImagePicker.launchImageLibraryAsync(pickerOptions());

    if (!aliveRef.current || attemptRef.current !== attempt) return;

    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) {
      // Cancelled, or a picker that returned nothing. Neither is a failure and
      // neither deserves a sentence: he is looking at the two buttons again.
      commit(attempt, { status: 'idle' });
      return;
    }

    // **image/jpeg is the fallback and not a claim.** The endpoint reads the
    // real format off the magic bytes and answers 400 unsupported_format if it
    // cannot, so a wrong guess here cannot mislabel what is scanned. What it
    // does decide is the extension attachReceipt stores the file under, which is
    // why it is carried forward rather than re-guessed at attach time.
    await upload(attempt, { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  }

  // **The teardown.** Closing the sheet and unmounting are the same event as far
  // as the camera is concerned: abort the upload and orphan every continuation
  // still in flight so none of them writes to a component that is gone. There is
  // deliberately no AppState listener calling this — see the header.
  function teardown(): void {
    attemptRef.current += 1;
    busyRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
  }

  const teardownRef = useRef(teardown);
  useEffect(() => {
    teardownRef.current = teardown;
  });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      teardownRef.current();
    };
  }, []);

  function start(from: 'camera' | 'gallery'): void {
    // Synchronous, and set before anything awaits. A second press landing while
    // the first is still opening the picker must not open a second one.
    if (busyRef.current) return;
    busyRef.current = true;
    const attempt = (attemptRef.current += 1);
    setState({ status: 'choosing' });
    guard(attempt, pick(attempt, from));
  }

  return {
    state,
    takePhoto: () => start('camera'),
    pickFromGallery: () => start('gallery'),
    reset: () => {
      teardown();
      setState({ status: 'idle' });
    },
  };
}
