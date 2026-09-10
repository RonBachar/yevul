import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applySprayCost,
  applySprayMaterial,
  applySprayQuantity,
  applySprayUnit,
  applySprayUnitPrice,
  computeEntryCost,
  createLogEntry,
  formatCalendarDate,
  newSprayDraft,
  nextSprayStep,
  parseSprayAmountInput,
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
  sprayUnitLabelKey,
  SPRAY_BLOCKER_MESSAGE_KEYS,
  SPRAY_UNITS,
  t,
  updateLogEntry,
  usePlots,
  useSprayPrices,
  useSpraySuggestions,
  type LogEntry,
  type SprayDraft,
  type SprayStep,
} from '@yevul/shared';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { Calendar } from './Calendar';
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
// ---- The date ----
//
// **"Another date" opens a calendar, and it used to open two number boxes.**
// The founder, after using the tiles: "everywhere there is a date and it has to
// be entered it is very uncomfortable to set a day and a month. I want a
// calendar to open!" The three squares in front of it -- today, yesterday, the
// day before -- are unchanged and are still the answer nearly every time; the
// grid is the way past them, and it is the same grid every other date field in
// the app now uses. See Calendar.tsx and packages/shared/src/calendar.ts.
//
// Nothing in this file builds a date any more. Every date it handles is a
// YYYY-MM-DD string that came from the shared package or straight off a
// log_entries row; toISOString is banned in this repo and the reason is written
// at the bottom of safeHarvestDate.ts.

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
  // The remembered per-material prices. applySprayMaterial reads them to pre-fill
  // the unit and unit price when this farm has bought the material before.
  const prices = useSprayPrices(supabase, farmId);

  const [step, setStep] = useState<SprayStep>('pest');
  const [draft, setDraft] = useState<SprayDraft>(() => newSprayDraft(new Date(), defaultPlotId));
  // Set when a tile on the review was tapped, so that answering the step it
  // jumped to comes straight back rather than walking the rest of the flow
  // again. Checking a single value should cost two taps, not five.
  const [returnToReview, setReturnToReview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
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
    setStatus('idle');
  }, [visible, entry, defaultPlotId]);

  // One place decides where a tap lands, so the skip rule and the
  // came-from-review rule cannot disagree with each other.
  function answered(current: SprayStep, next: SprayDraft) {
    setDraft(next);
    setAdding(false);
    setAddText('');
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
      ? // Neither the note, the work hours nor the kind of work are among the six
        // fields this flow asks for, so an edit carries the existing ones through
        // instead of erasing them. Hours and the kind of work are entered on the
        // journal sheet, for any type. `input.cost` is not overridden here -- the
        // draft already carries the farmer's own number (or the material+labour
        // suggestion CostPanel computed below) from the cost step, and there is
        // no second, separate work_cost column left to carry through. See the
        // money header in logEntries.ts.
        //
        // **workKind was the same bug as sprayQuantity/sprayUnitPrice, found and
        // fixed the same day, one field later.** writePayload() in logEntries.ts
        // builds the FULL row on every update and work_kind is ungated (it
        // belongs to the work, not to the type -- see its own comment there), so
        // a null here is a null written to the column: editing a spray from this
        // walk silently erased whatever kind of work had been typed on the
        // journal sheet, exactly like the quantity/price bug did for the
        // material half.
        await updateLogEntry(supabase, entry.id, {
          ...input,
          note: entry.note,
          workHours: entry.workHours,
          workHourlyRate: entry.workHourlyRate,
          workKind: entry.workKind,
        })
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
            answered(
              'material',
              withEntryCostSuggestion(
                applySprayMaterial(draft, value, suggestions.rows, prices),
                entry?.workHours ?? null,
                entry?.workHourlyRate ?? null,
              ),
            )
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
                    answered(
                      'material',
                      withEntryCostSuggestion(
                        applySprayMaterial(draft, material, suggestions.rows, prices),
                        entry?.workHours ?? null,
                        entry?.workHourlyRate ?? null,
                      ),
                    );
                  }
                }}
              />
            ) : null
          }
        />
      ) : null}

      {step === 'cost' ? (
        <CostPanel
          draft={draft}
          setDraft={setDraft}
          // Hours have no box on this walk -- they are entered on the journal
          // sheet, for any entry type -- but an entry already carrying some
          // (Ido's example: a spray that also took three hours) must still
          // suggest material + labour here, not material alone. See
          // computeEntryCost in workEntry.ts and the sheet header above.
          workHours={entry?.workHours ?? null}
          workHourlyRate={entry?.workHourlyRate ?? null}
          subtitle={subtitle}
          disabled={busy}
          // Cost has no single value to "select", so it advances on an explicit
          // button. Every field on it is optional, so this can be pressed with
          // nothing filled -- the founder's rule that the cost is never a cage.
          onContinue={() => answered('cost', draft)}
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
          // **The three squares stay and the calendar is the way past them.**
          // A spray is written the evening it happened or the morning after, so
          // today / yesterday / the day before is the answer nearly every time
          // and it costs one tap. The calendar is for the rest -- and for the
          // farmer three weeks behind on his paperwork, who now sees the month
          // he is filing into instead of guessing which year two numbers landed
          // in.
          actions={[{ key: 'add', label: t('date.other'), onPress: () => setAdding(true) }]}
          disabled={busy}
          footer={
            adding ? (
              <View style={styles.addPanel}>
                {/* A tap on a day is the answer. There is no confirm button
                    here any more, and there is nothing to type: the two number
                    boxes needed one because a half-typed pair is not a date,
                    while a day in a grid is complete the moment it is pressed.
                    'past', because a spray is something that already happened,
                    and now that is a bound the grid shows rather than a year
                    silently subtracted after the fact. */}
                <Calendar
                  value={draft.date}
                  onSelect={(date) => answered('date', { ...draft, date })}
                  direction="past"
                  disabled={busy}
                />
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

// **Layers the work-hours half onto a draft's auto suggestion.**
// applySprayMaterial/applySprayQuantity/applySprayUnitPrice (packages/shared,
// not owned here) only know the material half -- quantity x unit price --
// because sprayEntry.ts has no notion of hours. This sheet does carry hours,
// frozen on the entry being edited (see the 'cost' step header below), so
// whenever those setters leave the draft on "auto" (costEdited false) this
// widens the suggestion to material + labour, exactly what a farmer reopening
// a spray that also took him three hours expects to see. A typed cost
// (costEdited true) is never touched here -- manual entry always wins.
function withEntryCostSuggestion(
  draft: SprayDraft,
  workHours: number | null,
  workHourlyRate: number | null,
): SprayDraft {
  if (draft.costEdited) return draft;
  return { ...draft, cost: computeEntryCost(draft.quantity, draft.unitPrice, workHours, workHourlyRate) };
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
    // The plain number, no currency symbol: the review is a glance at what is
    // about to be written, and the amount was typed as bare digits.
    cost: draft.cost === null ? t('spray.notSet') : String(draft.cost),
    dose: draft.dose ?? t('spray.notSet'),
    phiDays:
      draft.phiDays === null
        ? t('spray.unknownPhiDays')
        : `${draft.phiDays} ${t('spray.daysSuffix')}`,
    plot: plotName,
    // formatCalendarDate, which splits the string rather than parsing it: a
    // YYYY-MM-DD put through new Date() is UTC midnight, and reading the day
    // off it west of UTC gives yesterday. **It now shows the year as well.**
    // The calendar can reach a month in another year, which the two number
    // boxes never could, so the last screen before the write has to say which
    // year it is about to file this spray under.
    date: formatCalendarDate(draft.date),
  };

  return (Object.keys(values) as Exclude<SprayStep, 'review'>[]).map((step) => ({
    value: step,
    label: values[step],
    caption: t(sprayStepFieldKey(step)),
  }));
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

// A stored amount as the text its box shows: empty for "not stated", the plain
// number otherwise. String() and not toFixed, so a whole price reads as "12"
// rather than "12.00" and a half-typed "1." is never fought mid-keystroke.
function amountToText(value: number | null): string {
  return value === null ? '' : String(value);
}

// The cost step: a small form, not a tile grid, because a quantity and a price
// are numbers a farmer types rather than a closed list to pick from -- the same
// reason the date's calendar and the "another number" boxes are not tiles.
//
// **Every field is optional and the total is always directly typeable.** The
// founder's rule: the pricelist is a pre-filled default, never a cage. So the
// quantity and unit-price boxes recompute the total live through the shared
// setters, but the total box wins the moment it is touched (applySprayCost), and
// "continue" advances even with nothing entered.
//
// Local text state per box, mirroring FreeTextPanel: a controlled TextInput
// bound straight to a number cannot hold "1." mid-type. Seeded from the draft on
// mount, which is when this step is entered -- the material picked a step earlier
// has already pre-filled the unit and price and recomputed the cost.
function CostPanel({
  draft,
  setDraft,
  workHours,
  workHourlyRate,
  subtitle,
  disabled,
  onContinue,
}: {
  draft: SprayDraft;
  setDraft: (next: SprayDraft) => void;
  // The entry's frozen work hours and rate, for the suggestion only -- this
  // panel has no boxes of its own for them. See withEntryCostSuggestion above.
  workHours: number | null;
  workHourlyRate: number | null;
  subtitle?: string;
  disabled: boolean;
  onContinue: () => void;
}) {
  const [quantityText, setQuantityText] = useState(() => amountToText(draft.quantity));
  const [unitPriceText, setUnitPriceText] = useState(() => amountToText(draft.unitPrice));
  const [costText, setCostText] = useState(() => amountToText(draft.cost));

  // undefined from the parser is "not a number" and must not become a null
  // value, exactly as the phiDays panel guards it. The typed text stays on screen
  // either way; only the draft is left alone until the box reads as empty or a
  // number. When the total is still auto, the newly computed figure -- material
  // plus whatever labour the entry already carries -- is mirrored into the cost
  // box so it is never a stale number the farmer did not type.
  function onChangeQuantity(text: string) {
    setQuantityText(text);
    const parsed = parseSprayAmountInput(text);
    if (parsed === undefined) return;
    const next = withEntryCostSuggestion(applySprayQuantity(draft, parsed), workHours, workHourlyRate);
    setDraft(next);
    if (!next.costEdited) setCostText(amountToText(next.cost));
  }

  function onChangeUnitPrice(text: string) {
    setUnitPriceText(text);
    const parsed = parseSprayAmountInput(text);
    if (parsed === undefined) return;
    const next = withEntryCostSuggestion(applySprayUnitPrice(draft, parsed), workHours, workHourlyRate);
    setDraft(next);
    if (!next.costEdited) setCostText(amountToText(next.cost));
  }

  function onChangeCost(text: string) {
    setCostText(text);
    const parsed = parseSprayAmountInput(text);
    if (parsed === undefined) return;
    setDraft(applySprayCost(draft, parsed));
  }

  // Per-unit wording once a unit is chosen, the neutral label before that.
  const unitPriceLabel =
    draft.quantityUnit === 'kg'
      ? t('spray.unitPricePerKg')
      : draft.quantityUnit === 'liter'
        ? t('spray.unitPricePerLiter')
        : t('spray.unitPrice');

  return (
    <View style={styles.costPanel}>
      <View style={styles.costHeading}>
        <Text style={styles.costTitle}>{t(sprayStepTitleKey('cost'))}</Text>
        {subtitle ? <Text style={styles.costSubtitle}>{subtitle}</Text> : null}
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('spray.quantity')}</Text>
        <TextInput
          style={formStyles.input}
          value={quantityText}
          onChangeText={onChangeQuantity}
          editable={!disabled}
          keyboardType="decimal-pad"
          placeholder={t('spray.quantityPlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('spray.unitLabel')}</Text>
        <View style={formStyles.chips}>
          {SPRAY_UNITS.map((unit) => {
            const active = draft.quantityUnit === unit;
            return (
              <Pressable
                key={unit}
                style={[formStyles.chip, active && formStyles.chipActive]}
                // Tapping the chosen unit again clears it: the unit is optional
                // like everything else here, so it must be un-pickable.
                onPress={() => setDraft(applySprayUnit(draft, active ? null : unit))}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                  {t(sprayUnitLabelKey(unit))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{unitPriceLabel}</Text>
        <TextInput
          style={formStyles.input}
          value={unitPriceText}
          onChangeText={onChangeUnitPrice}
          editable={!disabled}
          keyboardType="decimal-pad"
          placeholder={t('spray.unitPricePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('spray.cost')}</Text>
        <TextInput
          style={formStyles.input}
          value={costText}
          onChangeText={onChangeCost}
          editable={!disabled}
          keyboardType="decimal-pad"
          placeholder={t('spray.costPlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
        {/* costComputed only while the number is still the formula's; costHint
            always, so the manual path -- just type the amount -- is never hidden. */}
        {!draft.costEdited && draft.cost !== null ? (
          <Text style={styles.costNote}>{t('spray.costComputed')}</Text>
        ) : null}
        <Text style={styles.costNote}>{t('spray.costHint')}</Text>
      </View>

      <Pressable
        style={[formStyles.save, disabled && formStyles.saveDisabled]}
        onPress={onContinue}
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
  // The cost step's form. A column of fields, spaced like the grid steps so the
  // sheet reads as one flow whether the current step is tiles or inputs.
  costPanel: {
    gap: spacing.s16,
  },
  costHeading: {
    gap: spacing.s4,
  },
  // The question, weighted like TilePicker's title so the two kinds of step
  // carry the same header rather than looking like different screens.
  costTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subheading,
    color: colors.ink900,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  costSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  costNote: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
});
