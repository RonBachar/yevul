import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { formatAmount, formatArea, formatNumber, yieldRateUnitLabel } from './format';
import { t } from './i18n';
// The three units, the conversion between them and the sentence that shows the
// farmer his own arithmetic. Pure, and tested away from React; see yieldUnits.ts.
import { forecastUnits } from './yieldUnits';
// The one cap-and-dedupe rule the crop grid shares with the spray grids. See
// useCropSuggestions below; plotForm.ts imports only *types* back from here, so
// there is no import cycle at run time.
import { plotCropOptions } from './plotForm';
import { writeOutcome, type WriteOutcome } from './postgrest';
import { useLoadCount } from './refresh';
import type { AreaUnit, Currency } from './settings';

// חלקות ו-CropCycle, שלב 3 משימה ראשונה. שני הלקוחות טוענים וכותבים
// דרך הפונקציות וההוקים כאן, כדי שהטיפול בדחיית RLS (ראה postgrest.ts)
// לא ייכתב פעמיים ויתפצל, אותו כלל שכבר קיים ב-useFarmSettings.
//
// **אין שדה "עונה פעילה" בסכמה.** prd.md אומר במפורש שהחקלאי כמעט לא
// נוגע בשדה העונה, וברירת המחדל היא תמיד העונה הפעילה. לכן ה-CropCycle
// "הנוכחי" של חלקה הוא פשוט האחרון שנוצר, ממוין לפי created_at. מעבר
// בין עונות אמיתי, עם UI לבחירה, לא נבנה כאן, ואין לו עדיין דרישה
// ברודמאפ.

export type Plot = {
  id: string;
  farmId: string;
  name: string;
  area: number | null;
  areaUnit: AreaUnit | null;
  // האחראי על החלקה, שלב 6, שיתוף המשק. prd.md סעיף 11: "לכל חלקה
  // אפשר להגדיר אחראי". מזהה משתמש או null כשלא הוגדר אחראי. נכתב רק
  // דרך setPlotResponsible, ורק owner/manager מורשים (RLS).
  responsibleUserId: string | null;
};

export type CropCycle = {
  id: string;
  plotId: string;
  name: string;
  season: string | null;
  // The unit the YIELD is measured in, and, since 20260909120000, the separate
  // unit the PRICE is quoted in. Both are free text in the column and both are
  // read through yieldUnits.ts, which maps the three known units and hands back
  // anything else unchanged. **priceUnit null means "the same unit as
  // yieldUnit"**, which is what every row written before that migration meant.
  yieldUnit: string | null;
  priceUnit: string | null;
  expectedYieldPerArea: number | null;
  expectedPricePerUnit: number | null;
  // מועד קטיף משוער, a YYYY-MM-DD day picked off the calendar. Null for most of
  // the year on most plots, which is a normal state and not a missing answer.
  expectedHarvestDate: string | null;
  forecastUpdatedAt: string | null;
};

export type PlotWithCropCycle = Plot & { cropCycle: CropCycle | null };

// שורת התמצית מתחת לשם החלקה, "40 דונם · זיתים · עונה 2026" לפי
// Plot Card ב-design.md. חי כאן ולא בכל מסך בנפרד, כי כרטיס החלקה
// מוצג גם ברשימה וגם (בעתיד) בדשבורד, ושני לקוחות לא צריכים לבנות
// את אותה שרשרת חיבור מחרוזות פעמיים.
export function plotSummaryLine(plot: Plot, cropCycle: CropCycle | null): string {
  const parts: string[] = [];
  if (plot.area != null && plot.areaUnit) {
    parts.push(formatArea(plot.area, plot.areaUnit));
  }
  if (cropCycle) {
    parts.push(cropCycle.name);
    if (cropCycle.season) parts.push(`${t('plots.seasonPrefix')} ${cropCycle.season}`);
  } else {
    parts.push(t('plots.noCrop'));
  }
  return parts.join(' · ');
}

// ============================================================
// צפי רווח לחלקה.
//
// **"צפי רווח" ולא "רווח", וזו לא קפדנות לשונית.** המספר הזה הוא
// הכלאה: צפי הכנסה (תחזית) פחות הוצאות בפועל (מציאות). הוא לא מומש,
// וצד אחד שלו הוא הערכה שהחקלאי הזין בעצמו. הערת שדה של עידו: טעות
// בהזנת יבול או מחיר תיראה בדיוק כמו רווח אמיתי, ולכן השם חייב לומר
// שזו הערכה.
//
// expensesTotal מקבל null כשאין עדיין מעקב הוצאות (הן בולט נפרד
// ברודמאפ). זה **לא** אותו דבר כמו 0: אפס הוצאות הוא עובדה, והיעדר
// מעקב הוא חוסר ידיעה. המסך משתמש ב-expensesTracked כדי להציג חיווי
// Wheat, לפי הדפוס ש-design.md כבר מגדיר, "we're not showing you
// everything yet" ולא "אתה מפסיד כסף".
// ============================================================

// **One cost line, and that is the whole of the 2026-09-10 change here.** This
// used to carry `sprayCost` and `workCost` beside `expenses`, because the journal
// froze those two figures on its own rows and profit subtracted all three. A
// farmer who recorded a spray in the journal and filed the same material as an
// expense was charged twice over. The journal no longer holds money at all -- an
// entry with a cost writes an expense (see the money header in logEntries.ts) --
// so `expenses` is now every shekel this plot cost, and there is nothing left to
// subtract twice.
export type PlotProfitForecast = {
  expectedIncome: number;
  expenses: number;
  expensesTracked: boolean;
  profit: number;
};

// בלי שטח, יבול או מחיר אין הכנסה לחשב, ולכן אין גם צפי רווח. מחזיר
// null במקום 0, כי 0 היה נקרא כ"אין רווח" במקום "אין מספיק נתונים".
//
// **The unit conversion happens here and nowhere else.** The yield is measured
// in one unit and the price quoted in another -- tons per dunam at shekels per
// kilo is Ido's own example -- so the two numbers cannot simply be multiplied.
// forecastUnits resolves both columns and returns the factor between them; a
// null factor is the one pair that does not convert (a count against a weight),
// and it returns null here for exactly the reason a missing yield does: there is
// no honest number to show, and a wrong one would look identical to a right one.
export function expectedIncomeFor(
  plotArea: number | null,
  cropCycle: CropCycle | null,
): number | null {
  if (
    plotArea == null ||
    cropCycle?.expectedYieldPerArea == null ||
    cropCycle?.expectedPricePerUnit == null
  ) {
    return null;
  }
  const { factor } = forecastUnits(cropCycle.yieldUnit, cropCycle.priceUnit);
  if (factor == null) return null;
  return plotArea * cropCycle.expectedYieldPerArea * factor * cropCycle.expectedPricePerUnit;
}

export function plotProfitForecast(
  plotArea: number | null,
  cropCycle: CropCycle | null,
  expensesTotal: number | null,
): PlotProfitForecast | null {
  const expectedIncome = expectedIncomeFor(plotArea, cropCycle);
  if (expectedIncome == null) return null;
  const expenses = expensesTotal ?? 0;
  return {
    expectedIncome,
    expenses,
    expensesTracked: expensesTotal != null,
    profit: expectedIncome - expenses,
  };
}

// ============================================================
// נודניק התיישנות הצפי, design.md, Forecast Update, "Staleness nudge".
//
// "if a plot's forecast hasn't been touched in a set number of months,
// the profitability tab surfaces a single caption line above the figure".
// המסמך משאיר את מספר החודשים פתוח; שלושה נבחרו כי זהו בערך אורך עונה
// אחת, כלומר הטווח שאחריו מחיר שוק או הערכת יבול כבר סביר שזזו.
//
// מחזיר את מחרוזת התאריך של העדכון האחרון (כדי שהתצוגה תגזור ממנה שם
// חודש), או null כשהצפי טרי, כשמעולם לא עודכן, או כשהתאריך פגום.
//
// **מעולם לא עודכן מחזיר null בכוונה.** חלקה שהחקלאי רק הגדיר לה יבול
// ומחיר בפעם הראשונה אינה "מיושנת", ונודניק שמופיע מיד אחרי ההזנה
// הראשונה מלמד להתעלם ממנו. forecast_updated_at נכתב ב-updateForecast,
// ולכן הוא null בדיוק במצב הזה.
//
// now מוזרק ולא נלקח מ-Date.now, כדי שהפונקציה תישאר טהורה ובדיקה.
export const FORECAST_STALE_MONTHS = 3;

export function staleForecastSince(cropCycle: CropCycle | null, now: Date): string | null {
  const updatedAt = cropCycle?.forecastUpdatedAt;
  if (!updatedAt) return null;

  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return null;

  // **היום מקוצץ לאורך חודש היעד, ולא נמסר כמו שהוא.** גם setMonth
  // וגם Date.UTC מנרמלים גלישה: ב-31 במאי, פחות שלושה חודשים, שניהם
  // הופכים "31 בפברואר" ל-3 במרץ, הסף זז כמה ימים קדימה, והנודניק
  // מופיע מוקדם מדי. Date.UTC(year, month + 1, 0) מחזיר את היום
  // האחרון בחודש היעד, ומגלגל שנים נכון גם כשהחודש יוצא שלילי.
  // נמצא בקוד ריוויו של שלב 4, ותוקן אחרי שהתיקון הראשון נפל על
  // אותה גלישה עצמה.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() - FORECAST_STALE_MONTHS;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const threshold = Date.UTC(year, month, Math.min(now.getUTCDate(), lastDayOfTargetMonth));
  return updated.getTime() < threshold ? updatedAt : null;
}

// ============================================================
// שורות היבול והמחיר בטאב צפי ההכנסה.
//
// **היחידה מוצגת דרך yieldUnits.ts ולא כטקסט הגולמי מהעמודה.** מאז
// שהצומצמו לשלוש (קילו, טון, יחידה) הערך השמור הוא קוד באנגלית, ורק
// שורות ישנות מחזיקות מחרוזת עברית חופשית. שתי המשפחות עוברות באותה
// פונקציה: מה שמזוהה מוצג בשמו העברי, וכל השאר מוצג כפי שהחקלאי כתב.
// ============================================================

// "850 קילו לדונם". המספר יחד עם **שתי** היחידות, יחידת היבול ויחידת
// השטח של החלקה. הגרסה הראשונה הציגה רק את יחידת היבול ("850 ק״ג"),
// והשאירה פתוחה את השאלה "לדונם או לכל החלקה?", אותה משפחת בלבול
// שהתוויות בגיליון עדכון הצפי סבלו ממנה.
export function expectedYieldDisplay(cropCycle: CropCycle, areaUnit: AreaUnit | null): string {
  if (cropCycle.expectedYieldPerArea == null) return t('plots.forecast.notSet');
  const value = formatNumber(cropCycle.expectedYieldPerArea);
  const { yieldLabel } = forecastUnits(cropCycle.yieldUnit, cropCycle.priceUnit);
  if (!areaUnit) return yieldLabel ? `${value} ${yieldLabel}` : value;
  return `${value} ${yieldRateUnitLabel(yieldLabel, areaUnit)}`;
}

// "‏60 ₪ / קילו", המחיר יחד עם היחידה שהוא מתייחס אליה, **שהיא עכשיו
// יחידת המחיר ולא יחידת היבול**. זה בדיוק התיקון: חקלאי שמצהיר יבול
// בטון ומחיר לקילו ראה כאן "60 ₪ / טון" ולא היה לו שום רמז לטעות.
//
// לוכסן ולא ל׳, אותו נימוק בדיוק כמו ב-priceUnitLabel: היחידה כאן היא
// המכנה, ובשורות ישנות היא עדיין טקסט חופשי שיכול להגיע ברבים.
export function expectedPriceDisplay(cropCycle: CropCycle, currency: Currency): string {
  if (cropCycle.expectedPricePerUnit == null) return t('plots.forecast.notSet');
  const amount = formatAmount(cropCycle.expectedPricePerUnit, currency);
  const { priceLabel } = forecastUnits(cropCycle.yieldUnit, cropCycle.priceUnit);
  return priceLabel ? `${amount} / ${priceLabel}` : amount;
}

const PLOT_COLUMNS = 'id, farm_id, name, area, area_unit, responsible_user_id';
const CROP_CYCLE_COLUMNS =
  'id, plot_id, name, season, yield_unit, price_unit, expected_yield_per_area, expected_price_per_unit, expected_harvest_date, forecast_updated_at, created_at';

type PlotRow = {
  id: string;
  farm_id: string;
  name: string;
  area: number | null;
  area_unit: AreaUnit | null;
  responsible_user_id: string | null;
};

type CropCycleRow = {
  id: string;
  plot_id: string;
  name: string;
  season: string | null;
  yield_unit: string | null;
  price_unit: string | null;
  expected_yield_per_area: number | null;
  expected_price_per_unit: number | null;
  expected_harvest_date: string | null;
  forecast_updated_at: string | null;
  created_at: string;
};

function mapPlot(row: PlotRow): Plot {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    area: row.area,
    areaUnit: row.area_unit,
    responsibleUserId: row.responsible_user_id,
  };
}

// **The two new columns are read with `?? null` and not read straight off the
// row.** A client running against a database that has not had 20260909120000
// applied yet gets `undefined` for them from PostgREST rather than a field that
// is missing, and `undefined` flowing into forecastUnits would be read as "no
// unit" instead of "the same unit as the yield". Defaulting here keeps that one
// deployment ordering from restating anyone's forecast.
function mapCropCycle(row: CropCycleRow): CropCycle {
  return {
    id: row.id,
    plotId: row.plot_id,
    name: row.name,
    season: row.season,
    yieldUnit: row.yield_unit,
    priceUnit: row.price_unit ?? null,
    expectedYieldPerArea: row.expected_yield_per_area,
    expectedPricePerUnit: row.expected_price_per_unit,
    expectedHarvestDate: row.expected_harvest_date ?? null,
    forecastUpdatedAt: row.forecast_updated_at,
  };
}

// ============================================================
// רשימת חלקות
// ============================================================

export type PlotsListState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  plots: PlotWithCropCycle[];
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts.
  loadCount: number;
};

export function usePlots(supabase: SupabaseClient): PlotsListState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [plots, setPlots] = useState<PlotWithCropCycle[]>([]);
  const [tick, setTick] = useState(0);
  const { loadCount, settle } = useLoadCount();

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: farmRows, error: farmError } = await currentFarmQuery(supabase);
      const farm = (farmRows as { id: string }[] | null)?.[0];
      if (!active) return;
      if (farmError || !farm) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }
      setFarmId(farm.id);

      // שתי שאילתות ולא הטמעה (embed) אחת, כי crop_cycles_view הוא
      // view שממסך עמודות לפי תפקיד, ו-PostgREST לא יודע לגזור ממנו
      // קשר זר כלפי plots. המיזוג קורה כאן, בקוד טהור.
      const [plotsResult, cyclesResult] = await Promise.all([
        supabase
          .from('plots')
          .select(PLOT_COLUMNS)
          .eq('farm_id', farm.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
        supabase
          .from('crop_cycles_view')
          .select(CROP_CYCLE_COLUMNS)
          .eq('farm_id', farm.id)
          .order('created_at', { ascending: false }),
      ]);

      if (!active) return;
      if (plotsResult.error || cyclesResult.error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const cycles = (cyclesResult.data ?? []) as CropCycleRow[];
      const latestCycleByPlot = new Map<string, CropCycleRow>();
      for (const cycle of cycles) {
        // הראשון בסדר created_at יורד מנצח, כך שגם אם חלקה תצבור עוד
        // עונות בעתיד, "הנוכחי" נשאר האחרון שנוצר בלי לוגיקה נוספת.
        if (!latestCycleByPlot.has(cycle.plot_id)) {
          latestCycleByPlot.set(cycle.plot_id, cycle);
        }
      }

      const rows = (plotsResult.data ?? []) as PlotRow[];
      setPlots(
        rows.map((row) => {
          const cycle = latestCycleByPlot.get(row.id);
          return { ...mapPlot(row), cropCycle: cycle ? mapCropCycle(cycle) : null };
        }),
      );
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, tick, settle]);

  return { loading, failed, farmId, plots, refresh, loadCount };
}

// ============================================================
// The crops this farm has grown, for the tile grid on the plot form.
//
// **useSpraySuggestions' twin, and it rests on the same argument.** prd.md
// section 8 asks for the spray material and pest to be suggested out of the
// farm's history so that they are not typed again every time. A crop is the
// same kind of value: a farm grows a handful of things and has grown them
// before. The founder's sketch says it in his own words -- "this screen fills
// up slowly according to what the farmer chose" -- and that is what turns the
// crop from a text box into a grid of squares.
//
// **crop_cycles_view and not usePlots.** usePlots already carries a crop name
// per plot, but only the *current* cycle of each, so a crop from an earlier
// season would fall off the grid the moment its plot was replanted. This is the
// farm's whole crop history instead. It reads the view and not the table for
// the reason createPlot writes without a select(): the client has no SELECT on
// crop_cycles at all, so that the role masking on the forecast columns cannot
// be walked around.
//
// Fifty rows, newest first, exactly like the spray query: enough that a real
// farm's whole vocabulary is in there, capped so the request stays small.
// ============================================================

export type CropSuggestions = { crops: string[] };

const EMPTY_CROP_SUGGESTIONS: CropSuggestions = { crops: [] };

export function useCropSuggestions(
  supabase: SupabaseClient,
  farmId: string | null,
): CropSuggestions {
  const [suggestions, setSuggestions] = useState<CropSuggestions>(EMPTY_CROP_SUGGESTIONS);

  useEffect(() => {
    let active = true;
    if (!farmId) {
      setSuggestions(EMPTY_CROP_SUGGESTIONS);
      return;
    }

    void supabase
      .from('crop_cycles_view')
      .select('name')
      .eq('farm_id', farmId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as { name: string | null }[];
        setSuggestions({ crops: plotCropOptions(rows.map((row) => row.name)) });
      });

    return () => {
      active = false;
    };
  }, [supabase, farmId]);

  return suggestions;
}

// ============================================================
// יצירת חלקה, עם ה-CropCycle הראשוני שלה
// ============================================================

export type CreatePlotInput = {
  name: string;
  area: number | null;
  areaUnit: AreaUnit;
  cropName: string;
};

export type CreatePlotResult =
  | { ok: true; plotId: string }
  | { ok: false; reason: 'forbidden' | 'nameRequired' | 'cropNameRequired' | 'error' };

export async function createPlot(
  supabase: SupabaseClient,
  farmId: string,
  input: CreatePlotInput,
): Promise<CreatePlotResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: 'nameRequired' };

  const cropName = input.cropName.trim();
  if (!cropName) return { ok: false, reason: 'cropNameRequired' };

  const plotWrite = await supabase
    .from('plots')
    .insert({ farm_id: farmId, name, area: input.area, area_unit: input.areaUnit })
    .select('id');
  const plotOutcome = writeOutcome(plotWrite);
  if (!plotOutcome.ok) return plotOutcome;
  const insertedPlot = (plotWrite.data as { id: string }[])[0];
  if (!insertedPlot) return { ok: false, reason: 'error' };
  const plotId = insertedPlot.id;

  // בלי הגידול הזה חלקה חדשה עומדת בסתירה למשפט המפורש ב-prd.md,
  // "חלקה היא שם, שטח, ומה גדל בה, זה כל מה שנדרש כדי להתחיל". יבול
  // ומחיר צפויים לא נשאלים כאן, הם ממתינים לכפתור עדכון צפי.
  //
  // בלי select() בכוונה: ה-SELECT על crop_cycles מוסר לגמרי מהלקוח
  // (ראה core_schema.sql), כדי שמיסוך התחזית לפי תפקיד ב-crop_cycles_view
  // לא יעקף על ידי RETURNING מה-INSERT. השורה נקראת בחזרה דרך ה-view.
  const season = String(new Date().getFullYear());
  const cycleWrite = await supabase
    .from('crop_cycles')
    .insert({ farm_id: farmId, plot_id: plotId, name: cropName, season });
  if (cycleWrite.error) return { ok: false, reason: 'error' };

  return { ok: true, plotId };
}

// ============================================================
// פרטי חלקה, שדות החלקה עצמה ו-CropCycle הנוכחי שלה
// ============================================================

export type PlotDetailState = {
  loading: boolean;
  failed: boolean;
  plot: Plot | null;
  cropCycle: CropCycle | null;
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts.
  loadCount: number;
};

// plotId מקבל null במסך יצירה, שמשתמש באותו טופס כמו עריכה אבל אין
// לו עדיין חלקה לטעון. בלי המקרה הזה כל טעינת מסך יצירה הייתה שולחת
// שאילתת רשת מיותרת עם id ריק, רק כדי להתעלם מהתוצאה.
export function usePlotDetail(supabase: SupabaseClient, plotId: string | null): PlotDetailState {
  const [loading, setLoading] = useState(plotId != null);
  const [failed, setFailed] = useState(false);
  const [plot, setPlot] = useState<Plot | null>(null);
  const [cropCycle, setCropCycle] = useState<CropCycle | null>(null);
  const [tick, setTick] = useState(0);
  const { loadCount, settle } = useLoadCount();

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    // The form screen has no plot to load yet, and counts as settled the
    // moment it asks: a pull that fires no query still has to end its spinner.
    if (plotId == null) {
      setLoading(false);
      settle();
      return;
    }

    const id = plotId;
    let active = true;

    async function load() {
      const [plotResult, cycleResult] = await Promise.all([
        supabase
          .from('plots')
          .select(PLOT_COLUMNS)
          .eq('id', id)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('crop_cycles_view')
          .select(CROP_CYCLE_COLUMNS)
          .eq('plot_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!active) return;
      if (plotResult.error || !plotResult.data) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      setPlot(mapPlot(plotResult.data as PlotRow));
      setCropCycle(cycleResult.data ? mapCropCycle(cycleResult.data as CropCycleRow) : null);
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, plotId, tick, settle]);

  return { loading, failed, plot, cropCycle, refresh, loadCount };
}

// ============================================================
// עריכת שדות החלקה עצמה, שם / שטח / יחידת שטח
// ============================================================

export type UpdatePlotInput = { name: string; area: number | null; areaUnit: AreaUnit };
export type UpdatePlotResult =
  { ok: true } | { ok: false; reason: 'forbidden' | 'nameRequired' | 'error' };

export async function updatePlot(
  supabase: SupabaseClient,
  plotId: string,
  input: UpdatePlotInput,
): Promise<UpdatePlotResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: 'nameRequired' };

  const write = await supabase
    .from('plots')
    .update({ name, area: input.area, area_unit: input.areaUnit })
    .eq('id', plotId)
    .select('id');
  return writeOutcome(write);
}

// ============================================================
// הגדרת אחראי לחלקה, שלב 6, שיתוף המשק. prd.md סעיף 11. עדכון שדה
// יחיד בנפרד משאר עריכת החלקה, בדיוק כמו updateForecast: האחראי נקבע
// מבורר ייעודי במסך פרטי החלקה, לא בתוך טופס יצירת/עריכת החלקה.
//
// responsibleUserId מקבל null כשמנקים אחראי. RLS מתיר עדכון plots
// ל-owner/manager בלבד (core_schema.sql, plots_update), והלקוח רק
// מדווח על מה שהשרת החליט דרך writeOutcome, לא מחליט הרשאה מראש.
//
// **אין לזה יותר קורא בשום מסך, וזה בכוונה.** 2026-09-09, אחרי מעבר של
// עידו והיזם על מסכי החלקה: בורר "אחראי החלקה" הוסר משני הלקוחות, כי
// חלקה היא שם, שטח וגידול וזה הכל. **הוסרו רק נקודות הכניסה ב-UI**;
// העמודה plots.responsible_user_id והפונקציה הזאת נשארו במקומן, כדי
// שההחלטה תהיה הפיכה בלי מיגרציה.
//
// מה שכן ממשיך לקרוא את השדה עצמו: myPlots.ts, כלומר מתג "החלקות שלי"
// במסך הבית. כל עוד אין UI שמציב אחראי, השדה נשאר null בכל החלקות,
// myPlotsToggleVisible מחזיר false, והמתג פשוט לא מוצג. אין מסך שבור,
// יש תכונה שממתינה לדרך להזין אותה.
// ============================================================

export async function setPlotResponsible(
  supabase: SupabaseClient,
  plotId: string,
  responsibleUserId: string | null,
): Promise<WriteOutcome> {
  const write = await supabase
    .from('plots')
    .update({ responsible_user_id: responsibleUserId })
    .eq('id', plotId)
    .select('id');
  return writeOutcome(write);
}

// ============================================================
// עריכת פרטי הגידול. יבול, מחיר, היחידות שלהם ומועד הקטיף נשמרים
// בנפרד דרך updateForecast, לפי Forecast Update ב-design.md.
//
// **הגיליון הנפרד של "עריכת גידול" בוטל.** היזם, מול עידו, על שני
// כפתורי העריכה שהיו במסך: "החלקה **היא** הגידול, למה יש שניים".
// מאז שם הגידול נערך בתוך טופס עריכת החלקה עצמו (ראה setPlotCrop),
// ולכן העונה ויחידת היבול אינן חלק מהקלט הזה יותר, אלא אופציונליות:
// מה שלא נמסר פשוט לא נכתב, ואינו נמחק.
// ============================================================

export type UpdateCropCycleInput = {
  name: string;
  season?: string | null;
  yieldUnit?: string | null;
};
export type UpdateCropCycleResult =
  { ok: true } | { ok: false; reason: 'forbidden' | 'nameRequired' | 'error' };

// UPDATE על crop_cycles, בניגוד ל-INSERT, לא זורק שגיאה כשה-RLS חוסם
// אותו, הוא פשוט לא נוגע בשורה. ובלי select() אפשרי (אותה סיבה כמו
// ב-createPlot), אין דרך לספור שורות שהושפעו. לכן ההצלחה מאומתת בקריאה
// חוזרת דרך ה-view ולא רק בהיעדר שגיאה, אותו כלל שהמנוע הזה קיים בשבילו.
export async function updateCropCycle(
  supabase: SupabaseClient,
  cropCycleId: string,
  input: UpdateCropCycleInput,
): Promise<UpdateCropCycleResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: 'nameRequired' };

  const write = await supabase
    .from('crop_cycles')
    .update({
      name,
      // undefined means the caller is not editing this field. Spreading it in
      // conditionally, rather than passing it through, is what keeps a form
      // that only knows the crop name from blanking a season it never showed.
      ...(input.season !== undefined ? { season: input.season } : {}),
      ...(input.yieldUnit !== undefined ? { yield_unit: input.yieldUnit } : {}),
    })
    .eq('id', cropCycleId);
  if (write.error) return { ok: false, reason: 'error' };

  const verify = await supabase
    .from('crop_cycles_view')
    .select('name')
    .eq('id', cropCycleId)
    .maybeSingle();
  if (verify.error || !verify.data || (verify.data as { name: string }).name !== name) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true };
}

// מה שגדל בחלקה, מתוך טופס עריכת החלקה. **החלקה היא הגידול**, ולכן
// שינוי הגידול הוא חלק מעריכת פרטי החלקה ולא מסך שני.
//
// cropCycleId הוא null כשלחלקה אין בכלל מחזור גידול. createPlot תמיד
// יוצר אחד, אז זה לא אמור לקרות, אבל אם קרה (שורה ישנה, מחיקה ידנית)
// העדיפות היא שהחקלאי יוכל להגדיר גידול ולא שהשמירה תיכשל בשקט. אז
// נוצר מחזור חדש, בדיוק כמו ב-createPlot, כולל העונה של השנה הנוכחית.
export async function setPlotCrop(
  supabase: SupabaseClient,
  farmId: string,
  plotId: string,
  cropCycleId: string | null,
  cropName: string,
): Promise<UpdateCropCycleResult> {
  const name = cropName.trim();
  if (!name) return { ok: false, reason: 'nameRequired' };

  if (cropCycleId) return updateCropCycle(supabase, cropCycleId, { name });

  // בלי select(), אותה סיבה בדיוק כמו ב-createPlot: ה-SELECT על
  // crop_cycles מוסר מהלקוח כדי שמיסוך התחזית ב-view לא ייעקף.
  const season = String(new Date().getFullYear());
  const write = await supabase
    .from('crop_cycles')
    .insert({ farm_id: farmId, plot_id: plotId, name, season });
  if (write.error) return { ok: false, reason: 'error' };
  return { ok: true };
}

// ============================================================
// עדכון צפי: יבול והיחידה שלו, מחיר והיחידה שלו, ומועד קטיף משוער.
//
// **שתי יחידות ולא אחת, וזה תיקון של באג ולא תוספת.** עידו מצהיר יבול
// בטון לדונם ומחיר בשקלים לקילו, ועד היום היה כאן שדה יחידה יחיד ששירת
// את שניהם, כלומר המספרים הוכפלו זה בזה כאילו הם באותה יחידה. ההמרה
// עצמה חיה ב-yieldUnits.ts, וכאן רק נשמרות שתי היחידות שהחקלאי בחר.
//
// **שתי היחידות נשמרות באותה כתיבה כמו שני המספרים.** בלעדיהן שני
// המספרים חסרי משמעות ("300 של מה?"), וכתיבה שנייה נפרדת הייתה מאפשרת
// מצב ביניים שבו הצפי נשמר בלי היחידות שמסבירות אותו.
// ============================================================

// undefined בכל שדה יחידה או תאריך פירושו "הקורא לא ערך את השדה הזה",
// והוא פשוט לא נכתב. null פירושו "נמחק במפורש". ההבחנה חשובה כאן במיוחד
// כי שורה ישנה מחזיקה יחידת יבול בטקסט חופשי, ואסור שמסך שלא הציג אותה
// ימחק אותה בשקט.
export type UpdateForecastInput = {
  expectedYieldPerArea: number;
  expectedPricePerUnit: number;
  yieldUnit?: string | null;
  priceUnit?: string | null;
  expectedHarvestDate?: string | null;
};
export type UpdateForecastResult = { ok: true } | { ok: false; reason: 'forbidden' | 'error' };

// '' is a box the farmer left empty, and the column it lands in is nullable, so
// it is stored as "no unit" rather than as an empty string that every later read
// would have to trim before asking whether it is set.
function emptyToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function updateForecast(
  supabase: SupabaseClient,
  cropCycleId: string,
  input: UpdateForecastInput,
): Promise<UpdateForecastResult> {
  const forecastUpdatedAt = new Date().toISOString();
  const write = await supabase
    .from('crop_cycles')
    .update({
      expected_yield_per_area: input.expectedYieldPerArea,
      expected_price_per_unit: input.expectedPricePerUnit,
      forecast_updated_at: forecastUpdatedAt,
      ...(input.yieldUnit !== undefined ? { yield_unit: emptyToNull(input.yieldUnit) } : {}),
      ...(input.priceUnit !== undefined ? { price_unit: emptyToNull(input.priceUnit) } : {}),
      ...(input.expectedHarvestDate !== undefined
        ? { expected_harvest_date: input.expectedHarvestDate }
        : {}),
    })
    .eq('id', cropCycleId);
  if (write.error) return { ok: false, reason: 'error' };

  // אימות דרך ה-view, אותה סיבה בדיוק כמו ב-updateCropCycle. שדות
  // התחזית עצמם ממוסכים ל-worker שם, אבל forecast_updated_at לא, ולכן
  // הוא השדה שמאומת מול הערך שרק נכתב.
  //
  // השוואה לפי זמן ולא לפי מחרוזת: Postgres/PostgREST מחזיר timestamptz
  // עם קיזוז "+00:00" בעוד ש-Date.toISOString() כותב "Z", אותו רגע
  // בדיוק אבל שתי מחרוזות שונות. השוואת מחרוזות ישירה תמיד נכשלה כאן
  // ודיווחה "forbidden" גם על כתיבה שהצליחה בפועל, נתפס תוך כדי בדיקה
  // ידנית בדפדפן, לא בטייפצ'ק ולא בלינט.
  const verify = await supabase
    .from('crop_cycles_view')
    .select('forecast_updated_at')
    .eq('id', cropCycleId)
    .maybeSingle();
  const verifiedAt = (verify.data as { forecast_updated_at: string } | null)?.forecast_updated_at;
  if (
    verify.error ||
    !verifiedAt ||
    new Date(verifiedAt).getTime() !== new Date(forecastUpdatedAt).getTime()
  ) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true };
}
