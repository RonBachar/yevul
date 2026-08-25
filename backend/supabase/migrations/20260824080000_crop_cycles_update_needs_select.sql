-- Postgres RLS דורש הרשאת SELECT על הטבלה כדי לאכוף מדיניות UPDATE
-- (ה-USING clause הוא בעצם בדיקת נראות מסוג SELECT), לא רק UPDATE.
-- ה-REVOKE הגורף על crop_cycles ב-core_schema.sql חוסם לכן גם PATCH
-- לגיטימי מ-owner/manager, PostgREST מחזיר 42501 "permission denied".
-- נתגלה תוך כדי בניית מסכי עריכת חלקה/גידול בשלב 3, זו הפעם הראשונה
-- שכתיבה אמיתית עוברת בפועל בטבלה הזו מקצה לקצה.
--
-- הרשאת SELECT ברמת עמודה, לא ברמת טבלה, פותרת את זה בלי לפרוץ את
-- המיסוך: worker עדיין לא יכול לקרוא expected_yield_per_area או
-- expected_price_per_unit ישירות מהטבלה, רק owner/manager יכולים
-- לכתוב אליהן (מדיניות ה-UPDATE כבר אוכפת את זה), וקריאה של שני השדות
-- האלה לכל תפקיד נשארת אך ורק דרך crop_cycles_view שממסך לפי תפקיד.
revoke select on public.crop_cycles from authenticated;
grant select (
  id, farm_id, plot_id, name, season, yield_unit, forecast_updated_at, created_at, deleted_at
) on public.crop_cycles to authenticated;
