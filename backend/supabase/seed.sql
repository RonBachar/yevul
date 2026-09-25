-- נתוני פיתוח ובדיקות בלבד. הקובץ הזה רץ רק מקומית (supabase db reset /
-- start), אף פעם לא נגד הפרויקט האמיתי בענן.

-- עמודות הטוקן (confirmation_token וכו') חייבות להיות מחרוזת ריקה ולא
-- NULL. GoTrue סורק אותן כמחרוזת, והכנסה ישירה דרך SQL שמשאירה אותן
-- NULL מפילה כל התחברות בשגיאת "converting NULL to string". בדיקות
-- pgTAP לא נתקלות בזה כי הן קובעות JWT ישירות בלי לעבור דרך GoTrue.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'demo-owner@yevul.app',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', '', '', '', '', ''
);

do $$
declare
  v_farm_id uuid;
  v_plot_north uuid;
  v_plot_south uuid;
  v_plot_east uuid;
  v_plot_west uuid;
  v_plot_citrus uuid;
  v_cc_id uuid;
  -- **שתי הצהרות ולא CTE אחד.** `with task as (insert ... returning id)
  -- insert into task_plots ... from task` נכשל על RLS: מדיניות ההכנסה
  -- של task_plots בודקת `exists (select 1 from public.tasks ...)`,
  -- והשורה שנוצרה ב-CTE אינה נראית לתמונת המצב של אותה פקודה עצמה.
  -- המשתנה מפריד את ההכנסה לשתי פקודות, ואז המשימה כבר קיימת.
  v_task_id uuid;
begin
  -- מדמה בקשה מאומתת של המשתמש שנוצר למעלה. הכנסת המשתמש כבר הפעילה
  -- את הטריגר on_auth_user_created שיצר לו משק אוטומטית בשם "המשק שלי",
  -- בדיוק כמו בהתחברות ראשונה אמיתית. כאן מאמצים אותו ומשנים את שמו,
  -- בדיוק כמו שמשתמש אמיתי יעשה במסך ההגדרות, ולא יוצרים משק שני.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select farm_id into v_farm_id
    from public.farm_members
    where user_id = '11111111-1111-1111-1111-111111111111'
      and role = 'owner'
      and deleted_at is null
    limit 1;

  update public.farms set name = 'משק הדגמה' where id = v_farm_id;

  -- חמש חלקות, שתי משפחות מדידה של יבול (משקל וספירה) לפי עידו, כדי
  -- שהמסכים שתלויים ביחידה (טאב הרווחיות, גיליון עדכון הצפי) יהיו
  -- ניתנים לבדיקה בלי להזין נתונים ידנית בכל פעם.

  insert into public.plots (farm_id, name, area, area_unit)
    values (v_farm_id, 'חלקה צפונית', 12.5, 'dunam')
    returning id into v_plot_north;

  -- אין RETURNING על crop_cycles בכוונה, היא חסומה ל-SELECT ישיר, ראה
  -- הערה במיגרציה. ה-id נוצר כאן מראש בדיוק כמו שהאפליקציה תעשה.
  v_cc_id := gen_random_uuid();
  insert into public.crop_cycles (
    id, farm_id, plot_id, name, season, yield_unit,
    expected_yield_per_area, expected_price_per_unit, forecast_updated_at
  ) values (
    v_cc_id, v_farm_id, v_plot_north, 'עגבניות', '2026', 'ק"ג',
    850, 3.2, now()
  );

  insert into public.plots (farm_id, name, area, area_unit)
    values (v_farm_id, 'חלקה דרומית', 20, 'dunam')
    returning id into v_plot_south;
  v_cc_id := gen_random_uuid();
  insert into public.crop_cycles (
    id, farm_id, plot_id, name, season, yield_unit,
    expected_yield_per_area, expected_price_per_unit, forecast_updated_at
  ) values (
    v_cc_id, v_farm_id, v_plot_south, 'זיתים', '2026', 'ק"ג',
    400, 12, now()
  );

  insert into public.plots (farm_id, name, area, area_unit)
    values (v_farm_id, 'חלקה מזרחית', 8, 'dunam')
    returning id into v_plot_east;
  v_cc_id := gen_random_uuid();
  insert into public.crop_cycles (
    id, farm_id, plot_id, name, season, yield_unit,
    expected_yield_per_area, expected_price_per_unit, forecast_updated_at
  ) values (
    v_cc_id, v_farm_id, v_plot_east, 'תפוחי עץ', '2026', 'ארגזים',
    60, 85, now()
  );

  insert into public.plots (farm_id, name, area, area_unit)
    values (v_farm_id, 'חלקה מערבית', 35, 'dunam')
    returning id into v_plot_west;
  v_cc_id := gen_random_uuid();
  insert into public.crop_cycles (
    id, farm_id, plot_id, name, season, yield_unit,
    expected_yield_per_area, expected_price_per_unit, forecast_updated_at
  ) values (
    v_cc_id, v_farm_id, v_plot_west, 'חיטה', '2026', 'טון',
    0.35, 950, now()
  );

  insert into public.plots (farm_id, name, area, area_unit)
    values (v_farm_id, 'מטע הדרים', 15, 'dunam')
    returning id into v_plot_citrus;
  v_cc_id := gen_random_uuid();
  insert into public.crop_cycles (
    id, farm_id, plot_id, name, season, yield_unit,
    expected_yield_per_area, expected_price_per_unit, forecast_updated_at
  ) values (
    v_cc_id, v_farm_id, v_plot_citrus, 'הדרים', '2026', 'יחידות',
    1200, 1.8, now()
  );

  -- משימות, ארבע הדחיפויות שהלוח מקבץ לפיהן (groupTasksByUrgency) פרוסות
  -- על פני חלקות שונות, בלי לגעת בשלוש המשימות שכבר היו על חלקה צפונית.
  insert into public.tasks (farm_id, title, due_date)
    values (v_farm_id, 'ריסוס נגד כנימה', current_date + 3) returning id into v_task_id;
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_north);
  insert into public.tasks (farm_id, title, due_date)
    values (v_farm_id, 'בדיקת מערכת השקיה', current_date + 7) returning id into v_task_id;
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_north);
  insert into public.tasks (farm_id, title, completed_at, completed_by)
    values (v_farm_id, 'דישון יסוד', now(), '11111111-1111-1111-1111-111111111111') returning id into v_task_id;
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_north);

  insert into public.tasks (farm_id, title, due_date)
    values (v_farm_id, 'לבדוק עלים צהובים', current_date - 4) returning id into v_task_id; -- באיחור
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_south);
  insert into public.tasks (farm_id, title, due_date)
    values (v_farm_id, 'ריסוס נגד כנימת עץ', current_date) returning id into v_task_id; -- היום
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_east);
  insert into public.tasks (farm_id, title, due_date)
    values (v_farm_id, 'דילול פרי', current_date + 2) returning id into v_task_id; -- השבוע
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_east);
  insert into public.tasks (farm_id, title, completed_at, completed_by)
    values (v_farm_id, 'קטיף ניסיון', now() - interval '2 days', '11111111-1111-1111-1111-111111111111') returning id into v_task_id;
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_east);
  insert into public.tasks (farm_id, title, due_date)
    values (v_farm_id, 'קציר חיטה', current_date + 25) returning id into v_task_id; -- בהמשך
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_west);
  insert into public.tasks (farm_id, title)
    values (v_farm_id, 'לבדוק רשת הצללה') returning id into v_task_id; -- ללא תאריך
  insert into public.task_plots (task_id, plot_id) values (v_task_id, v_plot_citrus);

  -- רשומות יומן, סוגים שונים על חלקות שונות, כולל רשומה כללית בלי
  -- חלקה (plot_id null) וסוג מהעשרה שהתווספו במיגרציית הרחבת ה-domain.
  insert into public.log_entries (
    farm_id, plot_id, date, type, source,
    spray_pest, spray_material, spray_dose, spray_phi_days
  ) values (
    v_farm_id, v_plot_north, current_date - 2, 'spray', 'manual',
    'כנימת עלה', 'קונפידור', '0.5 ליטר לדונם', 7
  );
  insert into public.log_entries (farm_id, plot_id, date, type, source, harvest_qty, harvest_unit)
    values (v_farm_id, v_plot_north, current_date - 10, 'harvest', 'manual', 320, 'ק"ג');
  insert into public.log_entries (farm_id, plot_id, date, type, source, note)
    values (v_farm_id, v_plot_north, current_date - 1, 'other', 'manual', 'בדיקת קרקע שגרתית');

  insert into public.log_entries (
    farm_id, plot_id, date, type, source,
    spray_pest, spray_material, spray_dose, spray_phi_days
  ) values (
    v_farm_id, v_plot_south, current_date - 5, 'spray', 'manual',
    'זבוב הזית', 'דימילין', '1 ליטר לדונם', 14
  );
  insert into public.log_entries (farm_id, plot_id, date, type, source, harvest_qty, harvest_unit)
    values (v_farm_id, v_plot_east, current_date - 1, 'harvest', 'manual', 42, 'ארגזים');
  insert into public.log_entries (farm_id, plot_id, date, type, source, note)
    values (v_farm_id, v_plot_west, current_date - 6, 'fertilize', 'manual', 'דישון חנקני לפני האביב');
  insert into public.log_entries (farm_id, plot_id, date, type, source, note)
    values (v_farm_id, v_plot_citrus, current_date - 3, 'irrigate', 'manual', 'כיוונון טפטפות');
  insert into public.log_entries (farm_id, plot_id, date, type, source, note)
    values (v_farm_id, null, current_date, 'other', 'manual', 'סיור שגרתי בכל המשק'); -- כללי, בלי חלקה

  insert into public.expenses (farm_id, amount, category, date, note, created_by)
    values (v_farm_id, 1250, 'חומרי הדברה', current_date - 3, 'קונפידור וציוד ריסוס', '11111111-1111-1111-1111-111111111111');

  reset role;
end $$;
