-- בדיקות RLS אוטומטיות, שלב 1.
-- מריצים עם: npx supabase test db --local --workdir backend
--
-- מכסה שלושה דפוסים: הרשאה כללית לפי חברות (plots), חסימת תפקיד
-- worker מטבלאות כסף ברמת השורה (expenses), ומיסוך עמודות רווחיות
-- בתוך טבלה תפעולית (crop_cycles_view, tasks_view). כל זה רץ בתוך
-- טרנזקציה אחת שמתבטלת (rollback) בסוף, לא נוגע בנתוני seed.

create extension if not exists pgtap;

begin;

select plan(75);

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
-- bbbbbbbb...0001 = owner_b, cccccccc...0001 = stranger
--
-- הערה, שלב 2: הטריגר on_auth_user_created (ראה המיגרציה
-- 20260820130000) יוצר אוטומטית משק לכל אחד מחמשת המשתמשים כבר
-- בהכנסה ל-auth.users למעלה, לפני שהבדיקות למטה קוראות ל-create_farm()
-- באופן מפורש. כלומר owner_a ו-owner_b מחזיקים בפועל בשני משקים כל
-- אחד (המשק האוטומטי + המשק שנוצר כאן), וגם stranger מחזיק במשק
-- אוטומטי משלו, לא "בלי שום משק" כפי שהיה נכון לפני שלב 2. זה לא שובר
-- אף בדיקה כאן כי כל הבדיקות מסננות לפי farm_id ספציפי מה-fixture
-- (farm_a/farm_b), לא סופרות "כל המשקים של המשתמש". בדיקה עתידית
-- שכן סופרת משקים לפי משתמש חייבת לקחת את זה בחשבון.

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

-- ====================================================================
-- קבוצה 10, כתיבה על crop_cycles, כולל שני עמודות הרווחיות. Postgres
-- דורש הרשאת SELECT כדי לאכוף מדיניות UPDATE (ה-USING clause הוא בעצם
-- בדיקת נראות), לא רק UPDATE. ה-REVOKE הגורף שהיה כאן קודם חסם לכן גם
-- PATCH לגיטימי מ-owner/manager, PostgREST החזיר 42501. נתפס תוך כדי
-- בדיקה ידנית בדפדפן בשלב 3, לא כאן, ולכן התווסף כאן עכשיו.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.crop_cycles set name = 'עגבניות שרי', season = '2027' where id = (select value from fixture where key = 'crop_cycle_a') $$,
  'owner_a can update crop_cycles name/season'
);

select lives_ok(
  $$ update public.crop_cycles set expected_yield_per_area = 900, expected_price_per_unit = 3.5, forecast_updated_at = now() where id = (select value from fixture where key = 'crop_cycle_a') $$,
  'owner_a can update the forecast columns themselves, the exact write that used to 403'
);
select is(
  (select expected_yield_per_area from public.crop_cycles_view where id = (select value from fixture where key = 'crop_cycle_a')),
  900::numeric,
  'the forecast update actually persisted, not just a silent no-op'
);

-- direct column-level select on a masked column throws even for the
-- owner, same principle as the star-select in group 4, at column
-- granularity this time, to prove the column grant is precise and not
-- an accidental full-table grant that would also unmask workers.
select throws_ok(
  $$ select expected_yield_per_area from public.crop_cycles limit 1 $$,
  '42501',
  null,
  'direct column-level SELECT on a masked crop_cycles column is denied, even for the owner'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ update public.crop_cycles set name = 'לא אמור לעבוד' where id = (select value from fixture where key = 'crop_cycle_a') $$,
  'worker_a UPDATE does not error (RLS USING silently matches zero rows, not a thrown exception)'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select name from public.crop_cycles_view where id = (select value from fixture where key = 'crop_cycle_a')),
  'עגבניות שרי',
  'worker_a''s update above touched zero rows, the name owner_a set is still there'
);

-- ====================================================================
-- קבוצה 11, כתיבה (UPDATE) על tasks, אותו פער בדיוק כמו קבוצה 10 על
-- crop_cycles. השלמה כאירוע, snooze וארכוב הם כולם UPDATE, וכולם היו
-- נכשלים בשקט (אפס שורות מושפעות) לפני 20260824090000.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.tasks set completed_at = now(), completed_by = 'aaaaaaaa-0000-0000-0000-000000000001'
     where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס' $$,
  'owner_a can complete a task, the exact write that used to 403'
);
select is(
  (select completed_at is not null from public.tasks_view where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס'),
  true,
  'the completion actually persisted, not just a silent no-op'
);

select lives_ok(
  $$ update public.tasks set snoozed_until = current_date + 7, snooze_count = snooze_count + 1
     where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות' $$,
  'owner_a can snooze a task'
);
select is(
  (select snooze_count from public.tasks_view where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות'),
  1,
  'the snooze count actually persisted'
);

select lives_ok(
  $$ update public.tasks set archived_at = now()
     where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות' $$,
  'owner_a can archive a task'
);
select is(
  (select archived_at is not null from public.tasks_view where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות'),
  true,
  'the archive actually persisted'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ update public.tasks set completed_at = now(), completed_by = 'aaaaaaaa-0000-0000-0000-000000000003'
     where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות' $$,
  'worker_a can complete a task too, tasks are not role-gated at the row level, only estimated_cost is'
);

select throws_ok(
  $$ update public.tasks set estimated_cost = 999 where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס' $$,
  '42501',
  null,
  'worker_a still cannot write a non-null estimated_cost via UPDATE, same as INSERT'
);

-- deleteTask, בקשת חקלאי: מחיקה אמיתית (soft), לא סתם השלמה. אותו UPDATE
-- כמו completed_at/snoozed_until/archived_at למעלה, ולכן צריך לעבור באותו
-- פער בדיוק, deleted_at כבר בעמודות ה-SELECT שהוענקו ב-20260824090000.
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ update public.tasks set deleted_at = now()
     where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות' $$,
  'owner_a can soft-delete a task'
);
select is(
  (select count(*)::int from public.tasks_view where farm_id = (select value from fixture where key = 'farm_a') and title = 'ריסוס עובד בלי עלות'),
  0,
  'the soft-deleted task no longer resolves via tasks_view, filtering is a query-layer concern (same rule as group 6)'
);

-- ====================================================================
-- קבוצה 12, task_cost_memory. לא עבר את ה-REVOKE הגורף שתפס את
-- crop_cycles ו-tasks (core_schema.sql מעניק SELECT מלא מלכתחילה), כי
-- הטבלה כולה כסף וחסומה ל-worker ברמת השורה, לא ממוסכת בעמודות. אין
-- כאן פער מקביל, הבדיקה כאן היא הכיסוי הראשון לטבלה הזו בכלל.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.task_cost_memory (farm_id, title_normalized, last_cost)
     values ((select value from fixture where key = 'farm_a'), 'ריסוס עשבייה', 300) $$,
  'owner_a can remember a task cost'
);

select lives_ok(
  $$ insert into public.task_cost_memory (farm_id, title_normalized, last_cost)
     values ((select value from fixture where key = 'farm_a'), 'ריסוס עשבייה', 350)
     on conflict (farm_id, title_normalized) do update set last_cost = excluded.last_cost $$,
  'upsert on the same normalized title updates in place, does not throw on the unique constraint'
);
select is(
  (select last_cost from public.task_cost_memory where farm_id = (select value from fixture where key = 'farm_a') and title_normalized = 'ריסוס עשבייה'),
  350::numeric,
  'the upsert kept exactly one row and the newer cost, not two rows'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.task_cost_memory where farm_id = (select value from fixture where key = 'farm_a')),
  0,
  'worker_a sees zero remembered costs, blocked at the row level like expenses'
);
select throws_ok(
  $$ insert into public.task_cost_memory (farm_id, title_normalized, last_cost)
     values ((select value from fixture where key = 'farm_a'), 'ריסוס עובד', 100) $$,
  '42501',
  null,
  'worker_a cannot write a remembered cost either'
);

-- ====================================================================
-- קבוצה 13, log_entries. עצמאי מ-tasks, טבלה תפעולית ולא כסף, ולכן
-- worker כותב וקורא בה במלואה, בדיוק כמו plots (הוא זה שמרסס וקוטף
-- בפועל, prd.md סעיף 8). הבדיקה כאן גם מכסה את הרחבת domain הסוגים
-- ב-20260825060000, שלושת הערכים המקוריים בלבד עברו בדיקה קודם.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, note)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'fertilize', 'manual', 'דישון יסוד') $$,
  'owner_a can insert one of the seven types the domain gained in 20260825060000, not just the original spray/harvest/other'
);

select throws_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'dance', 'manual') $$,
  '23514',
  null,
  'a type outside the closed list of ten is still rejected by the check constraint'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, note)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'other', 'manual', 'נרשם על ידי העובד') $$,
  'worker_a can insert a log entry directly, log_entries is operational not money'
);

select is(
  (select count(*)::int from public.log_entries where farm_id = (select value from fixture where key = 'farm_a')) >= 3,
  true,
  'worker_a can read farm_a journal entries too, same row-level access as plots'
);

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.log_entries where farm_id = (select value from fixture where key = 'farm_a')),
  0,
  'a stranger with no membership in farm A sees zero journal entries'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.log_entries set note = 'דישון יסוד, מנה שנייה'
     where farm_id = (select value from fixture where key = 'farm_a') and note = 'דישון יסוד' $$,
  'owner_a can edit a journal entry after creating it, Log Entry Sheet supports create and edit on the same row'
);
select is(
  (select note from public.log_entries where farm_id = (select value from fixture where key = 'farm_a') and type = 'fertilize'),
  'דישון יסוד, מנה שנייה',
  'the edit actually landed and did not silently no-op like the crop_cycles/tasks SELECT-for-UPDATE gap did before those fixes'
);

-- Spray breakdown columns (20260904130000), minus the money.
-- 20260910120000_money_single_source.sql dropped spray_cost and work_cost: money
-- lives in public.expenses only, and the journal keeps the breakdown that says
-- how the number was reached. So this group asserts what is left on the row --
-- quantity, unit, unit price -- and that a worker can still write and read it,
-- because log_entries has no masking view (deferred to stage 6, see
-- docs/open-items.md).
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, spray_pest, spray_material, spray_quantity, spray_quantity_unit, spray_unit_price)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'spray', 'manual', 'כנימה', 'קונפידור', 3, 'kg', 40) $$,
  'owner_a can write a spray with a quantity, unit and unit price'
);
select is(
  (select spray_unit_price from public.log_entries where farm_id = (select value from fixture where key = 'farm_a') and spray_material = 'קונפידור'),
  40::numeric,
  'the price that applied on the day stays frozen on the journal row, it is history and not a value'
);
select throws_ok(
  $$ insert into public.log_entries (farm_id, date, type, source, spray_pest, spray_material, spray_quantity_unit)
     values ((select value from fixture where key = 'farm_a'), current_date, 'spray', 'manual', 'עש', 'שמן', 'gram') $$,
  '23514',
  null,
  'a spray unit outside the liter/kg domain is rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, spray_pest, spray_material, spray_quantity, spray_quantity_unit)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'spray', 'manual', 'עש', 'ביומקטין', 2, 'liter') $$,
  'worker_a can write a spray breakdown too, log_entries is the operational table he himself writes to'
);

-- ====================================================================
-- קבוצה 13ב, log_entries.created_expense_id (20260910120000). הכסף עבר
-- לטבלה אחת: היומן רושם מה קרה, expenses רושמת כמה זה עלה, והעמודה הזו
-- היא הקישור החד-כיווני ביניהם, בדיוק כמו tasks.created_expense_id.
-- העמודה עצמה גלויה ל-worker (log_entries בלי view ממסך), אבל שורת
-- ההוצאה שהיא מצביעה עליה חסומה לו ברמת השורה. זו בדיוק הנקודה: המצביע
-- אינו דלת אחורית לכסף.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
declare
  v_expense_id uuid;
begin
  insert into public.expenses (farm_id, amount, category, date, source)
  values ((select value from fixture where key = 'farm_a'), 120, 'קונפידור', current_date, 'manual')
  returning id into v_expense_id;
  insert into fixture (key, value) values ('expense_link', v_expense_id);
end $$;

select lives_ok(
  $$ update public.log_entries
     set created_expense_id = (select value from fixture where key = 'expense_link')
     where farm_id = (select value from fixture where key = 'farm_a') and spray_material = 'קונפידור' $$,
  'owner_a can point a journal entry at the expense it produced'
);
select is(
  (select created_expense_id from public.log_entries where farm_id = (select value from fixture where key = 'farm_a') and spray_material = 'קונפידור'),
  (select value from fixture where key = 'expense_link'),
  'the link landed on the journal row'
);
select throws_ok(
  $$ update public.log_entries
     set created_expense_id = '00000000-0000-0000-0000-0000000000ff'
     where farm_id = (select value from fixture where key = 'farm_a') and spray_material = 'קונפידור' $$,
  '23503',
  null,
  'the journal cannot point at an expense that does not exist, the foreign key holds'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select created_expense_id from public.log_entries where farm_id = (select value from fixture where key = 'farm_a') and spray_material = 'קונפידור'),
  (select value from fixture where key = 'expense_link'),
  'worker_a still reads the journal row and its expense pointer, log_entries carries no masking view yet'
);
select is(
  (select count(*)::int from public.expenses where id = (select value from fixture where key = 'expense_link')),
  0,
  'but the expense it points at stays invisible to worker_a, the pointer is not a back door into the money table'
);

-- ====================================================================
-- קבוצה 13ג, log_entries.work_kind (20260910130000). "סוג עבודה" בטקסט
-- חופשי לצד `type`, שנשאר רשימה סגורה. שתי שאלות שונות על אותה שורה:
-- `type` הוא הדומיין שמסך יומן הריסוס והדוח לרגולטור מסננים לפיו,
-- ו-work_kind הוא מה שהחקלאי באמת עשה. הבדיקות כאן נועלות את שלושת
-- הדברים שאפשר לשבור בטעות: שאין אילוץ על הערך, שהוא אינו תלוי בסוג
-- הרשומה, ושהעובד כותב וקורא אותו כמו כל שאר הטבלה התפעולית.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, work_kind, work_hours)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'other', 'manual', 'תיקון גדר', 3) $$,
  'owner_a can say what the work was in his own words, which is the whole point: type stayed a closed list and this did not'
);
select is(
  (select work_kind from public.log_entries where farm_id = (select value from fixture where key = 'farm_a') and work_kind = 'תיקון גדר'),
  'תיקון גדר',
  'the free text landed as typed, no domain, no check constraint, nothing normalised behind his back'
);

-- Not gated on the type, exactly like work_hours. A spray that also took three
-- hours of pruning around it is one entry, and writePayload() in
-- packages/shared/src/logEntries.ts deliberately does not null this column per
-- type the way it nulls the spray columns.
select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, spray_pest, spray_material, work_kind)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'spray', 'manual', 'כנימה', 'שמן קיץ', 'ריסוס וגיזום') $$,
  'a spray can carry a kind of work too, the column belongs to the work and not to one entry type'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.log_entries (farm_id, plot_id, date, type, source, work_kind, work_hours)
     values ((select value from fixture where key = 'farm_a'), (select value from fixture where key = 'plot_a'), current_date, 'other', 'manual', 'ניקוי שוחות', 4) $$,
  'worker_a can record what he did today, log_entries is the operational table he himself writes to'
);
select is(
  (select work_kind from public.log_entries where farm_id = (select value from fixture where key = 'farm_a') and work_kind = 'תיקון גדר'),
  'תיקון גדר',
  'and he reads the owner''s too, there is no masking view on log_entries yet, see docs/open-items.md'
);

-- ====================================================================
-- קבוצה 14, spray_material_prices (20260904130000). טבלת מחירון, מחיר
-- ברירת מחדל לכל חומר, כסף ולכן worker חסום ברמת השורה בדיוק כמו
-- task_cost_memory. upsert על אותו חומר מעדכן במקום, אין מחיקה.
-- ====================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.spray_material_prices (farm_id, material_normalized, unit_price, unit)
     values ((select value from fixture where key = 'farm_a'), 'קונפידור', 40, 'kg') $$,
  'owner_a can remember a material price'
);
select lives_ok(
  $$ insert into public.spray_material_prices (farm_id, material_normalized, unit_price, unit)
     values ((select value from fixture where key = 'farm_a'), 'קונפידור', 45, 'kg')
     on conflict (farm_id, material_normalized) do update set unit_price = excluded.unit_price, unit = excluded.unit $$,
  'upsert on the same normalized material updates in place, not a second row'
);
select is(
  (select unit_price from public.spray_material_prices where farm_id = (select value from fixture where key = 'farm_a') and material_normalized = 'קונפידור'),
  45::numeric,
  'the upsert kept the newer price and exactly one row'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.spray_material_prices where farm_id = (select value from fixture where key = 'farm_a')),
  0,
  'worker_a sees zero remembered prices, blocked at the row level like task_cost_memory'
);
select throws_ok(
  $$ insert into public.spray_material_prices (farm_id, material_normalized, unit_price, unit)
     values ((select value from fixture where key = 'farm_a'), 'עלסר', 10, 'liter') $$,
  '42501',
  null,
  'worker_a cannot write a remembered price either'
);

select * from finish();

rollback;
