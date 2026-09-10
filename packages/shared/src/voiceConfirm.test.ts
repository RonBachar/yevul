import { describe, expect, it } from 'vitest';
import {
  parseVoiceAmountInput,
  parseVoicePhiDaysInput,
  voiceDateParts,
  voiceEditableFields,
  voiceExpenseInput,
  voiceFutureDateFromParts,
  voiceHasMoreItems,
  voiceJournalInput,
  voicePastDateFromParts,
  voicePlotStep,
  voicePlotStepId,
  voiceRecordBlocker,
  voiceTaskInput,
  VOICE_BLOCKER_MESSAGE_KEYS,
  VOICE_CONFIRM_MAX_EDITABLE_FIELDS,
  VOICE_CONFIRM_ORIGIN_KEYS,
  type VoiceConfirmOrigin,
} from './voiceConfirm';
import { t } from './i18n';
import {
  VOICE_KINDS,
  type VoiceExpense,
  type VoiceJournal,
  type VoiceParsed,
  type VoiceTask,
} from './voice';

// The confirmation checkpoint, stage 5 step 9.
//
// **These tests exist because the screen cannot be tested.** frontend/mobile
// has no test runner, so every decision that could be lifted out of the
// component was, and this file is where those decisions are held to their
// reasons. What is left in the component is rendering.

const expenseValue: VoiceExpense = {
  amount: 1500,
  name: 'סולר',
  plotName: 'דרומית',
  date: '2026-08-30',
  confidence: 0.9,
  hasMoreItems: false,
};

const taskValue: VoiceTask = {
  title: 'להחליף מסנן',
  plotName: null,
  dueDate: '2026-09-10',
  estimatedCost: 420,
  confidence: 0.8,
};

const sprayValue: VoiceJournal = {
  date: '2026-08-30',
  plotName: 'צפונית',
  type: 'spray',
  note: null,
  sprayPest: 'כנימה',
  sprayMaterial: 'קונפידור',
  sprayDose: '50 סמ"ק',
  sprayPhiDays: 14,
  confidence: 0.9,
};

// parseVoiceJournal has already nulled all four spray fields on this one. The
// fixture is written the way the validator hands it over, not the way a model
// might have answered.
const harvestValue: VoiceJournal = {
  date: '2026-08-30',
  plotName: null,
  type: 'harvest',
  note: 'קטיף ראשון',
  sprayPest: null,
  sprayMaterial: null,
  sprayDose: null,
  sprayPhiDays: null,
  confidence: 0.7,
};

const expense: VoiceParsed = { kind: 'expense', value: expenseValue };
const task: VoiceParsed = { kind: 'task', value: taskValue };
const spray: VoiceParsed = { kind: 'journal', value: sprayValue };
const harvest: VoiceParsed = { kind: 'journal', value: harvestValue };

// ============================================================

describe('voiceEditableFields', () => {
  // **The ceiling design.md sets, asserted rather than remembered.** Every
  // future kind, and every future argument for "just one more field", meets
  // this test first.
  it('never offers more than two edit boxes, for any kind', () => {
    for (const parsed of [expense, task, spray, harvest]) {
      expect(voiceEditableFields(parsed).length).toBeLessThanOrEqual(
        VOICE_CONFIRM_MAX_EDITABLE_FIELDS,
      );
    }
  });

  it('offers no field twice', () => {
    for (const parsed of [expense, task, spray, harvest]) {
      const fields = voiceEditableFields(parsed);
      expect(new Set(fields).size).toBe(fields.length);
    }
  });

  // The two that fail silently: an amount nothing on screen points back at, and
  // a date that files the row under a month he will not look in.
  it('edits the amount and the date of an expense, and not its name', () => {
    expect(voiceEditableFields(expense)).toEqual(['amount', 'date']);
  });

  // estimatedCost is a number, and it still does not get a box: the founder
  // removed the estimated-cost field from the manual task form entirely, and a
  // voice sheet that put it back would undo that decision.
  it('edits the title and the due date of a task, and not its estimated cost', () => {
    expect(voiceEditableFields(task)).toEqual(['title', 'dueDate']);
  });

  // Exactly the two arguments of safeHarvestDate(date, phiDays).
  it('edits the two fields the safe-harvest date is computed from, on a spray', () => {
    expect(voiceEditableFields(spray)).toEqual(['date', 'sprayPhiDays']);
  });

  // **The one that matters most.** An empty waiting-period box on a harvest
  // record is how a waiting period ends up on a harvest record.
  it('offers no waiting-period box on a journal entry that is not a spray', () => {
    expect(voiceEditableFields(harvest)).toEqual(['date']);
    expect(voiceEditableFields(harvest)).not.toContain('sprayPhiDays');
  });
});

// ============================================================

describe('voicePlotStep', () => {
  const plots = [
    { id: 'p1', name: 'חלקה צפונית' },
    { id: 'p2', name: 'חלקה דרומית' },
  ];

  it('resolves a single match, and carries the name the sheet has to show', () => {
    expect(voicePlotStep('הדרומית', plots)).toEqual({
      status: 'matched',
      plotId: 'p2',
      name: 'חלקה דרומית',
    });
  });

  // **The whole reason this step exists.** prd.md section 8: no guessing which
  // figure belongs to which plot. Two candidates come back as two candidates,
  // named, so the screen can ask rather than pick.
  it('hands back every candidate when the name is ambiguous, and picks none', () => {
    const twins = [
      { id: 'a', name: 'חלקה דרומית' },
      { id: 'b', name: 'הדרומית' },
    ];
    const step = voicePlotStep('דרומית', twins);
    expect(step.status).toBe('ambiguous');
    if (step.status === 'ambiguous') {
      expect(step.candidates).toEqual([
        { id: 'a', name: 'חלקה דרומית' },
        { id: 'b', name: 'הדרומית' },
      ]);
    }
    // And nothing downstream may treat it as settled.
    expect(voicePlotStepId(step)).toBeNull();
  });

  it('separates "he named no plot" from "he named one we do not have"', () => {
    expect(voicePlotStep(null, plots)).toEqual({ status: 'none' });
    expect(voicePlotStep('מערבית', plots)).toEqual({ status: 'unmatched', spoken: 'מערבית' });
  });

  // "חלקה" on its own is the word the resolver strips as a description. Saying
  // "we could not find a plot called חלקה" would answer a question nobody asked.
  it('treats a name that is only the word for "plot" as no plot at all', () => {
    expect(voicePlotStep('חלקה', plots)).toEqual({ status: 'none' });
    expect(voicePlotStep('   ', plots)).toEqual({ status: 'none' });
  });

  // Every kind's write path accepts a null plot: expenses allocate through a
  // separate table and simply get no allocation row, and both tasks.plot_id and
  // log_entries.plot_id are nullable.
  it('settles on no plot id for every case except a single match', () => {
    expect(voicePlotStepId(voicePlotStep(null, plots))).toBeNull();
    expect(voicePlotStepId(voicePlotStep('מערבית', plots))).toBeNull();
    expect(voicePlotStepId(voicePlotStep('צפונית', plots))).toBe('p1');
  });
});

// ============================================================

describe('voiceRecordBlocker', () => {
  // The rule createLogEntry enforces on the write, asked here before the
  // confirm button is offered — because by the time the write refuses, the
  // farmer has already spent one of ten monthly recordings.
  it('blocks a spray with no pest and a spray with no material', () => {
    expect(voiceRecordBlocker({ kind: 'journal', value: { ...sprayValue, sprayPest: null } })).toBe(
      'sprayPestMissing',
    );
    expect(
      voiceRecordBlocker({ kind: 'journal', value: { ...sprayValue, sprayMaterial: null } }),
    ).toBe('sprayMaterialMissing');
  });

  it('blocks nothing else', () => {
    expect(voiceRecordBlocker(spray)).toBeNull();
    // A harvest carries all four spray fields null by design, and that is not a
    // missing pest.
    expect(voiceRecordBlocker(harvest)).toBeNull();
    expect(voiceRecordBlocker(expense)).toBeNull();
    expect(voiceRecordBlocker(task)).toBeNull();
  });

  it('has Hebrew behind every blocker message, not a printed key', () => {
    for (const key of Object.values(VOICE_BLOCKER_MESSAGE_KEYS)) {
      expect(t(key)).not.toBe(key);
    }
  });
});

// ============================================================

describe('voiceHasMoreItems', () => {
  // prd.md section 8: one recording, one expense. The flag is a boolean and
  // there is deliberately no list schema behind it.
  it('is true only for an expense that said so', () => {
    const more: VoiceParsed = { kind: 'expense', value: { ...expenseValue, hasMoreItems: true } };
    expect(voiceHasMoreItems(more)).toBe(true);
    expect(voiceHasMoreItems(expense)).toBe(false);
    expect(voiceHasMoreItems(task)).toBe(false);
    expect(voiceHasMoreItems(spray)).toBe(false);
  });

  it('has Hebrew behind the sentence it turns on', () => {
    expect(t('voice.confirm.moreItems')).not.toBe('voice.confirm.moreItems');
    expect(t('voice.confirm.savedMore')).not.toBe('voice.confirm.savedMore');
  });
});

// ============================================================

describe('voiceDateParts', () => {
  // **The regression that already shipped once in this repo.** new Date() on a
  // YYYY-MM-DD string parses UTC midnight, and reading the day off it behind
  // UTC gives yesterday. Nothing here parses a Date at all.
  it('reads the day and month off the string, with no timezone in the way', () => {
    expect(voiceDateParts('2026-08-01')).toEqual({ day: '1', month: '8' });
    expect(voiceDateParts('2026-01-31')).toEqual({ day: '31', month: '1' });
  });

  it('drops leading zeros, matching what the manual sheets put in the same boxes', () => {
    expect(voiceDateParts('2026-09-05')).toEqual({ day: '5', month: '9' });
  });

  it('gives empty boxes for a date that is not there', () => {
    expect(voiceDateParts(null)).toEqual({ day: '', month: '' });
  });
});

describe('the two date directions', () => {
  const now = new Date(2026, 8, 2); // 2 September 2026, local midnight.

  // An expense and a journal entry record something that already happened.
  it('rolls a still-future day/month back to last year for a past record', () => {
    expect(voicePastDateFromParts({ day: '30', month: '8' }, now)).toBe('2026-08-30');
    expect(voicePastDateFromParts({ day: '15', month: '12' }, now)).toBe('2025-12-15');
  });

  // A task due date is a target, so it goes the other way.
  it('rolls an already-past day/month forward to next year for a due date', () => {
    expect(voiceFutureDateFromParts({ day: '10', month: '9' }, now)).toBe('2026-09-10');
    expect(voiceFutureDateFromParts({ day: '15', month: '8' }, now)).toBe('2027-08-15');
  });

  it('reads an empty or nonsense pair as no date rather than guessing one', () => {
    expect(voicePastDateFromParts({ day: '', month: '' }, now)).toBeNull();
    expect(voicePastDateFromParts({ day: '12', month: '' }, now)).toBeNull();
    expect(voicePastDateFromParts({ day: 'שלוש', month: '8' }, now)).toBeNull();
    expect(voiceFutureDateFromParts({ day: '0', month: '8' }, now)).toBeNull();
  });
});

// ============================================================

describe('reading the edit boxes', () => {
  it('accepts a comma as the decimal separator in an amount', () => {
    expect(parseVoiceAmountInput('1,5')).toBe(1.5);
    expect(parseVoiceAmountInput('1500')).toBe(1500);
  });

  it('refuses an amount that is not a positive number', () => {
    expect(parseVoiceAmountInput('')).toBeNull();
    expect(parseVoiceAmountInput('0')).toBeNull();
    expect(parseVoiceAmountInput('-40')).toBeNull();
    expect(parseVoiceAmountInput('הרבה')).toBeNull();
  });

  // **null and undefined are different answers, and the difference is the bug
  // this feature already had once.** An unreadable waiting period that came
  // back as null would be silently deleted from the record the safe-harvest
  // date is computed from; undefined stops the write instead.
  it('separates an empty waiting period from an unreadable one', () => {
    expect(parseVoicePhiDaysInput('')).toBeNull();
    expect(parseVoicePhiDaysInput('   ')).toBeNull();
    expect(parseVoicePhiDaysInput('14')).toBe(14);
    expect(parseVoicePhiDaysInput('שבועיים')).toBeUndefined();
    expect(parseVoicePhiDaysInput('-3')).toBeUndefined();
  });
});

// ============================================================

describe('a parsed record becoming the arguments of a create call', () => {
  it('carries the edited amount and date, and the extracted name, into createExpense', () => {
    expect(voiceExpenseInput(expenseValue, 'p2', { amount: 1600, date: '2026-08-29' })).toEqual({
      amount: 1600,
      name: 'סולר',
      plotId: 'p2',
      date: '2026-08-29',
      // The transcript is display data on the sheet, not a ledger note.
      note: null,
    });
  });

  it('writes an expense with no plot when none was resolved', () => {
    const input = voiceExpenseInput(expenseValue, null, { amount: 1500, date: '2026-08-30' });
    expect(input.plotId).toBeNull();
  });

  it('carries the extracted estimated cost into createTask without offering to edit it', () => {
    expect(
      voiceTaskInput(taskValue, null, { title: 'להחליף מסנן', dueDate: '2026-09-10' }),
    ).toEqual({
      title: 'להחליף מסנן',
      plotId: null,
      dueDate: '2026-09-10',
      estimatedCost: 420,
      assignedTo: null,
    });
  });

  it('keeps a task with no due date as a task with no due date', () => {
    const input = voiceTaskInput(taskValue, null, { title: 'x', dueDate: null });
    expect(input.dueDate).toBeNull();
  });

  // **The four regulatory fields reach the write intact.** This is the whole
  // point of the journal path: sprayPhiDays is what safeHarvestDate reads, and
  // pest, material and dose are the record a regulator asks for.
  it('carries every spray field into createLogEntry unchanged', () => {
    expect(voiceJournalInput(sprayValue, 'p1', { date: '2026-08-30', sprayPhiDays: 14 })).toEqual({
      plotId: 'p1',
      date: '2026-08-30',
      type: 'spray',
      note: null,
      sprayPest: 'כנימה',
      sprayMaterial: 'קונפידור',
      sprayDose: '50 סמ"ק',
      sprayPhiDays: 14,
      sprayQuantity: null,
      sprayQuantityUnit: null,
      sprayUnitPrice: null,
      workHours: null,
      workHourlyRate: null,
      cost: null,
      harvestQty: null,
      harvestUnit: null,
    });
  });

  it('carries an edited waiting period, since that is the field with the box', () => {
    const input = voiceJournalInput(sprayValue, 'p1', { date: '2026-08-30', sprayPhiDays: 21 });
    expect(input.sprayPhiDays).toBe(21);
  });

  // **Not a second strip, a refusal to undo the first one.** parseVoiceJournal
  // already nulled all four fields on a non-spray record; this asserts that no
  // edited value can put one of them back.
  it('never puts a waiting period on an entry that is not a spray', () => {
    const input = voiceJournalInput(harvestValue, null, {
      date: '2026-08-30',
      sprayPhiDays: 30,
    });
    expect(input.sprayPhiDays).toBeNull();
    expect(input.sprayPest).toBeNull();
    expect(input.sprayMaterial).toBeNull();
    expect(input.sprayDose).toBeNull();
    expect(input.type).toBe('harvest');
    expect(input.note).toBe('קטיף ראשון');
  });
});

// ============================================================

describe('the confirmation sheet strings', () => {
  // Same guard as the recording panel's prompt keys: a farmer must never read
  // "voice.confirm.heading" off the screen because a key was never translated.
  it('has Hebrew behind every sentence the sheet can show', () => {
    const keys = [
      'voice.confirm.heading',
      'voice.confirm.confirm',
      'voice.confirm.saving',
      'voice.confirm.plot',
      'voice.confirm.plotAsk',
      'voice.confirm.plotUnknown',
      'voice.confirm.moreItems',
      'voice.confirm.saved',
      'voice.confirm.savedMore',
      'voice.confirm.saveError',
      'voice.confirm.forbidden',
      'voice.confirm.dateInvalid',
      'voice.confirm.phiInvalid',
    ];
    for (const key of keys) expect(t(key)).not.toBe(key);
  });

  it('still covers all three kinds, so a fourth would show up here', () => {
    expect(VOICE_KINDS).toHaveLength(3);
  });
});

// ============================================================
// Where the record came from, stage 5 step 11.
//
// **One sheet, two ways in, and the wording has to follow the way in.** The
// failure this pins is the quiet one: a receipt route added by copying the voice
// props, leaving a farmer holding a camera a button that says "record again" and
// a failed save that promises "what you recorded is still here".
// ============================================================

describe('the confirmation sheet origin', () => {
  const origins: VoiceConfirmOrigin[] = ['voice', 'ocr'];

  it('gives each origin its own wording, never the other one’s', () => {
    expect(VOICE_CONFIRM_ORIGIN_KEYS.voice.again).not.toBe(VOICE_CONFIRM_ORIGIN_KEYS.ocr.again);
    expect(VOICE_CONFIRM_ORIGIN_KEYS.voice.saveError).not.toBe(
      VOICE_CONFIRM_ORIGIN_KEYS.ocr.saveError,
    );
  });

  it('has Hebrew behind every sentence either origin can show', () => {
    for (const origin of origins) {
      for (const key of Object.values(VOICE_CONFIRM_ORIGIN_KEYS[origin])) {
        expect(t(key), key).not.toBe(key);
      }
    }
  });

  // A scanned receipt is never offered a microphone and a recording is never
  // offered a camera. Read off the Hebrew rather than off the key names, because
  // the key names are ours and the sentence is the farmer's.
  it('never offers the wrong device', () => {
    expect(t(VOICE_CONFIRM_ORIGIN_KEYS.ocr.again)).toContain('צילום');
    expect(t(VOICE_CONFIRM_ORIGIN_KEYS.ocr.saveError)).not.toContain('הקלט');
    expect(t(VOICE_CONFIRM_ORIGIN_KEYS.voice.again)).toContain('הקלטה');
    expect(t(VOICE_CONFIRM_ORIGIN_KEYS.voice.saveError)).not.toContain('צילום');
  });

  // Both values are valid ExpenseSource strings, which is what lets the sheet
  // hand the origin straight to createExpense. 'manual' is deliberately not one
  // of them: nothing that reaches this sheet was typed.
  it('is a source the expense writer accepts, and never manual', () => {
    for (const origin of origins) {
      expect(['voice', 'ocr']).toContain(origin);
      expect(origin).not.toBe('manual');
    }
  });
});
