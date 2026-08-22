-- בדיקות אילוצי הערכים על הגדרות המשק, שלב 2.
-- מריצים עם: npx supabase test db --workdir backend
--
-- האילוצים האלה נוספו אחרי שהתגלה בפועל שבעל משק ששולח PATCH ישיר
-- ל-API עם currency שלא קיים קיבל HTTP 200 והערך נשמר. הבדיקות כאן
-- מוודאות שהחור נשאר סגור, ושהערכים הלגיטימיים ממשיכים לעבוד.
-- רץ בטרנזקציה שמתבטלת (rollback) בסוף.

create extension if not exists pgtap;

begin;

select plan(10);

-- ====================================================================
-- הכנה, משק בודד עם שורת הגדרות בברירות המחדל
-- ====================================================================

insert into public.farms (id, name)
values ('eeeeeeee-0000-0000-0000-000000000001', 'משק בדיקת אילוצים');

insert into public.settings (farm_id, currency, area_unit, locale)
values ('eeeeeeee-0000-0000-0000-000000000001', 'ILS', 'dunam', 'he');

-- ====================================================================
-- קבוצה 1, ערכים לגיטימיים עוברים. אילוץ שחוסם גם את הנכון הוא רגרסיה.
-- ====================================================================

select lives_ok(
  $$update public.settings set currency = 'USD' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'מטבע מהרשימה, USD, מתקבל'
);

select lives_ok(
  $$update public.settings set currency = 'EUR' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'מטבע מהרשימה, EUR, מתקבל'
);

select lives_ok(
  $$update public.settings set area_unit = 'hectare' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'יחידת שטח מהרשימה, hectare, מתקבלת'
);

select lives_ok(
  $$update public.settings set area_unit = 'acre' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'יחידת שטח מהרשימה, acre, מתקבלת'
);

select lives_ok(
  $$update public.farms set name = 'שם תקין' where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  'שם משק לא ריק מתקבל'
);

-- ====================================================================
-- קבוצה 2, ערכים מחוץ לרשימה נדחים. זה בדיוק המקרה שעבר קודם.
-- ====================================================================

select throws_ok(
  $$update public.settings set currency = 'BANANA' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'מטבע שלא קיים נדחה ברמת המסד ולא רק בממשק'
);

select throws_ok(
  $$update public.settings set area_unit = 'football-fields' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'יחידת שטח שלא קיימת נדחית ברמת המסד'
);

select throws_ok(
  $$update public.settings set locale = 'klingon' where farm_id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'שפה שאין לה מחרוזות נדחית ברמת המסד'
);

-- ====================================================================
-- קבוצה 3, שם משק ריק. המסך כבר חוסם, ומאותה סיבה זה לא מספיק.
-- ====================================================================

select throws_ok(
  $$update public.farms set name = '' where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'שם משק ריק נדחה'
);

select throws_ok(
  $$update public.farms set name = '   ' where id = 'eeeeeeee-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'שם משק של רווחים בלבד נדחה, לא רק מחרוזת ריקה'
);

select * from finish();

rollback;
