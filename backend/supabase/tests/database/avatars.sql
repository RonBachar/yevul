-- בדיקות תמונות פרופיל (אווטארים), שלב 6.
-- מריצים עם: npx supabase test db --local --workdir backend
--
-- מכסה שני דברים שהמיגרציה 20260904160000 הוסיפה:
--   1. profiles הוא עצמי בלבד: משתמש כותב וקורא רק את השורה שלו, וזר
--      לא יכול לקרוא או לכתוב את שורת מישהו אחר.
--   2. farm_members_view חושף avatar_path לחבר משק אחר, למרות ש-RLS של
--      profiles הוא עצמי בלבד (התצוגה security_invoker=false ולכן עוקפת).
-- רץ בטרנזקציה שמתבטלת (rollback) בסוף.

create extension if not exists pgtap;

begin;

select plan(7);

-- ====================================================================
-- הכנה (כ-postgres, הטריגר פועל בכל הכנסה ל-auth.users).
-- בעלים A מקבל משק אוטומטי, מזמין עובד, העובד נכנס ומצורף, וזר מקבל
-- משק משלו.
-- ====================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');

create temp table fx (key text primary key, value uuid);
grant all on fx to authenticated;

insert into fx (key, value)
  select 'farm_a', farm_id from public.farm_members
    where user_id = '22222222-0000-0000-0000-000000000001' and deleted_at is null;

-- הזמנת עובד למשק A
insert into public.farm_members (farm_id, role, status, invited_email) values
  ((select value from fx where key = 'farm_a'), 'worker', 'invited', 'hand@test.yevul');

-- העובד נכנס לראשונה ומצורף למשק A; הזר נכנס ומקבל משק משלו
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'hand@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'stranger@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');

-- ====================================================================
-- קבוצה 1, המשתמש כותב וקורא את שורת ה-profiles שלו (כ-worker)
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', '22222222-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$ insert into public.profiles (user_id, avatar_path)
       values ('22222222-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003/avatar.jpg') $$,
  'a member can create their own profile row'
);

select is(
  (select avatar_path from public.profiles
     where user_id = '22222222-0000-0000-0000-000000000003'),
  '22222222-0000-0000-0000-000000000003/avatar.jpg',
  'the member reads back their own avatar path'
);

-- ====================================================================
-- קבוצה 2, חבר משק אחר רואה את avatar_path דרך התצוגה (כ-owner A)
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', '22222222-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is(
  (select avatar_path from public.farm_members_view
     where user_id = '22222222-0000-0000-0000-000000000003'),
  '22222222-0000-0000-0000-000000000003/avatar.jpg',
  'a co-member sees the avatar path through the view'
);

select is(
  (select avatar_path from public.farm_members_view
     where user_id = '22222222-0000-0000-0000-000000000001'),
  null,
  'a member with no profile row has a null avatar path in the view'
);

-- ====================================================================
-- קבוצה 3, profiles עצמי בלבד: owner לא קורא את שורת העובד ישירות,
-- לא מכניס שורה עבור מישהו אחר, ועדכון על שורה זרה לא משנה כלום.
-- ====================================================================

select is(
  (select count(*)::int from public.profiles
     where user_id = '22222222-0000-0000-0000-000000000003'),
  0,
  'a member cannot read another member profile row directly'
);

select throws_ok(
  $$ insert into public.profiles (user_id, avatar_path)
       values ('22222222-0000-0000-0000-000000000005', 'hack/avatar.jpg') $$,
  '42501',
  null,
  'a member cannot insert a profile row for someone else'
);

-- עדכון על שורה זרה: USING שנכשל מעדכן אפס שורות בשקט, ולכן בודקים דרך
-- התצוגה שהערך לא השתנה.
update public.profiles
  set avatar_path = 'hacked/avatar.jpg'
  where user_id = '22222222-0000-0000-0000-000000000003';

select is(
  (select avatar_path from public.farm_members_view
     where user_id = '22222222-0000-0000-0000-000000000003'),
  '22222222-0000-0000-0000-000000000003/avatar.jpg',
  'a member update on another profile row changes nothing'
);

select * from finish();

rollback;
