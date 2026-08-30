-- בדיקות מכסת ה-AI החודשית, שלב 5.
-- מריצים עם: npx supabase test db --workdir backend
--
-- זו אכיפה של כסף אמיתי: כל בקשה שעוברת את השומר עולה לנו בקריאה
-- ל-OpenRouter. הבדיקות כאן שומרות על שלושת הדברים שאסור שיישברו,
-- שהמכסה נאכפת, שהיא נספרת גם כשאין תקרה, ושהקליינט אינו יכול לגעת
-- במונה בעצמו.
-- רץ בטרנזקציה שמתבטלת (rollback) בסוף.

create extension if not exists pgtap;

begin;

select plan(17);

-- ====================================================================
-- הכנה, שני משקים ומשתמש אחד שחבר רק באחד מהם
-- ====================================================================

insert into auth.users (id, email)
values
  ('11111111-0000-0000-0000-000000000001', 'quota-owner@yevul.test'),
  ('11111111-0000-0000-0000-000000000002', 'quota-outsider@yevul.test');

-- הטריגר on_auth_user_created מקצה משק לכל משתמש חדש, ולכן המשקים
-- כבר קיימים ואין ליצור אותם שוב.
select is(
  (select count(*)::int from public.farm_members
    where user_id = '11111111-0000-0000-0000-000000000001' and role = 'owner'),
  1,
  'ההכנה, המשתמש הראשון קיבל משק אוטומטית'
);

create temporary table quota_ctx as
select
  (select farm_id from public.farm_members
    where user_id = '11111111-0000-0000-0000-000000000001' limit 1) as owner_farm,
  (select farm_id from public.farm_members
    where user_id = '11111111-0000-0000-0000-000000000002' limit 1) as other_farm;

-- ====================================================================
-- קבוצה 1, ספירה והגדלה
-- ====================================================================

select is(
  private.consume_ai_quota((select owner_farm from quota_ctx), 3),
  true,
  'הקריאה הראשונה בחודש עוברת'
);

select is(
  (select used from public.ai_usage where farm_id = (select owner_farm from quota_ctx)),
  1,
  'הקריאה הראשונה יצרה שורה עם מונה 1'
);

select is(
  private.consume_ai_quota((select owner_farm from quota_ctx), 3),
  true,
  'הקריאה השנייה עוברת'
);

select is(
  private.consume_ai_quota((select owner_farm from quota_ctx), 3),
  true,
  'הקריאה השלישית, האחרונה במכסה, עוברת'
);

-- ====================================================================
-- קבוצה 2, המכסה נאכפת. זו הבדיקה שמונעת חשבון OpenRouter פתוח.
-- ====================================================================

select is(
  private.consume_ai_quota((select owner_farm from quota_ctx), 3),
  false,
  'הקריאה הרביעית נחסמת, המכסה מוצתה'
);

select is(
  (select used from public.ai_usage where farm_id = (select owner_farm from quota_ctx)),
  3,
  'קריאה שנחסמה אינה מגדילה את המונה'
);

select is(
  private.consume_ai_quota((select owner_farm from quota_ctx), 3),
  false,
  'המכסה נשארת חסומה גם בניסיון נוסף'
);

-- ====================================================================
-- קבוצה 3, מסלול ללא הגבלה. **עדיין נספר**, כי prd.md סעיף 13 דורש
-- מעקב עלות ללקוח גם כשאין תקרה.
-- ====================================================================

select is(
  private.consume_ai_quota((select owner_farm from quota_ctx), null),
  true,
  'מכסה null עוברת גם אחרי שהמכסה המוגבלת מוצתה'
);

select is(
  (select used from public.ai_usage where farm_id = (select owner_farm from quota_ctx)),
  4,
  'מסלול ללא הגבלה עדיין מקדם את המונה, לצורך מעקב עלות'
);

-- ====================================================================
-- קבוצה 4, מקרי קצה של התקרה. מכסה אפס חוסמת גם בקריאה הראשונה
-- בחודש, שהיא הענף שאין בו התנגשות ולכן ה-WHERE לא חל עליו.
-- ====================================================================

select is(
  private.consume_ai_quota((select other_farm from quota_ctx), 0),
  false,
  'מכסה אפס חוסמת את הקריאה הראשונה בחודש'
);

select is(
  (select count(*)::int from public.ai_usage
    where farm_id = (select other_farm from quota_ctx)),
  0,
  'מכסה אפס לא יצרה שורה בכלל'
);

-- ====================================================================
-- קבוצה 5, בידוד בין משקים. מונה של משק אחד לא נוגע בשני.
-- ====================================================================

select is(
  private.consume_ai_quota((select other_farm from quota_ctx), 2),
  true,
  'משק שני מתחיל מהמונה שלו ולא מזה של הראשון'
);

select is(
  (select used from public.ai_usage where farm_id = (select other_farm from quota_ctx)),
  1,
  'המונה של המשק השני עומד על 1'
);

select is(
  (select used from public.ai_usage where farm_id = (select owner_farm from quota_ctx)),
  4,
  'המונה של המשק הראשון לא הושפע'
);

-- ====================================================================
-- קבוצה 6, RLS. **הקליינט לעולם אינו כותב למונה**, אחרת המכסה חסרת
-- ערך. אין מדיניות INSERT/UPDATE בכוונה, ולכן שתי הכתיבות נחסמות.
-- ====================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001"}';

select throws_ok(
  $$update public.ai_usage set used = 0$$,
  '42501',
  null,
  'משתמש מחובר אינו יכול לאפס לעצמו את המונה'
);

select throws_ok(
  $$insert into public.ai_usage (farm_id, period, used)
    values ('11111111-0000-0000-0000-000000000001', current_date, 0)$$,
  '42501',
  null,
  'משתמש מחובר אינו יכול להוסיף שורת מכסה משלו'
);

select * from finish();

rollback;
