import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { LOG_ENTRY_TYPES, type LogEntryType } from './logEntryTypes';
import { writeOutcome } from './postgrest';
import { useLoadCount } from './refresh';

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
  harvestQty: number | null;
  harvestUnit: string | null;
  createdAt: string;
};

const LOG_ENTRY_COLUMNS =
  'id, farm_id, plot_id, date, type, note, source, spray_pest, spray_material, spray_dose, spray_phi_days, harvest_qty, harvest_unit, created_at';

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

export function useLogEntries(
  supabase: SupabaseClient,
  plotId?: string,
  type?: LogEntryType,
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
  const queryKey = `${plotId ?? ''}|${type ?? ''}`;
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
  }, [supabase, plotId, type, tick, queryKey, settle]);

  return { loading, failed, farmId, entries, plotNames, refresh, loadCount };
}

// ============================================================
// הצעות אוטומטיות למזיק ולחומר מתוך היסטוריית המשק, prd.md סעיף 8:
// "שם החומר והמזיק מוצעים מתוך היסטוריית המשק, כדי שלא יקלידו את אותו
// שם בכל פעם מחדש". שתי רשימות נפרדות, כל אחת בסדר מהאחרון לשימוש,
// בלי כפילויות, מוגבלות כדי לא להציג עשרות הצעות ישנות.
// ============================================================

const SPRAY_SUGGESTIONS_LIMIT = 6;

export type SpraySuggestions = { pests: string[]; materials: string[] };

function recentDistinct(values: (string | null)[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

export function useSpraySuggestions(
  supabase: SupabaseClient,
  farmId: string | null,
): SpraySuggestions {
  const [suggestions, setSuggestions] = useState<SpraySuggestions>({ pests: [], materials: [] });

  useEffect(() => {
    let active = true;
    if (!farmId) {
      setSuggestions({ pests: [], materials: [] });
      return;
    }

    void supabase
      .from('log_entries')
      .select('spray_pest, spray_material')
      .eq('farm_id', farmId)
      .eq('type', 'spray')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as { spray_pest: string | null; spray_material: string | null }[];
        setSuggestions({
          pests: recentDistinct(
            rows.map((row) => row.spray_pest),
            SPRAY_SUGGESTIONS_LIMIT,
          ),
          materials: recentDistinct(
            rows.map((row) => row.spray_material),
            SPRAY_SUGGESTIONS_LIMIT,
          ),
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
  return writeOutcome(write);
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
