import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';

// התפקיד של המשתמש במשק, שלב 6, "מצב עובד". שלושת הערכים הם בדיוק
// אותם ערכים שאילוץ ה-CHECK על farm_members.role מתיר במסד, ולכן הם
// חיים כאן כמקור אחד גם לקליינט.
//
// **האכיפה האמיתית של Worker Mode יושבת במסד, לא כאן.** RLS חוסם את
// worker ברמת השורה מטבלאות הכסף, ו-crop_cycles_view/tasks_view ממסכים
// את עמודות הרווחיות ל-null. התפקיד נקרא כאן רק כדי לא להציג לעובד
// מעטפת כסף ריקה או אסורה מלכתחילה (טאב שהרשימה בו תמיד תהיה ריקה,
// שורת הוצאה בגיליון הרישום שתיכשל בשמירה), בדיוק החלוקה ש-design.md
// דורש: "Enforce it at the query layer, and let the UI render what it
// receives."
export type FarmRole = 'owner' | 'manager' | 'worker';

export type MyRoleState = {
  role: FarmRole | null;
  loading: boolean;
};

// שלוש שורות הרישום של גיליון ה-Capture, ואותם שלושה ערכים בדיוק כמו
// VoiceKind. הן משוכפלות כאן כטיפוס עצמאי כי החלטת המעטפת (אילו שורות
// עובד רואה) שייכת לכאן, לא לשכבת הקול.
export type CaptureKind = 'expense' | 'task' | 'journal';

// ארבעת טאבי מסך פרטי החלקה, בסדר שבו שני הלקוחות מרנדרים אותם.
export type PlotDetailTab = 'income' | 'expenses' | 'tasks' | 'journal';

const CAPTURE_KINDS_FULL: CaptureKind[] = ['expense', 'task', 'journal'];
const CAPTURE_KINDS_WORKER: CaptureKind[] = ['task', 'journal'];
const PLOT_DETAIL_TABS_FULL: PlotDetailTab[] = ['income', 'expenses', 'tasks', 'journal'];
const PLOT_DETAIL_TABS_WORKER: PlotDetailTab[] = ['tasks', 'journal'];

// כל החלטות מעטפת Worker Mode במקום אחד, טהור ובדיק. שני הלקוחות
// קוראים לזה עם התוצאה של useMyRole, ואף לקוח לא מקבל החלטת מעטפת
// בעצמו, בדיוק כמו שהפורמטרים והמדיניות האחרים חיים ב-packages/shared.
export type WorkerModeShell = {
  // התפקיד הוכרע בפועל כ-worker. שונה מ-"נסתיר כסף ליתר ביטחון", ראה
  // moneyHidden למטה: isWorker נכון רק כשידוע בוודאות שזה עובד.
  isWorker: boolean;
  // טאב/route הכסף וכרטיס הרווח במסך הבית.
  showMoney: boolean;
  // שורות גיליון הרישום. לעובד בלי "הוצאה".
  captureKinds: CaptureKind[];
  // טאבי מסך פרטי החלקה. לעובד רק "משימות" ו"יומן".
  plotDetailTabs: PlotDetailTab[];
  // חצי ההוצאה של Completion Prompts. חצי היומן נשאר גם לעובד.
  showExpenseCompletionPrompt: boolean;
};

// **טעינה, ותפקיד לא ידוע, נחשבים כעובד לצורך הסתרת הכסף.** זו ההנחיה
// המפורשת של המשימה: עובד לעולם לא רואה מסך כסף אפילו לפריים אחד לפני
// שהתפקיד ידוע. המחיר, ובחירה מודעת בו, הוא שבעל משק עלול לראות את
// המעטפת המצומצמת לרגע קצר עד שהתפקיד נטען, ובמקרה נדיר של כשל טעינת
// תפקיד יישאר במעטפת המצומצמת עד רענון. זה הכיוון הבטוח, וממילא ה-RLS
// חוסם את נתוני הכסף בפועל, כך שאין כאן דליפת מידע אלא רק מעטפת.
export function workerModeShell(role: FarmRole | null, loading: boolean): WorkerModeShell {
  const moneyHidden = loading || role === null || role === 'worker';
  return {
    isWorker: role === 'worker',
    showMoney: !moneyHidden,
    captureKinds: moneyHidden ? CAPTURE_KINDS_WORKER : CAPTURE_KINDS_FULL,
    plotDetailTabs: moneyHidden ? PLOT_DETAIL_TABS_WORKER : PLOT_DETAIL_TABS_FULL,
    showExpenseCompletionPrompt: !moneyHidden,
  };
}

// הוק קליל שמחזיר את התפקיד שלי במשק הנוכחי, בדיוק כמו useFarmEntitlement
// שמחזיר זכאות. מקבל את ה-client כפרמטר ולא מייבא אותו, כדי שיישאר חסר
// תלות בסביבה, ומשתמש ב-currentFarmQuery, אותו כלל בחירת משק כמו שאר
// ההוקים.
//
// **קוראים מ-farm_members ישירות ולא מ-view.** המשימה מתייחסת ל-
// farm_members_view, אבל הוא עדיין לא קיים: מסך ההזמנות (הפריט שלפני
// זה בשלב 6) עוד לא נבנה, ואיתו תשתית החברים. עד שהוא ייבנה, קוראים
// את הטבלה הבסיסית: מדיניות farm_members_select מתירה לכל חבר פעיל
// לקרוא את כל הרוסטר של המשק שלו, ומזהה המשתמש הנוכחי בורר את השורה
// "שלי". ברגע שיהיה view שחושף is_self, אפשר להחליף כאן בלבד.
export function useMyRole(supabase: SupabaseClient): MyRoleState {
  const [state, setState] = useState<MyRoleState>({ role: null, loading: true });

  useEffect(() => {
    let active = true;

    async function load() {
      // המשתמש והמשק במקביל: אחד לא תלוי בשני. getUser מאמת את הזהות
      // מול השרת, וזה בדיוק מזהה השורה שאנחנו מחפשים בין החברים.
      const [{ data: userData }, { data: farmData, error: farmError }] = await Promise.all([
        supabase.auth.getUser(),
        currentFarmQuery(supabase, 'id'),
      ]);

      if (!active) return;

      const uid = userData.user?.id ?? null;
      const farmId = (farmData as { id: string }[] | null)?.[0]?.id ?? null;
      if (farmError || !uid || !farmId) {
        setState({ role: null, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('farm_members')
        .select('role')
        .eq('farm_id', farmId)
        .eq('user_id', uid)
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1);

      if (!active) return;

      if (error) {
        setState({ role: null, loading: false });
        return;
      }

      const role = (data as { role: FarmRole }[] | null)?.[0]?.role ?? null;
      setState({ role, loading: false });
    }

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  return state;
}
