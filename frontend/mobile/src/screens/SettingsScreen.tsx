import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AREA_UNITS,
  CURRENCIES,
  LOCALES,
  areaUnitLabelKey,
  currencyLabelKey,
  localeLabelKey,
  resolveDisplayName,
  t,
  updateDisplayName,
  useFarmSettings,
  type FarmSettingsForm,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { useAuth } from '../auth/AuthProvider';
import { ChipField } from '../components/ChipField';
import { FormScreen } from '../components/FormScreen';
import { MembersSection } from '../components/MembersSection';

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
  // draft מחזיק רק את מה שהמשתמש שינה בפועל, ואין useEffect שמסנכרן
  // אותו מ-form. אותו תיקון בדיוק כמו בווב, ומאותן שתי סיבות שנמצאו
  // בקוד ריוויו: סנכרון כזה דרס עריכה שנעשתה בזמן שהשמירה באוויר,
  // וגם הותיר את המסך בלי נתונים ברינדור הראשון שבהם כבר היו.
  const [draft, setDraft] = useState<FarmSettingsForm | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const current = draft ?? form;
  // השדות ננעלים בזמן שמירה, אחרת ההודעה "נשמר" מתייחסת לערכים ישנים
  // יותר ממה שמוצג על המסך.
  const busy = status === 'saving';

  function update<K extends keyof FarmSettingsForm>(key: K, value: FarmSettingsForm[K]) {
    if (!current) return;
    setDraft({ ...current, [key]: value });
    setStatus('idle');
  }

  async function onSave() {
    if (!current) return;
    // החיתוך ובדיקת השם הריק חיים ב-save המשותף, לא כאן, כדי שלא יהיו
    // שני עותקים של אותו כלל בשני הלקוחות. המסך רק מדווח.
    setStatus('saving');
    const result = await save(current);
    // אחרי שמירה מוצלחת נוטשים את הטיוטה, כך ש-current נופל חזרה ל-form
    // שהוא הערך הסמכותי מהשרת. בלי זה, מאז שהחיתוך עבר ל-save המשותף,
    // השדה היה ממשיך להציג את הרווחים שהמשתמש הקליד בזמן שבמסד כבר
    // יושב השם החתוך.
    if (result.ok) setDraft(null);
    setStatus(result.ok ? 'saved' : result.reason);
  }

  if (loading || loadFailed || !current) {
    return (
      // אותו ריפוד כמו במסך המלא. קודם הכותרת נצמדה לקצה המסך במצבים
      // האלה, כי הריפוד ישב רק על contentContainerStyle של ה-ScrollView.
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.body}>
          <Text style={styles.title}>{t('screen.settings')}</Text>
          <Text style={loadFailed ? formStyles.bad : styles.note}>
            {loadFailed ? t('settings.loadError') : t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    // בלי header, הכותרת נגללת יחד עם התוכן כמו קודם. המעטפת אחראית
    // למקלדת ולגלילה בלבד ולא כופה פריסת כותרת.
    <FormScreen>
      <Text style={styles.title}>{t('screen.settings')}</Text>

      {/* שם התצוגה יושב ב-user_metadata ולא בהגדרות המשק, ולכן שדה
          עצמאי עם שמירה משלו ולא חלק מ-useFarmSettings. */}
      <DisplayNameField />

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('settings.farmName')}</Text>
        <TextInput
          style={formStyles.input}
          value={current.farmName}
          onChangeText={(value) => update('farmName', value)}
          editable={!busy}
          placeholder={t('settings.farmNamePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <ChipField
        label={t('settings.currency')}
        options={CURRENCIES}
        selected={current.currency}
        labelKey={currencyLabelKey}
        onSelect={(value) => update('currency', value)}
        disabled={busy}
      />

      <ChipField
        label={t('settings.areaUnit')}
        options={AREA_UNITS}
        selected={current.areaUnit}
        labelKey={areaUnitLabelKey}
        onSelect={(value) => update('areaUnit', value)}
        disabled={busy}
      />

      <ChipField
        label={t('settings.locale')}
        options={LOCALES}
        selected={current.locale}
        labelKey={localeLabelKey}
        onSelect={(value) => update('locale', value)}
        disabled={busy}
      />

      {/* Completion Prompts, design.md: "Both toggles live in Settings
          and can be turned off independently." */}
      <ToggleRow
        label={t('settings.journalPrompt')}
        value={current.journalPromptEnabled}
        onChange={(value) => update('journalPromptEnabled', value)}
        disabled={busy}
      />
      <ToggleRow
        label={t('settings.expensePrompt')}
        value={current.expensePromptEnabled}
        onChange={(value) => update('expensePromptEnabled', value)}
        disabled={busy}
      />

      <Pressable
        style={[formStyles.save, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>
          {status === 'saving' ? t('settings.saving') : t('settings.save')}
        </Text>
      </Pressable>

      {status === 'saved' && <Text style={formStyles.good}>{t('settings.saved')}</Text>}
      {status === 'forbidden' && <Text style={formStyles.bad}>{t('settings.forbidden')}</Text>}
      {status === 'error' && <Text style={formStyles.bad}>{t('settings.saveError')}</Text>}
      {status === 'nameRequired' && (
        <Text style={formStyles.bad}>{t('settings.nameRequired')}</Text>
      )}

      {/* שיתוף המשק, שלב 6. ניהול פתוח לבעלים בלבד, האכיפה במסד. */}
      <MembersSection />
    </FormScreen>
  );
}

// שם התצוגה של המשתמש. שדה עצמאי כי המקור שונה מהגדרות המשק: הערך
// חי ב-user_metadata של Auth ולא בטבלת settings, והכתיבה עוברת דרך
// updateDisplayName ולא דרך save של useFarmSettings. אותו דפוס טיוטה
// כמו בשאר המסך: draft הוא null עד שנוגעים, וההצגה נופלת חזרה לשם
// השמור, כך שעדכון הסשן אחרי שמירה משתקף מאליו.
function DisplayNameField() {
  const { session } = useAuth();
  const savedName = resolveDisplayName(session?.user) ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const value = draft ?? savedName;
  const busy = status === 'saving';

  async function onSave() {
    setStatus('saving');
    const result = await updateDisplayName(supabase, value);
    if (result.ok) setDraft(null);
    setStatus(result.ok ? 'saved' : 'error');
  }

  return (
    <>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('settings.displayName')}</Text>
        <TextInput
          style={formStyles.input}
          value={value}
          onChangeText={(next) => {
            setDraft(next);
            setStatus('idle');
          }}
          editable={!busy}
          placeholder={t('settings.displayNamePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>
      <Pressable
        style={[formStyles.save, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>
          {busy ? t('settings.saving') : t('settings.save')}
        </Text>
      </Pressable>
      {status === 'saved' && <Text style={formStyles.good}>{t('settings.saved')}</Text>}
      {status === 'error' && <Text style={formStyles.bad}>{t('settings.saveError')}</Text>}
    </>
  );
}

// שורת מתג בוליאני, לשני מתגי Completion Prompts. Switch הוא הביטוי
// הטבעי של בוליאן בפלטפורמה, בניגוד לשדות הבחירה הסגורים למעלה
// (מטבע, יחידת שטח, שפה) שמשתמשים בצ'יפים כי יש בהם כמה אפשרויות.
function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={toggleStyles.row}>
      <Text style={toggleStyles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.field500, false: colors.border200 }}
        thumbColor={colors.paper}
      />
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s16,
  },
  label: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
});

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
    writingDirection: 'rtl',
  },
});
