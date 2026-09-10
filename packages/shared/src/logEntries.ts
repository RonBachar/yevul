import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type ExpenseInput,
  type ExpenseSource,
} from './expenses';
import { t } from './i18n';
import { LOG_ENTRY_TYPES, type LogEntryType } from './logEntryTypes';
import { writeOutcome, type WriteOutcome } from './postgrest';
import { useLoadCount } from './refresh';
import type { SprayUnit } from './settings';
import {
  normalizeSprayMaterial,
  sprayMaterialOptions,
  sprayPestOptions,
  type SprayHistoryRow,
  type SprayPriceRow,
} from './sprayEntry';
// The cap-and-dedupe rule the kind-of-work grid shares with the spray, crop and
// expense grids. Pure, and it lives beside computeWorkCost because a kind of work
// and the hours it took are one field pair, asked in one breath by Ido.
import { workKindOptions } from './workEntry';

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
  // How much material went on, in what unit, at what price. **Not money, the
  // record of how the money was reached.** The pricelist's remembered price only
  // pre-fills these; what is stored here is what this spray used, and it is never
  // re-valued from the current pricelist.
  sprayQuantity: number | null;
  sprayQuantityUnit: SprayUnit | null;
  sprayUnitPrice: number | null;
  // Hours worked and the rate they were worked at. Same standing as the three
  // above, and **on every entry type, not only a spray**: Ido's example is a
  // spray that also took him three hours, but a repair takes hours too. See
  // 20260906120000_work_hours.sql.
  workHours: number | null;
  workHourlyRate: number | null;
  // What the work actually was, in the farmer's own words. **Free text, and the
  // deliberate counterpart of `type` above rather than a replacement for it**:
  // `type` is the closed domain the spray filter and the regulator export depend
  // on, and this is the sentence there was nowhere to write. Also on every entry
  // type. See 20260910130000_work_kind.sql.
  workKind: string | null;
  // The expense this entry created, and its amount. **The entry does not store a
  // cost of its own any more** -- see the money header below. `cost` is read back
  // off the linked expense rather than off this row, so a screen showing what an
  // entry cost and the money screen showing the same shekels cannot drift apart:
  // there is one number and it lives in `expenses`.
  //
  // Both are null for a worker, who is blocked from the money table by RLS and
  // gets an empty embed rather than an error, exactly as he does from every other
  // expense read. That is the intended Worker Mode behaviour and not a failure.
  createdExpenseId: string | null;
  cost: number | null;
  harvestQty: number | null;
  harvestUnit: string | null;
  createdAt: string;
};

// The expense is embedded rather than fetched separately: one FK, so PostgREST
// resolves `expenses(...)` without a hint, and one round trip instead of two.
// `deleted_at` comes along so a soft-deleted expense can be dropped in the mapper
// -- filtering it in the query would turn a to-one embed into a row filter and
// hide the journal entry itself, which is exactly what must not happen when an
// expense is deleted (see deleteExpense).
const LOG_ENTRY_COLUMNS =
  'id, farm_id, plot_id, date, type, note, source, spray_pest, spray_material, spray_dose, spray_phi_days, spray_quantity, spray_quantity_unit, spray_unit_price, work_hours, work_hourly_rate, work_kind, created_expense_id, expenses(id, amount, deleted_at), harvest_qty, harvest_unit, created_at';

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
  work_hours: number | null;
  work_hourly_rate: number | null;
  work_kind: string | null;
  created_expense_id: string | null;
  // A to-one embed, so PostgREST hands back one object or null. Optional as well
  // as nullable because a client running against a database that has not had the
  // link migration applied yet gets the key back missing rather than null, and
  // the optional chain in the mapper is what keeps that deployment ordering from
  // throwing.
  expenses?: { id: string; amount: number; deleted_at: string | null } | null;
  harvest_qty: number | null;
  harvest_unit: string | null;
  created_at: string;
};

function mapLogEntry(row: LogEntryRow): LogEntry {
  // A soft-deleted expense is not a cost. The farmer deleted the money and kept
  // the record of the work, which is the founder's rule of 2026-09-10, so the
  // entry reads back with no cost while everything about the spray stays.
  const expense = row.expenses?.deleted_at ? null : (row.expenses ?? null);
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
    workHours: row.work_hours,
    workHourlyRate: row.work_hourly_rate,
    workKind: row.work_kind,
    createdExpenseId: expense ? expense.id : null,
    cost: expense ? expense.amount : null,
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

      const rows = (entriesResult.data ?? []) as unknown as LogEntryRow[];
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
// The kinds of work this farm has done, for the grid on the journal sheet.
//
// **useExpenseSuggestions' shape, not a second pattern.** Same fifty rows, same
// newest-first ordering, same `active` flag, same "an inactive hook keeps what it
// had rather than blanking the grid". The one list rule (recentValues) and the
// cap live in workEntry.ts as a pure function, exactly as expenseNameOptions
// lives in expenseForm.ts, because that is the half a test can reach.
//
// **The one difference from the expense twin, and it is a necessary one:
// `work_kind is not null` is in the query.** An expense almost always has a name,
// so fifty expense rows yield a full grid; a kind of work will be on a small
// minority of journal entries for a long time, and without the filter a farm that
// sprayed fifty times since it last pruned would get fifty nulls back and an
// empty grid -- on exactly the farm that has the history to fill it. Filtering in
// the database rather than over-fetching and dropping them in the client is the
// same principle useLogEntries applies to `type` and `workHoursOnly`.
//
// **useLogEntries cannot answer this**, for the reasons the expense header sets
// out and which all hold here: the sheet is opened from screens with no journal
// list behind them, the plot detail screen's list is one plot's while a farm's
// vocabulary is the farm's, and that query pulls every column with an embed where
// this one wants a single column.
//
// The farmer can always type something never typed before -- that is what makes
// this a grid of suggestions and not the closed list `type` deliberately is.
// ============================================================

export type WorkKindSuggestions = { kinds: string[] };

const EMPTY_WORK_KIND_SUGGESTIONS: WorkKindSuggestions = { kinds: [] };

export function useWorkKindSuggestions(
  supabase: SupabaseClient,
  farmId: string | null,
  active: boolean = true,
): WorkKindSuggestions {
  const [suggestions, setSuggestions] = useState<WorkKindSuggestions>(EMPTY_WORK_KIND_SUGGESTIONS);

  useEffect(() => {
    let alive = true;
    if (!farmId) {
      setSuggestions(EMPTY_WORK_KIND_SUGGESTIONS);
      return;
    }
    if (!active) return;

    void supabase
      .from('log_entries')
      .select('work_kind')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .not('work_kind', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as { work_kind: string | null }[];
        setSuggestions({ kinds: workKindOptions(rows.map((row) => row.work_kind)) });
      });

    return () => {
      alive = false;
    };
  }, [supabase, farmId, active]);

  return suggestions;
}

// ============================================================
// יצירה ועריכה. מזיק וחומר חובה רק כשהסוג ריסוס, prd.md סעיף 8:
// "ההבדל היחיד הוא שכשבוחרים בסוג ריסוס נפתחים ארבעה שדות נוספים...
// המינון וימי ההמתנה אופציונליים". כמות ויחידת קטיף אופציונליים
// בשניהם, כפי שכבר משתקף בנאלביליות העמודות ב-core_schema.sql.
//
// ============================================================
// **Money lives in `expenses` only. Founder's decision, 2026-09-10.**
//
// Until today a cost could be recorded twice over. `log_entries` carried frozen
// `spray_cost` and `work_cost` columns, profit.ts summed them as two cost lines
// of their own, and `expenses` was a third. A farmer who wrote the spray in the
// journal *and* filed the same sack of material as an expense was charged for it
// twice, and nothing anywhere stopped him -- the two schemas did not know about
// each other. A guard would have been the wrong fix: it would have had to grow a
// notion of "the same money", by material, by date, by amount, and be right about
// it every time.
//
// So the two columns are gone (see the migration that drops them) and the journal
// no longer holds money at all. **The journal records what happened; `expenses`
// records what it cost.** An entry that carries a cost writes an expense and links
// to it through `created_expense_id`, mirroring `tasks.created_expense_id`, which
// has worked this way since Completion Prompts. There is one row of money per
// cost, so counting it twice is not something the product declines to do -- it is
// something it has no way to express.
//
// **One entry, one expense, even when it carries both a material cost and hours.**
// The amount is their sum. The founder's words: Ido wants to know what the spray
// cost him, and that is one number. The breakdown that produced it -- quantity,
// unit price, hours, rate -- stays on the journal row, because it is the record of
// how the number was reached and not a second copy of the number.
//
// **The cost is still typed, and manual entry still wins.** `cost` is whatever the
// farmer put in the box. Quantity x price and hours x rate only pre-fill a
// suggestion for it (computeEntryCost in workEntry.ts), and a farmer with no
// material, no quantity, no hours and no rate can type a total and be done.
//
// **It is still frozen.** The amount is written on the expense at the time of the
// entry and never re-derived from today's pricelist or today's hourly rate. A
// price is history, not a value.
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
  workHours: number | null;
  workHourlyRate: number | null;
  // What the work was. Trimmed on the way in, and blank becomes null, so "not
  // stated" has one spelling in the column and the suggestion grid cannot fill
  // up with whitespace. See writePayload.
  workKind: string | null;
  // What this entry cost, all of it, as one number. Written to `expenses` and to
  // nothing else. null means the entry cost nothing that the farmer is recording
  // -- and on an edit it means *remove* the cost, which soft-deletes the expense
  // this entry created. See syncEntryExpense.
  cost: number | null;
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
    // **Not gated on the type, and that is the point.** Every other field above
    // belongs to one kind of record and is nulled when the type moves away from
    // it. Hours belong to the work, not to the kind of work: Ido's example is a
    // spray that also took three hours, and switching that record to "other"
    // must not throw the hours away. See 20260906120000_work_hours.sql.
    //
    // The rate is stored as it stands and never re-read from settings. That rate
    // only pre-filled the box; what is on the row is what this job was worked at,
    // and it stays that even after the farm raises its rate. **No cost column
    // sits next to them any more** -- the cost went to `expenses`, see the header.
    work_hours: input.workHours,
    work_hourly_rate: input.workHourlyRate,
    // **Ungated for the same reason, and it is the same sentence of Ido's.**
    // "שעות עבודה וסוג עבודה ביומן" is one request, so the kind of work follows
    // the hours exactly: a spray that was also a pruning keeps what the farmer
    // wrote when the record is retyped to 'other', and a fence repair can say so
    // without the type strip having to grow an eleventh value.
    //
    // Trimmed here rather than in either client, and blank collapses to null, so
    // the two sheets cannot disagree about what an empty box means. Same
    // treatment `note` and `spray_dose` already get two lines up.
    work_kind: input.workKind?.trim() ? input.workKind.trim() : null,
    harvest_qty: isHarvest ? input.harvestQty : null,
    harvest_unit: isHarvest ? (input.harvestUnit?.trim() ? input.harvestUnit.trim() : null) : null,
  };
}

// The name the expense is filed under. `expenses.category` is the column the
// expense *name* is stored in -- see the header of expenses.ts, there is no
// separate name column -- so this is the word the farmer will read on the money
// screen next to the amount.
//
// The material when there is one, because "קונפידור" tells him what he paid for;
// otherwise the entry type's own Hebrew label, which is already written down for
// every type in LOG_ENTRY_TYPE_LABEL_KEY. **No new Hebrew string is invented
// here**: an expense created from a repair is called "תיקון" because that is what
// this product already calls a repair.
function entryExpenseName(input: LogEntryInput): string {
  const material = input.sprayMaterial?.trim();
  if (material) return material;
  return t(logEntryTypeLabelKey(input.type));
}

// log_entries.source and expenses.source answer the same question in two
// vocabularies that only partly overlap. 'voice' exists in both. 'task' does not
// exist on an expense, and the honest reading of it is 'manual': a farmer ticked
// a task off and confirmed the figure himself. There is no 'ocr' journal entry.
function expenseSourceFor(source: LogEntrySource): ExpenseSource {
  return source === 'voice' ? 'voice' : 'manual';
}

// The whole of the money side of a journal write, in one place so create and
// update cannot come to different conclusions about it.
//
// **An edit updates the expense it already made; it never makes a second one.**
// That is what `existingExpenseId` is for, and it is why updateLogEntry reads the
// link back before writing. Without it, correcting a typo in a spray would have
// filed the material a second time -- the very double count this change exists to
// remove, reintroduced through the back door.
//
// **Removing the cost soft-deletes the expense.** A farmer who clears the cost box
// is saying this did not cost me that; leaving the expense behind would keep the
// money on his books with nothing on any screen still pointing at it.
//
// Best-effort throughout, like writeAllocation and rememberSprayMaterialPrice: the
// journal entry itself is already safely written, and a worker who is blocked from
// the money table by RLS must still be able to record that he sprayed.
async function syncEntryExpense(
  supabase: SupabaseClient,
  farmId: string,
  logEntryId: string,
  input: LogEntryInput,
  existingExpenseId: string | null,
  source: LogEntrySource,
): Promise<void> {
  if (input.cost === null) {
    // deleteExpense clears the back-link itself, in one place, so that an expense
    // deleted from the money screen and a cost cleared from the journal sheet end
    // up in exactly the same state.
    if (existingExpenseId) await deleteExpense(supabase, existingExpenseId);
    return;
  }

  const expenseInput: ExpenseInput = {
    amount: input.cost,
    name: entryExpenseName(input),
    // The plot comes from the entry, and a null plot is a farm-level expense with
    // no allocation at all -- which is how a general expense has always been
    // written (writeAllocation returns early on a null plot).
    plotId: input.plotId,
    date: input.date,
    note: input.note,
  };

  if (existingExpenseId) {
    await updateExpense(supabase, farmId, existingExpenseId, expenseInput);
    return;
  }

  const outcome = await createExpense(supabase, farmId, expenseInput, expenseSourceFor(source));
  if (!outcome.ok) return;
  // חייב await: PostgrestFilterBuilder הוא thenable עצל ולא Promise נלהב, ובלי
  // await השאילתה נבנית ואף פעם לא נשלחת. אותו כלל בדיוק כמו ב-completionPrompts.
  await supabase
    .from('log_entries')
    .update({ created_expense_id: outcome.id })
    .eq('id', logEntryId);
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
  if (!outcome.ok) return outcome;

  const logEntryId = (write.data as { id: string }[] | null)?.[0]?.id;
  // A brand new entry has no expense yet, so this can only create one.
  if (logEntryId) {
    await syncEntryExpense(supabase, farmId, logEntryId, input, null, source).catch(() => {});
  }
  // Remember the material's price for next time, only once the spray itself is
  // safely written. Best-effort, never blocks the save. See below.
  await rememberSprayMaterialPrice(supabase, farmId, input).catch(() => {});
  return outcome;
}

// **The farm and the existing link are read back off the row rather than passed
// in.** Both are facts about the saved entry, not about the form, and asking every
// caller for the farm id would have been one more thing two clients could get
// wrong on a screen that already knows the entry only by its id.
export async function updateLogEntry(
  supabase: SupabaseClient,
  logEntryId: string,
  input: LogEntryInput,
): Promise<LogEntryWriteResult> {
  const validationError = sprayValidationError(input);
  if (validationError) return { ok: false, reason: validationError };

  const existing = await supabase
    .from('log_entries')
    .select('farm_id, created_expense_id')
    .eq('id', logEntryId)
    .maybeSingle();
  const existingRow = existing.data as {
    farm_id: string;
    created_expense_id: string | null;
  } | null;

  const write = await supabase
    .from('log_entries')
    .update(writePayload(input))
    .eq('id', logEntryId)
    .select('id');
  const outcome = writeOutcome(write);
  if (!outcome.ok) return outcome;

  if (existingRow) {
    await syncEntryExpense(
      supabase,
      existingRow.farm_id,
      logEntryId,
      input,
      existingRow.created_expense_id,
      // 'manual' whatever the entry's own source was, and it is read only when a
      // cost is being added to an entry that had none. That addition is the farmer
      // sitting on the edit sheet typing a number -- it is not the recording that
      // created the entry, so labelling it 'voice' because the spray was spoken
      // would be the wrong answer to "how did this figure get in".
      'manual',
    ).catch(() => {});
  }
  return outcome;
}

// Deleting a journal entry, and the expense it created with it. Founder's rule,
// 2026-09-10, and the deliberate asymmetry with deleteExpense is the whole of it:
//
//   deleting the entry    takes the money with it. The work is being un-recorded,
//                         so the cost of that work has no subject left.
//
//   deleting the expense  leaves the entry standing with no cost. The spray really
//                         happened, and the regulator's export needs it -- what the
//                         farmer withdrew was the claim about what it cost him.
//
// Soft, `deleted_at`, no DELETE anywhere: the schema grants none. See the header
// of deleteExpense for the argument, which is the same one.
export async function deleteLogEntry(
  supabase: SupabaseClient,
  logEntryId: string,
): Promise<WriteOutcome> {
  const existing = await supabase
    .from('log_entries')
    .select('created_expense_id')
    .eq('id', logEntryId)
    .maybeSingle();
  const expenseId = (existing.data as { created_expense_id: string | null } | null)
    ?.created_expense_id;

  const write = await supabase
    .from('log_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', logEntryId)
    .select('id');
  const outcome = writeOutcome(write);
  if (!outcome.ok) return outcome;

  // Best-effort, and after the entry is gone: a worker is blocked from the money
  // table by RLS and must still be able to delete his own journal entry.
  if (expenseId) await deleteExpense(supabase, expenseId).catch(() => {});
  return outcome;
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
