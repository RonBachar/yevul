-- Completion Prompts, שלב 3. שתי השאלות העצמאיות בסיום משימה (לשמור
-- ביומן, ולרשום כהוצאה) חייבות להיות ניתנות לכיבוי בהגדרות, prd.md
-- סעיף 7 ו-design.md "Completion Prompts": "Both toggles live in
-- Settings and can be turned off independently." שני בוליאנים ברמת
-- המשק, אותה גישה כמו currency/area_unit/locale, ברירת מחדל true
-- לשתיהן, כי design.md: "Both default to being asked, never to an
-- automatic action" מתאר את ברירת המחדל של כל שאלה בפני עצמה, לא של
-- הצגתה.

alter table public.settings
  add column journal_prompt_enabled boolean not null default true,
  add column expense_prompt_enabled boolean not null default true;
