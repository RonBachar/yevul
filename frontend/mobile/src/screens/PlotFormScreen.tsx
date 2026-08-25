import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import {
  AREA_UNITS,
  areaUnitLabelKey,
  createPlot,
  t,
  updatePlot,
  useCurrentFarm,
  useFarmSettings,
  usePlotDetail,
  type AreaUnit,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { colors, fonts, fontSize, spacing } from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { ChipField } from '../components/ChipField';
import { FormScreen } from '../components/FormScreen';
import type { PlotsStackParamList } from '../navigation/PlotsStack';

type Nav = NativeStackNavigationProp<PlotsStackParamList, 'PlotForm'>;
type Route = RouteProp<PlotsStackParamList, 'PlotForm'>;

type Status = 'idle' | 'saving' | 'nameRequired' | 'cropNameRequired' | 'forbidden' | 'error';

// יצירה ועריכה של חלקה על אותו מסך, כדי לא לשכפל את הטופס. במצב יצירה
// מופיע גם שדה שם הגידול, כי prd.md אומר במפורש: "חלקה היא שם, שטח,
// ומה גדל בה, זה כל מה שנדרש כדי להתחיל". יבול ומחיר צפויים לא נשאלים
// כאן בכלל, הם ממתינים לכפתור עדכון צפי במסך פרטי החלקה. עונה נקבעת
// אוטומטית לשנה הנוכחית, prd.md: החקלאי כמעט לא נוגע בשדה הזה.
//
// במצב עריכה שדה הגידול לא מוצג, כי הוא שייך ל-CropCycle ולא לחלקה
// עצמה, ונערך בנפרד מטאב הרווחיות.
export function PlotFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const plotId = route.params?.plotId;
  const isEdit = Boolean(plotId);

  const { farm } = useCurrentFarm(supabase);
  const detail = usePlotDetail(supabase, plotId ?? null);
  const settings = useFarmSettings(supabase);

  const [name, setName] = useState('');
  const [areaText, setAreaText] = useState('');
  // null עד שידוע מה לבחור, ואז נגזר מהגדרות המשק. קודם ישב כאן 'dunam'
  // קשיח, כך שחקלאי שהגדיר הקטאר בהגדרות קיבל דונם בכל חלקה חדשה,
  // כלומר ההגדרה שהוא בחר במפורש נעקפה בשקט.
  const [areaUnit, setAreaUnit] = useState<AreaUnit | null>(null);
  const [cropName, setCropName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [prefilled, setPrefilled] = useState(false);

  // טוען את ערכי החלקה הקיימת פעם אחת כשמצב העריכה מוכן. בלי prefilled
  // כל refresh (למשל אחרי useFocusEffect במסך אחר) היה דורס מה שהמשתמש
  // כבר הקליד.
  useEffect(() => {
    if (isEdit && !prefilled && detail.plot) {
      setName(detail.plot.name);
      setAreaText(detail.plot.area != null ? String(detail.plot.area) : '');
      setAreaUnit(detail.plot.areaUnit ?? settings.form?.areaUnit ?? 'dunam');
      setPrefilled(true);
    }
  }, [isEdit, prefilled, detail.plot, settings.form?.areaUnit]);

  // בחלקה חדשה היחידה נגזרת מהגדרות המשק ברגע שהן נטענו, אלא אם
  // המשתמש כבר בחר במפורש (אז areaUnit כבר לא null ולא נדרס).
  const effectiveAreaUnit = areaUnit ?? settings.form?.areaUnit ?? 'dunam';

  const busy = status === 'saving';

  async function onSave() {
    const area = areaText.trim() === '' ? null : Number(areaText.replace(',', '.'));
    setStatus('saving');

    if (isEdit && plotId) {
      const result = await updatePlot(supabase, plotId, {
        name,
        area,
        areaUnit: effectiveAreaUnit,
      });
      if (result.ok) {
        navigation.goBack();
        return;
      }
      setStatus(result.reason);
      return;
    }

    if (!farm) {
      setStatus('error');
      return;
    }
    const result = await createPlot(supabase, farm.id, {
      name,
      area,
      areaUnit: effectiveAreaUnit,
      cropName,
    });
    if (result.ok) {
      navigation.goBack();
      return;
    }
    setStatus(result.reason);
  }

  if (isEdit && (detail.loading || detail.failed || !prefilled)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.center}>
          <Text style={detail.failed ? formStyles.bad : styles.note}>
            {detail.failed ? t('plots.detail.loadError') : t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <FormScreen
      header={
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('plots.detail.back')}
            hitSlop={12}
          >
            <ChevronRight size={28} strokeWidth={2} color={colors.ink900} />
          </Pressable>
          <Text style={styles.title}>
            {isEdit ? t('plots.form.titleEdit') : t('plots.form.titleNew')}
          </Text>
        </View>
      }
    >
      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.form.name')}</Text>
        <TextInput
          style={formStyles.input}
          value={name}
          onChangeText={setName}
          editable={!busy}
          placeholder={t('plots.form.namePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>

      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.form.area')}</Text>
        <TextInput
          style={formStyles.input}
          value={areaText}
          onChangeText={setAreaText}
          editable={!busy}
          keyboardType="decimal-pad"
          textAlign="right"
          placeholder={t('plots.form.areaPlaceholder')}
          placeholderTextColor={colors.slate600}
          importantForAutofill="no"
        />
      </View>

      <ChipField
        label={t('settings.areaUnit')}
        options={AREA_UNITS}
        selected={effectiveAreaUnit}
        labelKey={areaUnitLabelKey}
        onSelect={setAreaUnit}
        disabled={busy}
      />

      {!isEdit && (
        <View style={formStyles.field}>
          <Text style={formStyles.label}>{t('plots.form.cropName')}</Text>
          <TextInput
            style={formStyles.input}
            value={cropName}
            onChangeText={setCropName}
            editable={!busy}
            placeholder={t('plots.form.cropNamePlaceholder')}
            placeholderTextColor={colors.slate600}
            textAlign="right"
          />
        </View>
      )}

      <Pressable
        style={[formStyles.save, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('plots.saving') : t('plots.save')}</Text>
      </Pressable>

      {status === 'nameRequired' && (
        <Text style={formStyles.bad}>{t('plots.form.nameRequired')}</Text>
      )}
      {status === 'cropNameRequired' && (
        <Text style={formStyles.bad}>{t('plots.form.cropNameRequired')}</Text>
      )}
      {status === 'forbidden' && <Text style={formStyles.bad}>{t('plots.form.forbidden')}</Text>}
      {status === 'error' && <Text style={formStyles.bad}>{t('plots.form.saveError')}</Text>}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
    paddingHorizontal: spacing.s24,
    paddingTop: spacing.s16,
    paddingBottom: spacing.s8,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.headingSm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
});
