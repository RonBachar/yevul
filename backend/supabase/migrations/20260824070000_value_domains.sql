-- חקלאי רווחי, אוצר המילים עובר לדומיינים במקום CHECK לכל עמודה
--
-- למה. עד כאן אותה רשימת ערכים נכתבה מחדש בכל פעם שנוספה עמודה:
-- ('dunam','hectare','acre') הופיע ב-settings_area_unit_check ואז שוב
-- ב-plots_area_unit_check, ואיסור שם ריק הופיע ב-farms ואז שוב ב-plots,
-- שתי מיגרציות במרחק יומיים. השנייה נמצאה בקוד ריוויו ולא מתוך תכנון,
-- וזה בדיוק אופן הכשל: הכלל נאכף במקום שנזכרו בו, לא בכל מקום שהוא חל.
--
-- דומיין הופך את הכלל לחלק מהטיפוס. עמודה חדשה מצהירה
-- `area_unit public.area_unit` ומקבלת את האכיפה בהגדרה, בלי שאף אחד
-- יצטרך לזכור להוסיף CHECK. הוספת יחידה או מטבע היא מיגרציה אחת שנוגעת
-- בדומיין, ולא ציד אחרי כל הטבלאות שמשתמשות בו.
--
-- הרשימות כאן הן מקור האמת מול packages/shared/src/settings.ts.
--
-- מה לא נכלל כאן ולמה. crop_cycles.name ו-tasks.title הם גם שמות ישויות
-- וראוי להם public.entity_name, אבל שתי העמודות האלה מוגשות דרך
-- crop_cycles_view ו-tasks_view, ו-Postgres חוסם שינוי טיפוס של עמודה
-- שתצוגה תלויה בה. המרתן דורשת הפלה ובנייה מחדש של שתי תצוגות שנושאות
-- לוגיקת מיסוך לפי תפקיד, וזה סיכון גדול מהתועלת כאן. רשום ב-
-- docs/open-items.md, ייעשה כשנוגעים בתצוגות האלה ממילא.

-- ====================================================================
-- הדומיינים
-- ====================================================================

create domain public.currency_code as text
  check (value in ('ILS', 'USD', 'EUR'));

create domain public.area_unit as text
  check (value in ('dunam', 'hectare', 'acre'));

-- עברית בלבד בהשקה. שפה נוספת בשלב 8 מרחיבה את הדומיין הזה, במקום אחד.
create domain public.locale_code as text
  check (value in ('he'));

-- שם ישות שאינו ריק ואינו רווחים בלבד.
create domain public.entity_name as text
  check (btrim(value) <> '');

-- ====================================================================
-- הסרת האילוצים הפרטניים, הדומיין מחליף אותם
-- ====================================================================

alter table public.settings drop constraint settings_currency_check;
alter table public.settings drop constraint settings_area_unit_check;
alter table public.settings drop constraint settings_locale_check;
alter table public.farms drop constraint farms_name_not_blank;
alter table public.plots drop constraint plots_area_unit_check;
alter table public.plots drop constraint plots_name_not_blank;

-- ====================================================================
-- החלפת הטיפוסים. ברירת המחדל מוסרת ומוחזרת סביב שינוי הטיפוס, כדי
-- שההמרה לא תיפול על ביטוי ברירת המחדל הישן.
-- ====================================================================

alter table public.settings alter column currency drop default;
alter table public.settings alter column currency type public.currency_code;
alter table public.settings alter column currency set default 'ILS';

alter table public.settings alter column area_unit drop default;
alter table public.settings alter column area_unit type public.area_unit;
alter table public.settings alter column area_unit set default 'dunam';

alter table public.settings alter column locale drop default;
alter table public.settings alter column locale type public.locale_code;
alter table public.settings alter column locale set default 'he';

alter table public.farms alter column name type public.entity_name;

alter table public.plots alter column name type public.entity_name;
-- nullable נשאר nullable. NULL פירושו "השתמש ביחידה של המשק", ודומיין
-- לא אוכף NOT NULL, ה-CHECK שלו לא רץ על NULL.
alter table public.plots alter column area_unit type public.area_unit;
