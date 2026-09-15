-- A task can belong to several plots, and a task has no estimated cost.
--
-- 1. task_plots is the join table that replaces tasks.plot_id. A task with no
--    rows in it is a farm-level task, which is what a null plot_id meant.
-- 2. tasks.estimated_cost is dropped outright. Existing values are discarded;
--    that is the founder's decision of 2026-09-15. task_cost_memory stays: it
--    is fed by the completion prompt's expense amount, not by this column.
-- 3. log_entries.task_id links a journal entry back to the task whose
--    completion wrote it. Completing a task now writes one entry per plot, and
--    the farm-wide journal needs this key to show those entries once.

-- ====================================================================
-- 1. task_plots
-- ====================================================================

create table public.task_plots (
  task_id uuid not null references public.tasks(id),
  plot_id uuid not null references public.plots(id),
  primary key (task_id, plot_id)
);

create index task_plots_plot_id_idx on public.task_plots (plot_id);

alter table public.task_plots enable row level security;

-- Same rule as tasks: every active member of the task's farm reads and writes
-- the set, workers included. The farm is reached through the task, and the plot
-- must belong to that same farm, so a member cannot hang another farm's plot on
-- his own task. The columns are qualified with the table name on purpose: while
-- tasks still has plot_id, a bare `plot_id` inside the subquery resolves to
-- t.plot_id, not to the row being checked.
create policy "task_plots_select" on public.task_plots
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_plots.task_id
        and t.farm_id in (select private.active_member_farm_ids())
    )
  );

create policy "task_plots_insert" on public.task_plots
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.tasks t
      join public.plots p on p.farm_id = t.farm_id
      where t.id = task_plots.task_id
        and p.id = task_plots.plot_id
        and t.farm_id in (select private.active_member_farm_ids())
    )
  );

-- A real DELETE, unlike every other table. A join row is not a record of
-- anything: replacing a task's plot set means removing the rows that are no
-- longer in it, and a soft-deleted join row would only be a filter every read
-- has to remember.
create policy "task_plots_delete" on public.task_plots
  for delete to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_plots.task_id
        and t.farm_id in (select private.active_member_farm_ids())
    )
  );

grant select, insert, delete on public.task_plots to authenticated;

insert into public.task_plots (task_id, plot_id)
select id, plot_id from public.tasks where plot_id is not null;

-- ====================================================================
-- 2. Drop tasks.plot_id and tasks.estimated_cost
-- ====================================================================

-- tasks_view selects both columns and the two write policies check
-- estimated_cost, so all three go first and come back without them.
drop view public.tasks_view;

drop policy "tasks_insert" on public.tasks;
drop policy "tasks_update" on public.tasks;

alter table public.tasks drop column plot_id;
alter table public.tasks drop column estimated_cost;

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (farm_id in (select private.active_member_farm_ids()));

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (farm_id in (select private.active_member_farm_ids()))
  with check (farm_id in (select private.active_member_farm_ids()));

-- The view stays (it still filters deleted rows and scopes to the member's
-- farms), just without the two columns. The column-level SELECT grant on
-- public.tasks from 20260824090000 loses the dropped columns on its own.
create view public.tasks_view
with (security_invoker = false)
as
select
  id,
  farm_id,
  title,
  notes,
  photo_url,
  voice_note_url,
  due_date,
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

grant select on public.tasks_view to authenticated;

-- ====================================================================
-- 3. log_entries.task_id
-- ====================================================================

alter table public.log_entries add column task_id uuid references public.tasks(id);

create index log_entries_task_id_idx on public.log_entries (task_id);

-- Entries written by a completion before this migration are linked through
-- tasks.created_log_id, one entry per task.
update public.log_entries le
set task_id = t.id
from public.tasks t
where t.created_log_id = le.id;
