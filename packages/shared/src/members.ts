import { useCallback, useEffect, useState } from 'react';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { writeOutcome, type WriteOutcome } from './postgrest';
import { useLoadCount } from './refresh';

// חברי משק, שלב 6, docs/roadmap.md, docs/prd.md סעיף 11, docs/design.md
// בלוק Sharing. מקור אחד לכל מה שנוגע בחברי המשק בשני הלקוחות:
//   - קריאת הרוסטר (useMembers) דרך farm_members_view, שחושף גם אימייל
//     בלי לפתוח את auth.users.
//   - הזמנה, שינוי תפקיד, והסרה (בעלים בלבד, האכיפה ב-RLS).
//   - עוזרים טהורים לשיוך: אחראי לחלקה, משויך למשימה, ואווטאר בשורת
//     המשימה (ראשי תיבות מהאימייל).
//   - התפקיד שלי (useMyRole) והחלטות מעטפת "מצב עובד" (workerModeShell).
//
// המסד עשה את רוב העבודה כבר בשלב 1: farm_members נושאת role/status/
// invited_email, וה-RLS מבוסס עליה. המיגרציה 20260904140000 הוסיפה את
// הצירוף האוטומטי בכניסה, את הידוק הניהול לבעלים בלבד, ואת
// farm_members_view. הלקוח לא מחליט מי מורשה, ה-RLS מחליט; myRole ו-
// workerModeShell הם נוחות תצוגה בלבד, גם אם לקוח יתעלם מהם השרת חוסם.

export type MemberRole = 'owner' | 'manager' | 'worker';
export type MemberStatus = 'invited' | 'active';

// שם נרדף לתאימות: "מצב עובד" מדבר על תפקיד כ-FarmRole, השאר כ-MemberRole.
// אותו טיפוס בדיוק, שני שמות לפי ההקשר הקורא.
export type FarmRole = MemberRole;

// תפקיד שאפשר להזמין אליו או לשנות אליו. owner אינו כלול: אין העברת
// בעלות בגרסה הזו, הבעלים נקבע פעם אחת בהקמת המשק.
export type AssignableRole = 'manager' | 'worker';

export const ASSIGNABLE_ROLES: readonly AssignableRole[] = ['manager', 'worker'];

export function memberRoleLabelKey(role: MemberRole): string {
  return `members.role.${role}`;
}

export type FarmMember = {
  id: string;
  userId: string | null;
  role: MemberRole;
  status: MemberStatus;
  // האימייל של החבר: מ-auth.users לחבר פעיל, מ-invited_email להזמנה
  // ממתינה. יכול להיות null רק לבעלים שהקים משק בלי אימייל (תרחיש בדיקה).
  email: string | null;
  isSelf: boolean;
};

// שם נרדף למי שצורך רק את שדות הרוסטר (בוררי השיוך והאווטאר). אותו
// טיפוס כמו FarmMember; העוזרים למטה עובדים על שניהם.
export type Member = FarmMember;

// ============================================================
// עוזרים טהורים לשיוך אנשים (אחראי לחלקה, משויך למשימה, אווטאר).
// ============================================================

// ראשי תיבות מהחלק שלפני ה-@ באימייל, שני התווים הראשונים באותיות
// גדולות. מפרידים נפוצים (נקודה, פלוס, קו תחתון, מקף) מוסרים תחילה,
// כך ש-"avi.cohen@x.com" נותן "AV" ולא "AV." או "A.". מחזיר מחרוזת
// ריקה כשאין אימייל, וקורא ה-avatar מתייחס לריקה כ"אין מה להציג".
// design.md, Member Avatar: "Initials come from the assignee's email
// local-part (first 1-2 chars, uppercased)".
export function memberInitials(email: string | null | undefined): string {
  if (!email) return '';
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[._+\-\s]/g, '');
  return cleaned.slice(0, 2).toUpperCase();
}

// רק חבר פעיל עם מזהה משתמש אמיתי ניתן להצבה כאחראי חלקה או כמשויך
// למשימה. חבר שהוזמן ועדיין לא נכנס (user_id הוא null) אינו יכול
// להיות הבעלים של שום דבר, וחבר שנמחק כבר לא במשק.
export function assignableMembers(members: Member[]): Member[] {
  return members.filter((member) => member.status === 'active' && member.userId != null);
}

// מיפוי מזהה משתמש לחבר, כדי ששורת המשימה תפתור את assigned_to בלי
// שאילתה נוספת לכל שורה. הרוסטר נטען פעם אחת ללוח, ראה TaskBoard.
export function membersByUserId(members: Member[]): Map<string, Member> {
  const map = new Map<string, Member>();
  for (const member of members) {
    if (member.userId) map.set(member.userId, member);
  }
  return map;
}

// החבר שהוא המשתמש המחובר, כדי לגזור ממנו את התפקיד ולזהות "משויך אליי".
export function currentMember(members: Member[], currentUserId: string | null): Member | null {
  if (!currentUserId) return null;
  return members.find((member) => member.userId === currentUserId) ?? null;
}

// מה שאווטאר החבר בשורת המשימה צריך: ראשי התיבות של המשויך והתווית
// המלאה (אימייל) לנגישות. design.md, Member Avatar: מוצג "only when a
// task is assigned to someone other than the current user", כי "assigned
// to me" הוא ברירת המחדל והצגתו היא רעש. מחזיר null גם כשאין שיוך, גם
// כשהשיוך הוא למשתמש המחובר, וגם כשהמשויך לא נמצא ברוסטר (עזב את המשק).
export type TaskAssignee = { initials: string; label: string };

export function taskAssignee(
  assignedTo: string | null,
  currentUserId: string | null,
  byUserId: Map<string, Member>,
): TaskAssignee | null {
  if (!assignedTo || assignedTo === currentUserId) return null;
  const member = byUserId.get(assignedTo);
  if (!member) return null;
  const initials = memberInitials(member.email);
  if (!initials) return null;
  return { initials, label: member.email ?? initials };
}

// ============================================================
// "מצב עובד", החלטות מעטפת טהורות. design.md, Worker Mode: עובד רואה
// משימות, חלקות ויומן, בלי כסף בשום מקום. האכיפה האמיתית ב-RLS ובמיסוך
// crop_cycles_view/tasks_view; זה רק מונע להציג לעובד מעטפת כסף ריקה
// או אסורה מלכתחילה. "Enforce it at the query layer, and let the UI
// render what it receives."
// ============================================================

export type MyRoleState = {
  role: FarmRole | null;
  loading: boolean;
};

// שלוש שורות הרישום של גיליון ה-Capture, ואותם שלושה ערכים בדיוק כמו
// VoiceKind. הן טיפוס עצמאי כי החלטת המעטפת (אילו שורות עובד רואה)
// שייכת לכאן, לא לשכבת הקול.
export type CaptureKind = 'expense' | 'task' | 'journal';

// ארבעת טאבי מסך פרטי החלקה, בסדר שבו שני הלקוחות מרנדרים אותם.
export type PlotDetailTab = 'income' | 'expenses' | 'tasks' | 'journal';

const CAPTURE_KINDS_FULL: CaptureKind[] = ['expense', 'task', 'journal'];
const CAPTURE_KINDS_WORKER: CaptureKind[] = ['task', 'journal'];
const PLOT_DETAIL_TABS_FULL: PlotDetailTab[] = ['income', 'expenses', 'tasks', 'journal'];
const PLOT_DETAIL_TABS_WORKER: PlotDetailTab[] = ['tasks', 'journal'];

export type WorkerModeShell = {
  // התפקיד הוכרע בפועל כ-worker. שונה מ"נסתיר כסף ליתר ביטחון": isWorker
  // נכון רק כשידוע בוודאות שזה עובד.
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

// **טעינה, ותפקיד לא ידוע, נחשבים כעובד לצורך הסתרת הכסף.** עובד לעולם
// לא רואה מסך כסף אפילו לפריים אחד. המחיר: בעל משק עלול לראות מעטפת
// מצומצמת לרגע עד שהתפקיד נטען. זה הכיוון הבטוח, וממילא ה-RLS חוסם את
// נתוני הכסף, כך שאין דליפת מידע אלא רק מעטפת.
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

// ============================================================
// נירמול ואימות אימייל. טהור וניתן לבדיקה. הנירמול חייב להיות זהה לזה
// של המסד: הטריגר משווה lower(invited_email) = lower(new.email), והאינדקס
// הייחודי על הזמנה ממתינה גם הוא על lower(invited_email). כותבים אימייל
// מנורמל כדי ששניהם יסכימו, ולא נשענים על רישיות שהמשתמש הקליד.
// ============================================================

export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// בדיקה בסיסית בכוונה, לחוויית משתמש בלבד (שדה ריק או ללא @). האמת על
// אם האימייל אמיתי מתבררת רק כשאותו אדם מתחבר איתו בפועל, ולכן אין טעם
// בביטוי רגולרי מחמיר שידחה כתובות תקינות נדירות.
export function isValidInviteEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length < 3) return false;
  const at = trimmed.indexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return false;
  if (trimmed.includes(' ')) return false;
  return true;
}

// ============================================================
// רשימת החברים של המשק הנוכחי, עם התפקיד של המשתמש המחובר בו ומזההו.
// שני סבבים: איזה משק (currentFarm), ואז הרוסטר מהתצוגה. אותו דפוס
// כמו useExpenses. מזין גם את מסך ניהול החברים (myRole), גם את בוררי
// השיוך והאווטאר (members + currentUserId).
// ============================================================

const MEMBER_COLUMNS = 'id, user_id, role, status, email, is_self, created_at';

type MemberRow = {
  id: string;
  user_id: string | null;
  role: MemberRole;
  status: MemberStatus;
  email: string | null;
  is_self: boolean;
};

function mapMember(row: MemberRow): FarmMember {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    email: row.email,
    isSelf: row.is_self,
  };
}

export type MembersState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  members: FarmMember[];
  myRole: MemberRole | null;
  // המשתמש המחובר, נגזר משורת is_self, כדי שבוררי השיוך יזהו "אני".
  currentUserId: string | null;
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts.
  loadCount: number;
};

export function useMembers(supabase: SupabaseClient): MembersState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [members, setMembers] = useState<FarmMember[]>([]);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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

      const { data, error } = await supabase
        .from('farm_members_view')
        .select(MEMBER_COLUMNS)
        .eq('farm_id', farm.id)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const rows = (data ?? []) as MemberRow[];
      const mapped = rows.map(mapMember);
      // המשתמש המחובר והתפקיד שלו נגזרים משורת is_self של התצוגה, בלי
      // getUser נוסף: is_self מחושב במסד לפי auth.uid().
      const self = mapped.find((member) => member.isSelf) ?? null;
      setMembers(mapped);
      setMyRole(self?.role ?? null);
      setCurrentUserId(self?.userId ?? null);
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, tick, settle]);

  return { loading, failed, farmId, members, myRole, currentUserId, refresh, loadCount };
}

// הוק קליל שמחזיר רק את התפקיד שלי במשק הנוכחי, למעטפת "מצב עובד",
// בלי לטעון את כל הרוסטר. אותו דפוס כמו useFarmEntitlement.
//
// **קורא מ-farm_members_view ולוקח את שורת is_self.** התצוגה מסננת
// למשקים של הקורא ומסמנת את השורה שלי, כך שזה גם המקור של useMembers,
// בלי קוד קריאה שני.
export function useMyRole(supabase: SupabaseClient): MyRoleState {
  const [state, setState] = useState<MyRoleState>({ role: null, loading: true });

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: farmRows, error: farmError } = await currentFarmQuery(supabase, 'id');
      const farm = (farmRows as { id: string }[] | null)?.[0];
      if (!active) return;
      if (farmError || !farm) {
        setState({ role: null, loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('farm_members_view')
        .select('role, is_self')
        .eq('farm_id', farm.id);

      if (!active) return;
      if (error) {
        setState({ role: null, loading: false });
        return;
      }

      const rows = (data as { role: FarmRole; is_self: boolean }[] | null) ?? [];
      const role = rows.find((row) => row.is_self)?.role ?? null;
      setState({ role, loading: false });
    }

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  return state;
}

// ============================================================
// הזמנה. מוסיף שורת invited עם אימייל מנורמל. הכתיבה ישירה על הטבלה
// הבסיסית תחת RLS (בעלים בלבד), הקריאה דרך התצוגה. INSERT שנחסם ב-RLS
// כן זורק (בניגוד ל-UPDATE), ולכן כאן מבחינים בין הסיבות דרך קוד השגיאה:
// 23505 הזמנה כפולה, 42501 אין הרשאה.
// ============================================================

export type InviteResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalidEmail' | 'duplicate' | 'forbidden' | 'error' };

function inviteFailure(error: PostgrestError): InviteResult {
  if (error.code === '23505') return { ok: false, reason: 'duplicate' };
  if (error.code === '42501') return { ok: false, reason: 'forbidden' };
  return { ok: false, reason: 'error' };
}

export async function inviteMember(
  supabase: SupabaseClient,
  farmId: string,
  email: string,
  role: AssignableRole,
): Promise<InviteResult> {
  if (!isValidInviteEmail(email)) return { ok: false, reason: 'invalidEmail' };

  const write = await supabase
    .from('farm_members')
    .insert({
      farm_id: farmId,
      role,
      status: 'invited',
      invited_email: normalizeInviteEmail(email),
    })
    .select('id');

  if (write.error) return inviteFailure(write.error);
  const id = (write.data as { id: string }[] | null)?.[0]?.id;
  if (!id) return { ok: false, reason: 'error' };
  return { ok: true, id };
}

// שינוי תפקיד והסרה. שניהם UPDATE, ולכן דחיית RLS מחזירה אפס שורות
// בשקט ולא שגיאה, וזה בדיוק מה ש-writeOutcome מתרגם ל-forbidden.
// הסרה היא מחיקה רכה (deleted_at), כמו כל מחיקה במוצר.

export async function updateMemberRole(
  supabase: SupabaseClient,
  memberId: string,
  role: AssignableRole,
): Promise<WriteOutcome> {
  const write = await supabase
    .from('farm_members')
    .update({ role })
    .eq('id', memberId)
    .select('id');
  return writeOutcome(write);
}

export async function removeMember(
  supabase: SupabaseClient,
  memberId: string,
): Promise<WriteOutcome> {
  const write = await supabase
    .from('farm_members')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', memberId)
    .select('id');
  return writeOutcome(write);
}
