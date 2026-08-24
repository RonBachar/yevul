-- חקלאי רווחי, אילוץ יחידת שטח גם ברמת החלקה
--
-- המיגרציה הקודמת, 20260822050000, סגרה את הערכים החופשיים ב-
-- settings.area_unit אבל השאירה את plots.area_unit פתוח לגמרי. אותו
-- אוצר מילים בדיוק, רק שהאחד הוא ברירת המחדל של המשק והשני דריסה
-- לחלקה בודדת. נמצא בקוד ריוויו של שלב 2, ואומת מול המסד: לא היה שום
-- אילוץ CHECK על plots ועל crop_cycles, כלומר אפשר היה ליצור חלקה עם
-- area_unit שרירותי דרך קריאת API ישירה, בדיוק החור שנסגר טבלה אחת
-- לידה.
--
-- העיתוי לא מקרי, המשימה הראשונה בשלב 3 היא מסך החלקות, והיא הכותבת
-- הראשונה לעמודה הזאת מהממשק.
--
-- NULL מותר במפורש. plots.area_unit הוא nullable, ומשמעות NULL היא
-- "השתמש ביחידה של המשק מ-settings", ולא ערך חסר.
--
-- הרשימה חייבת להישאר זהה ל-AREA_UNITS ב-packages/shared/src/settings.ts
-- ולאילוץ settings_area_unit_check.

alter table public.plots
  add constraint plots_area_unit_check
  check (area_unit is null or area_unit in ('dunam', 'hectare', 'acre'));

-- שם חלקה ריק או רווחים בלבד הוא לא שם, מאותו נימוק כמו בשם המשק.
alter table public.plots
  add constraint plots_name_not_blank
  check (btrim(name) <> '');
