// The recording policy for voice capture, stage 5, docs/roadmap.md.
//
// **This is the half of recording that is not a microphone.** The microphone
// itself is expo-audio, a native dependency that only exists inside the mobile
// app and cannot be exercised without a device. What is left over once the
// native calls are removed is a handful of decisions — how long is too long,
// how short is too short, what a denied permission means, what the elapsed
// counter reads — and every one of them is a rule a farmer feels. They live
// here so they can be tested, because frontend/mobile has no test runner.
//
// **Nothing here touches audio bytes and nothing here talks to the endpoint.**
// The transport is voiceClient.ts and the microphone is
// frontend/mobile/src/hooks/useVoiceRecording.ts. This module is the rules both
// of them are steered by, and like the rest of packages/shared it reads no
// environment and imports nothing.

import type { VoiceKind } from './voice';

// ============================================================
// How long a recording may run.
//
// **The cap exists so the farmer is never told "too long" after waiting for an
// upload.** backend/worker/src/voice.ts refuses a body over 4MB with a 413, and
// by then he has already spoken, waited for the bytes to climb a rural cellular
// link, and got nothing back. Stopping him on the device costs him the tail of
// a sentence; stopping him at the Worker costs him the whole recording and the
// wait. So the device stops first, and the 413 stays what it should be: the
// last line of defence, not the normal path.
//
// **Two minutes, and the number comes straight out of the Worker's own
// arithmetic.** The comment above MAX_AUDIO_BYTES there works it out:
// RecordingPresets.HIGH_QUALITY encodes at 128 kbps, i.e. 16KB per second, so
// two minutes is about 1.9MB and the 4MB ceiling is "roughly double that". Two
// minutes is therefore the largest recording that still leaves a full 2x margin
// for a device that encodes fatter than the preset promises, which is the one
// failure this cap cannot see coming.
//
// It is also far longer than anything this feature is for. A single expense is
// "שילמתי ארבע מאות שקל על דשן לחלקה הצפונית", about five seconds, and the
// single-item extraction rule (prd.md appendix A.5) means a farmer who talks
// for two minutes has already given the model more than it can use. The cap is
// a guard against a phone left recording in a pocket, not a budget for speech.
export const VOICE_MAX_RECORDING_MILLIS = 120_000;

// **The floor is about the quota, not about quality.** A body of zero bytes is
// rejected by the Worker for free, before gate() consumes anything — see the
// order of operations in handleVoice. But an accidental tap produces a *valid*
// fraction-of-a-second m4a, which is not empty, which sails past that check,
// and which then costs the farm one of its ten recordings for the month to be
// told the model heard nothing. 700ms is below any real utterance and above
// every accidental one.
export const VOICE_MIN_RECORDING_MILLIS = 700;

export function recordingReachedLimit(millis: number): boolean {
  return millis >= VOICE_MAX_RECORDING_MILLIS;
}

export function recordingTooShort(millis: number): boolean {
  return millis < VOICE_MIN_RECORDING_MILLIS;
}

// ============================================================
// The microphone permission.
//
// **A denied microphone is a normal state of this app, not an error.** A farmer
// who tapped "don't allow" once did something completely reasonable, and the
// app has to keep working for him: every manual form still writes. What it must
// not do is show him the same "press and hold" button forever, because the
// system will never prompt again and the button will never do anything.
//
// The three outcomes are three different screens, which is the whole reason
// this is a named decision and not an `if (granted)`:
//
//   granted  Record.
//   ask      The system can still prompt. This is the first-time path and also
//            the path where he dismissed the prompt without choosing; both end
//            with him pressing again, and the prompt appearing again.
//   blocked  The system will not prompt again. The only way back is the phone's
//            own settings, so that is what the screen has to offer him.
// ============================================================

// Structural on purpose, so this file does not import expo-modules-core.
// PermissionResponse from expo-audio satisfies it.
export type MicrophonePermissionState = {
  granted: boolean;
  canAskAgain: boolean;
};

export type MicrophoneDecision = 'granted' | 'ask' | 'blocked';

export function microphoneDecision(state: MicrophonePermissionState): MicrophoneDecision {
  if (state.granted) return 'granted';
  return state.canAskAgain ? 'ask' : 'blocked';
}

// **The camera asks the phone the identical question and has the identical
// three answers**, and expo-image-picker's PermissionResponse satisfies the same
// structural type, so receipt scanning (step 11) reuses this decision rather
// than making a second one. Deliberately the same function and not a copy: a
// copy is a second chance to read "the system will never prompt again" as "ask
// again", which is the bug that leaves a button dead forever with no
// explanation. The alias exists so the receipt hook is not calling something
// named after a microphone.
export const cameraPermissionDecision = microphoneDecision;

// ============================================================
// What the farmer reads while it is happening.
// ============================================================

// **m:ss and not a spinner.** design.md, Loading State, Voice Processing: this
// audience needs to see that something is being recorded, and a bare spinner
// says only "wait". A climbing timer is the one piece of feedback that proves
// the microphone is open, and it is the same shape every voice recorder on
// earth already showed them.
//
// Defensive about its input because the number comes from a native status
// object that can report anything, including a negative duration on the frame
// the recorder is torn down.
export function formatRecordingElapsed(millis: number): string {
  const safe = Number.isFinite(millis) && millis > 0 ? millis : 0;
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// The coaching line shown the instant recording starts, design.md, Mic Capture
// Button: "אמרו: מה, כמה, לאיזו חלקה" for an expense, with the equivalent
// three-field prompt for the other two. It exists to shape the sentence before
// it is spoken, because the single-item extraction rule depends on the farmer
// actually saying one thing with its handful of fields.
//
// The mapping lives here rather than in the panel so the day a fourth kind is
// added, the compiler names this file. Record<VoiceKind, string> is what makes
// that happen: an added kind is a missing key, not a silent fallback.
const VOICE_PROMPT_KEYS: Record<VoiceKind, string> = {
  expense: 'voice.prompt.expense',
  task: 'voice.prompt.task',
  journal: 'voice.prompt.journal',
};

export function voicePromptKey(kind: VoiceKind): string {
  return VOICE_PROMPT_KEYS[kind];
}
