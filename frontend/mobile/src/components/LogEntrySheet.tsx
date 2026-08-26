import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createLogEntry,
  logEntryTypeLabelKey,
  LOG_ENTRY_TYPES,
  safeHarvestDate,
  t,
  updateLogEntry,
  usePlots,
  useSpraySuggestions,
  type LogEntry,
  type LogEntryType,
} from '@yevul/shared';
import { colors, fonts, fontSize } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { BottomSheet } from './BottomSheet';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// גוזר את date מיום/חודש. בכיוון הפוך מ-computeDueDate ב-TaskSheet:
// שם תאריך עתידי גולש לשנה הבאה כי מדובר ביעד קדימה, כאן רשומת יומן
// מתעדת משהו שכבר קרה, ולכן תאריך שהיה עתידי השנה גולש אחורה לשנה
// שעברה במקום קדימה.
function computeLogDate(day: string, month: string, now: Date): string | null {
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (!Number.isFinite(dayNum) || !Number.isFinite(monthNum) || dayNum < 1 || monthNum < 1) {
    return null;
  }
  const today = startOfDay(now);
  let candidate = new Date(now.getFullYear(), monthNum - 1, dayNum);
  if (candidate > today) candidate = new Date(now.getFullYear() - 1, monthNum - 1, dayNum);
  return candidate.toISOString().slice(0, 10);
}

// גיליון יצירה/עריכה של רשומת יומן, design.md "Log Entry Sheet". זו
// הנקודה היחידה שכותבת ליומן, גם מהאפשרות "יומן" בגיליון הרישום וגם
// (בעתיד) מ-Completion Prompts. בלי כפתורי מצלמה/מיקרופון, אותה סיבה
// בדיוק כמו ב-TaskSheet: תלויים בתשתית הקול שנבנית בשלב 5.
export function LogEntrySheet({
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

  const [type, setType] = useState<LogEntryType>('other');
  const [plotId, setPlotId] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [note, setNote] = useState('');
  const [sprayPest, setSprayPest] = useState('');
  const [sprayMaterial, setSprayMaterial] = useState('');
  const [sprayDose, setSprayDose] = useState('');
  const [sprayPhiDays, setSprayPhiDays] = useState('');
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestUnit, setHarvestUnit] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'pestRequired' | 'materialRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    if (entry) {
      const date = new Date(entry.date);
      setType(entry.type);
      setPlotId(entry.plotId);
      setDay(String(date.getDate()));
      setMonth(String(date.getMonth() + 1));
      setNote(entry.note ?? '');
      setSprayPest(entry.sprayPest ?? '');
      setSprayMaterial(entry.sprayMaterial ?? '');
      setSprayDose(entry.sprayDose ?? '');
      setSprayPhiDays(entry.sprayPhiDays != null ? String(entry.sprayPhiDays) : '');
      setHarvestQty(entry.harvestQty != null ? String(entry.harvestQty) : '');
      setHarvestUnit(entry.harvestUnit ?? '');
    } else {
      setType('other');
      setPlotId(defaultPlotId);
      setDay(String(now.getDate()));
      setMonth(String(now.getMonth() + 1));
      setNote('');
      setSprayPest('');
      setSprayMaterial('');
      setSprayDose('');
      setSprayPhiDays('');
      setHarvestQty('');
      setHarvestUnit('');
    }
    setStatus('idle');
  }, [visible, entry, defaultPlotId]);

  const phiDaysNumber = sprayPhiDays.trim() ? Number(sprayPhiDays) : null;
  const dateValue = computeLogDate(day, month, new Date());
  const safeHarvest =
    type === 'spray' && dateValue && phiDaysNumber != null && Number.isFinite(phiDaysNumber)
      ? safeHarvestDate(dateValue, phiDaysNumber)
      : null;

  async function onSave() {
    if (!farmId) return;
    const date = computeLogDate(day, month, new Date());
    if (!date) return;

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

      <View style={[formStyles.field, sheetGap]}>
        <Text style={formStyles.label}>{t('log.form.date')}</Text>
        <View style={dateRow}>
          <TextInput
            style={[formStyles.input, dateInput]}
            value={day}
            onChangeText={setDay}
            editable={!busy}
            keyboardType="number-pad"
            placeholder={t('log.form.dateDay')}
            placeholderTextColor={colors.slate600}
            textAlign="center"
            maxLength={2}
          />
          <TextInput
            style={[formStyles.input, dateInput]}
            value={month}
            onChangeText={setMonth}
            editable={!busy}
            keyboardType="number-pad"
            placeholder={t('log.form.dateMonth')}
            placeholderTextColor={colors.slate600}
            textAlign="center"
            maxLength={2}
          />
        </View>
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
// Field-700, לא Profit-600: design.md מפרט את שורת "בטוח לקטיף" בצבע
// הזה במפורש (Spray Log Screen), זו תזכורת רגועה ולא הכרזת רווח.
const safeHarvestText = {
  fontFamily: fonts.medium,
  fontSize: fontSize.bodySm,
  color: colors.field700,
  writingDirection: 'rtl' as const,
};
const dateRow = { flexDirection: 'row' as const, gap: 8 };
const dateInput = { flex: 1, textAlign: 'center' as const };
const rowFields = { flexDirection: 'row' as const, gap: 12 };
const rowField = { flex: 1, gap: 8 };
const suggestionScroll = { marginTop: 8 };
