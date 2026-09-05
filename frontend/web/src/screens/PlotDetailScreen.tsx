import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SprayCan } from 'lucide-react';
import {
  assignableMembers,
  canManagePlotResponsible,
  expectedPriceDisplay,
  expectedYieldDisplay,
  fontSize,
  formatAmount,
  formatSignedAmount,
  plotProfitForecast,
  setPlotResponsible,
  usePlotExpensesTotal,
  useLogEntries,
  useMembers,
  openSafeHarvestDate,
  staleForecastSince,
  formatMonthName,
  plotSummaryLine,
  priceUnitLabel,
  profitTone,
  scaledAmountFontSize,
  t,
  updateCropCycle,
  updateForecast,
  useFarmSettings,
  useMyRole,
  usePlotDetail,
  workerModeShell,
  yieldRateUnitLabel,
  type AreaUnit,
  type CropCycle,
  type Currency,
  type PlotDetailTab,
} from '@yevul/shared';
import { supabase } from '../lib/supabase';
import { ExpenseList } from '../components/ExpenseList';
import { JournalList } from '../components/JournalList';
import { TaskBoard } from '../components/TaskBoard';
import { YieldUnitField } from '../components/YieldUnitField';
import '../styles/form.css';
import './PlotDetailScreen.css';

// מסך פרטי חלקה. ארבעה טאבים לפי design.md, אבל רק רווחיות מקבל תוכן
// אמיתי במשימה הזו. משימות, יומן והוצאות נשארים שלד ריק בכוונה.
//
// עריכת הגידול והתחזית כאן היא עריכה מהירה בתוך השורה (toggle בין
// תצוגה לטופס), לא דיאלוג צף. prd.md סעיף 12 מונה במפורש "הגדרת
// חלקות וגידולים ועדכון צפי" בין הדברים שהדפדפן מציע כעריכה מהירה,
// בניגוד לגיליון התחתון שהנייד משתמש בו לאותה פעולה בדיוק.
// **טאב "רווחיות" המאוחד פוצל**, לפי הערת מוצר של עידו: שני צדי הכסף
// מקבלים טאב משלהם, וסיכום צפי הרווח עלה לכותרת קבועה כדי שייראה מכל
// טאב. ברגע שהסיכום יצא מהטאב, מה שנשאר בו הוא בדיוק תוכן צפי ההכנסה.
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
          רשימה שמשתנה מטאב לטאב היה שובר את הכותרת בכל לחיצה. */}
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
          {/* design.md, Spray Log Screen: "a button on the Plot Detail
              Screen's Profitability tab", אחת משלוש נקודות הכניסה
              הקבועות למסך יומן הריסוס. */}
          <Link className="plot-detail__spray-log-link" to={`/spray-log?plot=${plot.id}`}>
            <SprayCan size={18} strokeWidth={2} aria-hidden="true" />
            <span>{t('sprayLog.title')}</span>
          </Link>

          {/* אחראי החלקה, שלב 6, prd.md סעיף 11. הבורר מנהל את עצמו:
              נעלם לגמרי אם אין חברים שאפשר להציב או שהמשתמש אינו
              owner/manager, design.md, Sharing. */}
          <ResponsibleMemberCard
            plotId={plot.id}
            responsibleUserId={plot.responsibleUserId}
            onSaved={detail.refresh}
          />
        </div>
      )}

      {activeTab === 'tasks' && (
        <TaskBoard supabase={supabase} plotId={plot.id} showPlotName={false} />
      )}

      {activeTab === 'journal' && (
        <JournalList supabase={supabase} plotId={plot.id} showPlotName={false} />
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

// כרטיס רווחיות מאוחד: שורת זהות קומפקטית (שם/עונה/יחידת יבול) למעלה,
// קו מפריד, ואזור הכסף (צפי הכנסה + פירוק) מתחתיו. שתי עריכות עצמאיות
// לגמרי בשרת (updateCropCycle מול updateForecast, שני מצבי busy/status
// נפרדים), רק המעטפת החזותית התאחדה לכרטיס אחד במקום שניים צפים.
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
  const [cropEditing, setCropEditing] = useState(false);
  const [name, setName] = useState(cropCycle?.name ?? '');
  const [season, setSeason] = useState(cropCycle?.season ?? '');
  const [yieldUnit, setYieldUnit] = useState(cropCycle?.yieldUnit ?? '');
  const [cropStatus, setCropStatus] = useState<
    'idle' | 'saving' | 'nameRequired' | 'forbidden' | 'error'
  >('idle');
  const cropBusy = cropStatus === 'saving';

  const [forecastEditing, setForecastEditing] = useState(false);
  const [yieldText, setYieldText] = useState(String(cropCycle?.expectedYieldPerArea ?? ''));
  const [priceText, setPriceText] = useState(String(cropCycle?.expectedPricePerUnit ?? ''));
  const [unitText, setUnitText] = useState(cropCycle?.yieldUnit ?? '');
  const [forecastStatus, setForecastStatus] = useState<'idle' | 'saving' | 'forbidden' | 'error'>(
    'idle',
  );
  const forecastBusy = forecastStatus === 'saving';

  const needsUnit = !cropCycle?.yieldUnit?.trim();
  // התווית עוקבת אחרי מה שמוקלד עכשיו, לא אחרי מה ששמור. החקלאי מקליד
  // "טון" ורואה מיד "טון לדונם" בשדה שמתחת.
  const effectiveUnit = needsUnit ? unitText : (cropCycle?.yieldUnit ?? null);

  function startCropEdit() {
    setName(cropCycle?.name ?? '');
    setSeason(cropCycle?.season ?? '');
    setYieldUnit(cropCycle?.yieldUnit ?? '');
    setCropStatus('idle');
    setCropEditing(true);
  }

  async function onCropSubmit(event: FormEvent) {
    event.preventDefault();
    if (!cropCycle) return;
    setCropStatus('saving');
    const result = await updateCropCycle(supabase, cropCycle.id, {
      name,
      season: season.trim() === '' ? null : season.trim(),
      yieldUnit: yieldUnit.trim() === '' ? null : yieldUnit.trim(),
    });
    if (result.ok) {
      setCropEditing(false);
      onSaved();
      return;
    }
    setCropStatus(result.reason);
  }

  function startForecastEdit() {
    if (!cropCycle) return;
    setYieldText(String(cropCycle.expectedYieldPerArea ?? ''));
    setPriceText(String(cropCycle.expectedPricePerUnit ?? ''));
    setUnitText(cropCycle.yieldUnit ?? '');
    setForecastStatus('idle');
    setForecastEditing(true);
  }

  async function onForecastSubmit(event: FormEvent) {
    event.preventDefault();
    if (!cropCycle) return;
    const expectedYieldPerArea = Number(yieldText.replace(',', '.'));
    const expectedPricePerUnit = Number(priceText.replace(',', '.'));
    if (!Number.isFinite(expectedYieldPerArea) || !Number.isFinite(expectedPricePerUnit)) return;

    setForecastStatus('saving');
    const result = await updateForecast(supabase, cropCycle.id, {
      expectedYieldPerArea,
      expectedPricePerUnit,
      yieldUnit: needsUnit ? unitText : undefined,
    });
    if (result.ok) {
      setForecastEditing(false);
      onSaved();
      return;
    }
    setForecastStatus(result.reason);
  }

  const canCompute =
    plotArea != null &&
    cropCycle?.expectedYieldPerArea != null &&
    cropCycle?.expectedPricePerUnit != null;
  const expectedIncome = canCompute
    ? plotArea! * cropCycle!.expectedYieldPerArea! * cropCycle!.expectedPricePerUnit!
    : null;

  // תצוגה מקדימה חיה בזמן העריכה, מחושבת ממה שמוקלד ולא ממה ששמור.
  const yieldValue = Number(yieldText.replace(',', '.'));
  const priceValue = Number(priceText.replace(',', '.'));
  const previewTotal =
    plotArea != null &&
    yieldText !== '' &&
    priceText !== '' &&
    Number.isFinite(yieldValue) &&
    Number.isFinite(priceValue)
      ? plotArea * yieldValue * priceValue
      : null;

  return (
    <div className="plot-detail__card">
      {cropEditing ? (
        <form className="form" onSubmit={onCropSubmit} noValidate>
          <div className="form__row">
            <label className="form__label" htmlFor="crop-edit-name">
              {t('plots.form.cropName')}
            </label>
            <input
              id="crop-edit-name"
              className="form__input"
              type="text"
              placeholder={t('plots.form.cropNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={cropBusy}
            />
          </div>
          <div className="form__row">
            <label className="form__label" htmlFor="crop-edit-season">
              {t('plots.crop.season')}
            </label>
            <input
              id="crop-edit-season"
              className="form__input"
              type="text"
              placeholder={t('plots.crop.seasonPlaceholder')}
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              disabled={cropBusy}
            />
          </div>
          <YieldUnitField
            id="crop-edit-yield-unit"
            label={t('plots.crop.yieldUnit')}
            value={yieldUnit}
            onChange={setYieldUnit}
            disabled={cropBusy}
          />
          <div className="form__actions">
            <button type="submit" className="form__submit" disabled={cropBusy}>
              {cropBusy ? t('plots.saving') : t('plots.save')}
            </button>
            <button
              type="button"
              className="form__cancel"
              onClick={() => setCropEditing(false)}
              disabled={cropBusy}
            >
              {t('plots.detail.back')}
            </button>
            {cropStatus === 'nameRequired' && (
              <p className="form__message form__message--bad" role="alert">
                {t('plots.crop.nameRequired')}
              </p>
            )}
            {cropStatus === 'forbidden' && (
              <p className="form__message form__message--bad" role="alert">
                {t('plots.crop.forbidden')}
              </p>
            )}
            {cropStatus === 'error' && (
              <p className="form__message form__message--bad" role="alert">
                {t('plots.crop.saveError')}
              </p>
            )}
          </div>
        </form>
      ) : (
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
          {cropCycle && (
            <button type="button" className="plot-detail__identity-edit" onClick={startCropEdit}>
              {t('plots.crop.edit')}
            </button>
          )}
        </div>
      )}

      {cropCycle && (
        <>
          <div className="plot-detail__divider" />

          {forecastEditing ? (
            <form className="form" onSubmit={onForecastSubmit} noValidate>
              {/* שדה יחידת היבול מופיע רק כשהיא עדיין לא הוגדרה. בלעדיה
                  שני המספרים חסרי משמעות ("300 של מה?"), והיא נערכת
                  אחרת רק במסך זהות הגידול. חקלאי שכבר הגדיר יחידה רואה
                  בדיוק שני שדות, כפי ש-design.md דורש. */}
              {needsUnit && (
                <YieldUnitField
                  id="forecast-unit"
                  label={t('plots.forecast.unitQuestion')}
                  value={unitText}
                  onChange={setUnitText}
                  disabled={forecastBusy}
                />
              )}
              <div className="form__row">
                <label className="form__label" htmlFor="forecast-yield">
                  {t('plots.forecast.yield')}
                  {areaUnit && (
                    <span className="form__label-unit">
                      {' '}
                      · {yieldRateUnitLabel(effectiveUnit, areaUnit)}
                    </span>
                  )}
                </label>
                <input
                  id="forecast-yield"
                  className="form__input"
                  type="number"
                  step="any"
                  placeholder={t('common.numberPlaceholder')}
                  value={yieldText}
                  onChange={(e) => setYieldText(e.target.value)}
                  disabled={forecastBusy}
                />
              </div>
              <div className="form__row">
                <label className="form__label" htmlFor="forecast-price">
                  {t('plots.forecast.price')}
                  <span className="form__label-unit">
                    {' '}
                    · {priceUnitLabel(effectiveUnit, currency)}
                  </span>
                </label>
                <input
                  id="forecast-price"
                  className="form__input"
                  type="number"
                  step="any"
                  placeholder={t('common.numberPlaceholder')}
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                  disabled={forecastBusy}
                />
              </div>
              {/* התוצאה נראית לפני השמירה ולא רק אחריה, זו ההגנה האמיתית
                  מפני בלבול ק״ג/טון: סדר גודל שגוי קופץ לעין מיד. */}
              {previewTotal != null && (
                <div className="plot-detail__preview">
                  <span className="plot-detail__preview-label">{t('plots.forecast.total')}</span>
                  <span className="plot-detail__preview-value">
                    {formatAmount(previewTotal, currency)}
                  </span>
                </div>
              )}
              <div className="form__actions">
                <button type="submit" className="form__submit" disabled={forecastBusy}>
                  {forecastBusy ? t('plots.saving') : t('plots.save')}
                </button>
                <button
                  type="button"
                  className="form__cancel"
                  onClick={() => setForecastEditing(false)}
                  disabled={forecastBusy}
                >
                  {t('plots.detail.back')}
                </button>
                {forecastStatus === 'forbidden' && (
                  <p className="form__message form__message--bad" role="alert">
                    {t('plots.forecast.forbidden')}
                  </p>
                )}
                {forecastStatus === 'error' && (
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
                <button
                  type="button"
                  className="plot-detail__stale-nudge"
                  onClick={startForecastEdit}
                >
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
              <dl className="kv-list">
                <KvRow
                  label={t('plots.forecast.yield')}
                  value={expectedYieldDisplay(cropCycle, areaUnit)}
                />
                <KvRow
                  label={t('plots.forecast.price')}
                  value={expectedPriceDisplay(cropCycle, currency)}
                />
              </dl>
              <button
                type="button"
                className="plot-detail__forecast-update"
                onClick={startForecastEdit}
              >
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

// בורר האחראי לחלקה, שלב 6, prd.md סעיף 11. עריכת שדה יחיד בשמירה
// מיידית בעת הבחירה, בלי כפתור נפרד, כמו שאר העריכות המהירות בווב.
// **מנהל את הנראות של עצמו**: נעלם כשאין חברים שאפשר להציב (משק של
// אדם אחד) או כשהמשתמש אינו owner/manager, design.md, Sharing. RLS
// אוכף את ההרשאה ממילא, זו רק הסתרת ה-UI מהמי שלא יכול.
function ResponsibleMemberCard({
  plotId,
  responsibleUserId,
  onSaved,
}: {
  plotId: string;
  responsibleUserId: string | null;
  onSaved: () => void;
}) {
  const membersState = useMembers(supabase);
  const assignable = assignableMembers(membersState.members);
  const [failed, setFailed] = useState(false);

  if (assignable.length === 0 || !canManagePlotResponsible(membersState.myRole)) {
    return null;
  }

  async function onChange(value: string) {
    setFailed(false);
    const result = await setPlotResponsible(supabase, plotId, value === '' ? null : value);
    if (result.ok) {
      onSaved();
      return;
    }
    setFailed(true);
  }

  return (
    <div className="form__row">
      <label className="form__label" htmlFor="plot-responsible">
        {t('plots.responsible.label')}
      </label>
      <select
        id="plot-responsible"
        className="form__input"
        value={responsibleUserId ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('plots.responsible.none')}</option>
        {assignable.map((member) => (
          <option key={member.id} value={member.userId ?? ''}>
            {member.email ?? member.userId}
          </option>
        ))}
      </select>
      {failed && (
        <p className="form__message form__message--bad" role="alert">
          {t('plots.responsible.saveError')}
        </p>
      )}
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-list__row">
      <dt className="kv-list__label">{label}</dt>
      <dd className="kv-list__value">{value}</dd>
    </div>
  );
}
