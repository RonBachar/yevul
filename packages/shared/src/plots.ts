import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { formatAmount, formatArea, formatNumber, yieldRateUnitLabel } from './format';
import { t } from './i18n';
import { writeOutcome } from './postgrest';
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
};

export type CropCycle = {
  id: string;
  plotId: string;
  name: string;
  season: string | null;
  yieldUnit: string | null;
  expectedYieldPerArea: number | null;
  expectedPricePerUnit: number | null;
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

export type PlotProfitForecast = {
  expectedIncome: number;
  expenses: number;
  expensesTracked: boolean;
  profit: number;
};

// בלי שטח, יבול או מחיר אין הכנסה לחשב, ולכן אין גם צפי רווח. מחזיר
// null במקום 0, כי 0 היה נקרא כ"אין רווח" במקום "אין מספיק נתונים".
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
  return plotArea * cropCycle.expectedYieldPerArea * cropCycle.expectedPricePerUnit;
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

  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - FORECAST_STALE_MONTHS);
  return updated < threshold ? updatedAt : null;
}

// ============================================================
// יחידת יבול, הצעות נפוצות.
//
// **זו רשימת הצעות ולא רשימה סגורה.** העמודה במסד היא טקסט חופשי
// בכוונה (prd.md, מודל חקלאות-אגנוסטי), ולכן הרכיב מציע את הנפוצות
// ומשאיר "אחר" לכל דבר אחר. שתי משפחות המדידה מיוצגות, משקל וספירה,
// לפי הערת שדה של עידו שגידולים מסוימים נספרים ולא נשקלים.
// ============================================================

export const YIELD_UNIT_PRESET_KEYS = [
  'plots.crop.yieldUnitPreset.kg',
  'plots.crop.yieldUnitPreset.ton',
  'plots.crop.yieldUnitPreset.units',
  'plots.crop.yieldUnitPreset.crates',
] as const;

// הערך שנשמר הוא המחרוזת המתורגמת עצמה, ולכן הפונקציה נקראת בזמן
// ריצה ולא נפרסת לקבוע ברמת המודול, כדי שהחלפת שפה בשלב 8 תשפיע.
export function yieldUnitPresets(): string[] {
  return YIELD_UNIT_PRESET_KEYS.map((key) => t(key));
}

// "אחר" נבחר כשיש ערך שאינו אחת ההצעות, למשל יחידה שהחקלאי הקליד
// בעצמו או ערך שנשמר לפני שההצעות היו קיימות.
export function isCustomYieldUnit(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && !yieldUnitPresets().includes(trimmed);
}

// "850 ק״ג לדונם". המספר יחד עם **שתי** היחידות, יחידת היבול ויחידת
// השטח של החלקה. הגרסה הראשונה הציגה רק את יחידת היבול ("850 ק״ג"),
// והשאירה פתוחה את השאלה "לדונם או לכל החלקה?", אותה משפחת בלבול
// שהתוויות בגיליון עדכון הצפי סבלו ממנה.
export function expectedYieldDisplay(cropCycle: CropCycle, areaUnit: AreaUnit | null): string {
  if (cropCycle.expectedYieldPerArea == null) return t('plots.forecast.notSet');
  const value = formatNumber(cropCycle.expectedYieldPerArea);
  if (!areaUnit) return cropCycle.yieldUnit ? `${value} ${cropCycle.yieldUnit}` : value;
  return `${value} ${yieldRateUnitLabel(cropCycle.yieldUnit, areaUnit)}`;
}

// "‏60 ₪ / ק״ג", המחיר יחד עם היחידה שהוא מתייחס אליה. לוכסן ולא ל׳,
// אותו נימוק בדיוק כמו ב-priceUnitLabel: היחידה כאן היא המכנה, והיא
// טקסט חופשי שיכול להגיע ברבים ("יחידות", "ארגזים").
export function expectedPriceDisplay(cropCycle: CropCycle, currency: Currency): string {
  if (cropCycle.expectedPricePerUnit == null) return t('plots.forecast.notSet');
  const amount = formatAmount(cropCycle.expectedPricePerUnit, currency);
  const unit = cropCycle.yieldUnit?.trim();
  return unit ? `${amount} / ${unit}` : amount;
}

const PLOT_COLUMNS = 'id, farm_id, name, area, area_unit';
const CROP_CYCLE_COLUMNS =
  'id, plot_id, name, season, yield_unit, expected_yield_per_area, expected_price_per_unit, forecast_updated_at, created_at';

type PlotRow = {
  id: string;
  farm_id: string;
  name: string;
  area: number | null;
  area_unit: AreaUnit | null;
};

type CropCycleRow = {
  id: string;
  plot_id: string;
  name: string;
  season: string | null;
  yield_unit: string | null;
  expected_yield_per_area: number | null;
  expected_price_per_unit: number | null;
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
  };
}

function mapCropCycle(row: CropCycleRow): CropCycle {
  return {
    id: row.id,
    plotId: row.plot_id,
    name: row.name,
    season: row.season,
    yieldUnit: row.yield_unit,
    expectedYieldPerArea: row.expected_yield_per_area,
    expectedPricePerUnit: row.expected_price_per_unit,
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
};

export function usePlots(supabase: SupabaseClient): PlotsListState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [plots, setPlots] = useState<PlotWithCropCycle[]>([]);
  const [tick, setTick] = useState(0);

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
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, tick]);

  return { loading, failed, farmId, plots, refresh };
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

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (plotId == null) {
      setLoading(false);
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
        return;
      }

      setPlot(mapPlot(plotResult.data as PlotRow));
      setCropCycle(cycleResult.data ? mapCropCycle(cycleResult.data as CropCycleRow) : null);
      setFailed(false);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, plotId, tick]);

  return { loading, failed, plot, cropCycle, refresh };
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
// עריכת פרטי הגידול, שם / עונה / יחידת יבול. יבול ומחיר צפויים
// נשמרים בנפרד, דרך updateForecast, בדיוק לפי Forecast Update ב-design.md.
// ============================================================

export type UpdateCropCycleInput = {
  name: string;
  season: string | null;
  yieldUnit: string | null;
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
    .update({ name, season: input.season, yield_unit: input.yieldUnit })
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

// ============================================================
// עדכון צפי, יבול ומחיר בלבד. design.md, Forecast Update: גיליון של
// שני שדות, שום שדה נוסף.
// ============================================================

// yieldUnit אופציונלי, ונשלח רק כשהחקלאי הגדיר אותו בתוך הגיליון הזה,
// כלומר רק כשהוא היה ריק מלכתחילה. בלי היחידה, שני המספרים כאן חסרי
// משמעות ("300 של מה?"), ולכן היא נשמרת באותה כתיבה ולא בקריאה שנייה:
// שתי כתיבות נפרדות היו מאפשרות מצב ביניים שבו הצפי נשמר בלי היחידה
// שמסבירה אותו.
export type UpdateForecastInput = {
  expectedYieldPerArea: number;
  expectedPricePerUnit: number;
  yieldUnit?: string | null;
};
export type UpdateForecastResult = { ok: true } | { ok: false; reason: 'forbidden' | 'error' };

export async function updateForecast(
  supabase: SupabaseClient,
  cropCycleId: string,
  input: UpdateForecastInput,
): Promise<UpdateForecastResult> {
  const forecastUpdatedAt = new Date().toISOString();
  const yieldUnit = input.yieldUnit?.trim();
  const write = await supabase
    .from('crop_cycles')
    .update({
      expected_yield_per_area: input.expectedYieldPerArea,
      expected_price_per_unit: input.expectedPricePerUnit,
      forecast_updated_at: forecastUpdatedAt,
      ...(yieldUnit ? { yield_unit: yieldUnit } : {}),
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
