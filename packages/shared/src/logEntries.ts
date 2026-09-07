import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { LOG_ENTRY_TYPES, type LogEntryType } from './logEntryTypes';
import { writeOutcome } from './postgrest';
import { useLoadCount } from './refresh';
import type { SprayUnit } from './settings';
import {
  normalizeSprayMaterial,
  sprayMaterialOptions,
  sprayPestOptions,
  type SprayHistoryRow,
  type SprayPriceRow,
} from './sprayEntry';

// הסוגים עצמם חיים ב-logEntryTypes.ts, מודול טהור בלי ייבוא, כי
// ה-Worker זקוק להם דרך voice.ts ואין לו צורך ב-react ולא ב-supabase-js
// ששתי השורות הראשונות כאן גוררות. מיוצאים מחדש מכאן כדי ששום צרכן
// קיים לא ישבר.
export { LOG_ENTRY_TYPES };
export type { LogEntryType };

// היומן, שלב 3. עצמאי לגמרי מ-tasks, prd.md סעיף 8: "אם מחר נחליט
// למחוק את פיצ'ר המשימות לגמרי, היומן ימשיך לעבוד בדיוק אותו דבר".
// אין כאן שום ייבוא מ-tasks.ts ואין שום מפתח זר לטבלת tasks, הקישור
// היחיד קיים בכיוון ההפוך (tasks.created_log_id) וטרם נכתב, ראה
// Completion Prompts שעדיין לא נבנה.
//
// log_entries לא עבר REVOKE גורף כמו crop_cycles ו-tasks: הוא טבלה
// תפעולית ולא כסף, ה-worker הוא זה שמרסס וקוטף בפועל, ולכן מקבל
// SELECT/INSERT/UPDATE מלאים כבר ב-core_schema.sql, בלי view ממסך.

const LOG_ENTRY_TYPE_LABEL_KEY: Record<LogEntryType, string> = {
  till: 'log.type.till',
  sow: 'log.type.sow',
  fertilize: 'log.type.fertilize',
  spray: 'log.type.spray',
  irrigate: 'log.type.irrigate',
  prune: 'log.type.prune',
  thin: 'log.type.thin',
  harvest: 'log.type.harvest',
  repair: 'log.type.repair',
  other: 'log.type.other',
};

export function logEntryTypeLabelKey(type: LogEntryType): string {
  return LOG_ENTRY_TYPE_LABEL_KEY[type];
}

// The type a Log Entry Sheet opens on, decided here rather than inside either
// client's sheet so both answer the same way and the rule can be tested.
//
// `defaultType` is what the screen doing the opening asks for. The Spray Log
// Screen asks for 'spray', because it is the one screen that exists for spray
// records and a farmer standing on it should not have to find the type
// selector to write one. Every other opener asks for nothing and gets 'other',
// which is what the Journal has always defaulted to.
//
// **It applies to a new entry only.** An entry being edited always shows its
// own type: a default allowed to win there would silently retype a saved
// record the moment a farmer opened it to fix a typo. On the Spray Log Screen
// that bug would also be invisible, since every row it lists is already a
// spray and nothing on screen would move -- which is exactly why the rule is
// written down and tested here rather than left to two sheets to remember.
export function initialLogEntryType(
  entry: LogEntry | null,
  defaultType: LogEntryType = 'other',
): LogEntryType {
  return entry ? entry.type : defaultType;
}

// task, voice: קיימים בסכמה מהיום הראשון לצורך Completion Prompts
// (שלב 3, טרם נבנה) וחילוץ מקול (שלב 5, טרם נבנה). היצירה הידנית
// שהמסך הזה בונה כותבת תמיד 'manual'.
export type LogEntrySource = 'task' | 'manual' | 'voice';

export type LogEntry = {
  id: string;
  farmId: string;
  plotId: string | null;
  date: string;
  type: LogEntryType;
  note: string | null;
  source: LogEntrySource;
  sprayPest: string | null;
  sprayMaterial: string | null;
  sprayDose: string | null;
  sprayPhiDays: number | null;
  // Spray cost, frozen on the row at write time. See the pricelist migration:
  // the material's remembered price is only a default, the price and cost that
  // count are the ones stored here and never re-valued from the pricelist.
  sprayQuantity: number | null;
  sprayQuantityUnit: SprayUnit | null;
  sprayUnitPrice: number | null;
  sprayCost: number | null;
  // Work hours and their cost, frozen on the row at write time exactly like the
  // spray cost above. **On every entry type, not only a spray**: Ido's example
  // is a spray that also took him three hours, but a repair takes hours too. See
  // 20260906120000_work_hours.sql.
  workHours: number | null;
  workHourlyRate: number | null;
  workCost: number | null;
  harvestQty: number | null;
  harvestUnit: string | null;
  createdAt: string;
};

const LOG_ENTRY_COLUMNS =
  'id, farm_id, plot_id, date, type, note, source, spray_pest, spray_material, spray_dose, spray_phi_days, spray_quantity, spray_quantity_unit, spray_unit_price, spray_cost, work_hours, work_hourly_rate, work_cost, harvest_qty, harvest_unit, created_at';

type LogEntryRow = {
  id: string;
  farm_id: string;
  plot_id: string | null;
  date: string;
  type: LogEntryType;
  note: string | null;
  source: LogEntrySource;
  spray_pest: string | null;
  spray_material: string | null;
  spray_dose: string | null;
  spray_phi_days: number | null;
  spray_quantity: number | null;
  spray_quantity_unit: SprayUnit | null;
  spray_unit_price: number | null;
  spray_cost: number | null;
  work_hours: number | null;
  work_hourly_rate: number | null;
  work_cost: number | null;
  harvest_qty: number | null;
  harvest_unit: string | null;
  created_at: string;
};

function mapLogEntry(row: LogEntryRow): LogEntry {
  return {
    id: row.id,
    farmId: row.farm_id,
    plotId: row.plot_id,
    date: row.date,
    type: row.type,
    note: row.note,
    source: row.source,
    sprayPest: row.spray_pest,
    sprayMaterial: row.spray_material,
    sprayDose: row.spray_dose,
    sprayPhiDays: row.spray_phi_days,
    sprayQuantity: row.spray_quantity,
    sprayQuantityUnit: row.spray_quantity_unit,
    sprayUnitPrice: row.spray_unit_price,
    sprayCost: row.spray_cost,
    workHours: row.work_hours,
    workHourlyRate: row.work_hourly_rate,
    workCost: row.work_cost,
    harvestQty: row.harvest_qty,
    harvestUnit: row.harvest_unit,
    createdAt: row.created_at,
  };
}

// ============================================================
// רשימת רשומות היומן. plotId מצמצם לחלקה אחת (טאב יומן בפרטי חלקה),
// בלעדיו כל רשומות המשק (מסך היומן הכללי). type מצמצם לסוג אחד, קיים
// בשביל מסך יומן הריסוס (design.md, Spray Log Screen), כדי שהשאילתה
// עצמה תסנן במסד ולא תמשוך כל רשומה כדי לזרוק אותה בקליינט. מהחדש
// לישן לפי date, design.md, Journal List: "grouped by date, newest
// first, no section headers beyond the date itself" — בלי כותרות
// קבוצה נפרדות כמו בלוח המשימות, כל שורה כבר נושאת את התאריך שלה.
// ============================================================

export type LogEntriesListState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  entries: LogEntry[];
  plotNames: Map<string, string>;
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts.
  loadCount: number;
};

// workHoursOnly narrows to the entries that carry work hours, whatever their
// type, for the work-hours screen. **A fourth filter rather than a fourth hook**:
// it is the same query, the same ordering and the same plot-name join, and the
// one thing that differs is a where clause the database should apply anyway. It
// is deliberately not a `type` value either -- hours are not a kind of journal
// entry, they are something any entry can carry.
export function useLogEntries(
  supabase: SupabaseClient,
  plotId?: string,
  type?: LogEntryType,
  workHoursOnly: boolean = false,
): LogEntriesListState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [plotNames, setPlotNames] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);
  const { loadCount, settle } = useLoadCount();

  // זהות השאילתה, בלי ה-tick במכוון: ריענון מבקש את אותם נתונים בדיוק,
  // החלפת חלקה או סוג מבקשת נתונים אחרים. ההבחנה הזו קובעת מתי מותר
  // להמשיך להציג את מה שכבר יש ומתי זה שקר, ראה ההערה בתוך load.
  const queryKey = `${plotId ?? ''}|${type ?? ''}|${workHoursOnly ? 'work' : ''}`;
  const appliedQueryKey = useRef<string | null>(null);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    async function load() {
      // **רק כשהסינון עצמו השתנה, לא בכל הרצה.** loading אותחל ל-true
      // פעם אחת ב-useState ולא הוחזר לעולם, ולכן בין לחיצה על חלקה
      // בבורר של יומן הריסוס לבין חזרת התשובה הוא היה false בעוד
      // entries עדיין מחזיק את השורות של החלקה הקודמת. במסך ההוא שני
      // אלה נכנסים ישר ל-ExportBar, כלומר כפתור "ייצוא לרגולטור" היה
      // פעיל ומייצא את החלקה הלא נכונה.
      //
      // ההבחנה מול refresh() אינה קוסמטית: כשרק ה-tick עלה הסינון לא
      // זז, השורות הישנות עדיין שייכות למה שמוצג, והן רק ישנות בשנייה.
      // איפוס גורף היה מהבהב "טוען" אחרי כל שמירה בגיליון.
      if (appliedQueryKey.current !== queryKey) setLoading(true);
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

      let query = supabase
        .from('log_entries')
        .select(LOG_ENTRY_COLUMNS)
        .eq('farm_id', farm.id)
        .is('deleted_at', null);
      if (plotId) query = query.eq('plot_id', plotId);
      if (type) query = query.eq('type', type);
      if (workHoursOnly) query = query.not('work_hours', 'is', null);

      const [entriesResult, plotsResult] = await Promise.all([
        query.order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('plots').select('id, name').eq('farm_id', farm.id).is('deleted_at', null),
      ]);

      if (!active) return;
      if (entriesResult.error || plotsResult.error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const rows = (entriesResult.data ?? []) as LogEntryRow[];
      const plotRows = (plotsResult.data ?? []) as { id: string; name: string }[];
      setPlotNames(new Map(plotRows.map((row) => [row.id, row.name])));
      setEntries(rows.map(mapLogEntry));
      // רק אחרי ש-entries באמת מחזיק את השורות של הסינון הזה. סימון
      // מוקדם יותר היה גורם ללחיצה חוזרת על אותה חלקה, אחרי כשלון,
      // להיחשב כאילו היא כבר מוצגת.
      appliedQueryKey.current = queryKey;
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, plotId, type, workHoursOnly, tick, queryKey, settle]);

  return { loading, failed, farmId, entries, plotNames, refresh, loadCount };
}

// ============================================================
// Costs frozen on a log row, for the profit number. Two of them now: a spray's
// material cost (20260904130000_spray_pricelist.sql) and the cost of the hours a
// job took (20260906120000_work_hours.sql). The founder's decision of 2026-09-04
// is that such a cost lowers the plot's profit -- counted straight from the log
// row, not turned into an expense, so it stays clear of the still-open "money =
// invoices only" question in docs/open-items.md. Work hours follow it.
//
// plotId filters to one plot (its detail profit header); without it the whole
// farm, split into per-plot costs and the whole-farm rows (plot_id null) that
// join the general costs, exactly as expenses are split in useFarmProfit.
//
// **One loader, two columns.** The second cost is the same query with a
// different column and no type filter, and two copies of it would be two places
// to forget `deleted_at` or the plot split.
// ============================================================

export type SprayCostsState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  total: number;
  byPlot: Map<string, number>;
  general: number;
  // Whether any row with a cost exists at all: the same "tracked vs a real
  // zero" distinction expenses carry.
  tracked: boolean;
  refresh: () => void;
  loadCount: number;
};

// The cost of the hours worked, across the farm. Same shape as the spray costs,
// and named separately so a reader of useFarmProfit sees two cost lines rather
// than one thing used twice.
export type WorkCostsState = SprayCostsState;

// type is null for work hours on purpose: hours belong to any entry, while a
// material cost belongs to a spray and to nothing else.
function useFrozenCosts(
  supabase: SupabaseClient,
  costColumn: 'spray_cost' | 'work_cost',
  type: LogEntryType | null,
  plotId?: string,
): SprayCostsState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [rows, setRows] = useState<{ plotId: string | null; cost: number }[]>([]);
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

      let query = supabase
        .from('log_entries')
        .select(`plot_id, ${costColumn}`)
        .eq('farm_id', farm.id)
        .is('deleted_at', null)
        .not(costColumn, 'is', null);
      if (type) query = query.eq('type', type);
      if (plotId) query = query.eq('plot_id', plotId);

      const result = await query;
      if (!active) return;
      if (result.error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const raw = (result.data ?? []) as Record<string, unknown>[];
      setRows(
        raw.map((row) => ({
          plotId: (row.plot_id as string | null) ?? null,
          cost: row[costColumn] as number,
        })),
      );
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, costColumn, type, plotId, tick, settle]);

  const state = useMemo(() => {
    const byPlot = new Map<string, number>();
    let general = 0;
    let total = 0;
    for (const row of rows) {
      total += row.cost;
      if (row.plotId) byPlot.set(row.plotId, (byPlot.get(row.plotId) ?? 0) + row.cost);
      else general += row.cost;
    }
    return { byPlot, general, total, tracked: rows.length > 0 };
  }, [rows]);

  return {
    loading,
    failed,
    farmId,
    total: state.total,
    byPlot: state.byPlot,
    general: state.general,
    tracked: state.tracked,
    refresh,
    loadCount,
  };
}

export function useSprayCosts(supabase: SupabaseClient, plotId?: string): SprayCostsState {
  return useFrozenCosts(supabase, 'spray_cost', 'spray', plotId);
}

// The labour half of the same number. **No type filter**, because a job that
// took hours can be any entry -- Ido's own example is a spray that also took him
// three hours, and a repair takes hours just the same.
export function useWorkCosts(supabase: SupabaseClient, plotId?: string): WorkCostsState {
  return useFrozenCosts(supabase, 'work_cost', null, plotId);
}

// ============================================================
// הצעות אוטומטיות למזיק ולחומר מתוך היסטוריית המשק, prd.md סעיף 8:
// "שם החומר והמזיק מוצעים מתוך היסטוריית המשק, כדי שלא יקלידו את אותו
// שם בכל פעם מחדש". שתי רשימות נפרדות, כל אחת בסדר מהאחרון לשימוש,
// בלי כפילויות, מוגבלות כדי לא להציג עשרות הצעות ישנות.
//
// **The rows themselves are handed over too, and the two lists are now derived
// from them by tested pure functions in sprayEntry.ts.** The tile flow asks
// questions a flat list of names cannot answer -- what dose went with this
// material, what waiting period -- and the alternative was a second query over
// the same 50 rows. `pests` and `materials` are unchanged in shape and content,
// so the two existing sheets that read them are untouched.
// ============================================================

export type SpraySuggestions = {
  pests: string[];
  materials: string[];
  rows: SprayHistoryRow[];
};

const EMPTY_SUGGESTIONS: SpraySuggestions = { pests: [], materials: [], rows: [] };

export function useSpraySuggestions(
  supabase: SupabaseClient,
  farmId: string | null,
): SpraySuggestions {
  const [suggestions, setSuggestions] = useState<SpraySuggestions>(EMPTY_SUGGESTIONS);

  useEffect(() => {
    let active = true;
    if (!farmId) {
      setSuggestions(EMPTY_SUGGESTIONS);
      return;
    }

    void supabase
      .from('log_entries')
      .select('spray_pest, spray_material, spray_dose, spray_phi_days')
      .eq('farm_id', farmId)
      .eq('type', 'spray')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return;
        const raw = (data ?? []) as Pick<
          LogEntryRow,
          'spray_pest' | 'spray_material' | 'spray_dose' | 'spray_phi_days'
        >[];
        const rows: SprayHistoryRow[] = raw.map((row) => ({
          pest: row.spray_pest,
          material: row.spray_material,
          dose: row.spray_dose,
          phiDays: row.spray_phi_days,
        }));
        setSuggestions({
          pests: sprayPestOptions(rows),
          materials: sprayMaterialOptions(rows),
          rows,
        });
      });

    return () => {
      active = false;
    };
  }, [supabase, farmId]);

  return suggestions;
}

// ============================================================
// יצירה ועריכה. מזיק וחומר חובה רק כשהסוג ריסוס, prd.md סעיף 8:
// "ההבדל היחיד הוא שכשבוחרים בסוג ריסוס נפתחים ארבעה שדות נוספים...
// המינון וימי ההמתנה אופציונליים". כמות ויחידת קטיף אופציונליים
// בשניהם, כפי שכבר משתקף בנאלביליות העמודות ב-core_schema.sql.
// ============================================================

export type LogEntryInput = {
  plotId: string | null;
  date: string;
  type: LogEntryType;
  note: string | null;
  sprayPest: string | null;
  sprayMaterial: string | null;
  sprayDose: string | null;
  sprayPhiDays: number | null;
  sprayQuantity: number | null;
  sprayQuantityUnit: SprayUnit | null;
  sprayUnitPrice: number | null;
  sprayCost: number | null;
  workHours: number | null;
  workHourlyRate: number | null;
  workCost: number | null;
  harvestQty: number | null;
  harvestUnit: string | null;
};

export type LogEntryWriteResult =
  { ok: true } | { ok: false; reason: 'pestRequired' | 'materialRequired' | 'forbidden' | 'error' };

function sprayValidationError(input: LogEntryInput): 'pestRequired' | 'materialRequired' | null {
  if (input.type !== 'spray') return null;
  if (!input.sprayPest?.trim()) return 'pestRequired';
  if (!input.sprayMaterial?.trim()) return 'materialRequired';
  return null;
}

// שדות הסוג האחר תמיד null בכתיבה, גם אם הם כבר מלאים בעריכה של רשומה
// שהחליפה סוג. בלעדי זה, מעבר מריסוס לדישון בעריכה היה משאיר מזיק
// וחומר ישנים תקועים בשורה בלי שהם מוצגים בשום מקום בטופס.
function writePayload(input: LogEntryInput) {
  const isSpray = input.type === 'spray';
  const isHarvest = input.type === 'harvest';
  return {
    plot_id: input.plotId,
    date: input.date,
    type: input.type,
    note: input.note?.trim() ? input.note.trim() : null,
    spray_pest: isSpray ? (input.sprayPest?.trim() ?? null) : null,
    spray_material: isSpray ? (input.sprayMaterial?.trim() ?? null) : null,
    spray_dose: isSpray ? (input.sprayDose?.trim() ? input.sprayDose.trim() : null) : null,
    spray_phi_days: isSpray ? input.sprayPhiDays : null,
    spray_quantity: isSpray ? input.sprayQuantity : null,
    spray_quantity_unit: isSpray ? input.sprayQuantityUnit : null,
    spray_unit_price: isSpray ? input.sprayUnitPrice : null,
    spray_cost: isSpray ? input.sprayCost : null,
    // **Not gated on the type, and that is the point.** Every other field above
    // belongs to one kind of record and is nulled when the type moves away from
    // it. Hours belong to the work, not to the kind of work: Ido's example is a
    // spray that also took three hours, and switching that record to "other"
    // must not throw the hours away. See 20260906120000_work_hours.sql.
    //
    // work_cost is written as it stands and never recomputed on read. The rate
    // in settings only pre-filled the box; what is stored here is what this job
    // cost, and it stays that even after the farm raises its rate.
    work_hours: input.workHours,
    work_hourly_rate: input.workHourlyRate,
    work_cost: input.workCost,
    harvest_qty: isHarvest ? input.harvestQty : null,
    harvest_unit: isHarvest ? (input.harvestUnit?.trim() ? input.harvestUnit.trim() : null) : null,
  };
}

export async function createLogEntry(
  supabase: SupabaseClient,
  farmId: string,
  input: LogEntryInput,
  source: LogEntrySource = 'manual',
): Promise<LogEntryWriteResult> {
  const validationError = sprayValidationError(input);
  if (validationError) return { ok: false, reason: validationError };

  const write = await supabase
    .from('log_entries')
    .insert({ farm_id: farmId, source, ...writePayload(input) })
    .select('id');
  const outcome = writeOutcome(write);
  // Remember the material's price for next time, only once the spray itself is
  // safely written. Best-effort, never blocks the save. See below.
  if (outcome.ok) await rememberSprayMaterialPrice(supabase, farmId, input).catch(() => {});
  return outcome;
}

export async function updateLogEntry(
  supabase: SupabaseClient,
  logEntryId: string,
  input: LogEntryInput,
): Promise<LogEntryWriteResult> {
  const validationError = sprayValidationError(input);
  if (validationError) return { ok: false, reason: validationError };

  const write = await supabase
    .from('log_entries')
    .update(writePayload(input))
    .eq('id', logEntryId)
    .select('id');
  return writeOutcome(write);
}

// ============================================================
// The spray material pricelist: a per-farm default, never the source of truth
// for a saved spray's cost. See 20260904130000_spray_pricelist.sql.
// ============================================================

// Remember what the farm paid for a material, so the next spray of it pre-fills
// the price. Upserted like task_cost_memory (rememberTaskCost): best-effort,
// never blocks or reports, awaited *inside* an async function so the query is
// actually sent and not left an unfired thenable. A worker is blocked from the
// money table by RLS and simply leaves it unpopulated. Only a spray that carries
// both a unit price and a unit is remembered; a cost typed as a bare total has
// no per-unit price to store.
export async function rememberSprayMaterialPrice(
  supabase: SupabaseClient,
  farmId: string,
  input: LogEntryInput,
): Promise<void> {
  if (input.type !== 'spray') return;
  const material = input.sprayMaterial?.trim();
  if (!material) return;
  if (input.sprayUnitPrice === null || input.sprayQuantityUnit === null) return;
  await supabase.from('spray_material_prices').upsert(
    {
      farm_id: farmId,
      material_normalized: normalizeSprayMaterial(material),
      unit_price: input.sprayUnitPrice,
      unit: input.sprayQuantityUnit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'farm_id,material_normalized' },
  );
}

// One line of the pricelist, as the farmer states it on the pricelist screen.
export type SprayPriceInput = {
  material: string;
  unitPrice: number | null;
  unit: SprayUnit;
};

export type SprayPriceWriteResult =
  | { ok: true }
  | { ok: false; reason: 'materialRequired' | 'priceRequired' | 'forbidden' | 'error' };

// Writing one line of the pricelist on purpose, from the pricelist screen.
//
// **The sibling of rememberSprayMaterialPrice, and deliberately its opposite in
// manner.** That one is a silent by-product of saving a spray, so it validates
// nothing and reports nothing; this one is the farmer sitting down and stating a
// price, so it validates first and returns the same ok/reason shape as every
// other write here. The row it writes is identical, which is why the two live
// next to each other and share the normalization.
//
// **It still only writes a default.** Nothing here touches a spray that was
// already saved: those carry their own frozen price and cost. See
// 20260904130000_spray_pricelist.sql. And the price itself is never guessed --
// the farmer types it, because the same material is 7 shekels dearer one month
// and 4 cheaper the next.
export async function saveSprayPrice(
  supabase: SupabaseClient,
  farmId: string,
  input: SprayPriceInput,
): Promise<SprayPriceWriteResult> {
  const material = input.material.trim();
  if (!material) return { ok: false, reason: 'materialRequired' };
  // Zero passes: a material left over from last season really did cost nothing
  // this year. An empty or unreadable box does not, because a pricelist row with
  // no number is the one thing it cannot be.
  if (input.unitPrice === null || !Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    return { ok: false, reason: 'priceRequired' };
  }

  const write = await supabase
    .from('spray_material_prices')
    .upsert(
      {
        farm_id: farmId,
        material_normalized: normalizeSprayMaterial(material),
        unit_price: input.unitPrice,
        unit: input.unit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'farm_id,material_normalized' },
    )
    .select('id');
  return writeOutcome(write);
}

type SprayPriceRowResult = {
  material_normalized: string;
  unit_price: number;
  unit: SprayUnit;
};

// The farm's remembered material prices, for the spray entry flow to pre-fill a
// default. Worker gets zero rows (money table), which is fine: the tile flow
// then simply asks for the price like a first-ever spray.
export function useSprayPrices(supabase: SupabaseClient, farmId: string | null): SprayPriceRow[] {
  const [prices, setPrices] = useState<SprayPriceRow[]>([]);

  useEffect(() => {
    let active = true;
    if (!farmId) {
      setPrices([]);
      return;
    }

    void supabase
      .from('spray_material_prices')
      .select('material_normalized, unit_price, unit')
      .eq('farm_id', farmId)
      .then(({ data }) => {
        if (!active) return;
        const raw = (data ?? []) as SprayPriceRowResult[];
        setPrices(
          raw.map((row) => ({
            materialNormalized: row.material_normalized,
            unitPrice: row.unit_price,
            unit: row.unit,
          })),
        );
      });

    return () => {
      active = false;
    };
  }, [supabase, farmId]);

  return prices;
}
