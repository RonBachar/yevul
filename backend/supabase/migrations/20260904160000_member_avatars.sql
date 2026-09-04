-- חקלאי רווחי, תמונות פרופיל לחברי המשק (אווטארים), שלב 6.
-- קורא מחדש: docs/prd.md סעיף 11, docs/design.md בלוק Sharing, Member Avatar.
--
-- design.md כתב "No photo uploads in V1"; היזם ביטל את ההחלטה הזו בכוונה
-- ואישר תמונות פרופיל. ההחלטות כאן כבר נקבעו, המיגרציה רק מיישמת:
--   1. באקט אחסון ציבורי בשם avatars. תמונת פרופיל אינה רגישה, ובאקט
--      ציבורי נותן URL פשוט ומאפשר לחברי המשק לראות את התמונה אחד של
--      השני בלי מנגנון signed-url. הנתיב חייב להיות {user_id}/....
--   2. טבלת profiles נפרדת שנושאת את avatar_path של כל משתמש. בכוונה
--      לא על farm_members: הטבלה ההיא ניתנת לעריכה בידי הבעלים בלבד,
--      ואילו כאן כל משתמש עורך את השורה שלו. אילו התמונה ישבה על
--      farm_members, מתן היתר לחבר לעדכן את שורתו היה פותח לו גם לשנות
--      את התפקיד של עצמו. ההפרדה היא בדיוק כדי למנוע את זה.
--   3. יצירה מחדש של farm_members_view עם עמודה נוספת avatar_path,
--      בצירוף שמאלי ל-profiles. מכיוון שהתצוגה היא security_invoker=false,
--      חברי המשק רואים את avatar_path אחד של השני למרות ש-RLS של profiles
--      הוא עצמי בלבד. זה מכוון, וזה מה שמזין את הרוסטר בתמונות של כולם.

-- ====================================================================
-- 1. באקט avatars, ציבורי, עם תקרת גודל ורשימת סוגי תמונה סגורה.
--
-- ציבורי (public=true), כך שהקריאה מוגשת דרך נקודת הקצה הציבורית בלי
-- מדיניות select על storage.objects. 8MB תואם לתקרת הקבלות, ורשימת ה-MIME
-- מצומצמת לתמונות בלבד (בלי PDF, בשונה מהקבלות), אותה תבנית כמו
-- 20260904060000_receipt_bucket_limits.sql.
-- ====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- כתיבה, עדכון ומחיקה מותרים רק כשהתיקייה הראשונה בנתיב היא המשתמש
-- עצמו. אותה צורה כמו receipts_storage_* ב-core_schema.sql, אבל לפי
-- תיקיית המשתמש ולא לפי תפקיד במשק. הבאקט ציבורי, ולכן אין צורך
-- במדיניות select לקריאה.
create policy "avatars_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ====================================================================
-- 2. טבלת profiles, שורה אחת לכל משתמש, נושאת את נתיב האווטאר.
--
-- RLS עצמי בלבד: משתמש רואה ועורך רק את השורה שלו. הרוסטר לא קורא מכאן,
-- הוא קורא דרך farm_members_view (למטה) שעוקפת RLS ולכן חושפת את
-- avatar_path של כל חברי המשק. כך חבר יכול לראות תמונה של חבר אחר בלי
-- להיות מסוגל לקרוא את שורת ה-profiles שלו ישירות.
-- ====================================================================

create table public.profiles (
  user_id uuid primary key references auth.users(id),
  avatar_path text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.profiles to authenticated;

-- ====================================================================
-- 3. farm_members_view מחדש, עם avatar_path.
--
-- ההגדרה זהה למיגרציה 20260904140000, בתוספת צירוף שמאלי ל-profiles
-- וחשיפת avatar_path. security_invoker=false נשמר (כדי לקרוא את
-- auth.users וגם את profiles מעבר ל-RLS), וה-WHERE מצמצם למשקי הקורא.
-- ====================================================================

drop view public.farm_members_view;

create view public.farm_members_view
with (security_invoker = false)
as
select
  m.id,
  m.farm_id,
  m.user_id,
  m.role,
  m.status,
  coalesce(u.email, m.invited_email) as email,
  coalesce(m.user_id = auth.uid(), false) as is_self,
  p.avatar_path,
  m.created_at
from public.farm_members m
left join auth.users u on u.id = m.user_id
left join public.profiles p on p.user_id = m.user_id
where m.farm_id in (select private.active_member_farm_ids())
  and m.deleted_at is null;

grant select on public.farm_members_view to authenticated;
