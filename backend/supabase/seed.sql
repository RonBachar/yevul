-- נתוני פיתוח ובדיקות בלבד. הקובץ הזה רץ רק מקומית (supabase db reset /
-- start), אף פעם לא נגד הפרויקט האמיתי בענן.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'demo-owner@yevul.app',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}'
);

do $$
declare
  v_farm_id uuid;
  v_plot_id uuid;
  v_crop_cycle_id uuid;
begin
  -- מדמה בקשה מאומתת של המשתמש שנוצר למעלה, כדי לעשות שימוש חוזר
  -- ב-create_farm() בדיוק כמו שהאפליקציה תעשה, ולא לשכפל את הלוגיקה.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  v_farm_id := public.create_farm('משק הדגמה', 'ILS', 'dunam', 'he');

  insert into public.plots (farm_id, name, area, area_unit)
    values (v_farm_id, 'חלקה צפונית', 12.5, 'dunam')
    returning id into v_plot_id;

  -- אין RETURNING בכוונה, crop_cycles חסומה ל-SELECT ישיר, ראה
  -- הערה במיגרציה. ה-id נוצר כאן מראש בדיוק כמו שהאפליקציה תעשה.
  v_crop_cycle_id := gen_random_uuid();
  insert into public.crop_cycles (
    id, farm_id, plot_id, name, season, yield_unit,
    expected_yield_per_area, expected_price_per_unit, forecast_updated_at
  ) values (
    v_crop_cycle_id, v_farm_id, v_plot_id, 'עגבניות', '2026', 'ק"ג',
    850, 3.2, now()
  );

  insert into public.tasks (farm_id, plot_id, title, due_date, estimated_cost)
    values (v_farm_id, v_plot_id, 'ריסוס נגד כנימה', current_date + 3, 420);

  insert into public.tasks (farm_id, plot_id, title, due_date)
    values (v_farm_id, v_plot_id, 'בדיקת מערכת השקיה', current_date + 7);

  insert into public.tasks (farm_id, plot_id, title, completed_at, completed_by)
    values (v_farm_id, v_plot_id, 'דישון יסוד', now(), '11111111-1111-1111-1111-111111111111');

  insert into public.log_entries (
    farm_id, plot_id, date, type, source,
    spray_pest, spray_material, spray_dose, spray_phi_days
  ) values (
    v_farm_id, v_plot_id, current_date - 2, 'spray', 'manual',
    'כנימת עלה', 'קונפידור', '0.5 ליטר לדונם', 7
  );

  insert into public.log_entries (farm_id, plot_id, date, type, source, harvest_qty, harvest_unit)
    values (v_farm_id, v_plot_id, current_date - 10, 'harvest', 'manual', 320, 'ק"ג');

  insert into public.log_entries (farm_id, plot_id, date, type, source, note)
    values (v_farm_id, v_plot_id, current_date - 1, 'other', 'manual', 'בדיקת קרקע שגרתית');

  insert into public.expenses (farm_id, amount, category, date, note, created_by)
    values (v_farm_id, 1250, 'חומרי הדברה', current_date - 3, 'קונפידור וציוד ריסוס', '11111111-1111-1111-1111-111111111111');

  reset role;
end $$;
