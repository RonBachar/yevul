-- חקלאי רווחי, הזמנת חברי משק לפי אימייל, שלב 6, משימה 1.
-- קורא מחדש: docs/prd.md סעיף 11, docs/design.md בלוק Sharing.
--
-- הסכמה תומכת בשיתוף מהיום הראשון: farm_members עם role/status/
-- invited_email, plots.responsible_user_id, tasks.assigned_to, ו-RLS
-- לפי תפקיד (worker חסום מטבלאות הכסף, עמודות רווח ממוסכות בתצוגות).
-- לכן המיגרציה הזו קטנה בכוונה ומוסיפה שלושה דברים בלבד:
--   1. צירוף מוזמן למשק ברגע שהוא נכנס עם אותו אימייל, במקום שיקבל
--      משק ריק משלו. (עדכון handle_new_user)
--   2. ניהול חברים הוא של הבעלים בלבד. (הידוק מדיניות farm_members)
--   3. תצוגה שחושפת את האימייל של כל חבר לרוסטר, בלי לפתוח את
--      auth.users ללקוח.

-- ====================================================================
-- 1. צירוף אוטומטי של מוזמן.
--
-- לפני שהטריגר יוצר משק חדש למשתמש, הוא מחפש הזמנה ממתינה שתואמת את
-- האימייל שלו (השוואה לא תלוית רישיות, כי אימייל אינו תלוי רישיות).
-- אם נמצאה, הוא מפעיל אותה (קובע user_id ו-status='active') ולא יוצר
-- משק ריק. אם לא, מתנהג בדיוק כמו קודם.
--
-- כך כל משתמש נשאר בדיוק במשק אחד, ו-currentFarmQuery בלקוח נשאר תקף
-- בלי בורר משקים. משתמש שכבר נרשם ורק אחר כך הוזמן הוא תרחיש קצה
-- (הוא יהיה חבר בשני משקים), מתועד ב-docs/open-items.md.
-- ====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched int;
begin
  -- רשת ביטחון מפני הפעלה חוזרת: חברות פעילה קיימת עוצרת כאן
  if exists (
    select 1 from public.farm_members
    where user_id = new.id and deleted_at is null
  ) then
    return new;
  end if;

  -- צירוף לכל הזמנה ממתינה שתואמת את האימייל
  update public.farm_members
    set user_id = new.id,
        status = 'active'
  where user_id is null
    and status = 'invited'
    and deleted_at is null
    and new.email is not null
    and lower(invited_email) = lower(new.email);

  get diagnostics v_matched = row_count;

  -- צורף לפחות למשק אחד, אין צורך במשק ריק משלו
  if v_matched > 0 then
    return new;
  end if;

  perform private.provision_farm(new.id, 'המשק שלי', 'ILS', 'dunam', 'he');
  return new;
end;
$$;

-- ====================================================================
-- 2. ניהול חברים, בעלים בלבד.
--
-- הבעלים מזמין (INSERT של שורת invited), משנה תפקיד ומסיר (UPDATE,
-- כולל מחיקה רכה על deleted_at). שותף (manager) עושה כל פעולה תפעולית
-- אחרת במשק אבל אינו מנהל אנשים, לפי prd.md סעיף 11 שמייחס את הזמנת
-- האנשים לבעלים. השורה הראשונה (ה-owner עצמו) נכנסת דרך provision_farm
-- שהוא security definer ועוקף RLS, לכן ההידוק כאן אינו נוגע בהקמת המשק.
-- ====================================================================

drop policy "farm_members_insert" on public.farm_members;
create policy "farm_members_insert" on public.farm_members
  for insert to authenticated
  with check (private.farm_role(farm_id) = 'owner');

drop policy "farm_members_update" on public.farm_members;
create policy "farm_members_update" on public.farm_members
  for update to authenticated
  using (private.farm_role(farm_id) = 'owner')
  with check (private.farm_role(farm_id) = 'owner');

-- הזמנה ממתינה יחידה לכל אימייל בכל משק (השוואה לא תלוית רישיות), כדי
-- שלחיצה כפולה על "הזמן" לא תיצור שתי שורות. חל רק על שורות invited
-- חיות, כך שאותו אימייל יכול להיות מוזמן מחדש אחרי הסרה.
create unique index farm_members_unique_pending_invite
  on public.farm_members (farm_id, lower(invited_email))
  where deleted_at is null and status = 'invited' and invited_email is not null;

-- ====================================================================
-- 3. farm_members_view, מקור הקריאה לרוסטר.
--
-- חושף את האימייל של כל חבר (מ-auth.users לחבר פעיל, מ-invited_email
-- להזמנה ממתינה) בלי לפתוח את auth.users ללקוח. security_invoker=false
-- כדי לקרוא את auth.users, וה-WHERE מצמצם למשקים של הקורא בלבד, אותה
-- תבנית בדיוק כמו crop_cycles_view ו-tasks_view. הכתיבה (הזמנה, שינוי
-- תפקיד, הסרה) נשארת ישירה על הטבלה הבסיסית תחת RLS, כמו שאר המוצר.
-- ====================================================================

create view public.farm_members_view
with (security_invoker = false)
as
select
  m.id,
  m.farm_id,
  m.user_id,
  m.role,
  m.status,
  coalesce(u.email, m.invited_email) as email,
  coalesce(m.user_id = auth.uid(), false) as is_self,
  m.created_at
from public.farm_members m
left join auth.users u on u.id = m.user_id
where m.farm_id in (select private.active_member_farm_ids())
  and m.deleted_at is null;

grant select on public.farm_members_view to authenticated;
