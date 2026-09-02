import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  RecordingPresets,
} from 'expo-audio';
import {
  deviceToday,
  microphoneDecision,
  recordingReachedLimit,
  recordingTooShort,
  requestVoiceExtraction,
  VOICE_MESSAGE_KEYS,
  type VoiceFailure,
  type VoiceKind,
  type VoiceNextStep,
  type VoiceSuccess,
} from '@yevul/shared';
import { createVoiceFetch } from '../lib/voiceTransport';

// The microphone, stage 5, docs/roadmap.md.
//
// **This is the only module in the app that imports expo-audio, and that is the
// point of it.** Recording is a native dependency with a session, a permission,
// a file on disk and a lifecycle, and every one of those is a way to leak
// something. Keeping it behind one hook means there is exactly one place that
// can leak, one place to read when it does, and one place to change the day
// expo-audio's API moves under us. The panel above it sees a state machine and
// two button handlers.
//
// **It does not decide anything it could be tested on.** How long is too long,
// how short is too short, what a denied permission means, how the timer reads:
// all of that is packages/shared/src/voiceRecording.ts, which has tests,
// because frontend/mobile has no test runner. What is left here is the part
// that genuinely needs a device.
//
// **It does not know the wire contract either.** requestVoiceExtraction owns
// every status the endpoint can answer with and every Hebrew message key that
// goes with it. The few failures this file raises itself are the ones that
// happen before a request exists — a recording too short to send, a file that
// could not be read, a session that is gone — and they reuse the same keys
// rather than inventing a second vocabulary for the same sentences.

// ============================================================
// The state machine.
//
// Seven states, and the two that are not in the obvious list earn their place:
//
//   requesting-permission  The system dialog is up. Distinct from recording
//                          because the microphone is not open yet, and distinct
//                          from idle because a second press must not queue a
//                          second prompt behind the first.
//   permission-blocked     He said no, once, and the phone will not ask again.
//                          **Not an error state**, deliberately: nothing failed
//                          and nothing is broken, he simply made a choice, and
//                          the screen that answers it is a way into the phone's
//                          settings rather than a red sentence.
//
// `stoppedAtLimit` rides along from the moment the two minute cap cuts him off
// until the result is on screen, because that is when he can be told why the
// recording ended without him letting go of the button.
// ============================================================

export type VoiceRecordingState =
  | { status: 'idle' }
  | { status: 'requesting-permission' }
  | { status: 'permission-blocked' }
  | { status: 'recording'; elapsedMillis: number }
  | { status: 'uploading'; stoppedAtLimit: boolean }
  | { status: 'done'; success: VoiceSuccess; stoppedAtLimit: boolean }
  | { status: 'error'; failure: VoiceFailure };

export type VoiceRecordingController = {
  state: VoiceRecordingState;
  // Press and release, not start and stop. The gesture is walkie-talkie: hold
  // the button, speak, let go. It is the one recording interaction that needs
  // no explanation and cannot be left running by accident.
  pressIn: () => void;
  pressOut: () => void;
  // Back to idle from a result, a failure, or a blocked microphone.
  reset: () => void;
};

// **m4a, and it is stated rather than assumed.** RecordingPresets.HIGH_QUALITY
// encodes MPEG-4 AAC on both platforms (mpeg4/aac on Android, MPEG4AAC on iOS)
// and writes a .m4a file, and nothing in the pipeline converts it. The endpoint
// happens to default to the same thing, but voiceClient.ts is explicit that the
// caller holding the file is the one who knows its format, so this file says so
// instead of leaning on a default it does not own. Change the preset and this
// line has to change with it.
const RECORDING_FORMAT = 'm4a' as const;

// Four times a second. The farmer reads whole seconds, but a one second tick
// visibly stutters against the wall clock it is compared to, and this counter's
// only job is to prove the microphone is open.
const TICK_MILLIS = 250;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The same shape requestVoiceExtraction returns, for the failures that happen
// before there is a request to fail. `status` is null for exactly the reason it
// is null there: no answer arrived, because nothing was asked.
function localFailure(nextStep: VoiceNextStep, messageKey: string, reason: string): VoiceFailure {
  return { ok: false, nextStep, messageKey, reason, status: null };
}

// **Reading the file with fetch, and not with expo-file-system.** RN 0.81
// resolves a file:// URI through the same networking stack as any other
// request: iOS has RCTFileRequestHandler, and on Android the Blob module
// registers a handler for non-remote URIs whenever the response type is blob,
// which is what whatwg-fetch always asks for. Response.arrayBuffer() then goes
// through FileReader.readAsArrayBuffer, which RN implements. This is the same
// route ExpenseSheet already uses to read a picked receipt off disk, so it is
// not a new bet — and it saves adding a native dependency for one read.
async function readAudioBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

export function useVoiceRecording({
  kind,
  workerUrl,
  accessToken,
}: {
  kind: VoiceKind;
  workerUrl: string;
  // From the Supabase session. Injected here rather than read inside
  // packages/shared, like the URL, and null when the session has gone.
  accessToken: string | null;
}): VoiceRecordingController {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceRecordingState>({ status: 'idle' });

  // **Everything that must be read or written between renders is a ref, not
  // state.** A press, a native status tick and an upload all race each other,
  // and a stale closure reading `state` would let a released button stop a
  // recording that a later press had already started.
  const aliveRef = useRef(true);
  // Bumped on every press and on every cancel. An async continuation whose
  // attempt is no longer the current one has been abandoned and must not write.
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const pressedRef = useRef(false);
  const recordingRef = useRef(false);
  // Once the phone has said yes, it keeps saying yes. Caching it skips a
  // needless async round trip, and with it a flash of the permission state, on
  // every press after the first.
  const grantedRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function commit(attempt: number, next: VoiceRecordingState): void {
    if (!aliveRef.current || attemptRef.current !== attempt) return;
    // Every state the farmer can press out of releases the press guard. Doing
    // it here rather than at each call site is what makes it impossible to
    // leave the button dead after a path nobody thought about.
    if (
      next.status === 'idle' ||
      next.status === 'done' ||
      next.status === 'error' ||
      next.status === 'permission-blocked'
    ) {
      busyRef.current = false;
    }
    setState(next);
  }

  // **No async path here is allowed to end in an unhandled rejection.** Every
  // one of them ends in a native call that can throw, and a throw nobody
  // catches leaves busyRef set: the microphone button goes dead, silently, with
  // no way back short of closing the sheet. This turns any such throw into the
  // one honest thing to say about it, which is that it is our bug.
  function guard(attempt: number, work: Promise<void>): void {
    void work.catch((error: unknown) => {
      commit(attempt, {
        status: 'error',
        failure: localFailure('ourBug', VOICE_MESSAGE_KEYS.ourBug, describeError(error)),
      });
    });
  }

  function stopTicking(): void {
    if (tickRef.current === null) return;
    clearInterval(tickRef.current);
    tickRef.current = null;
  }

  function readDurationMillis(): number {
    try {
      return recorder.getStatus().durationMillis;
    } catch {
      // getStatus throws once the native object is released. Zero reads as "too
      // short", which lands the farmer on "we heard nothing" — the honest
      // answer, since there is no audio.
      return 0;
    }
  }

  // Returns whether the stop actually landed. **The caller needs to know, and
  // not for a message.** `recorder.uri` still holds the previous recording's
  // path when a stop fails, so treating a failed stop as a success would upload
  // whatever the farmer said last time and charge him for it.
  async function stopRecorderQuietly(): Promise<boolean> {
    try {
      await recorder.stop();
      return true;
    } catch {
      // Already stopped, never prepared, or released by expo-audio's own
      // unmount cleanup, which runs before ours. There is nothing to do about
      // any of the three and nothing the farmer would want to hear.
      return false;
    }
  }

  // **Releasing the audio session is not optional on iOS.** Leaving the
  // recording category active routes the rest of the app's audio through the
  // earpiece at a fraction of the volume, and the farmer has no idea why his
  // phone went quiet. It runs on every exit from recording, including failures.
  function releaseAudioSession(): void {
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {
      // Nothing useful to do if the session cannot be restored, and it is not
      // worth a sentence in front of a farmer who is looking at his result.
    });
  }

  async function resolvePermission(): Promise<'granted' | 'ask' | 'blocked'> {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) return 'granted';
    // **Asked only when the phone will actually ask.** Calling request on a
    // blocked permission resolves instantly with the same denial and teaches
    // the farmer that the button does nothing.
    if (microphoneDecision(current) === 'blocked') return 'blocked';
    return microphoneDecision(await requestRecordingPermissionsAsync());
  }

  function startTicking(attempt: number): void {
    stopTicking();
    tickRef.current = setInterval(() => {
      const elapsedMillis = readDurationMillis();
      if (recordingReachedLimit(elapsedMillis)) {
        // Stopped on the device rather than refused by the Worker. See
        // VOICE_MAX_RECORDING_MILLIS: a 413 arrives only after he has already
        // waited for the upload.
        guard(attempt, finishRef.current(true));
        return;
      }
      commit(attempt, { status: 'recording', elapsedMillis });
    }, TICK_MILLIS);
  }

  async function beginRecording(attempt: number): Promise<void> {
    if (!grantedRef.current) {
      commit(attempt, { status: 'requesting-permission' });
      const decision = await resolvePermission();
      if (!aliveRef.current || attemptRef.current !== attempt) return;
      if (decision === 'blocked') {
        commit(attempt, { status: 'permission-blocked' });
        return;
      }
      if (decision !== 'granted') {
        // He dismissed the dialog without choosing. The phone will ask again,
        // so the button goes back to what it was and nothing is said about it.
        commit(attempt, { status: 'idle' });
        return;
      }
      grantedRef.current = true;
      // **The press that opened the system dialog is spent.** His finger came
      // off the button while he was reading it, so there is nothing to record.
      // Idle, with the "press and hold" hint still on screen, is the whole
      // instruction he needs for the second press.
      if (!pressedRef.current) {
        commit(attempt, { status: 'idle' });
        return;
      }
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
    } catch (error) {
      releaseAudioSession();
      commit(attempt, {
        status: 'error',
        failure: localFailure('ourBug', VOICE_MESSAGE_KEYS.ourBug, describeError(error)),
      });
      return;
    }

    if (!aliveRef.current || attemptRef.current !== attempt || !pressedRef.current) {
      // Released, or the sheet closed, while the recorder was preparing. A tap
      // this short has no audio in it and no sentence is worth showing: the
      // hint on screen already says to hold the button.
      releaseAudioSession();
      commit(attempt, { status: 'idle' });
      return;
    }

    try {
      recorder.record();
    } catch (error) {
      releaseAudioSession();
      commit(attempt, {
        status: 'error',
        failure: localFailure('ourBug', VOICE_MESSAGE_KEYS.ourBug, describeError(error)),
      });
      return;
    }
    recordingRef.current = true;
    commit(attempt, { status: 'recording', elapsedMillis: 0 });
    startTicking(attempt);
  }

  async function finishRecording(stoppedAtLimit: boolean): Promise<void> {
    // The button release and the two minute cap can both land on the same
    // frame. Whichever gets here first owns the stop.
    if (!recordingRef.current) return;
    recordingRef.current = false;
    pressedRef.current = false;
    stopTicking();

    const attempt = attemptRef.current;
    // Read before the stop, because the status object is gone afterwards.
    const elapsedMillis = readDurationMillis();
    const stopped = await stopRecorderQuietly();
    const uri = stopped ? recorder.uri : null;
    releaseAudioSession();

    if (!aliveRef.current || attemptRef.current !== attempt) return;

    // **Neither of these two costs a recording out of the farm's ten.** A body
    // the Worker never receives cannot consume the quota that gate() spends,
    // and an accidental tap producing a third of a second of m4a is exactly the
    // request that would have.
    if (uri === null || recordingTooShort(elapsedMillis)) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('fixRecording', VOICE_MESSAGE_KEYS.noSound, 'recording_too_short'),
      });
      return;
    }

    if (accessToken === null) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('signIn', VOICE_MESSAGE_KEYS.signIn, 'no_access_token'),
      });
      return;
    }

    commit(attempt, { status: 'uploading', stoppedAtLimit });

    let audio: ArrayBuffer;
    try {
      audio = await readAudioBuffer(uri);
    } catch (error) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('ourBug', VOICE_MESSAGE_KEYS.ourBug, describeError(error)),
      });
      return;
    }
    if (!aliveRef.current || attemptRef.current !== attempt) return;

    if (audio.byteLength === 0) {
      commit(attempt, {
        status: 'error',
        failure: localFailure('fixRecording', VOICE_MESSAGE_KEYS.noSound, 'empty_audio_file'),
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const result = await requestVoiceExtraction(
      { workerUrl, accessToken, kind, today: deviceToday(), audio, format: RECORDING_FORMAT },
      createVoiceFetch(controller),
    );
    abortRef.current = null;

    commit(
      attempt,
      result.ok
        ? { status: 'done', success: result, stoppedAtLimit }
        : { status: 'error', failure: result },
    );
  }

  // **The teardown, and the reason it is one function called from three
  // places.** Closing the sheet, backgrounding the app and unmounting are the
  // same event as far as the microphone is concerned: stop it, drop the timer,
  // abort the upload, hand the audio session back, and orphan every async
  // continuation that is still in flight so none of them writes to a component
  // that is gone.
  function teardown(): void {
    attemptRef.current += 1;
    pressedRef.current = false;
    busyRef.current = false;
    stopTicking();
    abortRef.current?.abort();
    abortRef.current = null;
    if (recordingRef.current) {
      recordingRef.current = false;
      void stopRecorderQuietly();
    }
    releaseAudioSession();
  }

  // The latest-value refs the listeners below read. They are written in an
  // effect, and this effect is declared first so it has run by the time the
  // ones after it register anything.
  const teardownRef = useRef(teardown);
  const finishRef = useRef(finishRecording);
  useEffect(() => {
    teardownRef.current = teardown;
    finishRef.current = finishRecording;
  });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      teardownRef.current();
    };
  }, []);

  // **Backgrounding discards the recording rather than sending it.** The phone
  // takes the microphone away the moment a call or another app wants it, so
  // what is on disk is half a sentence, and a half sentence is worth less than
  // the recording out of ten it would cost to find that out.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      teardownRef.current();
      setState({ status: 'idle' });
    });
    return () => subscription.remove();
  }, []);

  return {
    state,
    pressIn: () => {
      // Synchronous, and set before anything awaits. A second press landing
      // while the first is still opening the permission dialog must not queue a
      // second dialog behind it.
      if (busyRef.current) return;
      busyRef.current = true;
      pressedRef.current = true;
      const attempt = (attemptRef.current += 1);
      guard(attempt, beginRecording(attempt));
    },
    pressOut: () => {
      pressedRef.current = false;
      guard(attemptRef.current, finishRecording(false));
    },
    reset: () => {
      teardown();
      setState({ status: 'idle' });
    },
  };
}
