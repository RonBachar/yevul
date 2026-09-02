// The confirmation checkpoint, stage 5 step 9, docs/roadmap.md: one unified
// confirmation screen for all three schemas, one or two fields and no more,
// before the result actually goes in.
//
// **One screen for three schemas, so every per-kind decision has to live
// somewhere that is not the screen.** That is this file. It answers four
// questions, and each of them is a rule a farmer feels rather than a rendering
// detail:
//
//   1. Which one or two fields get an edit box, and which are read-only text.
//   2. What a spoken plot name means: resolved, ambiguous, unmatched, absent.
//   3. Whether the record can be written at all, before the button is offered.
//   4. What arguments a parsed record turns into for createExpense, createTask
//      and createLogEntry.
//
// They live here for the reason the rest of stage 5's policy does:
// frontend/mobile has no test runner, so anything left inside a component is
// untested, and none of these four are worth leaving untested.
//
// **Nothing here talks to Supabase and nothing here renders.** The type-only
// imports of ExpenseInput, TaskInput and LogEntryInput are erased at compile
// time, so this module still pulls in neither react nor supabase-js — the same
// constraint voice.ts observes for the Worker's sake, honoured here even though
// the Worker does not load this file.

import type { ExpenseInput } from './expenses';
import type { LogEntryInput } from './logEntries';
import { formatLocalDateOnly } from './safeHarvestDate';
import type { TaskInput } from './tasks';
import {
  normalizePlotName,
  resolvePlotCandidates,
  type VoiceExpense,
  type VoiceJournal,
  type VoiceParsed,
  type VoiceTask,
} from './voice';

// ============================================================
// Which fields earn an edit box.
//
// **Two is a ceiling, not a target**, docs/design.md, Voice / OCR Confirmation
// Sheet: "Maximum two editable fields". The same ceiling the Forecast Update
// sheet holds to. Everything else the model extracted is still shown, as
// read-only text, so the farmer can see it is right — the sheet is a trust
// checkpoint, and a value he cannot see is a value he cannot check.
//
// **The test for whether a field earns the box is what happens when the model
// gets it wrong and nobody notices.** A wrong expense name shows up in the
// ledger in his own words and he fixes it on the spot. A wrong amount moves the
// bottom line with no row pointing at it, a wrong date files the row under a
// month he will never look in, and a wrong pre-harvest interval produces a
// "safe to harvest" date that is a regulatory answer. Those are the fields that
// fail silently, and those are the ones that get edited here.
// ============================================================

export const VOICE_CONFIRM_MAX_EDITABLE_FIELDS = 2;

export type VoiceEditableField = 'amount' | 'date' | 'title' | 'dueDate' | 'sprayPhiDays';

export function voiceEditableFields(parsed: VoiceParsed): readonly VoiceEditableField[] {
  // **Expense: amount and date.**
  //
  // amount is the record. It is the only number, it is money, and a
  // transcription slip between "ארבע מאות" and "ארבעת אלפים" is a tenfold
  // error that reaches the P&L with nothing on screen ever pointing back at it.
  //
  // date, because the model resolves "אתמול" and "ביום ראשון" against a `today`
  // this client supplies, and a resolution that lands in the wrong month files
  // the expense somewhere he will not think to look. Note this is not the
  // validator's job: parseVoiceExpense already guarantees the date is a real
  // calendar date, and a real date can still be the wrong one.
  //
  // name does **not** get a box, deliberately, even though it is the field he
  // would most want to touch. It is free text on the ledger row, he reads it
  // there in his own words, and editing it there costs one tap. It is the
  // textbook case of an error that does not fail silently.
  if (parsed.kind === 'expense') return ['amount', 'date'];

  // **Task: title and due date.**
  //
  // title, because for a task there is nothing else — a garbled title is a job
  // he cannot act on, and createTask rejects an empty one outright, so a screen
  // with no way to fix it would be a dead confirm button.
  //
  // dueDate, because it is the whole of the task board: it decides the urgency
  // group the row lands in, whether it renders overdue, and when he is reminded.
  //
  // estimatedCost does **not** get a box, and that is not an oversight. The
  // founder removed the estimated-cost field from the manual task sheet
  // entirely (docs/roadmap.md, stage 3): "a money question on a form that is
  // supposed to take five seconds". Putting it back on the voice sheet would
  // reintroduce exactly the field that was taken out. It is shown read-only
  // when the model heard one, and written as extracted.
  if (parsed.kind === 'task') return ['title', 'dueDate'];

  // **Journal: date, and for a spray also the pre-harvest interval.**
  //
  // These two are not two fields that happen to matter. They are precisely the
  // two arguments of safeHarvestDate(date, phiDays), i.e. the regulatory answer
  // this product exists to get right. Everything else about a spray — pest,
  // material, dose — is evidence for the record, and evidence he can read off
  // the screen. The waiting period is arithmetic he cannot check by eye.
  //
  // **A non-spray entry gets one box, not two.** sprayPhiDays does not exist on
  // it (parseVoiceJournal has already nulled all four spray fields), and
  // offering an empty box for a field that must stay null is how a harvest
  // record ends up carrying a waiting period. One field is inside the ceiling;
  // the ceiling is a maximum.
  return parsed.value.type === 'spray' ? ['date', 'sprayPhiDays'] : ['date'];
}

// ============================================================
// The plot.
//
// **The rule is not to guess, and it is a requirement rather than caution.**
// prd.md section 8: there is no guessing which amount belongs to which plot,
// because that is exactly where a transcription slip becomes a wrong financial
// figure. resolvePlotCandidates never picks; this turns what it found into the
// four things the sheet can be looking at, which are four different screens.
//
//   none       Nothing was said about a plot. Legitimate for all three kinds:
//              expenses allocate separately (a farm-level expense has no
//              allocation row at all), and both tasks.plot_id and
//              log_entries.plot_id are nullable. Nothing is shown about it.
//   matched    Exactly one plot. Shown by name, read-only.
//   ambiguous  More than one. **The sheet must ask.** Not the first, not the
//              closest, and not silently none either — dropping the plot he
//              actually named is the same wrong attribution by another route.
//   unmatched  He named a plot and no plot has that name. The record is still
//              written, without a plot, and the sheet says so rather than
//              letting the name disappear between what he said and what he
//              confirmed.
// ============================================================

export type VoicePlotOption = { id: string; name: string };

export type VoicePlotStep =
  | { status: 'none' }
  | { status: 'matched'; plotId: string; name: string }
  | { status: 'ambiguous'; candidates: VoicePlotOption[] }
  | { status: 'unmatched'; spoken: string };

export function voicePlotStep(
  spoken: string | null,
  plots: readonly VoicePlotOption[],
): VoicePlotStep {
  // Asked before the candidates, and with the resolver's own normalisation:
  // "חלקה" on its own is a description, not a name, and normalises away to
  // nothing. Telling the farmer we could not find a plot called "חלקה" would be
  // answering a question he did not ask.
  if (spoken === null || normalizePlotName(spoken) === '') return { status: 'none' };

  const candidates = resolvePlotCandidates(spoken, plots);
  if (candidates.length === 1) {
    const only = candidates[0]!;
    return { status: 'matched', plotId: only.id, name: only.name };
  }
  if (candidates.length > 1) {
    return { status: 'ambiguous', candidates: candidates.map(({ id, name }) => ({ id, name })) };
  }
  return { status: 'unmatched', spoken: spoken.trim() };
}

// The plot id a step already settles on its own. `ambiguous` is the one case
// with no answer here, because the answer is the farmer's and the sheet holds
// it until he gives it.
export function voicePlotStepId(step: VoicePlotStep): string | null {
  return step.status === 'matched' ? step.plotId : null;
}

// ============================================================
// What stops the record from being written at all.
//
// **createLogEntry refuses a spray with no pest or no material**, see
// sprayValidationError in logEntries.ts, and it refuses it *after* the farmer
// has confirmed. He has already spent one of ten monthly recordings by then,
// and an error he can do nothing about on a screen with no field for it is the
// worst possible place to tell him.
//
// So the same rule is asked here, before the confirm button is offered, and it
// is asked of the parsed record rather than of the write input. The two are
// deliberately separate functions and not one shared one: that one enumerates
// the write's own failure reasons and belongs to the write, this one gates a
// button, and collapsing them would put a database concern in front of a
// farmer. A test holds them to the same answer.
//
// **The way out is a new recording, not a third and fourth edit box.** Two
// more fields would break design.md's ceiling, and the missing halves of a
// spray record are the two things he can simply say again.
// ============================================================

export type VoiceRecordBlocker = 'sprayPestMissing' | 'sprayMaterialMissing';

export const VOICE_BLOCKER_MESSAGE_KEYS: Record<VoiceRecordBlocker, string> = {
  sprayPestMissing: 'voice.confirm.sprayPestMissing',
  sprayMaterialMissing: 'voice.confirm.sprayMaterialMissing',
};

export function voiceRecordBlocker(parsed: VoiceParsed): VoiceRecordBlocker | null {
  if (parsed.kind !== 'journal') return null;
  if (parsed.value.type !== 'spray') return null;
  if (parsed.value.sprayPest === null) return 'sprayPestMissing';
  if (parsed.value.sprayMaterial === null) return 'sprayMaterialMissing';
  return null;
}

// ============================================================
// "There are more expenses."
//
// prd.md section 8 is "one recording, one expense", and the roadmap is explicit
// about what the flag does: the confirmation screen shows a message and the
// farmer is walked through one item at a time. **There is no list-of-expenses
// schema and there is no queue**, deliberately — VoiceExpense carries a boolean
// and not an array. The one-at-a-time affordance is therefore the offer of
// another recording once this one is written, which is the whole of it.
// ============================================================

export function voiceHasMoreItems(parsed: VoiceParsed): boolean {
  return parsed.kind === 'expense' && parsed.value.hasMoreItems;
}

// ============================================================
// Editing a date without a date picker.
//
// Two number fields, day and month, no year — the same shape every manual sheet
// in this app already uses, and for the same reason: no native date picker
// dependency, and a farmer thinking "within the season" does not think in
// years. The year is inferred, and **the two directions are opposite facts**:
// an expense or a journal entry records something that already happened, so a
// day/month still ahead belongs to last year; a task due date is a target, so
// one already past belongs to next year. Both rules already existed, written
// out three times across three components. This is the tested copy; the three
// components are not touched here, and that duplication is recorded rather than
// silently left (see the report for this step).
// ============================================================

export type VoiceDateParts = { day: string; month: string };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// **Split, not `new Date(...)`.** A YYYY-MM-DD string parses as UTC midnight,
// and reading getDate() off it in a timezone behind UTC gives yesterday. That
// exact bug already shipped once in this repo and shifted every hand-picked
// date a day early. There is nothing to parse here anyway: parseVoiceExpense
// and parseVoiceJournal have already proved the string is a calendar date.
export function voiceDateParts(date: string | null): VoiceDateParts {
  if (date === null) return { day: '', month: '' };
  const [, month, day] = date.split('-');
  if (month === undefined || day === undefined) return { day: '', month: '' };
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(dayNumber)) return { day: '', month: '' };
  // Without the leading zero, matching what every manual sheet puts in the same
  // two boxes. "08" and "8" are the same month and only one of them looks typed.
  return { day: String(dayNumber), month: String(monthNumber) };
}

function dateFromParts(
  { day, month }: VoiceDateParts,
  now: Date,
  direction: 'past' | 'future',
): string | null {
  const dayNumber = Number(day.trim());
  const monthNumber = Number(month.trim());
  if (day.trim() === '' || month.trim() === '') return null;
  if (!Number.isFinite(dayNumber) || !Number.isFinite(monthNumber)) return null;
  if (dayNumber < 1 || monthNumber < 1) return null;

  const today = startOfDay(now);
  let candidate = new Date(now.getFullYear(), monthNumber - 1, dayNumber);
  if (direction === 'past' && candidate > today) {
    candidate = new Date(now.getFullYear() - 1, monthNumber - 1, dayNumber);
  }
  if (direction === 'future' && candidate < today) {
    candidate = new Date(now.getFullYear() + 1, monthNumber - 1, dayNumber);
  }
  // candidate is local midnight, so it has to be read off the local calendar.
  // toISOString() here is the same day-early bug named above.
  return formatLocalDateOnly(candidate);
}

export function voicePastDateFromParts(parts: VoiceDateParts, now: Date): string | null {
  return dateFromParts(parts, now, 'past');
}

export function voiceFutureDateFromParts(parts: VoiceDateParts, now: Date): string | null {
  return dateFromParts(parts, now, 'future');
}

// ============================================================
// Reading the two edit boxes.
//
// **Both follow voice.ts's own convention, and it is not cosmetic**: null means
// "there is no value here", undefined means "what is in the box is not a
// value". The first is a legitimate record, the second must stop the write. The
// same distinction was already the subject of a real bug in this feature, where
// an invalid number was quietly deleted instead of rejected, on the very field
// the safe-harvest date is computed from.
// ============================================================

// Required, so there is no null-means-absent case: an amount that cannot be
// read is an amount that blocks the button.
export function parseVoiceAmountInput(text: string): number | null {
  // The comma is what a Hebrew keyboard's decimal key produces on some layouts,
  // and the manual expense sheet already accepts it. A farmer typing 1,5 means
  // one and a half, and Number('1,5') is NaN.
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseVoicePhiDaysInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  // An empty box is a spray with no stated waiting period, which is a real
  // record: log.form.sprayPhiDays is optional in the manual sheet too.
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

// ============================================================
// Where the record came from.
//
// **One confirmation screen now has two ways in**, stage 5 step 11: a recording
// and a photographed receipt. design.md has always called this screen the "Voice
// / OCR Confirmation Sheet", and prd.md line 15 lists photographing a receipt
// beside typing and speaking as one of the three ways a farmer records
// something — so the second route was always going to arrive here rather than at
// a sheet of its own.
//
// **Three things follow from the origin, and every one of them would be a lie if
// it were left on the voice wording.** The `source` column, which is the only
// way anyone tells a scanned expense from a spoken one afterwards. The button
// that offers another go, which cannot say "record again" to a farmer holding a
// camera. And the sentence after a failed save, which promises that "what you
// recorded is still here".
//
// **It is a prop and not a second component.** The sheet is the trust checkpoint
// after *any* AI-parsed input, prd.md section 3, and the point of reusing the
// expense schema in step 10 was that a receipt produces the same record in the
// same columns. Two sheets that drift apart is exactly the outcome that reuse
// was meant to prevent.
//
// **`ocr` is deliberately not offered to the journal write.** log_entries.source
// is constrained to ('task','manual','voice') in the schema and LogEntrySource
// says so, and a receipt cannot produce a journal entry anyway — ReceiptParsed
// is narrowed to the expense arm. The type is the enforcement: passing an origin
// to createLogEntry would not compile.
// ============================================================

export type VoiceConfirmOrigin = 'voice' | 'ocr';

export type VoiceConfirmOriginKeys = { again: string; saveError: string };

export const VOICE_CONFIRM_ORIGIN_KEYS: Record<VoiceConfirmOrigin, VoiceConfirmOriginKeys> = {
  voice: { again: 'voice.again', saveError: 'voice.confirm.saveError' },
  ocr: { again: 'receipt.again', saveError: 'receipt.confirm.saveError' },
};

// ============================================================
// A parsed record becomes the arguments of a create call.
//
// The three functions below are the whole of the translation, and they are
// pure so that it is the translation that gets tested rather than a component
// that happens to perform it.
//
// **`source` is not passed through here.** It is not extracted, it is not
// edited, and it is not a property of the record — it is a property of how the
// record arrived. It goes straight to createExpense/createLogEntry at the call
// site, so these three cannot be handed a record from one route and a source
// from another.
// ============================================================

export type VoiceExpenseEdits = { amount: number; date: string };
export type VoiceTaskEdits = { title: string; dueDate: string | null };
export type VoiceJournalEdits = { date: string; sprayPhiDays: number | null };

export function voiceExpenseInput(
  value: VoiceExpense,
  plotId: string | null,
  edits: VoiceExpenseEdits,
): ExpenseInput {
  return {
    amount: edits.amount,
    // The extracted name, unedited. It is the free-text `category` column, the
    // same field the manual form fills, per the decision recorded in voice.ts.
    name: value.name,
    plotId,
    date: edits.date,
    // **The transcript does not go in the note.** It is display data on the
    // confirmation screen, "this is what we heard", and putting a whole spoken
    // sentence into the ledger's note column would turn every voice row into a
    // paragraph next to rows the farmer wrote himself in three words.
    note: null,
  };
}

export function voiceTaskInput(
  value: VoiceTask,
  plotId: string | null,
  edits: VoiceTaskEdits,
): TaskInput {
  return {
    title: edits.title,
    plotId,
    dueDate: edits.dueDate,
    // Written as extracted, shown read-only on the sheet. See voiceEditableFields
    // for why this is not an edit box.
    estimatedCost: value.estimatedCost,
  };
}

export function voiceJournalInput(
  value: VoiceJournal,
  plotId: string | null,
  edits: VoiceJournalEdits,
): LogEntryInput {
  const isSpray = value.type === 'spray';
  return {
    plotId,
    date: edits.date,
    type: value.type,
    note: value.note,
    // **The four regulatory fields pass through untouched.** They are the spray
    // record, and sprayPhiDays is what safeHarvestDate reads.
    sprayPest: value.sprayPest,
    sprayMaterial: value.sprayMaterial,
    sprayDose: value.sprayDose,
    // **The edited waiting period applies to a spray and to nothing else.**
    // This is not a second strip: parseVoiceJournal already nulled all four
    // fields on a non-spray record, and this line defers to that instead of
    // repeating it. What it prevents is *undoing* the strip — an edit box that
    // voiceEditableFields never offers cannot put a waiting period on a harvest,
    // and reading the parsed value here makes that structural rather than a
    // convention the screen has to remember.
    sprayPhiDays: isSpray ? edits.sprayPhiDays : value.sprayPhiDays,
    // Not in any of the three voice schemas. A harvest quantity spoken aloud
    // ("קטפתי שלושה טון") is a real thing to want, but adding it is a schema
    // change to VoiceJournal and to the JSON schema the model is given, not a
    // line here — and docs/open-items.md already records that the journal voice
    // schema is due to change for a separate reason.
    harvestQty: null,
    harvestUnit: null,
  };
}
