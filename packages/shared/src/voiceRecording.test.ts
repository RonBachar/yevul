// Tests for the recording policy, packages/shared/src/voiceRecording.ts.
//
// These exist because frontend/mobile has no test runner and never will have
// one for this: the microphone is a native module and the panel is a React
// Native component. Everything in this file was deliberately pulled out of that
// component so that the rules a farmer feels — how long he may talk, what
// happens when he taps by accident, what a blocked microphone means — are
// covered by something, rather than by a device the next person has to find.
//
// The boundaries are asserted exactly, not approximately. Every one of them is
// a decision with a cost attached: one side of VOICE_MIN_RECORDING_MILLIS burns
// a recording out of ten, and one side of VOICE_MAX_RECORDING_MILLIS is a 413
// the farmer waits for.

import { describe, expect, it } from 'vitest';
import {
  formatRecordingElapsed,
  microphoneDecision,
  recordingReachedLimit,
  recordingTooShort,
  voicePromptKey,
  VOICE_MAX_RECORDING_MILLIS,
  VOICE_MIN_RECORDING_MILLIS,
} from './voiceRecording';
import { VOICE_KINDS } from './voice';
import { t } from './i18n';

describe('the recording length limits', () => {
  it('keeps two minutes of HIGH_QUALITY audio under the Worker 4MB ceiling', () => {
    // The arithmetic the cap is derived from, asserted rather than trusted:
    // 128 kbps is 16KB per second, and the Worker refuses more than 4MB. If
    // either number moves, this is the test that says the cap moved with it.
    const bytesPerSecond = 16 * 1024;
    const workerCeilingBytes = 4 * 1024 * 1024;
    const bytesAtLimit = (VOICE_MAX_RECORDING_MILLIS / 1000) * bytesPerSecond;
    expect(bytesAtLimit).toBeLessThan(workerCeilingBytes);
    // And with room to spare, because a device that encodes fatter than the
    // preset promises is the one failure the cap cannot see coming.
    expect(bytesAtLimit * 2).toBeLessThanOrEqual(workerCeilingBytes);
  });

  it('stops exactly at the limit and not one tick before', () => {
    expect(recordingReachedLimit(VOICE_MAX_RECORDING_MILLIS - 1)).toBe(false);
    expect(recordingReachedLimit(VOICE_MAX_RECORDING_MILLIS)).toBe(true);
    expect(recordingReachedLimit(VOICE_MAX_RECORDING_MILLIS + 5_000)).toBe(true);
  });

  it('treats an accidental tap as too short, and a real word as long enough', () => {
    expect(recordingTooShort(0)).toBe(true);
    expect(recordingTooShort(120)).toBe(true);
    expect(recordingTooShort(VOICE_MIN_RECORDING_MILLIS - 1)).toBe(true);
    expect(recordingTooShort(VOICE_MIN_RECORDING_MILLIS)).toBe(false);
    expect(recordingTooShort(5_000)).toBe(false);
  });

  it('leaves a usable window between the two limits', () => {
    expect(VOICE_MIN_RECORDING_MILLIS).toBeLessThan(VOICE_MAX_RECORDING_MILLIS);
  });
});

describe('the microphone permission decision', () => {
  it('records when it is granted, whatever canAskAgain says', () => {
    // iOS reports canAskAgain false once the choice has been made at all,
    // "allow" included. Reading that field before granted would have locked out
    // every farmer who said yes.
    expect(microphoneDecision({ granted: true, canAskAgain: true })).toBe('granted');
    expect(microphoneDecision({ granted: true, canAskAgain: false })).toBe('granted');
  });

  it('separates a first refusal from one the system will not ask about again', () => {
    expect(microphoneDecision({ granted: false, canAskAgain: true })).toBe('ask');
    expect(microphoneDecision({ granted: false, canAskAgain: false })).toBe('blocked');
  });
});

describe('the elapsed counter', () => {
  it('reads as a timer from the first tick', () => {
    expect(formatRecordingElapsed(0)).toBe('0:00');
    expect(formatRecordingElapsed(999)).toBe('0:00');
    expect(formatRecordingElapsed(1_000)).toBe('0:01');
    expect(formatRecordingElapsed(7_400)).toBe('0:07');
  });

  it('pads the seconds so the digits do not jump under the farmer eye', () => {
    expect(formatRecordingElapsed(59_000)).toBe('0:59');
    expect(formatRecordingElapsed(60_000)).toBe('1:00');
    expect(formatRecordingElapsed(65_000)).toBe('1:05');
    expect(formatRecordingElapsed(VOICE_MAX_RECORDING_MILLIS)).toBe('2:00');
  });

  it('shows a zero rather than NaN when the native status is nonsense', () => {
    // A recorder torn down mid-tick has reported a negative duration before.
    expect(formatRecordingElapsed(-1)).toBe('0:00');
    expect(formatRecordingElapsed(Number.NaN)).toBe('0:00');
    expect(formatRecordingElapsed(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('the coaching line', () => {
  it('has one prompt per kind, and they are all distinct', () => {
    const keys = VOICE_KINDS.map(voicePromptKey);
    expect(keys).toHaveLength(VOICE_KINDS.length);
    expect(new Set(keys).size).toBe(VOICE_KINDS.length);
  });

  it('names the expense prompt the panel actually asks for', () => {
    expect(voicePromptKey('expense')).toBe('voice.prompt.expense');
    expect(voicePromptKey('task')).toBe('voice.prompt.task');
    expect(voicePromptKey('journal')).toBe('voice.prompt.journal');
  });

  // t() returns the key itself when the string is missing, so a prompt that was
  // never translated would reach the farmer as "voice.prompt.task" printed on
  // the screen. This is the only place that can catch that, since the panel
  // itself has no test runner.
  it('has a Hebrew sentence behind every prompt key', () => {
    for (const kind of VOICE_KINDS) {
      const key = voicePromptKey(kind);
      expect(t(key)).not.toBe(key);
    }
  });
});
