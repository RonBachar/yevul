import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import PencilLine from 'lucide-react-native/icons/pencil-line';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import TrendingDown from 'lucide-react-native/icons/trending-down';
import SprayCan from 'lucide-react-native/icons/spray-can';
import {
  expectedPriceDisplay,
  expectedYieldDisplay,
  formatAmount,
  formatSignedAmount,
  plotProfitForecast,
  plotSummaryLine,
  priceUnitLabel,
  profitTone,
  t,
  updateCropCycle,
  updateForecast,
  useFarmSettings,
  useMyRole,
  usePlotDetail,
  usePlotExpensesTotal,
  useLogEntries,
  openSafeHarvestDate,
  staleForecastSince,
  formatMonthName,
  workerModeShell,
  yieldRateUnitLabel,
  type AreaUnit,
  type CropCycle,
  type Currency,
  type PlotDetailTab,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import {
  colors,
  fonts,
  fontSize,
  profitToneColor,
  radius,
  spacing,
  touchTarget,
} from '../theme/tokens';
import { formStyles } from '../theme/formStyles';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { BottomSheet } from '../components/BottomSheet';
import { ExpenseList } from '../components/ExpenseList';
import { JournalList } from '../components/JournalList';
import { TaskBoard } from '../components/TaskBoard';
import { YieldUnitField } from '../components/YieldUnitField';
import type { PlotsStackParamList } from '../navigation/PlotsStack';

type Nav = NativeStackNavigationProp<PlotsStackParamList, 'PlotDetail'>;
type Route = RouteProp<PlotsStackParamList, 'PlotDetail'>;

// מסך פרטי חלקה. **טאב "רווחיות" המאוחד פוצל**, לפי הערת מוצר של עידו:
// שני צדי הכסף מקבלים טאב משלהם, וסיכום צפי הרווח עלה לכותרת קבועה
// כדי שייראה מכל טאב בלי להיכנס לאחד מהם.
//
// הפיצול הזה גם מייתר את מה שהיה קודם: ברגע שהסיכום לא יושב בתוך טאב,
// מה שנשאר ב"רווחיות" הוא בדיוק תוכן טאב צפי ההכנסה, ואין עוד שני
// מקומות שמדברים על הוצאות.
// סדר הטאבים והתוויות. הרשימה הנראית עצמה (מלאה מול מצומצמת לעובד)
// מגיעה מ-workerModeShell, וסוג הטאב חי ב-@yevul/shared כמקור אחד.
type Tab = PlotDetailTab;
const TAB_LABEL_KEY: Record<Tab, string> = {
  income: 'plots.tab.income',
  expenses: 'plots.tab.expenses',
  tasks: 'plots.tab.tasks',
  journal: 'plots.tab.journal',
};

export function PlotDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const plotId = route.params.plotId;

  const detail = usePlotDetail(supabase, plotId);
  const settings = useFarmSettings(supabase);
  // ההוצאות בפועל של החלקה, שלב 4. עד כאן הועבר כאן `null` קבוע, כי
  // מעקב ההוצאות עוד לא היה קיים כשהמסך נבנה, והתוצאה הייתה צפי רווח
  // ששווה להכנסה המלאה גם אחרי שהחקלאי כבר רשם הוצאות.
  const plotExpenses = usePlotExpensesTotal(supabase, plotId);
  // רשומות הריסוס של החלקה, לצ'יפ "בטוח לקטיף". הסינון לפי סוג קורה
  // במסד ולא בקליינט, אותו עיקרון כמו במסך יומן הריסוס.
  const sprays = useLogEntries(supabase, plotId, 'spray');
  // Worker Mode, design.md: "Plot Detail drops to two tabs, משימות and יומן.
  // צפי הכנסה and הוצאות don't render." הרשימה נגזרת ב-workerModeShell, ועד
  // שהתפקיד ידוע נוהגים כאילו זה עובד, כך שטאב הכנסה לא מהבהב לעובד.
  const role = useMyRole(supabase);
  const shell = workerModeShell(role.role, role.loading);
  const tabs = shell.plotDetailTabs;
  const [tab, setTab] = useState<Tab>('income');
  // הטאב הפעיל בפועל נגזר ולא נשמר: כשהטאב השמור אינו ברשימה הנראית
  // (עובד עם ברירת מחדל 'income', או בזמן טעינת תפקיד) נופלים לראשון
  // הנראה. כך בעל משק נוחת על 'income' ברגע שהתפקיד מוכרע, בלי לדרוס
  // את ברירת המחדל שלו, ועובד לעולם לא רואה תוכן כספי אפילו לפריים.
  // 'tasks' כברירת מחדל היא רק כדי לספק את הטיפוס (tabs לעולם לא ריק,
  // 'tasks' קיים בשתי הרשימות). בפועל tabs[0] הוא 'income' לבעל משק ו-
  // 'tasks' לעובד.
  const activeTab: Tab = tabs.includes(tab) ? tab : (tabs[0] ?? 'tasks');
  const [forecastOpen, setForecastOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  // שלוש השאילתות שמזינות את כותרת המסך ואת טאב ההכנסה, כולן במשיכה
  // אחת. **נקרא לפני היציאה המוקדמת שמתחת**, כי הוק לא נקרא בתנאי;
  // וזה גם מה שמאפשר למשוך את מסך הכשל עצמו ולנסות שוב, במקום לצאת
  // מהמסך ולחזור אליו.
  const refreshControl = usePullToRefresh([detail, plotExpenses, sprays]);

  useFocusEffect(
    useCallback(() => {
      detail.refresh();
    }, [detail.refresh]),
  );

  if (detail.loading || detail.failed || !detail.plot) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.centerFill} refreshControl={refreshControl}>
          <View style={styles.center}>
            <Text style={detail.failed ? formStyles.bad : styles.note}>
              {detail.failed ? t('plots.detail.loadError') : t('common.loading')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { plot, cropCycle } = detail;

  // "עכשיו" נלקח פעם אחת בזמן הרינדור ומוזרק לשתי הפונקציות הטהורות,
  // כדי שהחישוב עצמו יישאר בדיק ולא ייגע בשעון בעצמו.
  const now = new Date();
  const staleSince = staleForecastSince(cropCycle, now);
  const safeHarvest = openSafeHarvestDate(sprays.entries, now);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('plots.detail.back')}
          hitSlop={12}
        >
          <ChevronRight size={28} strokeWidth={2} color={colors.ink900} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.plotName}>{plot.name}</Text>
          <Text style={styles.plotSummary}>{plotSummaryLine(plot, cropCycle)}</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('PlotForm', { plotId })}
          accessibilityRole="button"
          accessibilityLabel={t('plots.detail.edit')}
          hitSlop={12}
        >
          <PencilLine size={22} strokeWidth={2} color={colors.slate600} />
        </Pressable>
      </View>

      {/* הסיכום יושב מחוץ לטאבים, ולכן נראה מכל אחד מהם.
          **הוא נעלם לגמרי לעובד בלי בדיקת תפקיד בקליינט**, כי שדות
          התחזית ממוסכים ל-null ב-crop_cycles_view, ובלעדיהם אין הכנסה
          לחשב ו-plotProfitForecast מחזיר null. זו בדיוק האכיפה בשכבת
          השאילתה ש-design.md דורש, ולא הסתרה ב-UI שעלולה לדלוף. */}
      <ProfitForecastHeader
        plotArea={plot.area}
        cropCycle={cropCycle}
        expensesTotal={plotExpenses.total}
        expensesLoading={plotExpenses.loading}
        currency={settings.form?.currency ?? 'ILS'}
      />

      <View style={styles.tabTrack}>
        {tabs.map((key) => {
          const active = key === activeTab;
          return (
            <Pressable
              key={key}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t(TAB_LABEL_KEY[key])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* טאב ההכנסה נשאר ScrollView ולא הופך לרשימה: זה כרטיס אחד
          וכפתור, מספר קבוע של ילדים, ולא רשימה שגדלה עם הנתונים. רק
          המשיכה נוספה. */}
      {activeTab === 'income' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          refreshControl={refreshControl}
        >
          <View style={styles.card}>
            <View style={styles.identityRow}>
              {cropCycle ? (
                <Text style={styles.identityText}>
                  {cropCycle.name}
                  {cropCycle.season ? (
                    <Text style={styles.identityMeta}> · {cropCycle.season}</Text>
                  ) : null}
                </Text>
              ) : (
                <Text style={styles.identityTextMuted}>{t('plots.noCrop')}</Text>
              )}
              {cropCycle && (
                <Pressable
                  onPress={() => setCropOpen(true)}
                  accessibilityRole="button"
                  hitSlop={12}
                >
                  <Text style={styles.identityEdit}>{t('plots.crop.edit')}</Text>
                </Pressable>
              )}
            </View>

            {cropCycle && (
              <>
                <View style={styles.divider} />

                {/* נודניק ההתיישנות, design.md, "Staleness nudge":
                    שורת טקסט אחת מעל המספר, לא כרטיס ולא מודאל. לוחצים
                    עליה ונפתח אותו גיליון דו-שדות של עדכון הצפי. */}
                {staleSince && (
                  <Pressable onPress={() => setForecastOpen(true)} accessibilityRole="button">
                    <Text style={styles.staleNudge}>
                      {t('plots.forecast.stalePrefix')} {formatMonthName(staleSince)},{' '}
                      {t('plots.forecast.staleSuffix')}
                    </Text>
                  </Pressable>
                )}

                <View style={styles.incomeBlock}>
                  <Text style={styles.incomeLabel}>{t('plots.income.expected')}</Text>
                  <ExpectedIncome
                    plotArea={plot.area}
                    cropCycle={cropCycle}
                    currency={settings.form?.currency ?? 'ILS'}
                  />
                </View>

                <KvRow
                  label={t('plots.forecast.yield')}
                  value={expectedYieldDisplay(cropCycle, plot.areaUnit)}
                />
                <KvRow
                  label={t('plots.forecast.price')}
                  value={expectedPriceDisplay(cropCycle, settings.form?.currency ?? 'ILS')}
                />

                <Pressable
                  style={styles.forecastUpdate}
                  onPress={() => setForecastOpen(true)}
                  accessibilityRole="button"
                >
                  <PencilLine size={16} strokeWidth={2} color={colors.field700} />
                  <Text style={styles.forecastUpdateText}>{t('plots.forecast.update')}</Text>
                </Pressable>

                {/* design.md, טאב צפי הכנסה: "When the plot has an open
                    spray record with phi_days set, a Field-100 'בטוח
                    לקטיף מ-…' chip renders here too". המחמיר מבין
                    הריסוסים הפתוחים קובע, ראה openSafeHarvestDate. */}
                {safeHarvest && (
                  <View style={styles.safeHarvestChip}>
                    <Text style={styles.safeHarvestText}>
                      {t('log.form.safeHarvestPrefix')}-
                      {new Date(safeHarvest).toLocaleDateString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* design.md, Spray Log Screen: "a button on the Plot Detail
              Screen's Profitability tab", אחת משלוש נקודות הכניסה
              הקבועות למסך יומן הריסוס. */}
          <Pressable
            style={styles.sprayLogButton}
            onPress={() => navigation.navigate('SprayLog', { plotId })}
            accessibilityRole="button"
          >
            <SprayCan size={18} strokeWidth={2} color={colors.field700} />
            <Text style={styles.sprayLogButtonText}>{t('sprayLog.title')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {activeTab === 'tasks' && (
        <View style={styles.tasksBody}>
          <TaskBoard supabase={supabase} plotId={plotId} showPlotName={false} />
        </View>
      )}

      {activeTab === 'journal' && (
        <View style={styles.tasksBody}>
          <JournalList
            supabase={supabase}
            plotId={plotId}
            showPlotName={false}
            onDeleted={plotExpenses.refresh}
          />
        </View>
      )}

      {activeTab === 'expenses' && (
        <View style={styles.tasksBody}>
          <ExpenseList supabase={supabase} plotId={plotId} showPlotName={false} />
        </View>
      )}

      {cropCycle && (
        <ForecastUpdateSheet
          visible={forecastOpen}
          onClose={() => setForecastOpen(false)}
          cropCycle={cropCycle}
          plotArea={plot.area}
          areaUnit={plot.areaUnit}
          currency={settings.form?.currency ?? 'ILS'}
          onSaved={() => {
            setForecastOpen(false);
            detail.refresh();
          }}
        />
      )}

      {cropCycle && (
        <CropCycleEditSheet
          visible={cropOpen}
          onClose={() => setCropOpen(false)}
          cropCycle={cropCycle}
          onSaved={() => {
            setCropOpen(false);
            detail.refresh();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// סיכום צפי הרווח בראש המסך, מחוץ לטאבים. design.md דורש שכל מספר
// רווח/הפסד יישא סימן וחץ ולא יסתמך על צבע בלבד, ולכן שניהם כאן.
// אפס נשאר Ink-900, כי אפס אינו רווח ואינו הפסד.
function ProfitForecastHeader({
  plotArea,
  cropCycle,
  expensesTotal,
  expensesLoading,
  currency,
}: {
  plotArea: number | null;
  cropCycle: CropCycle | null;
  expensesTotal: number | null;
  expensesLoading: boolean;
  currency: Currency;
}) {
  // הכותרת כולה מוסתרת עד שההוצאות ידועות. מספר כספי שגוי, ובמיוחד
  // המשפט "עדיין לא נרשמו הוצאות" על חלקה שיש בה הוצאות, גרועים
  // מהופעה של הכותרת רבע שנייה מאוחר יותר. ראה usePlotExpensesTotal.
  if (expensesLoading) return null;
  // null כשאין מספיק נתונים לחשב, וגם כשהמשתמש הוא עובד ששדות התחזית
  // ממוסכים לו במסד. בשני המקרים הכותרת פשוט לא מרונדרת.
  //
  // אחרי הטעינה expensesTotal הוא מספר אמיתי, כולל 0, שהוא עובדה ולא
  // חוסר ידיעה. null כאן נשאר רק לכשל טעינה, ושם חיווי ה-Wheat נכון.
  const forecast = plotProfitForecast(plotArea, cropCycle, expensesTotal);
  if (!forecast) return null;

  const tone = profitTone(forecast.profit);
  const toneStyle =
    tone === 'profit'
      ? styles.profitValueGain
      : tone === 'loss'
        ? styles.profitValueLoss
        : styles.profitValueZero;
  const Glyph = tone === 'loss' ? TrendingDown : TrendingUp;
  const glyphColor = profitToneColor(tone);

  return (
    <View style={styles.profitHeader}>
      <Text style={styles.profitLabel}>{t('plots.profit.forecast')}</Text>
      <View style={styles.profitValueRow}>
        {tone !== 'zero' && <Glyph size={22} strokeWidth={2.5} color={glyphColor} />}
        <Text style={[styles.profitValue, toneStyle]} numberOfLines={1} adjustsFontSizeToFit>
          {formatSignedAmount(forecast.profit, currency)}
        </Text>
      </View>
      <Text style={styles.profitBreakdown}>
        {t('plots.profit.income')} {formatAmount(forecast.expectedIncome, currency)} ·{' '}
        {t('plots.profit.expenses')} {formatAmount(forecast.expenses, currency)}
      </Text>
      {/* Wheat ולא אדום. המסר הוא "עוד לא מוצג לך הכל", לא "אתה מפסיד". */}
      {!forecast.expensesTracked && (
        <Text style={styles.profitCaveat}>{t('plots.profit.noExpensesYet')}</Text>
      )}
    </View>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

// prd.md, סעיף החלקה: ההכנסה מחושבת פשוט, שטח כפול יבול צפוי ליחידת
// שטח כפול מחיר משוער ליחידה. שלושת הנתונים אופציונליים, ולכן בלי
// כולם ההכנסה לא ידועה ולא מוצג "0" מטעה במקומה.
function ExpectedIncome({
  plotArea,
  cropCycle,
  currency,
}: {
  plotArea: number | null;
  cropCycle: CropCycle;
  currency: Currency;
}) {
  const canCompute =
    plotArea != null &&
    cropCycle.expectedYieldPerArea != null &&
    cropCycle.expectedPricePerUnit != null;

  // בלי הכל, אין הכנסה צפויה לחשב. שורות היבול והמחיר שמתחת כבר
  // מראות "לא הוזן עדיין" בכל שדה חסר, ולכן אין צורך במשפט הנחיה נוסף
  // כאן, design.md: "absence is information the farmer already has."
  if (!canCompute) {
    return null;
  }

  const expectedIncome =
    plotArea! * cropCycle.expectedYieldPerArea! * cropCycle.expectedPricePerUnit!;
  return (
    <Text
      style={styles.incomeFigure}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={fontSize.headingSm / fontSize.headingLg}
    >
      {formatAmount(expectedIncome, currency)}
    </Text>
  );
}

// design.md, Forecast Update: גיליון של שני שדות, יבול ומחיר. שדה
// יחידת היבול מופיע כאן **רק כשהיא עדיין לא הוגדרה**, ואז הוא נחוץ:
// בלעדיו שני המספרים חסרי משמעות ("300 של מה?"), כי היחידה נערכת במסך
// אחר לגמרי (זהות הגידול) והיא אופציונלית בסכמה. חקלאי שכבר הגדיר
// יחידה רואה בדיוק שני שדות, כפי שהמפרט דורש.
//
// התוויות מרכיבות את היחידות האמיתיות ("ק״ג לדונם", "₪ לק״ג") במקום
// המילה "יחידה", שהופיעה קודם בשתי משמעויות שונות באותו גיליון.
function ForecastUpdateSheet({
  visible,
  onClose,
  cropCycle,
  plotArea,
  areaUnit,
  currency,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  cropCycle: CropCycle;
  plotArea: number | null;
  areaUnit: AreaUnit | null;
  currency: Currency;
  onSaved: () => void;
}) {
  const [yieldText, setYieldText] = useState(String(cropCycle.expectedYieldPerArea ?? ''));
  const [priceText, setPriceText] = useState(String(cropCycle.expectedPricePerUnit ?? ''));
  const [unitText, setUnitText] = useState(cropCycle.yieldUnit ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'forbidden' | 'error'>('idle');
  const busy = status === 'saving';

  const needsUnit = !cropCycle.yieldUnit?.trim();
  // התוויות עוקבות אחרי מה שמוקלד עכשיו, לא אחרי מה ששמור. החקלאי
  // מקליד "טון" ורואה מיד "טון לדונם" בשדה שמתחת.
  const effectiveUnit = needsUnit ? unitText : cropCycle.yieldUnit;

  const yieldValue = Number(yieldText.replace(',', '.'));
  const priceValue = Number(priceText.replace(',', '.'));
  const previewTotal =
    plotArea != null &&
    Number.isFinite(yieldValue) &&
    Number.isFinite(priceValue) &&
    yieldText &&
    priceText
      ? plotArea * yieldValue * priceValue
      : null;

  async function onSave() {
    if (!Number.isFinite(yieldValue) || !Number.isFinite(priceValue)) return;

    setStatus('saving');
    const result = await updateForecast(supabase, cropCycle.id, {
      expectedYieldPerArea: yieldValue,
      expectedPricePerUnit: priceValue,
      yieldUnit: needsUnit ? unitText : undefined,
    });
    if (result.ok) {
      setStatus('idle');
      onSaved();
      return;
    }
    setStatus(result.reason);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      {needsUnit && (
        <View style={styles.sheetFirst}>
          <YieldUnitField
            label={t('plots.forecast.unitQuestion')}
            value={unitText}
            onChange={setUnitText}
            disabled={busy}
          />
        </View>
      )}

      <View style={[formStyles.field, needsUnit ? styles.sheetGap : styles.sheetFirst]}>
        <Text style={formStyles.label}>
          {t('plots.forecast.yield')}
          {areaUnit && (
            <Text style={styles.unitHint}> · {yieldRateUnitLabel(effectiveUnit, areaUnit)}</Text>
          )}
        </Text>
        <TextInput
          style={formStyles.input}
          value={yieldText}
          onChangeText={setYieldText}
          editable={!busy}
          keyboardType="decimal-pad"
          textAlign="right"
          placeholder={t('common.numberPlaceholder')}
          placeholderTextColor={colors.slate600}
          importantForAutofill="no"
        />
      </View>

      <View style={[formStyles.field, styles.sheetGap]}>
        <Text style={formStyles.label}>
          {t('plots.forecast.price')}
          <Text style={styles.unitHint}> · {priceUnitLabel(effectiveUnit, currency)}</Text>
        </Text>
        <TextInput
          style={formStyles.input}
          value={priceText}
          onChangeText={setPriceText}
          editable={!busy}
          keyboardType="decimal-pad"
          textAlign="right"
          placeholder={t('common.numberPlaceholder')}
          placeholderTextColor={colors.slate600}
          importantForAutofill="no"
        />
      </View>

      {/* התוצאה נראית לפני השמירה, ולא רק אחריה. זו ההגנה האמיתית מפני
          בלבול ק״ג/טון: סדר גודל שגוי קופץ לעין מיד. */}
      {previewTotal != null && (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>{t('plots.forecast.total')}</Text>
          <Text style={styles.previewValue}>{formatAmount(previewTotal, currency)}</Text>
        </View>
      )}

      <Pressable
        style={[formStyles.save, styles.sheetGap, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('plots.saving') : t('plots.save')}</Text>
      </Pressable>
      {status === 'forbidden' && (
        <Text style={[formStyles.bad, styles.sheetGap]}>{t('plots.forecast.forbidden')}</Text>
      )}
      {status === 'error' && (
        <Text style={[formStyles.bad, styles.sheetGap]}>{t('plots.forecast.saveError')}</Text>
      )}
    </BottomSheet>
  );
}

function CropCycleEditSheet({
  visible,
  onClose,
  cropCycle,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  cropCycle: CropCycle;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cropCycle.name);
  const [season, setSeason] = useState(cropCycle.season ?? '');
  const [yieldUnit, setYieldUnit] = useState(cropCycle.yieldUnit ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'nameRequired' | 'forbidden' | 'error'>(
    'idle',
  );
  const busy = status === 'saving';

  async function onSave() {
    setStatus('saving');
    const result = await updateCropCycle(supabase, cropCycle.id, {
      name,
      season: season.trim() === '' ? null : season.trim(),
      yieldUnit: yieldUnit.trim() === '' ? null : yieldUnit.trim(),
    });
    if (result.ok) {
      setStatus('idle');
      onSaved();
      return;
    }
    setStatus(result.reason);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={t('capture.close')}>
      <View style={formStyles.field}>
        <Text style={formStyles.label}>{t('plots.form.cropName')}</Text>
        <TextInput
          style={formStyles.input}
          value={name}
          onChangeText={setName}
          editable={!busy}
          placeholder={t('plots.form.cropNamePlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>
      <View style={[formStyles.field, styles.sheetGap]}>
        <Text style={formStyles.label}>{t('plots.crop.season')}</Text>
        <TextInput
          style={formStyles.input}
          value={season}
          onChangeText={setSeason}
          editable={!busy}
          placeholder={t('plots.crop.seasonPlaceholder')}
          placeholderTextColor={colors.slate600}
          textAlign="right"
        />
      </View>
      <View style={styles.sheetGap}>
        <YieldUnitField
          label={t('plots.crop.yieldUnit')}
          value={yieldUnit}
          onChange={setYieldUnit}
          disabled={busy}
        />
      </View>
      <Pressable
        style={[formStyles.save, styles.sheetGap, busy && formStyles.saveDisabled]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={formStyles.saveText}>{busy ? t('plots.saving') : t('plots.save')}</Text>
      </Pressable>
      {status === 'nameRequired' && (
        <Text style={[formStyles.bad, styles.sheetGap]}>{t('plots.crop.nameRequired')}</Text>
      )}
      {status === 'forbidden' && (
        <Text style={[formStyles.bad, styles.sheetGap]}>{t('plots.crop.forbidden')}</Text>
      )}
      {status === 'error' && (
        <Text style={[formStyles.bad, styles.sheetGap]}>{t('plots.crop.saveError')}</Text>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s16,
    paddingHorizontal: spacing.s24,
    paddingTop: spacing.s16,
    paddingBottom: spacing.s16,
  },
  headerText: {
    flex: 1,
    gap: spacing.s4,
  },
  plotName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.headingSm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  plotSummary: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // סיכום קבוע מעל טראק הטאבים. heading (44) ולא heading-lg (60):
  // זה כרום מתמיד שנראה מכל טאב, ולא הגיבור של מסך ייעודי, ו-60px
  // היו דוחפים את תוכן הטאבים נמוך מדי במסך קטן.
  profitHeader: {
    paddingHorizontal: spacing.s24,
    paddingBottom: spacing.s16,
    gap: 2,
  },
  profitLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  profitValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
  },
  // נודניק ההתיישנות. caption/Slate-600, שורה אחת מעל המספר.
  staleNudge: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  // צ'יפ Field-100, design.md. ה-alignSelf מונע ממנו להימתח לרוחב
  // הכרטיס, צ'יפ נמדד לפי תוכנו.
  safeHarvestChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.s12,
    paddingVertical: spacing.s8,
    paddingHorizontal: spacing.s12,
    borderRadius: radius.pill,
    backgroundColor: colors.field100,
  },
  safeHarvestText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
    writingDirection: 'rtl',
  },
  // heading/900, אותו משקל כמו שאר מספרי הרווח במוצר, design.md.
  profitValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    writingDirection: 'rtl',
  },
  profitValueGain: {
    color: colors.profit600,
  },
  profitValueLoss: {
    color: colors.loss600,
  },
  // אפס אינו רווח ואינו הפסד, design.md.
  profitValueZero: {
    color: colors.ink900,
  },
  profitBreakdown: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  profitCaveat: {
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.wheat800,
    writingDirection: 'rtl',
    marginTop: spacing.s4,
  },
  tabTrack: {
    flexDirection: 'row',
    marginHorizontal: spacing.s24,
    padding: spacing.s4,
    borderRadius: radius.pill,
    backgroundColor: colors.mist200,
  },
  tabItem: {
    flex: 1,
    minHeight: touchTarget.min - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  tabItemActive: {
    backgroundColor: colors.paper,
  },
  tabLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
  tabLabelActive: {
    fontFamily: fonts.bold,
    color: colors.field700,
  },
  // flex על ה-ScrollView עצמו, לא רק על התוכן. אותה סיבה כמו ב-TaskBoard,
  // בלעדיו הגלילה מקבלת את גובה התוכן במקום את השטח שנשאר.
  scroll: {
    flex: 1,
  },
  body: {
    padding: spacing.s24,
    paddingBottom: spacing.s48,
    gap: spacing.s16,
  },
  sprayLogButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.min - 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.pill,
    backgroundColor: colors.field100,
  },
  sprayLogButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
  },
  tasksBody: {
    flex: 1,
    padding: spacing.s24,
  },
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.mist100,
    padding: spacing.s20,
    gap: spacing.s12,
  },
  // שורת הזהות הקומפקטית בראש הכרטיס: שם הגידול · עונה · יחידת יבול,
  // וקישור עריכה מולה. מחליפה את כותרת הכרטיס והגלולה הנפרדת שהיו כאן
  // לפני האיחוד עם כרטיס ההכנסה הצפויה, ראה docs/design.md.
  identityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  identityText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.body,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  identityTextMuted: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  identityMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
  identityEdit: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
  },
  // Border-200 hairline, "the primary elevation cue in this system"
  // (design.md, Tokens Colors) — מפריד בין שורת הזהות לאזור הכסף בלי
  // להוסיף כרטיס שני צף.
  divider: {
    height: 1,
    backgroundColor: colors.border200,
  },
  incomeBlock: {
    alignItems: 'flex-start',
    gap: spacing.s8,
  },
  incomeLabel: {
    overflow: 'hidden',
    paddingHorizontal: spacing.s12,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.field700,
    fontFamily: fonts.bold,
    fontSize: fontSize.caption,
    color: colors.paper,
    writingDirection: 'rtl',
  },
  forecastUpdate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    minHeight: touchTarget.min - 16,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.pill,
    backgroundColor: colors.mist200,
    alignSelf: 'flex-start',
  },
  forecastUpdateText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.field700,
  },
  incomeFigure: {
    // design.md מפרט משקל 900 לספרה הזו, אבל הנייד טוען כרגע רק שלושה
    // משקלים (Regular/Medium/Bold), ראה theme/tokens.ts. bold הוא
    // הקרוב ביותר הזמין, לא סטייה מכוונת מהמפרט.
    fontFamily: fonts.bold,
    fontSize: fontSize.headingLg,
    // Ink-900 ולא Profit-600. מאז שצפי הרווח קיים בכותרת, הירוק שמור
    // לו בלבד: הכנסה ברוטו אינה רווח, ושני מספרים ירוקים על אותו מסך
    // היו מרוקנים את הצבע ממשמעות. design.md: Profit-600 ל-P&L בלבד.
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kvLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  kvValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodySm,
    color: colors.ink900,
    writingDirection: 'rtl',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s24,
  },
  // Lets the loading and error state fill the screen inside a scroll view, so
  // there is something to pull on when the plot failed to load.
  centerFill: {
    flexGrow: 1,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  sheetGap: {
    marginTop: spacing.s16,
  },
  // הגיליון עצמו כבר נותן ריווח מתחת לגבשושית, ולכן השדה הראשון לא
  // מוסיף עוד. קיים כדי ששני הענפים (עם/בלי שדה יחידה) ייראו זהים.
  sheetFirst: {
    marginTop: 0,
  },
  unitHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.s16,
    paddingTop: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: colors.border200,
  },
  previewLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.bodySm,
    color: colors.slate600,
    writingDirection: 'rtl',
  },
  previewValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.bodyLg,
    color: colors.profit600,
    writingDirection: 'rtl',
  },
});
