-- בדיקות הזמנת חברי משק, שלב 6, משימה 1.
-- מריצים עם: npx supabase test db --local --workdir backend
--
-- מכסה שלושה דברים שהמיגרציה 20260904140000 הוסיפה:
--   1. מוזמן שנכנס עם אימייל תואם מצורף למשק המזמין, לא מקבל משק ריק
--      משלו, וההשוואה אינה תלוית רישיות.
--   2. ניהול חברים (הזמנה, הסרה) הוא של הבעלים בלבד.
--   3. farm_members_view חושף אימייל ומצומצם למשקי הקורא.
-- רץ בטרנזקציה שמתבטלת (rollback) בסוף.

create extension if not exists pgtap;

begin;

select plan(15);

-- ====================================================================
-- הכנה, כל ההכנסות ל-auth.users רצות כ-postgres (הטריגר פועל בכל אחת).
-- שני בעלים, שני משקים אוטומטיים נפרדים.
-- ====================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-o@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-p@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');

create temp table fx (key text primary key, value uuid);
grant all on fx to authenticated;

insert into fx (key, value)
  select 'farm_o', farm_id from public.farm_members
    where user_id = '11111111-0000-0000-0000-000000000001' and deleted_at is null;
insert into fx (key, value)
  select 'farm_p', farm_id from public.farm_members
    where user_id = '11111111-0000-0000-0000-000000000002' and deleted_at is null;

-- הזמנות ממתינות במשק O (נכתבות כ-postgres, כאן לא בודקים את המדיניות
-- אלא את הטריגר). ה-manager מוזמן באימייל עם אותיות גדולות בכוונה, כדי
-- לבדוק צירוף לא תלוי רישיות.
insert into public.farm_members (farm_id, role, status, invited_email) values
  ((select value from fx where key = 'farm_o'), 'worker', 'invited', 'son@test.yevul'),
  ((select value from fx where key = 'farm_o'), 'manager', 'invited', 'Spouse@Test.Yevul');

-- עכשיו המוזמנים נכנסים לראשונה. הטריגר אמור לצרף אותם למשק O.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'son@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'spouse@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  -- משתמש בלי הזמנה, אמור לקבל משק משלו כרגיל
  ('00000000-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'noinvite@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');

-- ====================================================================
-- קבוצה 1, הטריגר צירף את המוזמן למשק המזמין (נבדק כ-postgres)
-- ====================================================================

select is(
  (select count(*)::int from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000003' and deleted_at is null),
  1,
  'son got exactly one membership, not the invite plus a personal farm'
);

select is(
  (select farm_id from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000003' and deleted_at is null),
  (select value from fx where key = 'farm_o'),
  'son is attached to the inviting farm, farm O'
);

select is(
  (select role from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000003' and deleted_at is null),
  'worker',
  'son keeps the role he was invited with'
);

select is(
  (select status from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000003' and deleted_at is null),
  'active',
  'the pending invite flipped to active on sign-in'
);

select is(
  (select count(*)::int from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000003' and role = 'owner' and deleted_at is null),
  0,
  'son did not get a personal owner farm'
);

-- ====================================================================
-- קבוצה 2, צירוף לא תלוי רישיות (הוזמן Spouse@Test, נכנס spouse@test)
-- ====================================================================

select is(
  (select role from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000004' and deleted_at is null),
  'manager',
  'spouse attached despite the invite email being mixed-case'
);

-- ====================================================================
-- קבוצה 3, משתמש בלי הזמנה עדיין מקבל משק משלו (רגרסיה על שלב 2)
-- ====================================================================

select is(
  (select role from public.farm_members
     where user_id = '11111111-0000-0000-0000-000000000005' and deleted_at is null),
  'owner',
  'a user with no matching invite still gets a personal farm as owner'
);

-- ====================================================================
-- קבוצה 4, farm_members_view, כ-owner_o (authenticated)
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', '11111111-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select email from public.farm_members_view
     where user_id = '11111111-0000-0000-0000-000000000003'),
  'son@test.yevul',
  'the view exposes an active member email from auth.users'
);

select is(
  (select count(*)::int from public.farm_members_view
     where farm_id = (select value from fx where key = 'farm_p')),
  0,
  'owner_o sees no members of farm P through the view'
);

-- ====================================================================
-- קבוצה 5, הזמנה היא של הבעלים בלבד
-- ====================================================================

select lives_ok(
  $$ insert into public.farm_members (farm_id, role, status, invited_email)
       values ((select value from fx where key = 'farm_o'), 'worker', 'invited', 'worker2@test.yevul') $$,
  'owner can create an invite'
);

select throws_ok(
  $$ insert into public.farm_members (farm_id, role, status, invited_email)
       values ((select value from fx where key = 'farm_o'), 'worker', 'invited', 'worker2@test.yevul') $$,
  '23505',
  null,
  'a duplicate pending invite for the same email is rejected'
);

-- כ-manager (spouse), הזמנה נדחית ברמת המדיניות
select set_config('request.jwt.claims', json_build_object('sub', '11111111-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.farm_members (farm_id, role, status, invited_email)
       values ((select value from fx where key = 'farm_o'), 'worker', 'invited', 'blocked@test.yevul') $$,
  '42501',
  null,
  'a manager cannot create an invite'
);

-- ====================================================================
-- קבוצה 6, הסרת חבר היא של הבעלים בלבד. UPDATE תחת USING שנכשל אינו
-- זורק, הוא מעדכן אפס שורות בשקט, ולכן בודקים את התוצאה ולא חריגה.
-- ====================================================================

-- manager מנסה למחוק רכות את son, ולא אמור להצליח
update public.farm_members
  set deleted_at = now()
  where user_id = '11111111-0000-0000-0000-000000000003'
    and farm_id = (select value from fx where key = 'farm_o');

select set_config('request.jwt.claims', json_build_object('sub', '11111111-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.farm_members_view
     where user_id = '11111111-0000-0000-0000-000000000003'),
  1,
  'the manager attempt did not remove son, he is still in the roster'
);

-- owner מוחק רכות את son
select lives_ok(
  $$ update public.farm_members
       set deleted_at = now()
       where user_id = '11111111-0000-0000-0000-000000000003'
         and farm_id = (select value from fx where key = 'farm_o') $$,
  'owner can soft-delete a member'
);

select is(
  (select count(*)::int from public.farm_members_view
     where user_id = '11111111-0000-0000-0000-000000000003'),
  0,
  'after the owner removes son, he is gone from the roster'
);

select * from finish();

rollback;
