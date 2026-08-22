import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AREA_UNITS,
  CURRENCIES,
  LOCALES,
  areaUnitLabelKey,
  currencyLabelKey,
  localeLabelKey,
  t,
  useFarmSettings,
  type FarmSettingsForm,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, radius, spacing, touchTarget } from '../theme/tokens';

// מסך ההגדרות בנייד. אותה לוגיקת טעינה ושמירה בדיוק כמו בווב, דרך
// useFarmSettings ב-packages/shared, כדי שהטיפול בדחיית RLS לא ייכתב
// פעמיים ויתפצל. רק ה-UI שונה, וזה בדיוק ההבדל שאמור להיות בין
// שני הלקוחות.
//
// אין כאן בחירה בתפריט נפתח כמו בווב. שדות עם מעט אפשרויות מוצגים
// כשורת צ'יפים, כי בשדה, ביד אחת ובשמש, בחירה בלחיצה אחת עדיפה על
// תפריט שנפתח ומכסה את המסך.
type Status = 'idle' | 'saving' | 'saved' | 'forbidden' | 'error' | 'nameRequired';

export function SettingsScreen() {
  const { loading, loadFailed, form, save } = useFarmSettings(supabase);
  const [draft, setDraft] = useState<FarmSettingsForm | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (form) setDraft(form);
  }, [form]);

  function update<K extends keyof FarmSettingsForm>(key: K, value: FarmSettingsForm[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setStatus('idle');
  }

  async function onSave() {
    if (!draft) return;
    if (draft.farmName.trim() === '') {
      setStatus('nameRequired');
      return;
    }
    setStatus('saving');
    const result = await save({ ...draft, farmName: draft.farmName.trim() });
    setStatus(result.ok ? 'saved' : result.reason === 'forbidden' ? 'forbidden' : 'error');
  }

  if (loading || loadFailed || !draft) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Text style={styles.title}>{t('screen.settings')}</Text>
        <Text style={loadFailed ? styles.bad : styles.note}>
          {loadFailed ? t('settings.loadError') : t('common.loading')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('screen.settings')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('settings.farmName')}</Text>
          <TextInput
            style={styles.input}
            value={draft.farmName}
            onChangeText={(value) => update('farmName', value)}
            placeholder={t('settings.farmNamePlaceholder')}
            placeholderTextColor={colors.slate600}
            textAlign="right"
          />
        </View>

        <ChipField
          label={t('settings.currency')}
          options={CURRENCIES}
          selected={draft.currency}
          labelKey={currencyLabelKey}
          onSelect={(value) => update('currency', value)}
        />

        <ChipField
          label={t('settings.areaUnit')}
          options={AREA_UNITS}
          selected={draft.areaUnit}
          labelKey={areaUnitLabelKey}
          onSelect={(value) => update('areaUnit', value)}
        />

        <ChipField
          label={t('settings.locale')}
          options={LOCALES}
          selected={draft.locale}
          labelKey={localeLabelKey}
          onSelect={(value) => update('locale', value)}
        />

        <Pressable
          style={[styles.save, status === 'saving' && styles.saveDisabled]}
          onPress={onSave}
          disabled={status === 'saving'}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>
            {status === 'saving' ? t('settings.saving') : t('settings.save')}
          </Text>
        </Pressable>

        {status === 'saved' && <Text style={styles.good}>{t('settings.saved')}</Text>}
        {status === 'forbidden' && <Text style={styles.bad}>{t('settings.forbidden')}</Text>}
        {status === 'error' && <Text style={styles.bad}>{t('settings.saveError')}</Text>}
        {status === 'nameRequired' && <Text style={styles.bad}>{t('settings.nameRequired')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// שורת צ'יפים לבחירה מתוך קבוצה קטנה וסגורה. הצ'יפ הנבחר מסומן גם
// בצבע וגם במשקל, לא בצבע בלבד, אותו כלל כמו במצב הפעיל בניווט.
function ChipField<T extends string>({
  label,
  options,
  selected,
  labelKey,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  labelKey: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((value) => {
          const active = value === selected;
          return (
            <Pressable
              key={value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(labelKey(value))}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  body: {
    padding: spacing.s24,
    paddingBottom: spacing.s48,
    gap: spacing.s24,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    paddingHorizontal: spacing.s24,
    writingDirection: 'rtl',
  },
  field: {
    gap: spacing.s8,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  input: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.s16,
    borderWidth: 1,
    borderColor: colors.border200,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.ink900,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s8,
  },
  chip: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border200,
    backgroundColor: colors.paper,
  },
  chipActive: {
    borderColor: colors.field700,
    backgroundColor: colors.field100,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
  chipTextActive: {
    fontFamily: fonts.bold,
    color: colors.field700,
  },
  save: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.field700,
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.paper,
  },
  good: {
    fontFamily: fonts.medium,
    fontSize: fontSize.bodySm,
    color: colors.profit600,
    writingDirection: 'rtl',
  },
  bad: {
    fontFamily: fonts.medium,
    fontSize: fontSize.bodySm,
    color: colors.loss600,
    paddingHorizontal: spacing.s24,
    writingDirection: 'rtl',
  },
});
