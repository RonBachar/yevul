-- בדיקות ליצירת משק אוטומטית בהתחברות ראשונה, שלב 2.
-- מריצים עם: npx supabase test db --workdir backend
--
-- מוודא שהטריגר on_auth_user_created מקים למשתמש חדש בדיוק משק אחד,
-- עם חברות owner פעילה, שורת settings עם ברירות המחדל, ושורת מנוי,
-- ושכל משתמש מקבל משק נפרד משלו. רץ בטרנזקציה שמתבטלת (rollback) בסוף.

create extension if not exists pgtap;

begin;

select plan(13);

-- ====================================================================
-- הכנה, שני משתמשים חדשים. עצם ההכנסה ל-auth.users מפעילה את הטריגר.
-- רצים כ-postgres (בלי set role authenticated), כך ש-RLS לא חוסם את
-- שאילתות האימות ואפשר לבדוק את המצב שהטריגר יצר ישירות.
-- ====================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'newuser-1@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'newuser-2@test.yevul', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');

-- ====================================================================
-- קבוצה 1, המשתמש הראשון קיבל בדיוק משק אחד עם חברות owner פעילה
-- ====================================================================

select is(
  (select count(*)::int from public.farm_members
     where user_id = 'dddddddd-0000-0000-0000-000000000001' and deleted_at is null),
  1,
  'new user 1 got exactly one membership, not zero and not two'
);

select is(
  (select role from public.farm_members
     where user_id = 'dddddddd-0000-0000-0000-000000000001' and deleted_at is null),
  'owner',
  'new user 1 is the owner of their auto-created farm'
);

select is(
  (select status from public.farm_members
     where user_id = 'dddddddd-0000-0000-0000-000000000001' and deleted_at is null),
  'active',
  'the owner membership is active, not a pending invite'
);

-- ====================================================================
-- קבוצה 2, המשק עצמו נוצר עם שם ברירת המחדל
-- ====================================================================

select is(
  (select f.name
     from public.farms f
     join public.farm_members m on m.farm_id = f.id
     where m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.deleted_at is null),
  'המשק שלי',
  'the auto-created farm carries the default name'
);

-- ====================================================================
-- קבוצה 3, שורת settings נוצרה עם ברירות המחדל של ההשקה בישראל
-- ====================================================================

select is(
  (select s.currency
     from public.settings s
     join public.farm_members m on m.farm_id = s.farm_id
     where m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.deleted_at is null),
  'ILS',
  'settings currency defaults to ILS'
);

select is(
  (select s.area_unit
     from public.settings s
     join public.farm_members m on m.farm_id = s.farm_id
     where m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.deleted_at is null),
  'dunam',
  'settings area_unit defaults to dunam'
);

select is(
  (select s.locale
     from public.settings s
     join public.farm_members m on m.farm_id = s.farm_id
     where m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.deleted_at is null),
  'he',
  'settings locale defaults to he'
);

-- ====================================================================
-- קבוצה 4, שורת מנוי נוצרה, לא פעילה כברירת מחדל (חינמי עד רכישה)
-- ====================================================================

select isnt_empty(
  $$ select 1
       from public.subscriptions sub
       join public.farm_members m on m.farm_id = sub.farm_id
       where m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.deleted_at is null $$,
  'a subscription row was created for the new farm'
);

select is(
  (select sub.entitlement_active
     from public.subscriptions sub
     join public.farm_members m on m.farm_id = sub.farm_id
     where m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.deleted_at is null),
  false,
  'the new farm starts on the free tier, entitlement not active'
);

-- ====================================================================
-- קבוצה 5, בידוד, המשתמש השני קיבל משק משלו, נפרד לגמרי מהראשון
-- ====================================================================

select is(
  (select count(*)::int from public.farm_members
     where user_id = 'dddddddd-0000-0000-0000-000000000002' and deleted_at is null),
  1,
  'new user 2 also got exactly one membership'
);

select isnt(
  (select farm_id from public.farm_members
     where user_id = 'dddddddd-0000-0000-0000-000000000001' and deleted_at is null),
  (select farm_id from public.farm_members
     where user_id = 'dddddddd-0000-0000-0000-000000000002' and deleted_at is null),
  'the two users own two different, separate farms'
);

-- ====================================================================
-- קבוצה 6, שמירה מפני יצירה כפולה, הכנסה חוזרת של אותו משתמש (מקרה
-- קצה תיאורטי) לא יוצרת משק שני. מדמים זאת בקריאה ישירה לטריגר-הלוגיקה
-- דרך provision guard: מוסיפים חברות שנייה ידנית אסור, אז במקום זאת
-- מוודאים שהמצב הנוכחי הוא בדיוק משק אחד לכל משתמש (שתי שורות סה"כ
-- לשני משתמשי הבדיקה החדשים).
-- ====================================================================

select is(
  (select count(*)::int from public.farm_members
     where user_id in ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002')
       and deleted_at is null),
  2,
  'exactly one farm membership per new user, no duplicates'
);

select is(
  (select count(distinct farm_id)::int from public.farm_members
     where user_id in ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002')
       and deleted_at is null),
  2,
  'two distinct farms for the two new users'
);

select * from finish();

rollback;
