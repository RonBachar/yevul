import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { writeOutcome } from './postgrest';
import { useLoadCount } from './refresh';

// הוצאות, שלב 3, docs/roadmap.md. **הקוד הראשון כאן ניסה טופס עם
// קטגוריה (רשימה סגורה) ובחירת חלקה כשדה נפרד, לפי design.md.
// עידו דחה את זה במפורש: "אני לא רוצה שיהיו לי אפשרויות, זה מסבך".
// הטופס האמיתי, לפי בקשתו המפורשת, הוא ארבעה שדות בלבד: שם ההוצאה,
// סכום, תאריך, הערה, בלי שום בחירה מתוכנן. plotId עדיין קיים ונכתב
// (המשק עדיין זקוק לשיוך חלקה לצורך צפי הרווח בפרטי חלקה), אבל הוא
// תמיד מגיע משתיקה מההקשר שבו הטופס נפתח (defaultPlotId), לא נבחר
// בטופס עצמו.
//
// המשימה הזו נבנית שלב-שלב: מה שיש כאן הוא השלב הראשון, הקצאה יחידה
// (בלי חלקה, או חלקה אחת ב-100% מהסכום). פיצול אמיתי בין כמה חלקות,
// הוצאה קבועה חוזרת (recurring_rules) וקבלה מצורפת (receipts) לא
// נבנים כאן במכוון, כל אחד שלב נפרד בהמשך.
//
// expenses עצמה אינה מחזיקה plot_id בכלל, prd.md נספח א.3: השיוך
// לחלקה תמיד דרך expense_allocations, "אחד או יותר". `name` נכתב
// לעמודת `category` הקיימת בסכימה (טקסט חופשי בלי אילוץ), כי אין עמודת
// שם/תיאור נפרדת ואין טעם להוסיף אחת בשביל אותו תפקיד בדיוק.
export type ExpenseSource = 'manual' | 'voice' | 'ocr';

export type Expense = {
  id: string;
  farmId: string;
  amount: number;
  name: string | null;
  date: string;
  note: string | null;
  source: ExpenseSource;
  plotId: string | null;
  receiptPath: string | null;
  createdAt: string;
};

// ============================================================
// רשימת הוצאות. plotId מצמצם להוצאות עם הקצאה לחלקה הזו (טאב הוצאות
// בפרטי חלקה), בלעדיו כל הוצאות המשק (טאב כסף). הסינון לפי חלקה קורה
// במסד דרך expense_allocations!inner, לא בקליינט, אותו עיקרון כמו
// useLogEntries עם type.
// ============================================================

const EXPENSE_COLUMNS =
  'id, farm_id, amount, category, date, note, source, created_at, receipts(storage_path, deleted_at)';

type ExpenseRow = {
  id: string;
  farm_id: string;
  amount: number;
  category: string | null;
  date: string;
  note: string | null;
  source: ExpenseSource;
  created_at: string;
  expense_allocations: { plot_id: string; deleted_at: string | null }[];
  receipts: { storage_path: string; deleted_at: string | null }[];
};

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    farmId: row.farm_id,
    amount: row.amount,
    name: row.category,
    date: row.date,
    note: row.note,
    source: row.source,
    plotId: row.expense_allocations[0]?.plot_id ?? null,
    receiptPath: row.receipts?.find((r) => !r.deleted_at)?.storage_path ?? null,
    createdAt: row.created_at,
  };
}

export type ExpensesListState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  expenses: Expense[];
  plotNames: Map<string, string>;
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts for why the spinner
  // cannot be driven by `loading` or by watching the rows.
  loadCount: number;
};

export function useExpenses(supabase: SupabaseClient, plotId?: string): ExpensesListState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [plotNames, setPlotNames] = useState<Map<string, string>>(new Map());
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

      // plotId דורש !inner כדי לצמצם לשורות עם הקצאה תואמת בפועל.
      // בלעדיו (רשימת כל המשק) ה-join הוא שמאלי, כדי שהוצאה כללית
      // בלי אף הקצאה עדיין תופיע עם expense_allocations ריק. סינון
      // deleted_at על ההקצאה חיוני: updateExpense מוחק רך הקצאות ישנות
      // (ראה שם), ובלעדי הסינון כאן שורה ישנה שהוחלפה הייתה ממשיכה
      // להצביע על חלקה שכבר לא רלוונטית.
      const select = plotId
        ? `${EXPENSE_COLUMNS}, expense_allocations!inner(plot_id, deleted_at)`
        : `${EXPENSE_COLUMNS}, expense_allocations(plot_id, deleted_at)`;
      let query = supabase
        .from('expenses')
        .select(select)
        .eq('farm_id', farm.id)
        .is('deleted_at', null)
        .is('expense_allocations.deleted_at', null);
      if (plotId) query = query.eq('expense_allocations.plot_id', plotId);

      const [expensesResult, plotsResult] = await Promise.all([
        query.order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('plots').select('id, name').eq('farm_id', farm.id).is('deleted_at', null),
      ]);

      if (!active) return;
      if (expensesResult.error || plotsResult.error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const rows = (expensesResult.data ?? []) as unknown as ExpenseRow[];
      const plotRows = (plotsResult.data ?? []) as { id: string; name: string }[];
      setPlotNames(new Map(plotRows.map((row) => [row.id, row.name])));
      setExpenses(rows.map(mapExpense));
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, plotId, tick, settle]);

  return { loading, failed, farmId, expenses, plotNames, refresh, loadCount };
}

// ============================================================
// יצירה ועריכה. אותו כלל כמו ב-createExpense המקורי (Completion
// Prompts): הכתיבה העיקרית קודם, וההקצאה best-effort אחריה, כשל שם
// לא הופך את ההוצאה עצמה לכישלון.
// ============================================================

export type ExpenseInput = {
  amount: number;
  name: string | null;
  plotId: string | null;
  date: string;
  note: string | null;
};

export type ExpenseWriteResult =
  { ok: true; id: string } | { ok: false; reason: 'forbidden' | 'error' };

async function writeAllocation(
  supabase: SupabaseClient,
  farmId: string,
  expenseId: string,
  input: ExpenseInput,
) {
  if (!input.plotId) return;
  await supabase.from('expense_allocations').insert({
    farm_id: farmId,
    expense_id: expenseId,
    plot_id: input.plotId,
    amount: input.amount,
  });
}

// **`source` is a parameter with a default, exactly like createLogEntry's.**
// The column has been in the schema since day one with a 'manual' default, and
// every caller until stage 5 was a hand-typed form, so nothing wrote it and the
// default carried it. Voice makes that untrue: a spoken expense and a typed one
// have to be tellable apart afterwards, and the default would have labelled
// every recording as something the farmer typed. Defaulted rather than
// required so no existing call site changes meaning.
export async function createExpense(
  supabase: SupabaseClient,
  farmId: string,
  input: ExpenseInput,
  source: ExpenseSource = 'manual',
): Promise<ExpenseWriteResult> {
  const write = await supabase
    .from('expenses')
    .insert({
      farm_id: farmId,
      amount: input.amount,
      category: input.name?.trim() ? input.name.trim() : null,
      date: input.date,
      note: input.note?.trim() ? input.note.trim() : null,
      source,
    })
    .select('id');
  const outcome = writeOutcome(write);
  if (!outcome.ok) return outcome;

  const expenseId = (write.data as { id: string }[] | null)?.[0]?.id;
  if (!expenseId) return { ok: false, reason: 'error' };

  await writeAllocation(supabase, farmId, expenseId, input);
  return { ok: true, id: expenseId };
}

// עריכה מוחקת רך (deleted_at) את ההקצאה הישנה ויוצרת חדשה, במקום
// upsert חלקי, כי אין עדיין UI לפיצול אמיתי בין כמה חלקות (המשימה
// הבאה ברודמאפ). **מחיקה רכה בכוונה, לא קשיחה**: אין למדיניות ה-RLS
// של expense_allocations בכלל מדיניות DELETE (רק select/insert/update),
// אז DELETE אמיתי היה נחסם בשקט, מחזיר הצלחה עם אפס שורות שנמחקו,
// בדיוק התבנית שכבר תועדה כאן פעם אחת ב-postgrest.ts. נתפס בבדיקה
// בפועל בדפדפן: עריכת חלקה בהוצאה קיימת לא עדכנה את החלקה המוצגת.
async function clearAllocations(supabase: SupabaseClient, expenseId: string) {
  await supabase
    .from('expense_allocations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('expense_id', expenseId)
    .is('deleted_at', null);
}

// ============================================================
// קבלה. מעלה קובץ לסטורג' ורושם שורה ב-receipts. מוחק רך קבלה קודמת
// תחילה (מנגנון החלפה), כי יש unique index על קבלה פעילה אחת להוצאה.
// storage_path: {farm_id}/{expense_id}.{ext} — הנתיב הראשון הוא
// farm_id כדי לתמוך במדיניות ה-RLS שבודקת את תיקיית השורש.
// ============================================================

// **The receipts row's own source, which is not the expense's.** They answer
// different questions: expenses.source is how the *figure* got in, receipts.source
// is how the *document* got in, and stage 5 step 11 is the first time the two can
// disagree — a farmer can photograph a receipt and have it fill the form ('ocr'
// on both), or type an expense and attach a photo of the paperwork ('manual' on
// the receipt, whatever the expense was). Defaulted rather than required so no
// existing call site changes meaning, exactly like createExpense's.
//
// Only two values, because those are the only two ways a document arrives today.
// The column itself is unconstrained text, so this type is the only thing keeping
// a third spelling out of it.
export type ReceiptSource = 'manual' | 'ocr';

export async function attachReceipt(
  supabase: SupabaseClient,
  farmId: string,
  expenseId: string,
  file: Blob,
  mimeType: string,
  source: ReceiptSource = 'manual',
): Promise<{ ok: boolean }> {
  const ext = mimeType === 'application/pdf' ? 'pdf' : (mimeType.split('/')[1] ?? 'jpg');
  const storagePath = `${farmId}/${expenseId}.${ext}`;

  await supabase
    .from('receipts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('expense_id', expenseId)
    .is('deleted_at', null);

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(storagePath, file, { contentType: mimeType, upsert: true });

  if (uploadError) return { ok: false };

  const { error: insertError } = await supabase.from('receipts').insert({
    farm_id: farmId,
    expense_id: expenseId,
    storage_path: storagePath,
    mime_type: mimeType,
    source,
  });

  return { ok: !insertError };
}

export async function updateExpense(
  supabase: SupabaseClient,
  farmId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<ExpenseWriteResult> {
  const write = await supabase
    .from('expenses')
    .update({
      amount: input.amount,
      category: input.name?.trim() ? input.name.trim() : null,
      date: input.date,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .eq('id', expenseId)
    .select('id');
  const outcome = writeOutcome(write);
  if (!outcome.ok) return outcome;

  await clearAllocations(supabase, expenseId);
  await writeAllocation(supabase, farmId, expenseId, input);
  return { ok: true, id: expenseId };
}
