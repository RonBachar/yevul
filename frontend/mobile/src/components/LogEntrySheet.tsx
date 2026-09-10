import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeEntryCost,
  createLogEntry,
  entryCostEdited,
  formatLocalDateOnly,
  initialLogEntryType,
  logEntryTypeLabelKey,
  LOG_ENTRY_TYPES,
  parseWorkAmountInput,
  safeHarvestDate,
  t,
  updateLogEntry,
  useFarmSettings,
  usePlots,
  useSpraySuggestions,
  useWorkKindSuggestions,
  workKindOptions,
  type LogEntry,
  type LogEntryType,
} from '@yevul/shared';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { TilePicker } from './TilePicker';

// The device's calendar day, never the UTC one, for a new entry's default.
// toISOString() is wrong from local midnight until 02:00 or 03:00, and here
// that default can become a spray date, which is what safeHarvestDate computes
// the regulatory answer from.
function today(): string {
  return formatLocalDateOnly(new Date());
}

// גיליון יצירה/עריכה של רשומת יומן, design.md "Log Entry Sheet". זו
// הנקודה היחידה שכותבת ליומן, גם מהאפשרות "יומן" בגיליון הרישום וגם
// (בעתיד) מ-Completion Prompts. בלי כפתורי מצלמה/מיקרופון, אותה סיבה
// בדיוק כמו ב-TaskSheet: תלויים בתשתית הקול שנבנית בשלב 5.
// defaultType is the sibling of defaultPlotId: what the opening screen wants a
// *new* entry to start on. See initialLogEntryType in the shared package for
// why an entry being edited ignores it.
export function LogEntrySheet({
  supabase,
  visible,
  onClose,
  entry,
  defaultPlotId,
  defaultType,
  farmId,
  onSaved,
}: {
  supabase: SupabaseClient;
  visible: boolean;
  onClose: () => void;
  entry: LogEntry | null;
  defaultPlotId: string | null;
  defaultType?: LogEntryType;
  farmId: string | null;
  onSaved: () => void;
}) {
  const plotsState = usePlots(supabase);
  const suggestions = useSpraySuggestions(supabase, farmId);
  // Only for the farm's hourly rate, which pre-fills the rate box below.
  const settings = useFarmSettings(supabase);
  // The kind-of-work grid, out of this farm's own journal. Passed the sheet's
  // own `visible` as `active`, the same rule useExpenseSuggestions is called
  // with in ExpenseSheet: this component stays mounted behind the tab bar, so a
  // grid read once on mount would go stale the moment a farmer types a new kind
  // of work and reopens the sheet.
  const workKindSuggestions = useWorkKindSuggestions(supabase, farmId, visible);

  const [type, setType] = useState<LogEntryType>(initialLogEntryType(entry, defaultType));
  const [plotId, setPlotId] = useState<string | null>(null);
  // The date itself, YYYY-MM-DD, rather than a day and a month with the year
  // guessed from which side of today they landed on. See DateField.
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [sprayPest, setSprayPest] = useState('');
  const [sprayMaterial, setSprayMaterial] = useState('');
  const [sprayDose, setSprayDose] = useState('');
  const [sprayPhiDays, setSprayPhiDays] = useState('');
  // Work hours, on every entry type. Mirrors the web sheet field for field; see
  // its comment and 20260906120000_work_hours.sql for why the cost is frozen and
  // why a typed total always beats hours x rate.
  const [workHours, setWorkHours] = useState('');
  const [workHourlyRate, setWorkHourlyRate] = useState('');
  // The kind of work, Ido's second half of the same 2026-09-06 request:
  // "שעות עבודה וסוג עבודה ביומן". Free text with a grid of suggestions, and
  // **not gated on `type`** -- pruning, tilling and a fence repair are all work,
  // and a spray that also took three hours is work too, exactly like workHours
  // above. See the header of workEntry.ts for why `type` itself stays a closed
  // list instead.
  const [workKind, setWorkKind] = useState('');
  // Whether the "new kind" square has opened its box. The box writes straight
  // into workKind, exactly as ExpenseSheet's name box writes straight into
  // draft.name -- there is no confirm tap between typing a kind and saving the
  // entry.
  const [addingWorkKind, setAddingWorkKind] = useState(false);
  // The entry's single cost box -- material and labour together, see
  // computeEntryCost in workEntry.ts. This sheet has no material/quantity UI
  // (that lives in SprayEntrySheet's tile flow), so in practice this box only
  // ever suggests the labour half, but it stays plumbed through computeEntryCost
  // rather than computeWorkCost so an entry edited here that already has a
  // spray quantity/price on it (written by SprayEntrySheet) still suggests the
  // full total instead of silently dropping the material half.
  const [cost, setCost] = useState('');
  const [costTyped, setCostTyped] = useState(false);
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestUnit, setHarvestUnit] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'pestRequired' | 'materialRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  useEffect(() => {
    if (!visible) return;
    // Outside the branch on purpose: one line owns the starting type in both
    // cases, so a reopen after an edit cannot leave the previous entry's type
    // on screen for a new record.
    setType(initialLogEntryType(entry, defaultType));
    if (entry) {
      setPlotId(entry.plotId);
      // **Passed through as the string it already is**, the same rule
      // sprayDraftFromEntry states: log_entries.date is a Postgres date column
      // and arrives as YYYY-MM-DD. The previous version put it through a Date
      // and read getDate() off it, which is the day-early round trip written
      // out at the bottom of safeHarvestDate.ts.
      setDate(entry.date);
      setNote(entry.note ?? '');
      setSprayPest(entry.sprayPest ?? '');
      setSprayMaterial(entry.sprayMaterial ?? '');
      setSprayDose(entry.sprayDose ?? '');
      setSprayPhiDays(entry.sprayPhiDays != null ? String(entry.sprayPhiDays) : '');
      setWorkHours(entry.workHours != null ? String(entry.workHours) : '');
      setWorkHourlyRate(entry.workHourlyRate != null ? String(entry.workHourlyRate) : '');
      setWorkKind(entry.workKind ?? '');
      setCost(entry.cost != null ? String(entry.cost) : '');
      // The rate (and material, if this entry was written by SprayEntrySheet)
      // on the row is the one this job was priced at, never today's. See
      // entryCostEdited: a stored cost that no longer matches quantity x price
      // plus hours x rate was typed by hand and must not be silently recomputed.
      setCostTyped(
        entryCostEdited(
          entry.cost,
          entry.sprayQuantity,
          entry.sprayUnitPrice,
          entry.workHours,
          entry.workHourlyRate,
        ),
      );
      setHarvestQty(entry.harvestQty != null ? String(entry.harvestQty) : '');
      setHarvestUnit(entry.harvestUnit ?? '');
    } else {
      setPlotId(defaultPlotId);
      setDate(today());
      setNote('');
      setSprayPest('');
      setSprayMaterial('');
      setSprayDose('');
      setSprayPhiDays('');
      setWorkHours('');
      // Left empty here: the settings may not have arrived yet. The effect below
      // fills it the moment they do, and only while the box is still empty.
      setWorkHourlyRate('');
      setWorkKind('');
      setCost('');
      setCostTyped(false);
      setHarvestQty('');
      setHarvestUnit('');
    }
    // The add-a-kind box closes on every open, exactly like ExpenseSheet's
    // add-a-name box, so a sheet reopened after an edit does not show a keyboard
    // left over from a previous use.
    setAddingWorkKind(false);
    setStatus('idle');
  }, [visible, entry, defaultPlotId, defaultType]);

  // A typed number, or null for an empty or unreadable box. A cost is optional,
  // so "unreadable" collapses to null rather than blocking the save.
  const amountOrNull = (text: string): number | null => {
    const value = parseWorkAmountInput(text);
    return typeof value === 'number' ? value : null;
  };

  // The farm's rate pre-fills the box and never owns it: it does not overwrite
  // what the farmer typed, nor the rate frozen on a record being edited.
  const farmHourlyRate = settings.form?.workHourlyRate ?? null;
  useEffect(() => {
    if (!visible) return;
    if (entry?.workHourlyRate != null) return;
    if (farmHourlyRate === null) return;
    setWorkHourlyRate((current) => (current === '' ? String(farmHourlyRate) : current));
  }, [visible, entry, farmHourlyRate]);

  // Hours x rate while the farmer has not typed a total, and left alone once he
  // has. Same rule as the web sheet, both reading it from workEntry.ts. This
  // sheet has no material/quantity boxes of its own, so the two spray-half
  // arguments are whatever the entry already carries (null for a plain journal
  // entry, or the frozen values SprayEntrySheet wrote for a spray) -- never
  // this sheet's own state, since it has none to offer.
  useEffect(() => {
    if (costTyped) return;
    const computed = computeEntryCost(
      entry?.sprayQuantity ?? null,
      entry?.sprayUnitPrice ?? null,
      amountOrNull(workHours),
      amountOrNull(workHourlyRate),
    );
    setCost(computed === null ? '' : String(computed));
    // Only the two inputs, the entry's frozen spray half, and the typed flag
    // drive the recompute; amountOrNull is a pure local helper with no state.
  }, [workHours, workHourlyRate, costTyped, entry]);

  // The tiles: the farm's fifty most recent kinds of work, newest first, plus
  // whatever this record already carries -- the held value dropped out while the
  // add box is open, same as ExpenseSheet's nameOptions immediately above.
  const workKindChoices = workKindOptions(
    workKindSuggestions.kinds,
    addingWorkKind ? null : workKind,
  );
  const selectedWorkKind = addingWorkKind || workKind.trim() === '' ? null : workKind.trim();

  const phiDaysNumber = sprayPhiDays.trim() ? Number(sprayPhiDays) : null;
  const safeHarvest =
    type === 'spray' && date && phiDaysNumber != null && Number.isFinite(phiDaysNumber)
      ? safeHarvestDate(date, phiDaysNumber)
      : null;

  async function onSave() {
    if (!farmId || !date) return;

    setStatus('saving');
    const input = {
      plotId,
      date,
      type,
      note: note.trim() ? note.trim() : null,
      sprayPest: sprayPest.trim() ? sprayPest.trim() : null,
      sprayMaterial: sprayMaterial.trim() ? sprayMaterial.trim() : null,
      sprayDose: sprayDose.trim() ? sprayDose.trim() : null,
      sprayPhiDays: Number.isFinite(phiDaysNumber) ? phiDaysNumber : null,
      // The generic journal sheet has no material/quantity UI -- that walk lives
      // in SprayEntrySheet's tile flow -- so it carries the entry's existing
      // values straight back out.
      //
      // **Passing null here was a real bug, found 2026-09-10.** The comment that
      // stood here claimed an existing spray's quantity and price survived
      // because updateLogEntry "only touches the columns this sheet owns". They
      // did not: writePayload() in logEntries.ts builds the FULL row on every
      // update, so a null in the input is a null written to the column. Editing
      // a spray from the journal instead of the spray log silently erased how
      // its cost was reached -- the money survived on the expense, the "5 litres
      // at 20" behind it did not. A farmer who opened the entry to fix a typo in
      // the note lost the breakdown and was never told.
      //
      // A new entry has no `entry`, so these stay null, which is correct. And a
      // record whose type moves away from spray is cleared by writePayload
      // itself, which gates all three on isSpray -- so carrying them through
      // here cannot resurrect a spray half on a record that is no longer one.
      sprayQuantity: entry?.sprayQuantity ?? null,
      sprayQuantityUnit: entry?.sprayQuantityUnit ?? null,
      sprayUnitPrice: entry?.sprayUnitPrice ?? null,
      // Frozen as it stands, never recomputed on read: this entry keeps the
      // cost it had today even after the farm raises its hourly rate or a
      // material's pricelist price changes. See 20260906120000_work_hours.sql
      // and the money header in logEntries.ts.
      workHours: amountOrNull(workHours),
      workHourlyRate: amountOrNull(workHourlyRate),
      // Not gated on `type`, same as workHours just above: a farmer typing a
      // kind of work is stating what the job was, and that is true of every
      // entry type, not only ones that already have hours logged.
      workKind: workKind.trim() ? workKind.trim() : null,
      cost: amountOrNull(cost),
      harvestQty:
        harvestQty.trim() && Number.isFinite(Number(harvestQty)) ? Number(harvestQty) : null,
      harvestUnit: harvestUnit.trim() ? harvestUnit.trim() : null,
    };
    const result = entry
      ? await updateLogEntry(supabase, entry.id, input)
      : await createLogEntry(supabase, farmId, input);
    if (result.ok) {
      onSaved();
      return;
    }
    setStatus(result.reason);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('log.form.type')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={formStyles.chips}>
            {LOG_ENTRY_TYPES.map((option) => {
              const active = type === option;
              return (
                <Pressable
                  key={option}
                  style={[formStyles.chip, active && formStyles.chipActive]}
                  onPress={() => setType(option)}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                    {t(logEntryTypeLabelKey(option))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {type === 'spray' && (
        <>
          <View style={[formStyles.field, sheetGap]}>
            <Text style={formStyles.label}>{t('log.form.sprayPest')}</Text>
            <TextInput
              style={formStyles.input}
              value={sprayPest}
              onChangeText={setSprayPest}
              editable={!busy}
              placeholder={t('log.form.sprayPestPlaceholder')}
              placeholderTextColor={colors.slate600}
              textAlign="right"
            />
            {suggestions.pests.length > 0 && (
              <SuggestionRow values={suggestions.pests} onPick={setSprayPest} disabled={busy} />
            )}
          </View>

          <View style={[formStyles.field, sheetGap]}>
            <Text style={formStyles.label}>{t('log.form.sprayMaterial')}</Text>
            <TextInput
              style={formStyles.input}
              value={sprayMaterial}
              onChangeText={setSprayMaterial}
              editable={!busy}
              placeholder={t('log.form.sprayMaterialPlaceholder')}
              placeholderTextColor={colors.slate600}
              textAlign="right"
            />
            {suggestions.materials.length > 0 && (
              <SuggestionRow
                values={suggestions.materials}
                onPick={setSprayMaterial}
                disabled={busy}
              />
            )}
          </View>

          <View style={[rowFields, sheetGap]}>
            <View style={rowField}>
              <Text style={formStyles.label}>
                {t('log.form.sprayDose')} · {t('common.optional')}
              </Text>
              <TextInput
                style={formStyles.input}
                value={sprayDose}
                onChangeText={setSprayDose}
                editable={!busy}
                textAlign="right"
              />
            </View>
            <View style={rowField}>
              <Text style={formStyles.label}>
                {t('log.form.sprayPhiDays')} · {t('common.optional')}
              </Text>
              <TextInput
                style={formStyles.input}
                value={sprayPhiDays}
                onChangeText={setSprayPhiDays}
                editable={!busy}
                keyboardType="number-pad"
                textAlign="right"
              />
            </View>
          </View>

          {safeHarvest && (
            <Text style={[safeHarvestText, sheetGap]}>
              {t('log.form.safeHarvestPrefix')}{' '}
              {new Date(safeHarvest).toLocaleDateString('he-IL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </Text>
          )}
        </>
      )}

      {type === 'harvest' && (
        <View style={[rowFields, sheetGap]}>
          <View style={rowField}>
            <Text style={formStyles.label}>{t('log.form.harvestQty')}</Text>
            <TextInput
              style={formStyles.input}
              value={harvestQty}
              onChangeText={setHarvestQty}
              editable={!busy}
              keyboardType="decimal-pad"
              textAlign="right"
              placeholder={t('common.numberPlaceholder')}
              placeholderTextColor={colors.slate600}
            />
          </View>
          <View style={rowField}>
            <Text style={formStyles.label}>{t('log.form.harvestUnit')}</Text>
            <TextInput
              style={formStyles.input}
              value={harvestUnit}
              onChangeText={setHarvestUnit}
              editable={!busy}
              textAlign="right"
              placeholder={t('log.form.harvestUnitPlaceholder')}
              placeholderTextColor={colors.slate600}
            />
          </View>
        </View>
      )}

      {/* שעות העבודה, מחוץ לכל תנאי סוג. עידו, 6.9.2026: "שעות עבודה
          פלוס חומרים", והדוגמה שלו היא ריסוס שגם לקח לו שלוש שעות.
          התעריף מגיע מהמחירון, העלות מחושבת, וכל אחד משלושתם ניתן
          להקלדה ידנית. */}
      <View style={[rowFields, sheetGap]}>
        <View style={rowField}>
          <Text style={formStyles.label}>
            {t('work.hours')} · {t('common.optional')}
          </Text>
          <TextInput
            style={formStyles.input}
            value={workHours}
            onChangeText={setWorkHours}
            editable={!busy}
            keyboardType="decimal-pad"
            textAlign="right"
            placeholder={t('work.hoursPlaceholder')}
            placeholderTextColor={colors.slate600}
          />
        </View>
        <View style={rowField}>
          <Text style={formStyles.label}>
            {t('work.hourlyRate')} · {t('common.optional')}
          </Text>
          <TextInput
            style={formStyles.input}
            value={workHourlyRate}
            onChangeText={setWorkHourlyRate}
            editable={!busy}
            keyboardType="decimal-pad"
            textAlign="right"
            placeholder={t('work.hourlyRatePlaceholder')}
            placeholderTextColor={colors.slate600}
          />
        </View>
      </View>

      {/* סוג העבודה, מחוץ לכל תנאי סוג, בדיוק כמו השעות. עידו,
          6.9.2026, החצי השני של אותה בקשה: "שעות עבודה וסוג עבודה
          ביומן". רשת מתוך היסטוריית המשק, ותמיד אפשר להקליד סוג
          שאף אחד לא הקליד קודם. */}
      <View style={sheetGap}>
        <TilePicker
          title={t('work.kind')}
          options={workKindChoices.map((value) => ({ value, label: value }))}
          selectedValue={selectedWorkKind}
          onSelect={(value) => {
            setWorkKind(value);
            setAddingWorkKind(false);
          }}
          actions={[
            { key: 'add', label: t('work.kindAdd'), onPress: () => setAddingWorkKind(true) },
          ]}
          emptyHint={t('work.kindEmpty')}
          disabled={busy}
          footer={
            addingWorkKind ? (
              <View style={workKindAnswer}>
                <TextInput
                  style={formStyles.input}
                  value={workKind}
                  onChangeText={setWorkKind}
                  editable={!busy}
                  placeholder={t('work.kindPlaceholder')}
                  placeholderTextColor={colors.slate600}
                  textAlign="right"
                  autoFocus
                />
              </View>
            ) : null
          }
        />
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>
          {t('log.form.cost')} · {t('common.optional')}
        </Text>
        <TextInput
          style={formStyles.input}
          value={cost}
          onChangeText={(text) => {
            setCost(text);
            // An empty box returns the cost to auto; anything typed wins.
            setCostTyped(text.trim() !== '');
          }}
          editable={!busy}
          keyboardType="decimal-pad"
          textAlign="right"
          placeholder={t('work.costPlaceholder')}
          placeholderTextColor={colors.slate600}
        />
        <Text style={workHintText}>
          {!costTyped && cost ? t('work.costComputed') : t('work.costHint')}
        </Text>
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('plots.form.name')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={formStyles.chips}>
            {!plotsState.loading &&
              plotsState.plots.map((plot) => {
                const active = plotId === plot.id;
                return (
                  <Pressable
                    key={plot.id}
                    style={[formStyles.chip, active && formStyles.chipActive]}
                    onPress={() => setPlotId(plot.id)}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>
                      {plot.name}
                    </Text>
                  </Pressable>
                );
              })}
            <Pressable
              style={[formStyles.chip, plotId === null && formStyles.chipActive]}
              onPress={() => setPlotId(null)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected: plotId === null }}
            >
              <Text style={[formStyles.chipText, plotId === null && formStyles.chipTextActive]}>
                {t('tasks.plotGeneral')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      {/* A journal entry records something that has already happened, whatever
          its type, so the calendar stops at today. The three shortcuts are the
          same ones the spray walk already offers and for the same reason: a
          record is written the evening it happened or the morning after. */}
      <View style={sheetGap}>
        <DateField
          label={t('log.form.date')}
          value={date}
          onChange={(next) => setDate(next ?? today())}
          direction="past"
          disabled={busy}
        />
      </View>

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>
          {t('log.form.note')} · {t('common.optional')}
        </Text>
        <TextInput
          style={formStyles.input}
          value={note}
          onChangeText={setNote}
          editable={!busy}
          placeholder={t('log.form.notePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <Pressable
        style={[formStyles.save, sheetGap, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('log.saving') : t('log.save')}</Text>
      </Pressable>
      {status === 'pestRequired' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('log.form.pestRequired')}</Text>
      )}
      {status === 'materialRequired' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('log.form.materialRequired')}</Text>
      )}
      {status === 'forbidden' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('log.form.forbidden')}</Text>
      )}
      {status === 'error' && (
        <Text style={[formStyles.bad, sheetGap]}>{t('log.form.saveError')}</Text>
      )}
    </BottomSheet>
  );
}

// שורת הצעות קטנה מעל השדה, prd.md סעיף 8: "שם החומר והמזיק מוצעים
// מתוך היסטוריית המשק". לחיצה ממלאת את השדה, לא מוסיפה אליו.
function SuggestionRow({
  values,
  onPick,
  disabled,
}: {
  values: string[];
  onPick: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={suggestionScroll}>
      <View style={formStyles.chips}>
        {values.map((value) => (
          <Pressable
            key={value}
            style={formStyles.chip}
            onPress={() => onPick(value)}
            disabled={disabled}
            accessibilityRole="button"
          >
            <Text style={formStyles.chipText}>{value}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const sheetGap = { marginTop: 16 };
// The box a grid cannot answer, under the grid. Same gap ExpenseSheet's
// `styles.answer` uses for its own add-a-name box.
const workKindAnswer = { gap: spacing.s12, marginTop: spacing.s4 };
// Field-700, לא Profit-600: design.md מפרט את שורת "בטוח לקטיף" בצבע
// הזה במפורש (Spray Log Screen), זו תזכורת רגועה ולא הכרזת רווח.
const safeHarvestText = {
  fontFamily: fonts.bold,
  fontSize: fontSize.bodySm,
  color: colors.field700,
  writingDirection: 'rtl' as const,
};
// שורת ההסבר מתחת לעלות העבודה, "מחושב אוטומטית, אפשר לשנות". טקסט
// עזר ולא תווית שדה, ולכן Slate-600 ובגודל הקטן.
const workHintText = {
  fontFamily: fonts.regular,
  fontSize: fontSize.bodySm,
  color: colors.slate600,
  writingDirection: 'rtl' as const,
};
const rowFields = { flexDirection: 'row' as const, gap: 12 };
const rowField = { flex: 1, gap: 8 };
const suggestionScroll = { marginTop: 8 };
