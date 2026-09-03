import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
// The cap-and-dedupe rule the name grid shares with the spray and crop grids.
// See useExpenseSuggestions below; expenseForm.ts imports only *types* back from
// here, so there is no import cycle at run time. Same shape as plots.ts.
import { expenseNameOptions } from './expenseForm';
import { writeOutcome, type WriteOutcome } from './postgrest';
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
// The names this farm has spent money on, for the tile grid on the expense
// sheet.
//
// **useSpraySuggestions' third twin, and it rests on the same argument.** A farm
// buys a handful of things over and over -- diesel, fertiliser, pesticide -- so
// the grid fills up from what was actually spent instead of being typed again
// every time. See the header of expenseForm.ts for why the name is the only
// field on that sheet that became squares.
//
// **useExpenses was checked first and cannot answer this.** Three reasons, and
// each one alone is enough. It is not always there: RootTabs and CaptureSheet
// open ExpenseSheet with no list behind them at all. Where it is there it is
// sometimes the wrong list: the plot detail screen's expenses tab filters it to
// one plot through expense_allocations!inner, and a farm's vocabulary is the
// farm's, not one plot's. And it selects every column of every expense the farm
// has ever had, with two joins, where this needs one column and fifty rows.
//
// **`active` is what the twins do not have, and this one needs.** ExpenseSheet
// is mounted for the life of the tab bar with `visible` false, so a hook that
// read once on mount would hand a farmer a grid that is missing the name he
// entered an hour ago -- on the screen he uses most. Passing the sheet's own
// visibility re-reads the fifty rows each time it opens, which is one small
// request per opening and no requests at all while it is closed. An inactive
// hook keeps what it already had rather than blanking the grid, so nothing
// flickers on the way out.
//
// Fifty rows, newest first, exactly like the spray and crop queries: enough that
// a real farm's whole vocabulary is in there, capped so the request stays small.
// ============================================================

export type ExpenseSuggestions = { names: string[] };

const EMPTY_EXPENSE_SUGGESTIONS: ExpenseSuggestions = { names: [] };

export function useExpenseSuggestions(
  supabase: SupabaseClient,
  farmId: string | null,
  active: boolean = true,
): ExpenseSuggestions {
  const [suggestions, setSuggestions] = useState<ExpenseSuggestions>(EMPTY_EXPENSE_SUGGESTIONS);

  useEffect(() => {
    let alive = true;
    if (!farmId) {
      setSuggestions(EMPTY_EXPENSE_SUGGESTIONS);
      return;
    }
    if (!active) return;

    void supabase
      .from('expenses')
      // `category` and not `name`: the column the expense name is stored in. See
      // the header of this file.
      .select('category')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as { category: string | null }[];
        setSuggestions({ names: expenseNameOptions(rows.map((row) => row.category)) });
      });

    return () => {
      alive = false;
    };
  }, [supabase, farmId, active]);

  return suggestions;
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

// **`Blob | ArrayBuffer`, and the union is the whole point of this signature.**
// The web hands over a real `File` from an `<input>`, which uploads fine. React
// Native's `Blob` is a different object: a handle to bytes held on the native
// side, with nothing readable from JavaScript. supabase-js cannot read it, so
// `upload()` silently sends nothing and the file never arrives — no throw, no
// error, just an empty bucket. That is exactly what happened here: every
// receipt attached from the phone since the feature was built went nowhere, in
// both the manual attach and the scan, and it surfaced only when someone
// checked the bucket. React Native must therefore pass an `ArrayBuffer`, which
// is what Supabase's own React Native guidance says and what
// `Response.arrayBuffer()` produces.
export type ReceiptUpload = Blob | ArrayBuffer;

export async function attachReceipt(
  supabase: SupabaseClient,
  farmId: string,
  expenseId: string,
  file: ReceiptUpload,
  mimeType: string,
  source: ReceiptSource = 'manual',
): Promise<{ ok: boolean }> {
  // An empty upload is a failure, not an attachment. Without this an
  // unreadable file would still create a receipts row pointing at a zero-byte
  // object, and the farmer would be told his document was filed when the
  // accountant will find nothing there.
  if (file instanceof ArrayBuffer && file.byteLength === 0) return { ok: false };
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

// ============================================================
// Deleting an expense. Founder's report 2026-09-02: "if someone enters an
// expense by mistake I want to delete it". A task could already be deleted and
// an expense could not, so this is deleteTask's shape on the money table, not a
// new mechanism: one soft delete, `deleted_at`, no DELETE anywhere (the schema
// grants none — see core_schema.sql, "מחיקה היא תמיד UPDATE על deleted_at").
//
// **One row is touched, and the three things hanging off the expense are
// deliberately left alone.**
//
// `expense_allocations`: not cleared, and the reason is that it never carries
// the money. Its `amount` column is written by writeAllocation and read by
// nobody — EXPENSE_COLUMNS embeds only `plot_id` off it — so every figure the
// product shows is summed from `expenses.amount` (profit.ts, reports.ts), and a
// leftover allocation cannot inflate a total. It cannot even be seen: the only
// reads of that table are child joins under a query on `expenses` that already
// filters `deleted_at is null`, so a soft-deleted expense takes its allocations
// out of every list, every plot total and every export along with it. Clearing
// them is in fact the one move here that could corrupt the record — it is what
// updateExpense's clearAllocations does, and an expense restored afterwards
// would come back as a general farm expense instead of the plot's, silently
// moving money off a plot. The row stays whole so the undo that design.md asks
// for can be one write.
//
// The `receipts` row and the object in the bucket: also untouched, and the
// storage bytes especially. `receipts_storage_delete` exists in the policy, so
// a client *could* erase them, and nothing else in this product ever does —
// deleting bytes is the only irreversible act available on this path, and a
// mistyped amount is not a reason to burn an accountant's document. The row and
// the file are reachable only through the expense (loadReceiptDocument is
// keyed by expense_id), which is now gone from every screen, so this creates no
// orphan beyond the one docs/open-items.md already records for receipt replacement.
//
// **No undo, and that is inherited rather than chosen.** design.md asks for a
// five-second undo wherever deletion exists and the roadmap schedules it for
// stage 8; deleteTask does not have one either, and both clients guard deletion
// with a confirmation dialog before the write instead. Expenses match that
// exactly rather than growing a one-off.
export async function deleteExpense(
  supabase: SupabaseClient,
  expenseId: string,
): Promise<WriteOutcome> {
  const write = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)
    .select('id');
  return writeOutcome(write);
}
