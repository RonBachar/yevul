-- חקלאי רווחי, סכמת ליבה + RLS, שלב 1
-- קורא מחדש: docs/prd.md נספח א.3 וא.4 לפני שינוי הקובץ הזה.

create extension if not exists pgcrypto;

-- סכמת עזר לפונקציות RLS פנימיות, לא חשופה דרך ה-API (ראה api.schemas ב-config.toml)
create schema if not exists private;

-- ====================================================================
-- טבלאות ליבה
-- ====================================================================

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.farm_members (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  user_id uuid references auth.users(id),
  role text not null check (role in ('owner', 'manager', 'worker')),
  status text not null default 'active' check (status in ('invited', 'active')),
  invited_email text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint farm_members_user_or_invite check (user_id is not null or invited_email is not null)
);
-- חבר פעיל אחד לכל שילוב משק+משתמש, מחיקה רכה משחררת את השילוב מחדש
create unique index farm_members_unique_active_user on public.farm_members (farm_id, user_id)
  where deleted_at is null and user_id is not null;
create index farm_members_farm_id_idx on public.farm_members (farm_id);
create index farm_members_user_id_idx on public.farm_members (user_id);

create table public.subscriptions (
  farm_id uuid primary key references public.farms(id),
  entitlement_active boolean not null default false,
  entitlement_id text,
  product_id text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.settings (
  farm_id uuid primary key references public.farms(id),
  currency text not null default 'ILS',
  area_unit text not null default 'dunam',
  locale text not null default 'he'
);

create table public.plots (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null,
  area numeric,
  area_unit text,
  responsible_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index plots_farm_id_idx on public.plots (farm_id);

create table public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  plot_id uuid not null references public.plots(id),
  name text not null,
  season text,
  yield_unit text,
  expected_yield_per_area numeric,
  expected_price_per_unit numeric,
  forecast_updated_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index crop_cycles_farm_id_idx on public.crop_cycles (farm_id);
create index crop_cycles_plot_id_idx on public.crop_cycles (plot_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  plot_id uuid references public.plots(id),
  title text not null,
  notes text,
  photo_url text,
  voice_note_url text,
  due_date date,
  estimated_cost numeric,
  assigned_to uuid references auth.users(id),
  completed_at timestamptz,  -- אירוע, לא בוליאני. אין UPDATE שהופך true ל-false, רק קביעה חד-כיוונית
  completed_by uuid references auth.users(id),
  snoozed_until date,
  snooze_count int not null default 0,
  created_log_id uuid,     -- קישור אופציונלי הפוך בלבד, ראה הערה למטה. אין FK מכיוון LogEntry
  created_expense_id uuid, -- קישור אופציונלי הפוך בלבד
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_farm_id_idx on public.tasks (farm_id);
create index tasks_plot_id_idx on public.tasks (plot_id);

create table public.task_cost_memory (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  title_normalized text not null,
  last_cost numeric not null,
  updated_at timestamptz not null default now(),
  unique (farm_id, title_normalized)
);
create index task_cost_memory_farm_id_idx on public.task_cost_memory (farm_id);

-- עצמאי לחלוטין מ-Task, בכוונה. שום FK ל-tasks בטבלה הזו.
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  plot_id uuid references public.plots(id),
  date date not null,
  type text not null check (type in ('spray', 'harvest', 'other')),
  note text,
  source text not null check (source in ('task', 'manual', 'voice')),
  spray_pest text,
  spray_material text,
  spray_dose text,
  spray_phi_days int,
  harvest_qty numeric,
  harvest_unit text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
  -- safe_harvest_date נגזר בזמן קריאה מ-date + spray_phi_days, ראה packages/shared, לא מחושב כאן
);
create index log_entries_farm_id_idx on public.log_entries (farm_id);
create index log_entries_plot_id_idx on public.log_entries (plot_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  amount numeric not null,
  category text,
  date date not null,
  note text,
  source text not null default 'manual' check (source in ('manual', 'voice', 'ocr')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index expenses_farm_id_idx on public.expenses (farm_id);

create table public.expense_allocations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  expense_id uuid not null references public.expenses(id),
  plot_id uuid not null references public.plots(id),
  percent numeric,
  amount numeric,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint expense_allocations_percent_xor_amount check ((percent is not null) <> (amount is not null))
);
create index expense_allocations_farm_id_idx on public.expense_allocations (farm_id);
create index expense_allocations_expense_id_idx on public.expense_allocations (expense_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  expense_id uuid not null references public.expenses(id),
  storage_path text not null,
  mime_type text,
  uploaded_at timestamptz not null default now(),
  source text,
  ocr_raw jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- קבלה פעילה אחת בכל רגע נתון להוצאה, מחיקה רכה מאפשרת צירוף מחדש
create unique index receipts_one_active_per_expense on public.receipts (expense_id) where deleted_at is null;
create index receipts_farm_id_idx on public.receipts (farm_id);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  source_expense_id uuid not null references public.expenses(id),
  frequency text not null check (frequency in ('monthly', 'yearly')),
  allocation_strategy text,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recurring_rules_farm_id_idx on public.recurring_rules (farm_id);

-- קישורים הפוכים אופציונליים, נוספים רק אחרי ששתי הטבלאות קיימות
alter table public.tasks
  add constraint tasks_created_log_id_fkey foreign key (created_log_id) references public.log_entries(id);
alter table public.tasks
  add constraint tasks_created_expense_id_fkey foreign key (created_expense_id) references public.expenses(id);

-- ====================================================================
-- פונקציות עזר ל-RLS, בסכמת private, security definer, עוקפות RLS
-- כדי למנוע רקורסיה כשמדיניות מסתמכת על חברות במשק
-- ====================================================================

create or replace function private.active_member_farm_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select farm_id
  from public.farm_members
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;
$$;

create or replace function private.farm_role(p_farm_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.farm_members
  where farm_id = p_farm_id
    and user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  limit 1;
$$;

-- ה-authenticated role חייב USAGE על סכמת private כדי לקרוא לפונקציות
-- העזר בתוך מדיניות ה-RLS. בלי זה, כל קריאה/כתיבה שמפעילה מדיניות
-- שמסתמכת על farm_role() נכשלת ב-permission denied for schema private.
grant usage on schema private to authenticated;

revoke all on function private.active_member_farm_ids() from public;
revoke all on function private.farm_role(uuid) from public;
grant execute on function private.active_member_farm_ids() to authenticated;
grant execute on function private.farm_role(uuid) to authenticated;

-- ====================================================================
-- יצירת משק, נקודת הכניסה היחידה ליצירת Farm + FarmMember(owner).
-- security definer כדי לפתור בעיית ביצה ותרנגולת, אין דרך אחרת להכניס
-- את רשומת ה-owner הראשונה כי מדיניות ה-INSERT על farm_members דורשת
-- כבר להיות owner/manager באותו משק.
-- ====================================================================

create or replace function public.create_farm(
  p_name text,
  p_currency text default 'ILS',
  p_area_unit text default 'dunam',
  p_locale text default 'he'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.farms (name) values (p_name) returning id into v_farm_id;
  insert into public.farm_members (farm_id, user_id, role, status)
    values (v_farm_id, auth.uid(), 'owner', 'active');
  insert into public.settings (farm_id, currency, area_unit, locale)
    values (v_farm_id, p_currency, p_area_unit, p_locale);
  insert into public.subscriptions (farm_id) values (v_farm_id);

  return v_farm_id;
end;
$$;

revoke all on function public.create_farm(text, text, text, text) from public;
grant execute on function public.create_farm(text, text, text, text) to authenticated;

-- ====================================================================
-- RLS, מבוסס תמיד על farm_members, אף פעם לא על user_id ישיר.
--
-- חלוקת הרשאות לפי תפקיד, החלטה מתועדת (תואמת Worker Mode ב-design.md):
--   owner/manager בלבד יוצרים ועורכים Plot ו-CropCycle, ומשנים שם משק
--   והגדרות (currency/area_unit/locale). אלה פעולות מבניות של הקמת
--   וניהול המשק, לא פעולות שדה יומיומיות.
--   worker כן יוצר ועורך Task ו-LogEntry (כולל רשומות ריסוס וקטיף),
--   כי אלה בדיוק הפעולות שהעובד בשטח מבצע. כל שלושת התפקידים קוראים
--   את הנתונים התפעוליים של המשק (חוץ מהעמודות הממוסכות).
--
-- שתי משפחות מדיניות:
-- 1. טבלאות תפעוליות (plots, crop_cycles, tasks, log_entries, farms,
--    settings, subscriptions) — כל חבר פעיל במשק (owner/manager/worker)
--    רואה. עריכה מוגבלת ל-owner/manager במקומות שמפורטים למטה.
-- 2. טבלאות כסף (expenses, expense_allocations, receipts,
--    recurring_rules, task_cost_memory) — worker חסום לגמרי ברמת
--    השורה. החלטה מוצרית מפורשת, לא רק הסתרת UI, כי הסתרת טאב היא
--    נוחות עיצובית ולא הגנה.
--
-- שתי עמודות רווחיות שיושבות בתוך טבלאות תפעוליות (crop_cycles.
-- expected_yield_per_area, crop_cycles.expected_price_per_unit,
-- tasks.estimated_cost) מוסתרות מ-worker ברמת העמודה, לא ברמת השורה,
-- כי חסימת השורה כולה הייתה מסתירה גם שם גידול ותאריך יעד שה-worker
-- כן צריך לראות. הפתרון, view ממוסך על הטבלה הבסיסית, ראה בהמשך.
-- ====================================================================

alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.settings enable row level security;
alter table public.plots enable row level security;
alter table public.crop_cycles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_cost_memory enable row level security;
alter table public.log_entries enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_allocations enable row level security;
alter table public.receipts enable row level security;
alter table public.recurring_rules enable row level security;

-- --- farms ---
-- אין מדיניות INSERT בכוונה, יצירת משק עוברת רק דרך create_farm().
-- הערה על soft delete, החלטה מתועדת: מדיניות ה-SELECT אוכפת רק גבול
-- משק ותפקיד, ולא מסננת deleted_at. סינון רשומות מחוקות קורה בשכבת
-- הקריאה, ב-views ובקוד הלקוח, כי לראות רשומה מחוקה של המשק שלך הוא
-- לא חציית גבול אבטחה, זה אותו נתון שממילא מורשה לך. אחרת מחיקה רכה
-- (UPDATE שקובע deleted_at) הייתה נכשלת, כי השורה החדשה מסתירה את
-- עצמה מה-SELECT תוך כדי העדכון.
create policy "farms_select" on public.farms
  for select to authenticated
  using (id in (select private.active_member_farm_ids()));

create policy "farms_update" on public.farms
  for update to authenticated
  using (private.farm_role(id) in ('owner', 'manager'))
  with check (private.farm_role(id) in ('owner', 'manager'));

-- --- farm_members ---
-- SELECT, כל חבר פעיל רואה את כל הרוסטר של המשק שלו (לא מידע רגיש).
-- INSERT/UPDATE, owner/manager בלבד. עבור החבר הראשון (owner) הביצה
-- ותרנגולת נפתרת דרך create_farm(), לא דרך המדיניות הזו.
create policy "farm_members_select" on public.farm_members
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

create policy "farm_members_insert" on public.farm_members
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "farm_members_update" on public.farm_members
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

-- --- subscriptions ---
-- קריאה בלבד ללקוחות, עדכון entitlement מגיע רק מה-Worker דרך webhook
-- עם service_role שעוקף RLS, אין מדיניות UPDATE/INSERT ללקוח כלל.
create policy "subscriptions_select" on public.subscriptions
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

-- --- settings ---
create policy "settings_select" on public.settings
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

create policy "settings_update" on public.settings
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

-- --- plots ---
-- כל חבר פעיל רואה, יצירה ועריכה מוגבלות ל-owner/manager (הקמת המשק
-- היא פעולה מבנית, לא פעולת שדה יומיומית של worker).
create policy "plots_select" on public.plots
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

create policy "plots_insert" on public.plots
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "plots_update" on public.plots
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

-- --- crop_cycles ---
-- הטבלה הבסיסית חסומה לקריאה ישירה מהלקוח (ראה REVOKE בהמשך), קריאה
-- רק דרך crop_cycles_view שממסך את שתי עמודות התחזית מ-worker.
-- כתיבה, owner/manager בלבד, ישירות על הטבלה הבסיסית.
create policy "crop_cycles_select" on public.crop_cycles
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

create policy "crop_cycles_insert" on public.crop_cycles
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "crop_cycles_update" on public.crop_cycles
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

-- --- tasks ---
-- כל חבר פעיל יוצר, עורך, ומשלים משימות. estimated_cost חסום מ-worker
-- גם בקריאה (דרך tasks_view) וגם בכתיבה (WITH CHECK כאן), כדי שלא
-- יישאר פער בין "רואה" ל"כותב" על אותו נתון כסף.
create policy "tasks_select" on public.tasks
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    farm_id in (select private.active_member_farm_ids())
    and (private.farm_role(farm_id) <> 'worker' or estimated_cost is null)
  );

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (farm_id in (select private.active_member_farm_ids()))
  with check (
    farm_id in (select private.active_member_farm_ids())
    and (private.farm_role(farm_id) <> 'worker' or estimated_cost is null)
  );

-- --- log_entries ---
-- עצמאי מ-tasks, כל חבר פעיל יוצר וקורא, כולל worker (הוא זה שמרסס
-- ורושם קטיף בפועל).
create policy "log_entries_select" on public.log_entries
  for select to authenticated
  using (farm_id in (select private.active_member_farm_ids()));

create policy "log_entries_insert" on public.log_entries
  for insert to authenticated
  with check (farm_id in (select private.active_member_farm_ids()));

create policy "log_entries_update" on public.log_entries
  for update to authenticated
  using (farm_id in (select private.active_member_farm_ids()))
  with check (farm_id in (select private.active_member_farm_ids()));

-- --- טבלאות כסף, worker חסום לגמרי ברמת השורה ---

create policy "expenses_select" on public.expenses
  for select to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "expenses_insert" on public.expenses
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "expenses_update" on public.expenses
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "expense_allocations_select" on public.expense_allocations
  for select to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "expense_allocations_insert" on public.expense_allocations
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "expense_allocations_update" on public.expense_allocations
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "receipts_select" on public.receipts
  for select to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "receipts_insert" on public.receipts
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "receipts_update" on public.receipts
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "recurring_rules_select" on public.recurring_rules
  for select to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "recurring_rules_insert" on public.recurring_rules
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "recurring_rules_update" on public.recurring_rules
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "task_cost_memory_select" on public.task_cost_memory
  for select to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "task_cost_memory_insert" on public.task_cost_memory
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "task_cost_memory_update" on public.task_cost_memory
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

-- ====================================================================
-- הרשאות טבלה, מפורש ולא מסתמך על ברירת מחדל.
-- RLS קובע אילו שורות, ה-GRANT קובע אם הפעולה נגישה בכלל. אין GRANT
-- ל-anon על אף טבלה כאן, כל הגישה דורשת אימות. אין GRANT DELETE בשום
-- מקום, מחיקה היא תמיד UPDATE על deleted_at.
-- ====================================================================

grant select, update on public.farms to authenticated;
grant select, insert, update on public.farm_members to authenticated;
grant select on public.subscriptions to authenticated;
grant select, update on public.settings to authenticated;
grant select, insert, update on public.plots to authenticated;
grant insert, update on public.crop_cycles to authenticated;
grant insert, update on public.tasks to authenticated;
grant select, insert, update on public.task_cost_memory to authenticated;
grant select, insert, update on public.log_entries to authenticated;
grant select, insert, update on public.expenses to authenticated;
grant select, insert, update on public.expense_allocations to authenticated;
grant select, insert, update on public.receipts to authenticated;
grant select, insert, update on public.recurring_rules to authenticated;

-- ====================================================================
-- Views ממוסכים, מגינים על עמודות רווחיות ספציפיות בתוך טבלה תפעולית
-- שאר הנתונים בשורה כן חייבים להיות גלויים ל-worker.
--
-- הטבלה הבסיסית נחסמת לקריאה ישירה מה-authenticated role (REVOKE
-- למטה), כל קריאה עוברת דרך ה-view. ה-view עצמו מסנן חברות וממסך
-- לפי תפקיד בתוך אותה שאילתה אחת, בלי תלות ב-FORCE ROW LEVEL SECURITY.
-- ====================================================================

create view public.crop_cycles_view
with (security_invoker = false)
as
select
  id,
  farm_id,
  plot_id,
  name,
  season,
  yield_unit,
  case when private.farm_role(farm_id) = 'worker' then null else expected_yield_per_area end as expected_yield_per_area,
  case when private.farm_role(farm_id) = 'worker' then null else expected_price_per_unit end as expected_price_per_unit,
  forecast_updated_at,
  created_at
from public.crop_cycles
where farm_id in (select private.active_member_farm_ids())
  and deleted_at is null;

create view public.tasks_view
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
  created_at
from public.tasks
where farm_id in (select private.active_member_farm_ids())
  and deleted_at is null;

revoke select on public.crop_cycles from authenticated;
revoke select on public.tasks from authenticated;
grant select on public.crop_cycles_view to authenticated;
grant select on public.tasks_view to authenticated;

-- ====================================================================
-- Storage, באקט פרטי לקבלות, נתיב חייב להתחיל ב-{farm_id}/, גישה רק
-- ל-owner/manager, תואם לחסימת טבלת receipts.
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_storage_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and private.farm_role((storage.foldername(name))[1]::uuid) in ('owner', 'manager')
  );

create policy "receipts_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and private.farm_role((storage.foldername(name))[1]::uuid) in ('owner', 'manager')
  );

create policy "receipts_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and private.farm_role((storage.foldername(name))[1]::uuid) in ('owner', 'manager')
  );

create policy "receipts_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and private.farm_role((storage.foldername(name))[1]::uuid) in ('owner', 'manager')
  );
