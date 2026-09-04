import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { useLoadCount } from './refresh';

// רוסטר חברי המשק, שלב 6, שיתוף המשק. שני הלקוחות טוענים את הרשימה
// דרך useMembers כאן ולא מעתיקים את השאילתה, אותה גישה בדיוק כמו
// plots.ts ו-tasks.ts. הרשימה מזינה שני צרכנים: בורר האחראי לחלקה
// (owner/manager בלבד) ובורר המשויך למשימה, ובנוסף אווטאר החבר בשורת
// המשימה שממפה assigned_to (מזהה משתמש) לראשי תיבות.
//
// **הקריאה עוברת דרך farm_members_view ולא דרך הטבלה.** ה-view חושף גם
// את האימייל של המשתמש (auth.users לא נגיש ישירות ללקוח), וממנו נגזרות
// ראשי התיבות. ה-view והמיגרציה שלו הם חלק ממשימת הזמנות חברי המשק
// (שלב 6, בולט ראשון), ולא ממשימה זו.

export type MemberRole = 'owner' | 'manager' | 'worker';
export type MemberStatus = 'invited' | 'active';

// רק את השדות שהפיצ'ר הזה קורא בפועל. farm_members_view חושף מזהה
// חברות, מזהה משתמש (null לחבר שהוזמן ועדיין לא נכנס), תפקיד, סטטוס,
// ואימייל.
export type Member = {
  id: string;
  userId: string | null;
  role: MemberRole;
  status: MemberStatus;
  email: string | null;
};

// ============================================================
// לוגיקה טהורה. design.md, Member Avatar: "Initials come from the
// assignee's email local-part (first 1-2 chars, uppercased)".
// ============================================================

// ראשי תיבות מהחלק שלפני ה-@ באימייל, שני התווים הראשונים באותיות
// גדולות. מפרידים נפוצים (נקודה, פלוס, קו תחתון, מקף) מוסרים תחילה,
// כך ש-"avi.cohen@x.com" נותן "AV" ולא "AV." או "A.". מחזיר מחרוזת
// ריקה כשאין אימייל, וקורא ה-avatar מתייחס לריקה כ"אין מה להציג".
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

// החבר שהוא המשתמש המחובר, כדי לגזור ממנו את התפקיד (בורר האחראי הוא
// owner/manager בלבד) ולזהות "משויך אליי" באווטאר.
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
// טעינת הרוסטר.
// ============================================================

const MEMBER_COLUMNS = 'id, user_id, role, status, email';

type MemberViewRow = {
  id: string;
  user_id: string | null;
  role: MemberRole;
  status: MemberStatus;
  email: string | null;
};

function mapMember(row: MemberViewRow): Member {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    email: row.email,
  };
}

export type MembersState = {
  loading: boolean;
  failed: boolean;
  members: Member[];
  // המשתמש המחובר, כדי שהצרכנים יזהו "אני" בלי שאילתה שנייה משלהם.
  currentUserId: string | null;
  refresh: () => void;
  // Completed loads, for pull-to-refresh. See refresh.ts.
  loadCount: number;
};

export function useMembers(supabase: SupabaseClient): MembersState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
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

      const [membersResult, userResult] = await Promise.all([
        supabase.from('farm_members_view').select(MEMBER_COLUMNS).eq('farm_id', farm.id),
        supabase.auth.getUser(),
      ]);

      if (!active) return;
      if (membersResult.error) {
        setFailed(true);
        setLoading(false);
        settle();
        return;
      }

      const rows = (membersResult.data ?? []) as MemberViewRow[];
      setMembers(rows.map(mapMember));
      setCurrentUserId(userResult.data?.user?.id ?? null);
      setFailed(false);
      setLoading(false);
      settle();
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, tick, settle]);

  return { loading, failed, members, currentUserId, refresh, loadCount };
}
