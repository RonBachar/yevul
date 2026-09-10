-- Money moves to one table. The journal records what happened, not what it cost.
--
-- Founder decision, 2026-09-10. Until now the farm's money lived in two places
-- that never knew about each other:
--
--   1. public.expenses (+ expense_allocations, receipts) -- the real money
--      table, with per-plot allocation, receipts and recurring rules hanging
--      off it.
--   2. Cost columns frozen onto public.log_entries -- spray_cost, added in
--      20260904130000_spray_pricelist.sql, and work_cost, added in
--      20260906120000_work_hours.sql.
--
-- packages/shared/src/profit.ts summed BOTH, as two separate cost lines. So a
-- farmer who recorded a spray in the journal AND entered the same material as
-- an expense was charged for it twice, his profit number was wrong, and nothing
-- in the schema or the UI stopped him or even told him. There was no link
-- between the two records, so no code could have de-duplicated them either.
--
-- The fix is not a smarter sum. It is one source of truth: **every shekel the
-- farm spends is a row in public.expenses.** The journal keeps its own job,
-- which is the operational record of what was done, on which plot, on which
-- day, with which material.
--
-- **Why the breakdown columns stay.** spray_material, spray_quantity,
-- spray_quantity_unit, spray_unit_price, work_hours and work_hourly_rate are
-- NOT money -- they are the record of how a number was reached, and they are
-- operational facts the farmer wants on the journal row itself ("three kilos of
-- Confidor, four hours"). They also stay for the exact reason the two earlier
-- migrations gave for freezing the cost in the first place: a price is HISTORY,
-- not a value. The quantity and the rate that applied on that day belong to
-- that day's row and must never be re-derived from today's pricelist. Only the
-- product of them -- the money -- moves out to expenses.
--
-- **Why a link column and not a deletion.** log_entries.created_expense_id
-- deliberately mirrors tasks.created_expense_id, which has carried exactly this
-- meaning since core_schema.sql: an optional, backwards-only pointer from the
-- operational row to the money row it produced. It lets the app show "this
-- spray cost 120" without storing the 120 twice, and it is what makes the
-- double-count structurally impossible rather than merely discouraged.

-- ====================================================================
-- 1. The link column
-- ====================================================================

-- Same shape as tasks.created_expense_id: a nullable uuid with a foreign key to
-- public.expenses(id), and **no index**. That is not an oversight copied from
-- the older table -- neither column is ever queried the other way round ("find
-- the journal entry that made this expense"), the traffic is always the forward
-- read of a row already in hand, and the two existing indexes on log_entries
-- (farm_id, plot_id) are the ones that carry every real query. If a reverse
-- lookup is ever needed, both tables get the index together.
--
-- No ON DELETE clause, again matching tasks: expenses are soft-deleted
-- (deleted_at), never removed, so the reference cannot dangle.
alter table public.log_entries
  add column created_expense_id uuid references public.expenses(id);

-- ====================================================================
-- 2. Carry the existing money across. Nothing may be lost.
-- ====================================================================

-- This runs on a real vineyard's production data, so it is written to be
-- provable rather than clever: mint the expense ids first into a scratch table,
-- then insert the expenses, then the allocations, then point the journal rows
-- at them. Every step is a plain set operation over the same fixed set of log
-- ids, so the three row counts must match, and no row can be half-migrated.
--
-- Only rows with deleted_at is null are carried. A soft-deleted journal entry is
-- money the farmer already took back; resurrecting it as a live expense would
-- ADD money that the profit number does not have today.
create temporary table money_single_source_map as
select
  l.id as log_id,
  gen_random_uuid() as expense_id,
  l.farm_id,
  l.plot_id,
  l.date,
  -- **One journal entry produces one expense**, even when it carries both a
  -- material cost and a labour cost. Splitting a single "I sprayed for three
  -- hours" into two expense rows would show the farmer two entries he never
  -- made, and would double the number of things he has to reconcile against his
  -- receipts. The material/hours breakdown stays readable on the journal row.
  coalesce(l.spray_cost, 0) + coalesce(l.work_cost, 0) as amount,
  -- expenses.category is the expense NAME in the UI, not a domain: it is bare
  -- `text` with no check constraint (core_schema.sql), and
  -- packages/shared/src/expenses.ts maps it straight to `name` because Ido
  -- rejected a closed category list outright. So the best name available is the
  -- material he sprayed; failing that, the Hebrew label the app already shows
  -- for that entry type, copied verbatim from the log.type.* keys in
  -- packages/shared/src/i18n.ts so no new Hebrew enters the product here.
  coalesce(
    nullif(btrim(l.spray_material), ''),
    case l.type
      when 'till' then 'חריש'
      when 'sow' then 'זריעה'
      when 'fertilize' then 'דישון'
      when 'spray' then 'ריסוס'
      when 'irrigate' then 'השקיה'
      when 'prune' then 'גיזום'
      when 'thin' then 'דילול'
      when 'harvest' then 'קטיף'
      when 'repair' then 'תיקון'
      else 'אחר'
    end
  ) as category,
  -- The note is carried. Both columns hold the same kind of thing -- a free-text
  -- remark the farmer typed himself -- and neither is parsed, keyed on or
  -- rendered with any structure by any code path, so there is no conflict to
  -- avoid and no meaning that changes in transit. Dropping it would be the only
  -- lossy step in this migration: the note is often the only place that says
  -- what the money was actually for.
  l.note,
  l.created_at
from public.log_entries l
where l.deleted_at is null
  and (l.spray_cost is not null or l.work_cost is not null);

-- source = 'manual'. The expenses check constraint allows manual/voice/ocr
-- only, so 'task' -- which log_entries.source also permits -- has nowhere to go,
-- and there is no honest value for "created by a migration". 'manual' is the
-- column's own default and says the true thing about all of these rows: a person
-- typed this number into a form.
--
-- created_by is left null on purpose, and this is the one field the plan for
-- this migration assumed we had: **log_entries has no created_by column.** It
-- has never had one. Nothing is lost -- there is simply no author recorded on a
-- journal entry to carry -- and null is exactly what expenses.created_by already
-- means for every row written before that field was populated.
--
-- created_at is carried, so the expense is as old as the work it paid for.
insert into public.expenses (id, farm_id, amount, category, date, note, source, created_by, created_at)
select m.expense_id, m.farm_id, m.amount, m.category, m.date, m.note, 'manual', null, m.created_at
from money_single_source_map m;

-- The allocation, only where the journal entry named a plot.
--
-- amount and NOT percent: expense_allocations carries the XOR check constraint
-- expense_allocations_percent_xor_amount, so exactly one of the two must be set,
-- and the amount is the one we actually know. It is also what
-- writeAllocation() in packages/shared/src/expenses.ts already writes for a
-- single-plot expense, so these rows are indistinguishable from ones the app
-- created.
--
-- A journal entry with no plot_id becomes a farm-level expense with no
-- allocation row at all. That is not a gap: it is exactly how a general expense
-- already behaves, and the profit calculation already handles it.
insert into public.expense_allocations (farm_id, expense_id, plot_id, amount, created_at)
select m.farm_id, m.expense_id, m.plot_id, m.amount, m.created_at
from money_single_source_map m
where m.plot_id is not null;

update public.log_entries l
set created_expense_id = m.expense_id
from money_single_source_map m
where l.id = m.log_id;

drop table money_single_source_map;

-- ====================================================================
-- 3. Drop the money columns
-- ====================================================================

-- No view depends on either column, so this is a plain drop. log_entries is
-- still read directly by the clients -- unlike crop_cycles and tasks it has no
-- masking view, which is the open worker-mode item in docs/open-items.md -- and
-- these two columns were the loudest argument for adding one. They are leaving,
-- which shrinks that question rather than answering it: the remaining money-ish
-- column on the journal row is spray_unit_price, and it goes wherever the
-- worker-mode decision in stage 6 sends it.
alter table public.log_entries drop column spray_cost;
alter table public.log_entries drop column work_cost;
