import { useCallback, useEffect, useState } from 'react';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { currentFarmQuery } from './currentFarm';
import { writeOutcome, type WriteOutcome } from './postgrest';

// חברי משק, שלב 6, docs/roadmap.md, docs/prd.md סעיף 11.
//
// המסד עשה את רוב העבודה כבר בשלב 1: farm_members נושאת role/status/
// invited_email, וה-RLS מבוסס עליה. המיגרציה 20260904140000 הוסיפה את
// הצירוף האוטומטי בכניסה, את הידוק הניהול לבעלים בלבד, ואת
// farm_members_view שחושף אימייל לרוסטר בלי לפתוח את auth.users.
//
// הקוד כאן הוא הצד המשותף בלבד: קריאת הרוסטר, הזמנה, שינוי תפקיד,
// והסרה. הלקוח לא מחליט מי מורשה, ה-RLS מחליט. myRole מדווח מה השרת
// כבר יודע (דרך is_self בתצוגה), כדי שה-UI יראה את כלי הניהול לבעלים
// בלבד. זו נוחות תצוגה, לא הגנה: גם אם לקוח יציג אותם לכולם, השרת
// ידחה כל כתיבה שאינה של בעלים.

export type MemberRole = 'owner' | 'manager' | 'worker';
export type MemberStatus = 'invited' | 'active';

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
// רשימת החברים של המשק הנוכחי, יחד עם התפקיד של המשתמש המחובר בו.
// שני סבבים: איזה משק (currentFarm), ואז הרוסטר מהתצוגה. אותו דפוס
// כמו useExpenses.
// ============================================================

export type MembersState = {
  loading: boolean;
  failed: boolean;
  farmId: string | null;
  members: FarmMember[];
  myRole: MemberRole | null;
  refresh: () => void;
};

const MEMBER_COLUMNS = 'id, user_id, role, status, email, is_self, created_at';

export function useMembers(supabase: SupabaseClient): MembersState {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [members, setMembers] = useState<FarmMember[]>([]);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
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

      const { data, error } = await supabase
        .from('farm_members_view')
        .select(MEMBER_COLUMNS)
        .eq('farm_id', farm.id)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (error) {
        setFailed(true);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as MemberRow[];
      const mapped = rows.map(mapMember);
      setMembers(mapped);
      setMyRole(mapped.find((member) => member.isSelf)?.role ?? null);
      setFailed(false);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, tick]);

  return { loading, failed, farmId, members, myRole, refresh };
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
