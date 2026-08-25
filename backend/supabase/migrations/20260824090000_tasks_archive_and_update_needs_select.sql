-- שלב 3, משימה שנייה: משימות. שני שינויים בקובץ אחד כי שניהם נחוצים
-- לפני שכל כתיבה על tasks עובדת מהקליינט בכלל.

-- 1. archived_at, נפרד לגמרי מ-deleted_at. ארכוב הוא מצב מוצרי (משימה
-- שנדחתה שוב ושוב או שעברו עליה 30 יום, prd.md סעיף 7), לא מחיקה,
-- ולכן לא יכול לחלוק עמודה עם soft delete. משימה מאורכבת עדיין מגיעה
-- דרך "overflow" הלוח, בניגוד למשימה מחוקה שלעולם לא חוזרת.
alter table public.tasks add column archived_at timestamptz;

-- 2. אותו פער בדיוק שנתפס ב-crop_cycles (20260824080000): Postgres
-- דורש הרשאת SELECT כדי לאכוף מדיניות UPDATE, ה-USING clause הוא בעצם
-- בדיקת נראות מסוג SELECT, לא רק UPDATE עצמו. ה-REVOKE הגורף על tasks
-- ב-core_schema.sql חוסם לכן גם PATCH לגיטימי, כולל השלמת משימה
-- כאירוע, snooze, ועריכה, לכל תפקיד, לא רק owner/manager. נתפס כאן
-- לפני שהגיע למכשיר, בזכות התבנית שכבר נלמדה.
--
-- הרשאת SELECT ברמת עמודה על כל השדות חוץ מ-estimated_cost, שממשיך
-- להיות ממוסך ל-worker אך ורק דרך tasks_view, בדיוק כמו שתי עמודות
-- התחזית ב-crop_cycles.
grant select (
  id, farm_id, plot_id, title, notes, photo_url, voice_note_url, due_date,
  assigned_to, completed_at, completed_by, snoozed_until, snooze_count,
  created_log_id, created_expense_id, created_at, deleted_at, archived_at
) on public.tasks to authenticated;

-- ה-view חייב להכיר את העמודה החדשה כדי שהקליינט יוכל לקרוא אותה,
-- אין WHERE על archived_at כאן בכוונה: בניגוד ל-deleted_at, משימה
-- מאורכבת נשארת נגישה דרך overflow הלוח, הסינון קורה בקליינט לפי
-- ההקשר (לוח פתוח מול תצוגת ארכיון), לא ב-view.
create or replace view public.tasks_view
with (security_invoker = false)
as
select
  id,
  farm_id,
  plot_id,
  title,
  notes,
  photo_url,
  voice_note_url,
  due_date,
  case when private.farm_role(farm_id) = 'worker' then null else estimated_cost end as estimated_cost,
  assigned_to,
  completed_at,
  completed_by,
  snoozed_until,
  snooze_count,
  created_log_id,
  created_expense_id,
  created_at,
  archived_at
from public.tasks
where farm_id in (select private.active_member_farm_ids())
  and deleted_at is null;
