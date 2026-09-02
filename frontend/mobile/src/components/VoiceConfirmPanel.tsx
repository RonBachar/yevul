import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import PencilLine from 'lucide-react-native/icons/pencil-line';
import {
  createExpense,
  createLogEntry,
  createTask,
  logEntryTypeLabelKey,
  parseVoiceAmountInput,
  parseVoicePhiDaysInput,
  safeHarvestDate,
  t,
  usePlots,
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
  type VoiceDateParts,
  type VoiceParsed,
  type VoicePlotStep,
} from '@yevul/shared';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';

// The confirmation sheet, design.md "Voice / OCR Confirmation Sheet", stage 5
// step 9. **The trust checkpoint after every AI-parsed input**, prd.md section
// 3: always confirm, never guess.
//
// **One panel for all three schemas, and that is the whole point of it.** The
// roadmap line asks for a unified screen precisely so the farmer sees the same
// checkpoint whatever he said: the same heading, the same two boxes, the same
// green pill in the same place. Three sheets that each look slightly different
// would make the moment of confirming something he has to learn three times.
//
// **It renders decisions, it does not make them.** Which one or two fields get
// an edit box, what a spoken plot name resolves to, what stops a record from
// being written at all, and what a parsed record turns into for the create
// call — all of that is packages/shared/src/voiceConfirm.ts, where it is
// tested. frontend/mobile has no test runner, so anything decided in this file
// is decided untested, and the list of what that leaves is deliberately short:
// which row goes where, and what the button does when it is pressed.
//
// **A panel and not a *Sheet.** Every ExpenseSheet/TaskSheet/LogEntrySheet in
// this app renders its own <BottomSheet>; this renders inside the one
// CaptureSheet already opened, exactly as VoiceCapturePanel does, so the
// farmer stays in one layer from the microphone to the confirmation.
//
// **Sizes come from the tokens.** design.md asks for a 56px minimum on this
// button; tokens.ts records the founder's 2026-08-31 decision replacing 56 and
// 88 with 48 and 64, and formStyles.save is built on touchTarget.min. The same
// documented departure VoiceCapturePanel already makes for the microphone —
// if 56 is wanted back, the fix is tokens.ts, not a number typed in here.

type SaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'plotChoiceRequired'
  | 'amountInvalid'
  | 'dateInvalid'
  | 'titleRequired'
  | 'phiInvalid'
  | 'forbidden'
  | 'error';

const STATUS_MESSAGE_KEY: Partial<Record<SaveStatus, string>> = {
  plotChoiceRequired: 'voice.confirm.plotAsk',
  amountInvalid: 'expense.form.amountRequired',
  dateInvalid: 'voice.confirm.dateInvalid',
  titleRequired: 'tasks.form.titleRequired',
  phiInvalid: 'voice.confirm.phiInvalid',
  forbidden: 'voice.confirm.forbidden',
  error: 'voice.confirm.saveError',
};

export function VoiceConfirmPanel({
  supabase,
  farmId,
  parsed,
  transcript,
  onRecordAgain,
  onBack,
}: {
  supabase: SupabaseClient;
  // **From the caller, not from usePlots.** The write needs a farm and the
  // display needs plot names, and those are two different failures: a plots
  // query that came back empty or errored must still let him save an expense
  // with no plot, which is a legitimate record.
  farmId: string | null;
  parsed: VoiceParsed;
  // "This is what we heard." Display data, never a field of the record.
  transcript: string | null;
  // Discards this extraction and returns to the microphone, with the same kind
  // still selected.
  onRecordAgain: () => void;
  // Back to the three capture rows.
  onBack: () => void;
}) {
  const plotsState = usePlots(supabase);

  const editable = voiceEditableFields(parsed);
  const blocker = voiceRecordBlocker(parsed);
  const hasMoreItems = voiceHasMoreItems(parsed);

  // The initial values of the two boxes, taken from the extraction once. Lazy
  // initialisers rather than an effect: this panel is mounted by a result and
  // unmounted by the next recording, so there is no second `parsed` to sync to,
  // and an effect would only be a way to overwrite what the farmer just typed.
  const [amount, setAmount] = useState(() =>
    parsed.kind === 'expense' ? String(parsed.value.amount) : '',
  );
  const [title, setTitle] = useState(() => (parsed.kind === 'task' ? parsed.value.title : ''));
  const [phiDays, setPhiDays] = useState(() =>
    parsed.kind === 'journal' && parsed.value.sprayPhiDays !== null
      ? String(parsed.value.sprayPhiDays)
      : '',
  );
  const [date, setDate] = useState<VoiceDateParts>(() => {
    if (parsed.kind === 'expense') return voiceDateParts(parsed.value.date);
    if (parsed.kind === 'journal') return voiceDateParts(parsed.value.date);
    return voiceDateParts(parsed.value.dueDate);
  });

  // All three schemas carry plotName, and deliberately a name rather than an
  // id: the model hears "החלקה הדרומית" and has no way to know identifiers.
  const plotStep = voicePlotStep(parsed.value.plotName, plotsState.plots);
  // **Only the ambiguous case has a choice to hold.** Every other case is
  // already settled by voicePlotStep, and a second source of truth for the
  // resolved ones is a second thing that can be wrong.
  const [chosenPlotId, setChosenPlotId] = useState<string | null>(null);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const busy = status === 'saving';

  function resolvedPlotId(): string | null {
    if (plotStep.status === 'ambiguous') return chosenPlotId;
    return voicePlotStepId(plotStep);
  }

  async function onConfirm() {
    if (!farmId) {
      setStatus('error');
      return;
    }
    // **He named a plot and we cannot tell which one.** Nothing is written and
    // nothing is guessed, prd.md section 8.
    if (plotStep.status === 'ambiguous' && chosenPlotId === null) {
      setStatus('plotChoiceRequired');
      return;
    }
    const plotId = resolvedPlotId();

    if (parsed.kind === 'expense') {
      const amountNumber = parseVoiceAmountInput(amount);
      if (amountNumber === null) {
        setStatus('amountInvalid');
        return;
      }
      const dateValue = voicePastDateFromParts(date, new Date());
      if (dateValue === null) {
        setStatus('dateInvalid');
        return;
      }
      setStatus('saving');
      // **'voice' and not the 'manual' default.** A spoken expense and a typed
      // one have to be tellable apart afterwards; see createExpense.
      const result = await createExpense(
        supabase,
        farmId,
        voiceExpenseInput(parsed.value, plotId, { amount: amountNumber, date: dateValue }),
        'voice',
      );
      finish(result.ok, result.ok ? null : result.reason);
      return;
    }

    if (parsed.kind === 'task') {
      const trimmedTitle = title.trim();
      if (trimmedTitle === '') {
        setStatus('titleRequired');
        return;
      }
      // A task with no due date is a real task ("מתישהו"), so empty boxes are
      // an answer here rather than a failure.
      const dueDate = voiceFutureDateFromParts(date, new Date());
      setStatus('saving');
      // **No source is written for a task, because the column does not exist.**
      // expenses and log_entries both carry one; public.tasks does not, so
      // there is no way to tell a spoken task from a typed one until a
      // migration adds it. Recorded rather than faked.
      const result = await createTask(
        supabase,
        farmId,
        voiceTaskInput(parsed.value, plotId, { title: trimmedTitle, dueDate }),
      );
      finish(result.ok, result.ok ? null : result.reason);
      return;
    }

    const dateValue = voicePastDateFromParts(date, new Date());
    if (dateValue === null) {
      setStatus('dateInvalid');
      return;
    }
    const phi = parseVoicePhiDaysInput(phiDays);
    // undefined is "what is in the box is not a number", which must stop the
    // write. null is "no waiting period", which is a real spray record. The
    // difference matters here more than anywhere else in the product: this is
    // the field the safe-harvest date is computed from.
    if (phi === undefined) {
      setStatus('phiInvalid');
      return;
    }
    setStatus('saving');
    const result = await createLogEntry(
      supabase,
      farmId,
      voiceJournalInput(parsed.value, plotId, { date: dateValue, sprayPhiDays: phi }),
      'voice',
    );
    finish(result.ok, result.ok ? null : result.reason);
  }

  // **A failed write leaves everything exactly where it was.** He has just
  // spent one of ten monthly recordings, so the parsed record, both edit boxes
  // and the plot he picked all stay on screen and the button stays pressable.
  // The only thing that changes is the sentence under it.
  function finish(ok: boolean, reason: string | null) {
    if (ok) {
      setStatus('saved');
      return;
    }
    setStatus(reason === 'forbidden' ? 'forbidden' : 'error');
  }

  if (status === 'saved') {
    return (
      <View style={styles.root}>
        <CircleCheckBig size={32} strokeWidth={2} color={colors.field700} />
        <Text style={styles.saved}>
          {/* The one-at-a-time affordance, docs/roadmap.md: when the model
              heard further expenses, the farmer is walked through them one
              recording at a time. There is no queue and no list schema. */}
          {hasMoreItems ? t('voice.confirm.savedMore') : t('voice.confirm.saved')}
        </Text>
        <Pressable
          style={[formStyles.save, styles.action]}
          onPress={onRecordAgain}
          accessibilityRole="button"
        >
          <Text style={formStyles.saveText}>{t('voice.again')}</Text>
        </Pressable>
        <BackLink onPress={onBack} />
      </View>
    );
  }

  const messageKey = STATUS_MESSAGE_KEY[status];

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{t('voice.confirm.heading')}</Text>

      {transcript !== null && (
        <View style={styles.transcript}>
          <Text style={styles.transcriptLabel}>{t('voice.heard')}</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      )}

      {/* **Every box is gated on voiceEditableFields, not on the kind alone.**
          The kind check is what narrows the union for the state above it; the
          `editable` check is what makes the tested function the only authority
          on which fields carry a pencil. Without it, the ceiling would be
          enforced in one file and rendered in another, and the two would drift
          the first time a field was moved. */}
      {parsed.kind === 'expense' && (
        <>
          <ReadRow label={t('expense.form.name')} value={parsed.value.name} />
          {editable.includes('amount') && (
            <EditRow
              label={t('expense.form.amount')}
              value={amount}
              onChangeText={setAmount}
              disabled={busy}
              keyboardType="decimal-pad"
            />
          )}
        </>
      )}

      {parsed.kind === 'task' && editable.includes('title') && (
        <EditRow
          label={t('capture.task')}
          value={title}
          onChangeText={setTitle}
          disabled={busy}
          textAlign="right"
        />
      )}

      {parsed.kind === 'journal' && (
        <>
          <ReadRow label={t('log.form.type')} value={t(logEntryTypeLabelKey(parsed.value.type))} />
          {parsed.value.type === 'spray' && (
            <>
              <ReadRow label={t('log.form.sprayPest')} value={parsed.value.sprayPest} />
              <ReadRow label={t('log.form.sprayMaterial')} value={parsed.value.sprayMaterial} />
              <ReadRow label={t('log.form.sprayDose')} value={parsed.value.sprayDose} />
            </>
          )}
          <ReadRow label={t('log.form.note')} value={parsed.value.note} />
        </>
      )}

      {(editable.includes('date') || editable.includes('dueDate')) && (
        <DateRow
          label={editable.includes('dueDate') ? t('tasks.form.due') : t('log.form.date')}
          parts={date}
          onChange={setDate}
          disabled={busy}
        />
      )}

      {editable.includes('sprayPhiDays') && (
        <EditRow
          label={t('log.form.sprayPhiDays')}
          value={phiDays}
          onChangeText={setPhiDays}
          disabled={busy}
          keyboardType="number-pad"
        />
      )}

      {/* The regulatory answer itself, derived rather than entered, exactly as
          the manual journal sheet shows it. It is the reason the date and the
          waiting period are the two boxes on this screen. */}
      <SafeHarvestLine parsed={parsed} parts={date} phiDays={phiDays} />

      {parsed.kind === 'task' && parsed.value.estimatedCost !== null && (
        <ReadRow label={t('tasks.form.cost')} value={String(parsed.value.estimatedCost)} />
      )}

      <PlotSection
        loading={plotsState.loading}
        step={plotStep}
        chosenPlotId={chosenPlotId}
        onChoose={setChosenPlotId}
        disabled={busy}
      />

      {hasMoreItems && <Text style={styles.note}>{t('voice.confirm.moreItems')}</Text>}

      {blocker === null ? (
        <Pressable
          style={[formStyles.save, styles.action, busy && formStyles.saveDisabled]}
          onPress={() => void onConfirm()}
          disabled={busy || plotsState.loading}
          accessibilityRole="button"
        >
          <Text style={formStyles.saveText}>
            {busy ? t('voice.confirm.saving') : t('voice.confirm.confirm')}
          </Text>
        </Pressable>
      ) : (
        // **Nothing to confirm.** createLogEntry refuses a spray with no pest
        // or no material, and this sheet holds a ceiling of two edit boxes, so
        // the missing half is something he says again rather than types. The
        // single filled button becomes the only action that can help.
        <>
          <Text style={[formStyles.bad, styles.centered]}>
            {t(VOICE_BLOCKER_MESSAGE_KEYS[blocker])}
          </Text>
          <Pressable
            style={[formStyles.save, styles.action]}
            onPress={onRecordAgain}
            accessibilityRole="button"
          >
            <Text style={formStyles.saveText}>{t('voice.again')}</Text>
          </Pressable>
        </>
      )}

      {messageKey !== undefined && (
        <Text style={[formStyles.bad, styles.centered]}>{t(messageKey)}</Text>
      )}

      {/* **Exactly one filled button and exactly one text link**, design.md:
          never two filled buttons competing for the same thumb. When there is
          something to confirm the link discards the extraction and goes back to
          the microphone — the one way a parsed record is allowed to be thrown
          away, because he asked. When there is nothing to confirm, recording
          again is already the filled button and the link is the way out. */}
      {blocker === null ? (
        <Pressable
          style={styles.link}
          onPress={onRecordAgain}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>{t('voice.again')}</Text>
        </Pressable>
      ) : (
        <BackLink onPress={onBack} />
      )}
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress} accessibilityRole="button">
      <Text style={styles.linkText}>{t('voice.back')}</Text>
    </Pressable>
  );
}

// ============================================================
// The rows.
//
// **Read-only is not "hidden".** design.md puts a ceiling of two edit boxes on
// this sheet, not a ceiling of two facts: everything the model extracted is on
// screen so the farmer can check it, and only the fields that fail silently
// carry a pencil. A value the model did not find is simply not rendered, rather
// than rendered as an empty line that looks like a broken field.
// ============================================================

function ReadRow({ label, value }: { label: string; value: string | null }) {
  if (value === null || value.trim() === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// The pencil is design.md's `.edit-ic`, Slate-600 at rest. It sits beside the
// label rather than inside the box, so the box itself stays a plain large
// target rather than a field with a control in the corner.
function EditLabel({ label }: { label: string }) {
  return (
    <View style={styles.editLabelRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <PencilLine size={18} strokeWidth={1.75} color={colors.slate600} />
    </View>
  );
}

function EditRow({
  label,
  value,
  onChangeText,
  disabled,
  keyboardType,
  textAlign,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  disabled: boolean;
  keyboardType?: 'decimal-pad' | 'number-pad';
  textAlign?: 'right';
}) {
  return (
    <View style={styles.row}>
      <EditLabel label={label} />
      <TextInput
        style={[formStyles.input, styles.editInput]}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        keyboardType={keyboardType}
        textAlign={textAlign ?? 'right'}
      />
    </View>
  );
}

// Day and month, no year, the same two boxes every manual sheet in this app
// uses. The year is inferred by voicePastDateFromParts / voiceFutureDateFromParts.
function DateRow({
  label,
  parts,
  onChange,
  disabled,
}: {
  label: string;
  parts: VoiceDateParts;
  onChange: (next: VoiceDateParts) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.row}>
      <EditLabel label={label} />
      <View style={styles.dateRow}>
        <TextInput
          style={[formStyles.input, styles.dateInput]}
          value={parts.day}
          onChangeText={(day) => onChange({ ...parts, day })}
          editable={!disabled}
          keyboardType="number-pad"
          placeholder={t('log.form.dateDay')}
          placeholderTextColor={colors.slate600}
          textAlign="center"
          maxLength={2}
        />
        <TextInput
          style={[formStyles.input, styles.dateInput]}
          value={parts.month}
          onChangeText={(month) => onChange({ ...parts, month })}
          editable={!disabled}
          keyboardType="number-pad"
          placeholder={t('log.form.dateMonth')}
          placeholderTextColor={colors.slate600}
          textAlign="center"
          maxLength={2}
        />
      </View>
    </View>
  );
}

// Recomputed from the two boxes as he types, not from the extraction, because
// the whole reason those two boxes are the editable ones is that this line
// depends on them.
function SafeHarvestLine({
  parsed,
  parts,
  phiDays,
}: {
  parsed: VoiceParsed;
  parts: VoiceDateParts;
  phiDays: string;
}) {
  if (parsed.kind !== 'journal' || parsed.value.type !== 'spray') return null;
  const date = voicePastDateFromParts(parts, new Date());
  const phi = parseVoicePhiDaysInput(phiDays);
  if (date === null || phi === null || phi === undefined) return null;
  const safe = safeHarvestDate(date, phi);
  if (!safe) return null;
  return (
    <Text style={styles.safeHarvest}>
      {t('log.form.safeHarvestPrefix')}{' '}
      {new Date(safe).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}
    </Text>
  );
}

// ============================================================
// The plot.
//
// **The ambiguous case is the only one with a control**, and that is the
// requirement rather than a layout choice: prd.md section 8 forbids guessing
// which figure belongs to which plot, so two candidates become a question and
// never a default. Nothing is preselected.
// ============================================================

function PlotSection({
  loading,
  step,
  chosenPlotId,
  onChoose,
  disabled,
}: {
  loading: boolean;
  step: VoicePlotStep;
  chosenPlotId: string | null;
  onChoose: (id: string) => void;
  disabled: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('voice.confirm.plot')}</Text>
        <Text style={styles.rowValue}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (step.status === 'none') return null;

  if (step.status === 'matched') {
    return <ReadRow label={t('voice.confirm.plot')} value={step.name} />;
  }

  if (step.status === 'unmatched') {
    return <Text style={styles.note}>{t('voice.confirm.plotUnknown')}</Text>;
  }

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{t('voice.confirm.plotAsk')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={formStyles.chips}>
          {step.candidates.map((candidate) => {
            const active = chosenPlotId === candidate.id;
            return (
              <Pressable
                key={candidate.id}
                style={[formStyles.chip, active && formStyles.chipActive]}
                onPress={() => onChoose(candidate.id)}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                  {candidate.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    gap: spacing.s16,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s16,
  },
  heading: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  saved: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  row: {
    gap: spacing.s8,
  },
  rowLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // body-lg, design.md's Type Scale: "Confirmation-sheet field values".
  rowValue: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodyLg,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  editLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
  },
  // The same body-lg the read-only values use, so an edited field and a shown
  // one read as the same kind of thing at the same size.
  editInput: {
    fontSize: fontSize.bodyLg,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.s8,
  },
  dateInput: {
    flex: 1,
    fontSize: fontSize.bodyLg,
  },
  safeHarvest: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  transcript: {
    alignSelf: 'stretch',
    gap: spacing.s4,
    padding: spacing.s16,
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
  },
  transcriptLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  transcriptText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  action: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.s24,
  },
  centered: {
    textAlign: 'center',
  },
  link: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
});
