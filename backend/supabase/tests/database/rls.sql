-- בדיקות RLS אוטומטיות, שלב 1.
-- מריצים עם: npx supabase test db --local --workdir backend
--
-- מכסה שלושה דפוסים: הרשאה כללית לפי חברות (plots), חסימת תפקיד
-- worker מטבלאות כסף ברמת השורה (expenses), ומיסוך עמודות רווחיות
-- בתוך טבלה תפעולית (crop_cycles_view, tasks_view). כל זה רץ בתוך
-- טרנזקציה אחת שמתבטלת (rollback) בסוף, לא נוגע בנתוני seed.

create extension if not exists pgtap;

begin;

select plan(28);

-- ====================================================================
-- הכנה, חמישה משתמשי בדיקה, שני משקים נפרדים
-- ====================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'manager-a@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'worker-a@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-b@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'stranger@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');

create temp table fixture (key text primary key, value uuid);
grant all on fixture to authenticated;

-- מזהי המשתמשים קבועים, לא צריך fixture בשבילם
-- aaaaaaaa...0001 = owner_a, ...0002 = manager_a, ...0003 = worker_a
-- bbbbbbbb...0001 = owner_b, cccccccc...0001 = stranger, בלי שום משק

-- --- משק א, כ-owner_a ---
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_farm_id uuid;
  v_plot_id uuid;
  v_cc_id uuid;
begin
  v_farm_id := public.create_farm('משק בדיקה א');
  insert into fixture (key, value) values ('farm_a', v_farm_id);

  insert into public.farm_members (farm_id, user_id, role, status)
    values
      (v_farm_id, 'aaaaaaaa-0000-0000-0000-000000000002', 'manager', 'active'),
      (v_farm_id, 'aaaaaaaa-0000-0000-0000-000000000003', 'worker', 'active');

  insert into public.plots (farm_id, name, area, area_unit) values (v_farm_id, 'חלקה א', 10, 'dunam')
    returning id into v_plot_id;
  insert into fixture (key, value) values ('plot_a', v_plot_id);

  v_cc_id := gen_random_uuid();
  insert into public.crop_cycles (id, farm_id, plot_id, name, expected_yield_per_area, expected_price_per_unit)
    values (v_cc_id, v_farm_id, v_plot_id, 'עגבניות', 850, 3.2);
  insert into fixture (key, value) values ('crop_cycle_a', v_cc_id);

  insert into public.expenses (farm_id, amount, category, date) values (v_farm_id, 500, 'דשן', current_date);

  insert into public.log_entries (farm_id, plot_id, date, type, source, spray_pest, spray_phi_days)
    values (v_farm_id, v_plot_id, current_date, 'spray', 'manual', 'כנימה', 7);
end $$;

-- --- משק ב, כ-owner_b, לבדיקת בידוד בין שוכרים ---
select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
declare v_farm_b uuid;
begin
  v_farm_b := public.create_farm('משק בדיקה ב');
  insert into fixture (key, value) values ('farm_b', v_farm_b);
end $$;

-- ====================================================================
-- קבוצה 1, בידוד בין משקים, owner_b לא רואה כלום ממשק א
-- ====================================================================

select is(
  (select count(*)::int from public.plots where farm_id = (select value from fixture where key = 'farm_a')),
  0,
  'owner_b sees zero plots from farm A'
);

-- ====================================================================
-- קבוצה 2, טבלה תפעולית כללית (plots), כל חבר פעיל רואה
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.plots where farm_id = (select value from fixture where key = 'farm_a')), 1, 'owner_a sees the plot');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.plots where farm_id = (select value from fixture where key = 'farm_a')), 1, 'manager_a sees the plot');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.plots where farm_id = (select value from fixture where key = 'farm_a')), 1, 'worker_a sees the plot');

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.plots where farm_id = (select value from fixture where key = 'farm_a')), 0, 'stranger sees zero plots, not a member at all');

-- ====================================================================
-- קבוצה 3, טבלת כסף (expenses), worker חסום ברמת השורה, לא רק ה-UI
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.expenses where farm_id = (select value from fixture where key = 'farm_a')), 1, 'owner_a sees the expense');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.expenses where farm_id = (select value from fixture where key = 'farm_a')), 1, 'manager_a sees the expense');

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.expenses where farm_id = (select value from fixture where key = 'farm_a')), 0, 'worker_a sees zero expenses, blocked at the database, not just the UI');

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.expenses where farm_id = (select value from fixture where key = 'farm_a')), 0, 'stranger sees zero expenses');

-- ====================================================================
-- קבוצה 4, crop_cycles_view, מיסוך עמודות רווחיות מ-worker, שאר
-- העמודות נשארות גלויות
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select expected_yield_per_area from public.crop_cycles_view where id = (select value from fixture where key = 'crop_cycle_a')),
  850::numeric,
  'owner_a sees the real forecast yield'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select expected_yield_per_area from public.crop_cycles_view where id = (select value from fixture where key = 'crop_cycle_a')),
  null::numeric,
  'worker_a sees a masked (null) forecast yield'
);
select is(
  (select expected_price_per_unit from public.crop_cycles_view where id = (select value from fixture where key = 'crop_cycle_a')),
  null::numeric,
  'worker_a sees a masked (null) forecast price'
);
select is(
  (select name from public.crop_cycles_view where id = (select value from fixture where key = 'crop_cycle_a')),
  'עגבניות',
  'worker_a still sees the crop name, only the two forecast columns are masked'
);

-- direct base-table SELECT is blocked for everyone, even the owner, must use the view
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from public.crop_cycles limit 1 $$,
  '42501',
  null,
  'direct SELECT on the crop_cycles base table is denied, even for the owner'
);

-- ====================================================================
-- קבוצה 5, tasks_view, אותו עיקרון על estimated_cost, וגם על כתיבה
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into public.tasks (farm_id, plot_id, title, estimated_cost)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), 'ריסוס', 300) $$,
  'owner_a can create a task with a cost estimate'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ insert into public.tasks (farm_id, plot_id, title, estimated_cost)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), 'ריסוס עובד', 100) $$,
  '42501',
  null,
  'worker_a cannot write a non-null estimated_cost, not just read one'
);
select lives_ok(
  $$ insert into public.tasks (farm_id, plot_id, title)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), 'ריסוס עובד בלי עלות') $$,
  'worker_a can still create a task as long as estimated_cost stays null'
);
select is(
  (select estimated_cost from public.tasks_view where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס' limit 1),
  null::numeric,
  'worker_a sees a masked (null) estimated_cost on a task owner_a priced'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select estimated_cost from public.tasks_view where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס' limit 1),
  300::numeric,
  'owner_a sees the real estimated_cost'
);

-- ====================================================================
-- קבוצה 6, מחיקה רכה. החלטה מתועדת: ה-RLS לא מסנן deleted_at, הוא רק
-- גבול משק ותפקיד. השורה נשארת גלויה בקריאה ישירה על הטבלה הבסיסית,
-- הסינון של מחוקים קורה בשכבת ה-views ובקוד הלקוח. כאן מוודאים ששני
-- הדברים נכונים, שהמחיקה הרכה עצמה מצליחה, ושהעמודה אכן התעדכנה.
-- ====================================================================

select lives_ok(
  $$ update public.plots set deleted_at = now() where id = (select value from fixture where key = 'plot_a') $$,
  'owner_a can soft-delete the plot (RLS does not block the update)'
);
select isnt(
  (select deleted_at from public.plots where id = (select value from fixture where key = 'plot_a')),
  null,
  'the soft-deleted plot still resolves via direct base-table select, with deleted_at now set (filtering is a query-layer concern)'
);

-- ====================================================================
-- קבוצה 7, farm_members, כל חבר פעיל רואה את הרוסטר, זר לא רואה כלום
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.farm_members where farm_id = (select value from fixture where key = 'farm_a')),
  3,
  'manager_a sees all three members of farm A'
);

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.farm_members where farm_id = (select value from fixture where key = 'farm_a')),
  0,
  'stranger sees zero farm_members rows for farm A'
);

-- ====================================================================
-- קבוצה 8, subscriptions, כל חבר פעיל רואה, זר לא
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select isnt_empty(
  $$ select 1 from public.subscriptions where farm_id = (select value from fixture where key = 'farm_a') $$,
  'worker_a can read the farm subscription/entitlement status, that is not money data'
);

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from public.subscriptions where farm_id = (select value from fixture where key = 'farm_a') $$,
  'stranger cannot read farm A subscription'
);

-- ====================================================================
-- קבוצה 9, רגרסיה, worker לא רואה שורות כסף בכלל, מחוקות או לא. מוודא
-- שהסרת deleted_at ממדיניות ה-SELECT לא שברה בטעות את חסימת הכסף
-- שכבר סגרנו בקבוצה 3. owner מוחק רכות את ההוצאה, ואז worker עדיין
-- סופר אפס, כי הגבול שלו הוא תפקיד, לגמרי בלתי תלוי ב-deleted_at.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ update public.expenses set deleted_at = now() where farm_id = (select value from fixture where key = 'farm_a') $$,
  'owner_a can soft-delete the expense'
);
select is(
  (select count(*)::int from public.expenses where farm_id = (select value from fixture where key = 'farm_a')),
  1,
  'owner_a still resolves the soft-deleted expense via direct select (query layer filters it, not RLS)'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.expenses where farm_id = (select value from fixture where key = 'farm_a')),
  0,
  'worker_a still sees zero expenses after the soft-delete, money stays role-gated regardless of deleted_at'
);

select * from finish();

rollback;
