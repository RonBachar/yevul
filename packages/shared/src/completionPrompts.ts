import type { SupabaseClient } from '@supabase/supabase-js';
import { createExpense, type ExpenseInput } from './expenses';
import { formatLocalDateOnly } from './safeHarvestDate';
import { rememberTaskCost, type Task } from './tasks';
import { writeOutcome, type WriteOutcome } from './postgrest';

// Completion Prompts, שלב 3, design.md: שתי הצעות עצמאיות שיכולות
// להופיע כשמשימה מסומנת בוצע, לשמור ביומן ולרשום כהוצאה. "Offering,
// never doing", ולכן שתי הפונקציות כאן רק כותבות את מה שהחקלאי אישר
// בפועל, לא נקראות אוטומטית משום מקום אחר.
//
// אין כאן ניחוש של סוג יומן מתוך כותרת המשימה. design.md מרמז על
// "matches a Journal entry type", אבל prd.md סעיף 7 לא דורש את זה,
// ובלי מנגנון ניחוש אמין (שם המשימה הוא טקסט חופשי) התוצאה הייתה
// ניחוש שגוי בשקט. הרשומה נכתבת תמיד עם type 'other' וכותרת המשימה
// כהערה, שזה בדיוק מה שהוא, "עבודה שנעשתה".

// כותב את רשומת היומן ומקשר את המשימה אליה, prd.md נספח א.3:
// tasks.created_log_id הוא קישור אופציונלי בכיוון הזה בלבד. הקישור
// הוא best-effort, לא חוסם: הרשומה עצמה כבר נכתבה בהצלחה.
export async function confirmJournalFromTask(
  supabase: SupabaseClient,
  farmId: string,
  task: Pick<Task, 'id' | 'title' | 'plotId'>,
): Promise<WriteOutcome> {
  const write = await supabase
    .from('log_entries')
    .insert({
      farm_id: farmId,
      plot_id: task.plotId,
      // The farmer's own calendar day, not the UTC one: he ticks the task off
      // at 22:00 and the entry belongs to the day he did the work.
      date: formatLocalDateOnly(new Date()),
      type: 'other',
      source: 'task',
      note: task.title,
    })
    .select('id');
  const outcome = writeOutcome(write);
  const logEntryId = (write.data as { id: string }[] | null)?.[0]?.id;
  if (outcome.ok && logEntryId) {
    // חייב await: PostgrestFilterBuilder הוא thenable עצל, לא Promise
    // נלהב, ובלי await או .then() השאילתה נבנית ואף פעם לא נשלחת.
    await supabase.from('tasks').update({ created_log_id: logEntryId }).eq('id', task.id);
  }
  return outcome;
}

// כותב את ההוצאה, מקשר את המשימה אליה (created_expense_id, אותו כלל
// כמו למעלה), וזוכר את הסכום לפי כותרת מנורמלת לפעם הבאה, prd.md
// סעיף 7: "בפעם הבאה שהוא פותח משימה עם אותה כותרת השדה כבר מלא".
// הזיכרון עצמו קורה כאן, בזמן האישור בסיום, לא ביצירת המשימה, לפי
// ההחלטה שכבר הביאה להסרת שדה העלות מ-TaskSheet.
export async function confirmExpenseFromTask(
  supabase: SupabaseClient,
  farmId: string,
  task: Pick<Task, 'id' | 'title'>,
  input: ExpenseInput,
): Promise<WriteOutcome> {
  const outcome = await createExpense(supabase, farmId, input);
  if (!outcome.ok) return outcome;

  void rememberTaskCost(supabase, farmId, task.title, input.amount);
  // חייב await, אותו כלל בדיוק כמו confirmJournalFromTask למעלה:
  // PostgrestFilterBuilder הוא thenable עצל, בלי await השאילתה נבנית
  // ואף פעם לא נשלחת. עכשיו ש-createExpense מחזיר את מזהה ההוצאה
  // (נדרש למסך ההוצאות המלא), הקישור נכתב כאן במקום להישאר פתוח.
  await supabase.from('tasks').update({ created_expense_id: outcome.id }).eq('id', task.id);
  return outcome;
}

// ============================================================
// מה להציג. שתי השאלות עצמאיות: כל אחת מוצגת רק אם המתג שלה דלוק
// בהגדרות. אם שתיהן כבויות, אין מה להציג בכלל.
//
// **Worker Mode, שלב 6, design.md:** "The expense half of the Completion
// Prompts never fires; the journal half still can." hideExpense כופה את
// חצי ההוצאה לכבוי בלי קשר למתג, כי worker חסום מכתיבת הוצאה במסד וכל
// שאלה כזו הייתה נגמרת ב"אין הרשאה". showPrompt נגזר מהתוצאה הסופית,
// כך שעובד שאצלו רק ההוצאה דלוקה בהגדרות לא יקבל גיליון ריק.
// ============================================================

export type CompletionPromptVisibility = {
  showJournal: boolean;
  showExpense: boolean;
  showPrompt: boolean;
};

export function completionPromptVisibility(
  journalPromptEnabled: boolean,
  expensePromptEnabled: boolean,
  hideExpense = false,
): CompletionPromptVisibility {
  const showExpense = expensePromptEnabled && !hideExpense;
  return {
    showJournal: journalPromptEnabled,
    showExpense,
    showPrompt: journalPromptEnabled || showExpense,
  };
}
