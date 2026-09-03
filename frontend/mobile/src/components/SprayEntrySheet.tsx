import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applySprayMaterial,
  createLogEntry,
  newSprayDraft,
  nextSprayStep,
  parseSprayPhiDaysInput,
  previousSprayStep,
  safeHarvestDate,
  sprayDateOptions,
  sprayDoseOptions,
  sprayDraftFromEntry,
  sprayEntryBlocker,
  sprayEntryInput,
  sprayMaterialOptions,
  sprayPestOptions,
  sprayPhiOptions,
  sprayPlotOptions,
  sprayStepFieldKey,
  sprayStepPosition,
  sprayStepTitleKey,
  SPRAY_BLOCKER_MESSAGE_KEYS,
  t,
  updateLogEntry,
  usePlots,
  useSpraySuggestions,
  voicePastDateFromParts,
  type LogEntry,
  type SprayDraft,
  type SprayStep,
} from '@yevul/shared';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { TilePicker, type TileOption } from './TilePicker';

// Writing a spray, one question per screen, every answer a square.
//
// **This is the first consumer of TilePicker and it replaces LogEntrySheet on
// the Spray Log Screen only.** LogEntrySheet is untouched and still owns the
// Journal tab and the other nine entry types; retiring it here rather than
// everywhere is deliberate, because the pattern is being reviewed before it is
// applied to the rest of the app.
//
// ---- Why a walk and not one tall form ----
//
// The sketch is explicit: a title naming the field, a grid of squares, an "add
// a new one" at the bottom, one field at a time. What that buys over the form
// it replaces is not tiles-instead-of-chips, it is **no keyboard and no
// horizontal scrolling on the ordinary path**. The old sheet asked for a pest
// and a material as free text with a hidden suggestion strip underneath, a dose
// and a waiting period as number fields, and a plot as a horizontal chip strip.
//
// **Counted concretely, best case on the old sheet** -- both names already in
// this farm's history, plot near the front of the strip: press "new spray",
// tap the pest suggestion, tap the material suggestion, tap into the dose box
// and type it, tap into the waiting-days box and type it, swipe the plot strip,
// tap the plot, press save. **Seven taps, one horizontal swipe and about four
// keystrokes.** With a material used for the first time it is the same seven
// taps and closer to eighteen keystrokes, on a keyboard that covers the sheet.
//
// **Counted the same way here**: press "new spray", tap the pest, tap the
// material, tap the plot, tap "today", press save. **Six taps, no keystrokes,
// no horizontal scrolling** -- and five when he came in from a plot, because
// then the plot was already answered. Two of those steps disappeared rather
// than got faster, which is the part worth keeping:
//
// **Dose and waiting period are properties of the material, not of the spray.**
// They are printed on the can. So picking a material the farm has used before
// fills both from the last time it was used and the walk does not ask -- see
// applySprayMaterial in packages/shared/src/sprayEntry.ts. That is the
// history grid paying a second dividend: the more he uses the app, the shorter
// the walk gets.
//
// **The review screen is what pays for that skip and it is not optional.** A
// waiting period carried over silently is a regulatory number nobody looked at,
// and safeHarvestDate turns it into "safe to harvest from". So the last screen
// shows all six values as tiles, with the safe-harvest date computed underneath
// them, and one tap on any tile goes back to the screen that set it. Nothing is
// written that he has not seen.
//
// ---- The keyboard ----
//
// It appears in exactly one situation: he pressed an "add a new one" tile. Then
// a single input opens under the grid with a confirm button. Every other path
// through this sheet is taps.
//
// ---- Editing ----
//
// An existing spray opens straight on the review with its own values, because
// the review already is the six-field summary with a way into each one. There
// is no second layout for editing.
//
// The date arithmetic is voicePastDateFromParts from the shared package, which
// is the tested copy of the day/month rule the three older sheets each wrote
// out by hand. It builds the date with formatLocalDateOnly; toISOString is
// banned in this repo and the reason is written at the bottom of
// safeHarvestDate.ts.

// The plot step's tiles carry a plot id, and "the whole farm" is a real answer
// with no id. A sentinel rather than an empty string so that a missing value
// and the whole-farm choice can never be confused in onSelect.
const WHOLE_FARM_VALUE = 'whole-farm';

type Status = 'idle' | 'saving' | 'pestRequired' | 'materialRequired' | 'forbidden' | 'error';

export function SprayEntrySheet({
  supabase,
  visible,
  onClose,
  entry,
  defaultPlotId,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  visible: boolean;
  onClose: () => void;
  entry: LogEntry | null;
  defaultPlotId: string | null;
  farmId: string | null;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);
  const suggestions = useSpraySuggestions(supabase, farmId);

  const [step, setStep] = useState<SprayStep>('pest');
  const [draft, setDraft] = useState<SprayDraft>(() => newSprayDraft(new Date(), defaultPlotId));
  // Set when a tile on the review was tapped, so that answering the step it
  // jumped to comes straight back rather than walking the rest of the flow
  // again. Checking a single value should cost two taps, not five.
  const [returnToReview, setReturnToReview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [addDay, setAddDay] = useState('');
  const [addMonth, setAddMonth] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const busy = status === 'saving';

  // The three date tiles are relative to the day the sheet was opened on, so
  // they are fixed for as long as it is open rather than recomputed per render.
  const dateOptions = useMemo(() => sprayDateOptions(new Date()), [visible]);

  useEffect(() => {
    if (!visible) return;
    const next = entry ? sprayDraftFromEntry(entry) : newSprayDraft(new Date(), defaultPlotId);
    setDraft(next);
    // An existing record opens on the review: it already has all six answers,
    // and the review is the only screen that shows all six at once.
    setStep(entry ? 'review' : 'pest');
    setReturnToReview(false);
    setAdding(false);
    setAddText('');
    setAddDay('');
    setAddMonth('');
    setStatus('idle');
  }, [visible, entry, defaultPlotId]);

  // One place decides where a tap lands, so the skip rule and the
  // came-from-review rule cannot disagree with each other.
  function answered(current: SprayStep, next: SprayDraft) {
    setDraft(next);
    setAdding(false);
    setAddText('');
    setAddDay('');
    setAddMonth('');
    setStatus('idle');
    setStep(returnToReview ? 'review' : nextSprayStep(current, next));
    setReturnToReview(false);
  }

  function jumpFromReview(target: SprayStep) {
    setReturnToReview(true);
    setAdding(false);
    setAddText('');
    setStep(target);
  }

  function goBack() {
    if (adding) {
      setAdding(false);
      return;
    }
    if (returnToReview) {
      setReturnToReview(false);
      setStep('review');
      return;
    }
    const previous = previousSprayStep(step, draft);
    if (previous) setStep(previous);
  }

  const position = sprayStepPosition(step, draft);
  // **The counter is only shown while he is actually walking.** Coming back to
  // one value from the review is not step three of five, and saying so would be
  // telling him he is somewhere he is not.
  const subtitle = returnToReview
    ? undefined
    : `${position.index} ${t('spray.stepOf')} ${position.total}`;
  const canGoBack = adding || returnToReview || previousSprayStep(step, draft) !== null;

  const safeHarvest = draft.phiDays === null ? null : safeHarvestDate(draft.date, draft.phiDays);

  async function onSave() {
    if (!farmId) return;
    const blocker = sprayEntryBlocker(draft);
    if (blocker) {
      setStatus(blocker);
      return;
    }

    setStatus('saving');
    const input = sprayEntryInput(draft);
    const result = entry
      ? // The note is not one of the six fields this flow asks for, so an edit
        // carries the existing one through instead of erasing it.
        await updateLogEntry(supabase, entry.id, { ...input, note: entry.note })
      : await createLogEntry(supabase, farmId, input);
    if (result.ok) {
      onSaved();
      return;
    }
    setStatus(result.reason);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      <View style={styles.header}>
        <Text style={styles.sheetTitle}>{entry ? t('spray.editTitle') : t('spray.newTitle')}</Text>
        {canGoBack ? (
          <Pressable onPress={goBack} disabled={busy} accessibilityRole="button">
            <Text style={styles.back}>{t('spray.back')}</Text>
          </Pressable>
        ) : null}
      </View>

      {step === 'pest' ? (
        <TilePicker
          title={t(sprayStepTitleKey('pest'))}
          subtitle={subtitle}
          options={toTiles(sprayPestOptions(suggestions.rows))}
          selectedValue={draft.pest}
          onSelect={(value) => answered('pest', { ...draft, pest: value })}
          actions={[{ key: 'add', label: t('spray.addPest'), onPress: () => setAdding(true) }]}
          emptyHint={t('spray.emptyPests')}
          disabled={busy}
          footer={
            adding ? (
              <FreeTextPanel
                value={addText}
                onChangeText={setAddText}
                placeholder={t('log.form.sprayPestPlaceholder')}
                disabled={busy}
                onConfirm={() => {
                  const pest = addText.trim();
                  if (pest) answered('pest', { ...draft, pest });
                }}
              />
            ) : null
          }
        />
      ) : null}

      {step === 'material' ? (
        <TilePicker
          title={t(sprayStepTitleKey('material'))}
          subtitle={subtitle}
          options={toTiles(sprayMaterialOptions(suggestions.rows))}
          selectedValue={draft.material}
          // applySprayMaterial and not a spread: picking a material re-decides
          // the dose and the waiting period from this farm's history, and that
          // rule is tested in the shared package rather than written here.
          onSelect={(value) =>
            answered('material', applySprayMaterial(draft, value, suggestions.rows))
          }
          actions={[{ key: 'add', label: t('spray.addMaterial'), onPress: () => setAdding(true) }]}
          emptyHint={t('spray.emptyMaterials')}
          disabled={busy}
          footer={
            adding ? (
              <FreeTextPanel
                value={addText}
                onChangeText={setAddText}
                placeholder={t('log.form.sprayMaterialPlaceholder')}
                disabled={busy}
                onConfirm={() => {
                  const material = addText.trim();
                  if (material) {
                    answered('material', applySprayMaterial(draft, material, suggestions.rows));
                  }
                }}
              />
            ) : null
          }
        />
      ) : null}

      {step === 'dose' ? (
        <TilePicker
          title={t(sprayStepTitleKey('dose'))}
          subtitle={subtitle}
          options={toTiles(sprayDoseOptions(suggestions.rows, draft.material))}
          selectedValue={draft.dose}
          onSelect={(value) => answered('dose', { ...draft, dose: value })}
          actions={[
            { key: 'add', label: t('spray.addDose'), onPress: () => setAdding(true) },
            // The column is nullable and a farmer who does not record strengths
            // must be able to walk past this screen. Without it, a farm with no
            // dose history would face a grid whose only tile opens a keyboard.
            {
              key: 'skip',
              label: t('spray.skipDose'),
              onPress: () => answered('dose', { ...draft, dose: null }),
            },
          ]}
          emptyHint={t('spray.emptyDoses')}
          disabled={busy}
          footer={
            adding ? (
              <FreeTextPanel
                value={addText}
                onChangeText={setAddText}
                placeholder={t('common.numberPlaceholder')}
                disabled={busy}
                onConfirm={() => {
                  const dose = addText.trim();
                  if (dose) answered('dose', { ...draft, dose });
                }}
              />
            ) : null
          }
        />
      ) : null}

      {step === 'phiDays' ? (
        <TilePicker
          title={t(sprayStepTitleKey('phiDays'))}
          subtitle={subtitle}
          options={sprayPhiOptions(suggestions.rows, draft.material).map((days) => ({
            value: String(days),
            label: `${days} ${t('spray.daysSuffix')}`,
          }))}
          selectedValue={draft.phiDays === null ? null : String(draft.phiDays)}
          onSelect={(value) => answered('phiDays', { ...draft, phiDays: Number(value) })}
          actions={[
            { key: 'add', label: t('spray.addPhiDays'), onPress: () => setAdding(true) },
            // "Not known" and "no waiting period" are different facts, and this
            // tile is the first. A guessed interval becomes a safe-harvest date
            // that reads exactly like a real one.
            {
              key: 'unknown',
              label: t('spray.unknownPhiDays'),
              onPress: () => answered('phiDays', { ...draft, phiDays: null }),
            },
          ]}
          disabled={busy}
          footer={
            adding ? (
              <FreeTextPanel
                value={addText}
                onChangeText={setAddText}
                placeholder={t('common.numberPlaceholder')}
                keyboardType="number-pad"
                disabled={busy}
                onConfirm={() => {
                  const days = parseSprayPhiDaysInput(addText);
                  // undefined is "what is in the box is not a number", which
                  // must not become a null waiting period. See
                  // parseSprayPhiDaysInput.
                  if (days !== undefined) answered('phiDays', { ...draft, phiDays: days });
                }}
              />
            ) : null
          }
        />
      ) : null}

      {step === 'plot' ? (
        <TilePicker
          title={t(sprayStepTitleKey('plot'))}
          subtitle={subtitle}
          options={sprayPlotOptions(plotsState.loading ? [] : plotsState.plots).map((option) => ({
            value: option.plotId ?? WHOLE_FARM_VALUE,
            label: option.name ?? t('tasks.plotGeneral'),
          }))}
          selectedValue={draft.plotId ?? WHOLE_FARM_VALUE}
          onSelect={(value) =>
            answered('plot', { ...draft, plotId: value === WHOLE_FARM_VALUE ? null : value })
          }
          // No "add a new one" here, and that is the closed-list case rather
          // than an omission: creating a plot is a form with a name, an area
          // and a crop, and it does not belong inside writing a spray. No
          // emptyHint either: the whole-farm tile means this grid is never
          // empty, so a farm with no plots yet still has an answer to give.
          disabled={busy}
        />
      ) : null}

      {step === 'date' ? (
        <TilePicker
          title={t(sprayStepTitleKey('date'))}
          subtitle={subtitle}
          options={dateOptions.map((option) => ({
            value: option.date,
            label: t(option.labelKey),
          }))}
          selectedValue={draft.date}
          onSelect={(value) => answered('date', { ...draft, date: value })}
          actions={[{ key: 'add', label: t('spray.addDate'), onPress: () => setAdding(true) }]}
          disabled={busy}
          footer={
            adding ? (
              <View style={styles.addPanel}>
                <View style={styles.dateRow}>
                  <TextInput
                    style={[formStyles.input, styles.dateInput]}
                    value={addDay}
                    onChangeText={setAddDay}
                    editable={!busy}
                    keyboardType="number-pad"
                    placeholder={t('log.form.dateDay')}
                    placeholderTextColor={colors.slate600}
                    textAlign="center"
                    maxLength={2}
                  />
                  <TextInput
                    style={[formStyles.input, styles.dateInput]}
                    value={addMonth}
                    onChangeText={setAddMonth}
                    editable={!busy}
                    keyboardType="number-pad"
                    placeholder={t('log.form.dateMonth')}
                    placeholderTextColor={colors.slate600}
                    textAlign="center"
                    maxLength={2}
                  />
                </View>
                <Pressable
                  style={[formStyles.save, busy && formStyles.saveDisabled]}
                  onPress={() => {
                    // A spray is something that already happened, so a day and
                    // month still ahead of today belong to last year. That is
                    // the 'past' direction, and it is the tested copy.
                    const date = voicePastDateFromParts(
                      { day: addDay, month: addMonth },
                      new Date(),
                    );
                    if (date) answered('date', { ...draft, date });
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={formStyles.saveText}>{t('spray.confirm')}</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      ) : null}

      {step === 'review' ? (
        <TilePicker
          title={t(sprayStepTitleKey('review'))}
          subtitle={subtitle}
          // The tiles are the six answers, each captioned with the field it
          // belongs to, and each one a way back into the screen that set it.
          options={reviewTiles(draft, plotsState.loading ? [] : plotsState.plots)}
          selectedValue={null}
          onSelect={(value) => jumpFromReview(value as SprayStep)}
          disabled={busy}
          footer={
            <View style={styles.reviewFooter}>
              {safeHarvest ? (
                <Text style={styles.safeHarvest}>
                  {t('log.form.safeHarvestPrefix')}{' '}
                  {new Date(safeHarvest).toLocaleDateString('he-IL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </Text>
              ) : null}
              <Pressable
                style={[formStyles.save, busy && formStyles.saveDisabled]}
                onPress={onSave}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={formStyles.saveText}>{busy ? t('log.saving') : t('spray.save')}</Text>
              </Pressable>
              {status === 'pestRequired' || status === 'materialRequired' ? (
                <Text style={formStyles.bad}>{t(SPRAY_BLOCKER_MESSAGE_KEYS[status])}</Text>
              ) : null}
              {status === 'forbidden' ? (
                <Text style={formStyles.bad}>{t('log.form.forbidden')}</Text>
              ) : null}
              {status === 'error' ? (
                <Text style={formStyles.bad}>{t('log.form.saveError')}</Text>
              ) : null}
            </View>
          }
        />
      ) : null}
    </BottomSheet>
  );
}

// A history value is its own label: the farmer wrote "כנימה" and that is what
// the square says.
function toTiles(values: readonly string[]): TileOption[] {
  return values.map((value) => ({ value, label: value }));
}

// The review grid. `value` is the step to jump to rather than the answer, which
// is what lets TilePicker be reused here unchanged -- it hands back whatever
// identity it was given.
function reviewTiles(
  draft: SprayDraft,
  plots: readonly { id: string; name: string }[],
): TileOption[] {
  const plotName =
    draft.plotId === null
      ? t('tasks.plotGeneral')
      : (plots.find((plot) => plot.id === draft.plotId)?.name ?? t('spray.notSet'));

  const values: Record<Exclude<SprayStep, 'review'>, string> = {
    pest: draft.pest ?? t('spray.notSet'),
    material: draft.material ?? t('spray.notSet'),
    dose: draft.dose ?? t('spray.notSet'),
    phiDays:
      draft.phiDays === null
        ? t('spray.unknownPhiDays')
        : `${draft.phiDays} ${t('spray.daysSuffix')}`,
    plot: plotName,
    // Split rather than parsed. A YYYY-MM-DD string put through new Date() is
    // UTC midnight, and reading the day off it west of UTC gives yesterday.
    date: displayDate(draft.date),
  };

  return (Object.keys(values) as Exclude<SprayStep, 'review'>[]).map((step) => ({
    value: step,
    label: values[step],
    caption: t(sprayStepFieldKey(step)),
  }));
}

function displayDate(date: string): string {
  const [, month, day] = date.split('-');
  return month && day ? `${Number(day)}.${Number(month)}` : date;
}

function FreeTextPanel({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  disabled,
  onConfirm,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  keyboardType?: 'number-pad';
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.addPanel}>
      <TextInput
        style={formStyles.input}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.slate600}
        keyboardType={keyboardType}
        textAlign="right"
        autoFocus
      />
      <Pressable
        style={[formStyles.save, disabled && formStyles.saveDisabled]}
        onPress={onConfirm}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{t('spray.confirm')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s16,
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  back: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
  addPanel: {
    gap: spacing.s12,
    marginTop: spacing.s4,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.s8,
  },
  dateInput: {
    flex: 1,
    textAlign: 'center',
  },
  reviewFooter: {
    gap: spacing.s12,
    marginTop: spacing.s4,
  },
  // Field-700, not Profit-600: design.md names this colour for the "safe to
  // harvest" line on the Spray Log Screen. It is a calm reminder, not a
  // declaration of profit.
  safeHarvest: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
});
