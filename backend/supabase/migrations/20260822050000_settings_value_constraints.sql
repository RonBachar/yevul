-- חקלאי רווחי, אילוץ ערכים על הגדרות המשק
--
-- למה זה קיים. מסך ההגדרות כותב מטבע, יחידת שטח ו-locale. הרשימות
-- שמוצגות בתפריט הבחירה חיות ב-packages/shared, אבל רשימה בקליינט היא
-- אוצר מילים לממשק, לא אכיפה. נבדק בפועל מול השרת המקומי: בעל משק
-- שמדלג על המסך ושולח PATCH ישיר ל-API עם
-- {"currency":"BANANA","area_unit":"football-fields","locale":"klingon"}
-- קיבל HTTP 200 והערכים נשמרו במסד כמות שהם.
--
-- לפי כלל ההפרדה בין השכבות, כלל שאסור לעקוף שייך למסד ולא לקליינט,
-- במיוחד כשיש שני לקוחות שאמורים להתנהג אותו דבר. הסכמה כבר עושה את
-- זה נכון ב-farm_members.role וב-farm_members.status, וההגדרות נשארו
-- מאחור. זה מיישר אותן.
--
-- הרשימות כאן הן מקור האמת. כשמוסיפים מטבע או שפה, מוסיפים כאן
-- ובמקביל ב-packages/shared/src/settings.ts, ולעולם לא רק שם.

alter table public.settings
  add constraint settings_currency_check
  check (currency in ('ILS', 'USD', 'EUR'));

alter table public.settings
  add constraint settings_area_unit_check
  check (area_unit in ('dunam', 'hectare', 'acre'));

-- עברית בלבד בהשקה. שפות נוספות נכנסות בשלב 8, יחד עם מנגנון החלפת
-- השפה בשכבת התרגום, ואז המיגרציה שמוסיפה שפה מרחיבה גם את האילוץ הזה.
alter table public.settings
  add constraint settings_locale_check
  check (locale in ('he'));

-- שם משק ריק או רווחים בלבד הוא לא שם. המסך כבר חוסם אותו, אבל מאותה
-- סיבה בדיוק זה לא מספיק.
alter table public.farms
  add constraint farms_name_not_blank
  check (btrim(name) <> '');
