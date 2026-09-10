import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  expectedPriceDisplay,
  expectedYieldDisplay,
  fontSize,
  forecastSentence,
  forecastUnits,
  formatAmount,
  formatCalendarDate,
  formatSignedAmount,
  parseYieldUnit,
  plotProfitForecast,
  usePlotExpensesTotal,
  useLogEntries,
  openSafeHarvestDate,
  reconcileYieldUnits,
  staleForecastSince,
  formatMonthName,
  plotSummaryLine,
  priceUnitLabel,
  profitTone,
  scaledAmountFontSize,
  t,
  updateForecast,
  useFarmSettings,
  useMyRole,
  usePlotDetail,
  workerModeShell,
  yieldRateUnitLabel,
  yieldUnitLabel,
  YIELD_UNITS,
  type AreaUnit,
  type CropCycle,
  type Currency,
  type PlotDetailTab,
  type YieldUnit,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { DateField } from '../components/DateField';
import { ExpenseList } from '../components/ExpenseList';
import { JournalList } from '../components/JournalList';
import { TaskBoard } from '../components/TaskBoard';
import '../styles/form.css';
import './PlotDetailScreen.css';

// מסך פרטי חלקה. ארבעה טאבים לפי design.md.
//
// **מסך אחד, כפתור עריכה אחד.** עידו והיזם עברו על המסך ב-2026-09-09
// ומצאו בו שתי עריכות שונות לאותה ישות: "עריכת פרטי החלקה" בכותרת,
// ו"עריכת גידול" בתוך טאב צפי ההכנסה. דברי היזם: "החלקה **היא** הגידול,
// למה יש שניים". מאז שם הגידול נערך בתוך טופס עריכת החלקה עצמו, יחד עם
// השם והשטח, וכאן נשארה רק **תצוגה** של הזהות.
//
// מה עוד ירד מהמסך באותה ישיבה, ולמה:
//   - בורר "אחראי החלקה". חלקה היא שם, שטח וגידול, וזה הכל. הוסר ה-UI
//     תחילה (2026-09-09), ואז התכונה כולה (2026-09-10): הפונקציה שכתבה
//     אותה, myPlots.ts והבדיקות שלהם. **העמודה במסד נשארה** כדי
//     שההחזרה תהיה הפיכה בלי מיגרציה. ראה ההערה מעל PLOT_COLUMNS
//     ב-plots.ts ו-docs/open-items.md.
//   - הקישור ליומן הריסוס. הוא נשאר נגיש מהיומן, ולא היה לו מה לחפש
//     בתוך טאב שמדבר על כסף.
//
// עריכת התחזית כאן היא עריכה מהירה בתוך השורה (toggle בין תצוגה
// לטופס), לא דיאלוג צף. prd.md סעיף 12 מונה במפורש "הגדרת חלקות
// וגידולים ועדכון צפי" בין הדברים שהדפדפן מציע כעריכה מהירה, בניגוד
// לגיליון התחתון שהנייד משתמש בו לאותה פעולה בדיוק.
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
  const { plotId } = useParams<{ plotId: string }>();
  const detail = usePlotDetail(supabase, plotId ?? null);
  const settings = useFarmSettings(supabase);
  // ההוצאות בפועל של החלקה, שלב 4. עד כאן הועבר כאן `null` קבוע, כי
  // מעקב ההוצאות עוד לא היה קיים כשהמסך נבנה, והתוצאה הייתה צפי רווח
  // ששווה להכנסה המלאה גם אחרי שהחקלאי כבר רשם הוצאות.
  const plotExpenses = usePlotExpensesTotal(supabase, plotId ?? null);
  // רשומות הריסוס של החלקה, לצ'יפ "בטוח לקטיף". הסינון לפי סוג קורה
  // במסד ולא בקליינט, אותו עיקרון כמו במסך יומן הריסוס.
  const sprays = useLogEntries(supabase, plotId ?? undefined, 'spray');
  // Worker Mode, design.md: "Plot Detail drops to two tabs, משימות and יומן."
  // הרשימה נגזרת ב-workerModeShell, ועד שהתפקיד ידוע נוהגים כאילו זה עובד,
  // כך שטאב הכנסה לא מהבהב לעובד. הטאב הפעיל נגזר ולא נשמר: כשהשמור אינו
  // ברשימה הנראית נופלים לראשון, כך שבעל משק נוחת על 'income' ברגע שהתפקיד
  // הוכרע, ועובד לעולם לא רואה תוכן כספי.
  const role = useMyRole(supabase);
  const shell = workerModeShell(role.role, role.loading);
  const tabs = shell.plotDetailTabs;
  const [tab, setTab] = useState<Tab>('income');
  // 'tasks' כברירת מחדל היא רק כדי לספק את הטיפוס (tabs לעולם לא ריק,
  // 'tasks' קיים בשתי הרשימות). בפועל tabs[0] הוא 'income' לבעל משק ו-
  // 'tasks' לעובד.
  const activeTab: Tab = tabs.includes(tab) ? tab : (tabs[0] ?? 'tasks');

  if (detail.loading || detail.failed || !detail.plot) {
    return (
      <div className="screen">
        {detail.failed ? (
          <p className="form__message form__message--bad" role="alert">
            {t('plots.detail.loadError')}
          </p>
        ) : (
          <p className="screen__note">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  const { plot, cropCycle } = detail;

  // "עכשיו" נלקח פעם אחת בזמן הרינדור ומוזרק לשתי הפונקציות הטהורות,
  // כדי שהחישוב עצמו יישאר בדיק ולא ייגע בשעון בעצמו.
  const now = new Date();
  const staleSince = staleForecastSince(cropCycle, now);
  const safeHarvest = openSafeHarvestDate(sprays.entries, now);

  return (
    <div className="screen">
      {/* prose-width מ-shell.css, ולא רוחב מלא. הכותרת וכפתור העריכה הם
          טקסט ובקרה, לא רשימת נתונים, ולכן הם לא מועמדים לרוחב. נמדד
          בפועל על 1536: הכותרת ישבה 1018..1208 והכפתור 64..259, כלומר
          759 פיקסל ריקים בין הכפתור לכותרת שהוא שייך לה. עם 640 הפער
          יורד לכ-255, וב-640 ומטה זו כבר לא הגבלה בכלל.

          המחיר, וההכרעה מודעת לו: בשלושה מארבעת הטאבים הרשימה שמתחת
          רחבה 1144, ולכן כפתור העריכה כבר לא מיושר לקצה השמאלי שלה.
          כל מה שיושב במסך מיושר לקצה **הימני**, שהוא קצה ההתחלה
          ב-RTL, וזה הקצה שהעין קוראת ממנו. יישור הכפתור לקצה של
          רשימה שמשתנה מטאב לטאב היה שובר את הכותרת בכל לחיצה.

          **זהו כפתור העריכה היחיד במסך**, בקצה ה-inline-end של השורה
          העליונה (justify-content: space-between, כלומר שמאל ב-RTL). */}
      <div className="plot-detail__header prose-width">
        <div>
          <h1 className="screen__title plot-detail__title">{plot.name}</h1>
          <p className="screen__note">{plotSummaryLine(plot, cropCycle)}</p>
        </div>
        <Link className="form__submit" to={`/plots/${plot.id}/edit`}>
          {t('plots.detail.edit')}
        </Link>
      </div>

      {/* הסיכום יושב מחוץ לטאבים ולכן נראה מכל אחד מהם. נעלם לעובד בלי
          בדיקת תפקיד בקליינט, כי שדות התחזית ממוסכים ל-null במסד ואז
          אין הכנסה לחשב. אכיפה בשכבת השאילתה, כפי ש-design.md דורש. */}
      <ProfitForecastHeader
        plotArea={plot.area}
        cropCycle={cropCycle}
        expensesTotal={plotExpenses.total}
        expensesLoading={plotExpenses.loading}
        currency={settings.form?.currency ?? 'ILS'}
      />

      <div className="tab-track" role="tablist">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={
              activeTab === key ? 'tab-track__item tab-track__item--active' : 'tab-track__item'
            }
            onClick={() => setTab(key)}
          >
            {t(TAB_LABEL_KEY[key])}
          </button>
        ))}
      </div>

      {activeTab === 'income' && (
        <div className="plot-detail__body">
          <ProfitabilityCard
            plotArea={plot.area}
            areaUnit={plot.areaUnit}
            cropCycle={cropCycle}
            currency={settings.form?.currency ?? 'ILS'}
            staleSince={staleSince}
            safeHarvest={safeHarvest}
            onSaved={detail.refresh}
          />
        </div>
      )}

      {activeTab === 'tasks' && (
        <TaskBoard supabase={supabase} plotId={plot.id} showPlotName={false} />
      )}

      {activeTab === 'journal' && (
        <JournalList
          supabase={supabase}
          plotId={plot.id}
          showPlotName={false}
          onDeleted={plotExpenses.refresh}
        />
      )}

      {activeTab === 'expenses' && (
        <ExpenseList supabase={supabase} plotId={plot.id} showPlotName={false} />
      )}
    </div>
  );
}

// סיכום צפי הרווח בראש המסך, מחוץ לטאבים. design.md דורש שכל מספר
// רווח/הפסד יישא סימן וחץ ולא יסתמך על צבע בלבד, ולכן שניהם כאן.
// אפס נשאר Ink-900, כי אפס אינו רווח ואינו הפסד.
//
// **התווית "צפי רווח" יושבת מעל המספר ולא לצידו, והיא לא קישוט.** עידו
// ראה כאן "10,708.16-" ולא ידע אם זה הרווח או ההוצאה. בלי מילה שאומרת
// מה המספר, מספר גדול על מסך כסף הוא חידה.
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
  // אחרי הטעינה expensesTotal הוא מספר אמיתי, כולל 0, שהוא עובדה ולא
  // חוסר ידיעה. null כאן נשאר רק לכשל טעינה, ושם חיווי ה-Wheat נכון.
  const forecast = plotProfitForecast(plotArea, cropCycle, expensesTotal);
  if (!forecast) return null;

  const tone = profitTone(forecast.profit);

  return (
    <div className="plot-profit">
      <p className="plot-profit__label">{t('plots.profit.forecast')}</p>
      <p className={`plot-profit__value plot-profit__value--${tone}`}>
        {tone !== 'zero' && (
          <span className="plot-profit__glyph" aria-hidden="true">
            {tone === 'loss' ? '↓' : '↑'}
          </span>
        )}
        {formatSignedAmount(forecast.profit, currency)}
      </p>
      <p className="plot-profit__breakdown">
        {t('plots.profit.income')} {formatAmount(forecast.expectedIncome, currency)} ·{' '}
        {t('plots.profit.expenses')} {formatAmount(forecast.expenses, currency)}
      </p>
      {/* Wheat ולא אדום. המסר הוא "עוד לא מוצג לך הכל", לא "אתה מפסיד". */}
      {!forecast.expensesTracked && (
        <p className="plot-profit__caveat">{t('plots.profit.noExpensesYet')}</p>
      )}
    </div>
  );
}

// כרטיס רווחיות: שורת זהות קומפקטית (שם הגידול והעונה) למעלה, קו מפריד,
// ואזור הכסף מתחתיו. **שורת הזהות היא תצוגה בלבד** מאז שעריכת הגידול
// עברה לטופס עריכת החלקה, ראה ההערה בראש הקובץ.
function ProfitabilityCard({
  plotArea,
  areaUnit,
  cropCycle,
  currency,
  staleSince,
  safeHarvest,
  onSaved,
}: {
  plotArea: number | null;
  areaUnit: AreaUnit | null;
  cropCycle: CropCycle | null;
  currency: Currency;
  staleSince: string | null;
  safeHarvest: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [yieldText, setYieldText] = useState('');
  const [priceText, setPriceText] = useState('');
  // היחידות מוחזקות כקודים ולא כטקסט. שורה ישנה שהערך שלה אינו אחת
  // משלוש היחידות (למשל "ארגזים") נפתחת עם בורר ריק, כלומר החקלאי
  // מתבקש לבחור אחת מהשלוש. עד שיישמר, הערך המקורי שלו נשאר במסד
  // ומוצג בשורות התצוגה כפי שכתב אותו.
  const [yieldUnit, setYieldUnit] = useState<YieldUnit | null>(null);
  const [priceUnit, setPriceUnit] = useState<YieldUnit | null>(null);
  const [harvestDate, setHarvestDate] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'unitRequired' | 'forbidden' | 'error'
  >('idle');
  const busy = status === 'saving';

  const stored = forecastUnits(cropCycle?.yieldUnit ?? null, cropCycle?.priceUnit ?? null);

  function startEdit() {
    if (!cropCycle) return;
    setYieldText(String(cropCycle.expectedYieldPerArea ?? ''));
    setPriceText(String(cropCycle.expectedPricePerUnit ?? ''));
    setYieldUnit(parseYieldUnit(cropCycle.yieldUnit));
    // אין יחידת מחיר בשורה: היא נקראת כ"אותה יחידה כמו היבול", וזה גם
    // מה שהבורר צריך להראות, אחרת החקלאי היה נשאל שאלה שכבר ענה עליה.
    setPriceUnit(parseYieldUnit(cropCycle.priceUnit ?? cropCycle.yieldUnit));
    setHarvestDate(cropCycle.expectedHarvestDate);
    setStatus('idle');
    setEditing(true);
  }

  // כלל ה"יחידה" חי ב-@yevul/shared ונבדק שם. כאן רק מחווטים אותו לשני
  // הבוררים, כדי ששניהם יזוזו יחד מול העין של החקלאי.
  function chooseYieldUnit(next: YieldUnit | null) {
    const pair = reconcileYieldUnits(next, priceUnit, 'yield');
    setYieldUnit(pair.yieldUnit);
    setPriceUnit(pair.priceUnit);
  }

  function choosePriceUnit(next: YieldUnit | null) {
    const pair = reconcileYieldUnits(yieldUnit, next, 'price');
    setYieldUnit(pair.yieldUnit);
    setPriceUnit(pair.priceUnit);
  }

  const yieldValue = Number(yieldText.replace(',', '.'));
  const priceValue = Number(priceText.replace(',', '.'));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!cropCycle) return;
    if (!Number.isFinite(yieldValue) || !Number.isFinite(priceValue)) return;
    // **שתי היחידות נדרשות**, כי בלעדיהן שני המספרים חסרי משמעות
    // ("300 של מה?") והמשפט שמתחת לשדות לא יכול להיכתב בכלל.
    if (!yieldUnit || !priceUnit) {
      setStatus('unitRequired');
      return;
    }

    setStatus('saving');
    const result = await updateForecast(supabase, cropCycle.id, {
      expectedYieldPerArea: yieldValue,
      expectedPricePerUnit: priceValue,
      yieldUnit,
      priceUnit,
      expectedHarvestDate: harvestDate,
    });
    if (result.ok) {
      setEditing(false);
      onSaved();
      return;
    }
    setStatus(result.reason);
  }

  const expectedIncome = cropCycle ? expectedIncomeOf(plotArea, cropCycle) : null;

  // המשפט שמראה לחקלאי את החשבון של עצמו, חי, ממה שמוקלד עכשיו ולא
  // ממה ששמור. זו ההגנה האמיתית מפני בלבול קילו/טון: סדר גודל שגוי
  // קופץ לעין לפני השמירה ולא אחריה.
  const sentence = forecastSentence({
    area: plotArea,
    areaUnit,
    expectedYieldPerArea: yieldText !== '' && Number.isFinite(yieldValue) ? yieldValue : null,
    yieldUnit,
    expectedPricePerUnit: priceText !== '' && Number.isFinite(priceValue) ? priceValue : null,
    priceUnit,
    currency,
  });

  return (
    <div className="plot-detail__card">
      <div className="plot-detail__identity-row">
        {cropCycle ? (
          <p className="plot-detail__identity-text">
            {cropCycle.name}
            {cropCycle.season && (
              <span className="plot-detail__identity-meta"> · {cropCycle.season}</span>
            )}
          </p>
        ) : (
          <p className="plot-detail__identity-text plot-detail__identity-text--muted">
            {t('plots.noCrop')}
          </p>
        )}
      </div>

      {cropCycle && (
        <>
          <div className="plot-detail__divider" />

          {editing ? (
            <form className="form" onSubmit={onSubmit} noValidate>
              <div className="form__row">
                <label className="form__label" htmlFor="forecast-yield">
                  {t('plots.forecast.yield')}
                  {areaUnit && (
                    <span className="form__label-unit">
                      {' '}
                      ·{' '}
                      {yieldRateUnitLabel(yieldUnit ? yieldUnitLabel(yieldUnit) : null, areaUnit)}
                    </span>
                  )}
                </label>
                <div className="plot-detail__unit-row">
                  <input
                    id="forecast-yield"
                    className="form__input"
                    type="number"
                    step="any"
                    placeholder={t('common.numberPlaceholder')}
                    value={yieldText}
                    onChange={(e) => setYieldText(e.target.value)}
                    disabled={busy}
                  />
                  <UnitSelect
                    id="forecast-yield-unit"
                    label={t('plots.forecast.yieldUnitQuestion')}
                    value={yieldUnit}
                    onChange={chooseYieldUnit}
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="form__row">
                <label className="form__label" htmlFor="forecast-price">
                  {t('plots.forecast.price')}
                  <span className="form__label-unit">
                    {' '}
                    · {priceUnitLabel(priceUnit ? yieldUnitLabel(priceUnit) : null, currency)}
                  </span>
                </label>
                <div className="plot-detail__unit-row">
                  <input
                    id="forecast-price"
                    className="form__input"
                    type="number"
                    step="any"
                    placeholder={t('common.numberPlaceholder')}
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    disabled={busy}
                  />
                  <UnitSelect
                    id="forecast-price-unit"
                    label={t('plots.forecast.priceUnitQuestion')}
                    value={priceUnit}
                    onChange={choosePriceUnit}
                    disabled={busy}
                  />
                </div>
              </div>

              {/* הבורר השני קפץ בעקבות הראשון. בלי המשפט הזה זה נראה
                  כמו באג ולא ככלל. */}
              {yieldUnit === 'unit' && priceUnit === 'unit' && (
                <p className="plot-detail__unit-note">{t('plots.forecast.unitCountLocked')}</p>
              )}

              {/* מועד קטיף משוער, באותו לוח שנה כמו כל תאריך אחר במוצר.
                  'future' כי זה יעד ולא רישום של מה שקרה. */}
              <DateField
                id="forecast-harvest-date"
                label={t('plots.forecast.harvestDate')}
                value={harvestDate}
                onChange={setHarvestDate}
                direction="future"
                shortcuts={false}
                clearLabel={t('plots.forecast.harvestDateClear')}
                disabled={busy}
              />

              {/* **רשת הביטחון.** סכום לבדו אי אפשר לבדוק, 96,000 ו-96
                  שניהם נראים כמו כסף. משפט שמפרט כל יחידה בדרך הוא מה
                  שתופס חקלאי שהתכוון ל-4 לקילו והקליד 4,000 לטון. */}
              {sentence && <p className="plot-detail__sentence">{sentence}</p>}

              <div className="form__actions">
                <button type="submit" className="form__submit" disabled={busy}>
                  {busy ? t('plots.saving') : t('plots.save')}
                </button>
                <button
                  type="button"
                  className="form__cancel"
                  onClick={() => setEditing(false)}
                  disabled={busy}
                >
                  {t('plots.detail.back')}
                </button>
                {status === 'unitRequired' && (
                  <p className="form__message form__message--bad" role="alert">
                    {t('plots.forecast.unitRequired')}
                  </p>
                )}
                {status === 'forbidden' && (
                  <p className="form__message form__message--bad" role="alert">
                    {t('plots.forecast.forbidden')}
                  </p>
                )}
                {status === 'error' && (
                  <p className="form__message form__message--bad" role="alert">
                    {t('plots.forecast.saveError')}
                  </p>
                )}
              </div>
            </form>
          ) : (
            <>
              {/* נודניק ההתיישנות, design.md, "Staleness nudge": שורת
                  טקסט אחת מעל המספר, לא כרטיס ולא מודאל. לחיצה עליה
                  פותחת בדיוק את אותה עריכת צפי. */}
              {staleSince && (
                <button type="button" className="plot-detail__stale-nudge" onClick={startEdit}>
                  {t('plots.forecast.stalePrefix')} {formatMonthName(staleSince)},{' '}
                  {t('plots.forecast.staleSuffix')}
                </button>
              )}
              <p className="plot-detail__income-label">{t('plots.income.expected')}</p>
              {expectedIncome != null && (
                <p
                  className="plot-detail__income"
                  style={{
                    fontSize: scaledAmountFontSize(
                      formatAmount(expectedIncome, currency),
                      fontSize.headingLg,
                      fontSize.headingSm,
                    ),
                  }}
                >
                  {formatAmount(expectedIncome, currency)}
                </p>
              )}
              {/* יחידות שלא ניתנות להמרה זו לזו. לא אמור לקרות דרך
                  המסך, אבל עדיף לומר את זה מאשר לא להציג שום מספר
                  ולהשאיר את החקלאי בלי הסבר. */}
              {stored.factor == null && (
                <p className="plot-detail__unit-note">{t('plots.forecast.unitMismatch')}</p>
              )}
              <dl className="kv-list">
                <KvRow
                  label={t('plots.forecast.yield')}
                  value={expectedYieldDisplay(cropCycle, areaUnit)}
                />
                <KvRow
                  label={t('plots.forecast.price')}
                  value={expectedPriceDisplay(cropCycle, currency)}
                />
                <KvRow
                  label={t('plots.forecast.harvestDate')}
                  value={
                    cropCycle.expectedHarvestDate
                      ? formatCalendarDate(cropCycle.expectedHarvestDate)
                      : t('plots.forecast.notSet')
                  }
                />
              </dl>
              <button type="button" className="plot-detail__forecast-update" onClick={startEdit}>
                {t('plots.forecast.update')}
              </button>

              {/* design.md, טאב צפי הכנסה: צ'יפ Field-100 "בטוח לקטיף
                  מ-…" כשלחלקה יש ריסוס פתוח עם phi_days. המחמיר מבין
                  הריסוסים הפתוחים קובע, ראה openSafeHarvestDate. */}
              {safeHarvest && (
                <p className="plot-detail__safe-harvest">
                  {t('log.form.safeHarvestPrefix')}-
                  {new Date(safeHarvest).toLocaleDateString('he-IL', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// שלוש יחידות, ואין רביעית. תפריט נפתח בווב וצ'יפים בנייד, אותה הפרדה
// שכבר קיימת בין הלקוחות לשדות עם קבוצת ערכים סגורה (roadmap.md, שלב 2).
//
// **אין כאן "אחר".** קודם זה היה שדה טקסט חופשי עם הצעות, וזו בדיוק
// הסיבה שהמסד מחזיק היום "ארגזים" ליד "ק״ג": ערך שאי אפשר להמיר ואי
// אפשר לתמחר מול שום דבר אחר. הרשימה נסגרה בהחלטת מוצר.
function UnitSelect({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: YieldUnit | null;
  onChange: (next: YieldUnit | null) => void;
  disabled: boolean;
}) {
  return (
    <select
      id={id}
      className="form__input plot-detail__unit-select"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as YieldUnit))}
      disabled={disabled}
    >
      {/* אפשרות ריקה ראשונה, כדי שלא תיבחר יחידה שהחקלאי לא ביקש רק
          בגלל שהיא הראשונה ברשימה. */}
      <option value="">{t('plots.crop.yieldUnitUnset')}</option>
      {YIELD_UNITS.map((unit) => (
        <option key={unit} value={unit}>
          {yieldUnitLabel(unit)}
        </option>
      ))}
    </select>
  );
}

// ההכנסה הצפויה כפי שהיא שמורה, לא כפי שהיא מוקלדת. עוטף את הפונקציה
// המשותפת רק כדי שהמסך לא יחזיק עותק משלו של הכפל, ובעיקר של ההמרה
// בין היחידות שיושבת בתוכה.
function expectedIncomeOf(plotArea: number | null, cropCycle: CropCycle): number | null {
  return plotProfitForecast(plotArea, cropCycle, null)?.expectedIncome ?? null;
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-list__row">
      <dt className="kv-list__label">{label}</dt>
      <dd className="kv-list__value">{value}</dd>
    </div>
  );
}
