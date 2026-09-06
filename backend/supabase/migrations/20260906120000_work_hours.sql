-- Work hours on a journal entry, and what an hour costs.
--
-- Ido, 2026-09-06: "I'm out spraying weeds right now and I want to know exactly
-- what it costs me. Let me enter the material and a quantity and have the app
-- compute the material cost, AND let me enter how many hours the job took and
-- the cost per work hour. Work hours plus materials, with fixed prices I enter
-- once, and the app knows how to compute the costs." He also reported that he
-- cannot find a work-hours journal at all, because there was none.
--
-- The materials half shipped in 20260904130000_spray_pricelist.sql. This is the
-- labour half, and it is deliberately built on the very same decision.
--
-- **A rate is HISTORY, not a value.** An hour of work cost what it cost on the
-- day it was worked. One mutable rate, read back at display time, would
-- retroactively rewrite the cost of every job ever recorded the moment the
-- farmer raises it, and break the profit number. So work_cost is frozen ONTO the
-- log entry at write time, and settings.work_hourly_rate below is only a default
-- that pre-fills the next entry -- never read back to re-value a row that
-- already exists.
--
-- Manual entry always wins: work_cost can be typed directly, with no hours and
-- no rate at all. hours x rate only pre-fills a suggestion the farmer may
-- overwrite. Standing founder rule, the same one spray_cost carries.
--
-- **Not spray-only.** Ido's own example is a spray that also took him three
-- hours, but tilling, pruning and a repair take hours just the same, so these
-- three columns are offered on every log entry type. That is why writePayload()
-- does not null them per type the way it nulls the spray columns.

-- All nullable: an entry with no work hours is a valid record, and most entries
-- are. work_hours and work_hourly_rate are how the number was reached;
-- work_cost is the money, and it is the only one the profit calculation reads.
--
-- Like spray cost, these are NOT masked from a worker: log_entries is the
-- operational table the worker himself writes to, and whether a worker sees the
-- cost of his own hours is the same worker-mode question spray cost is already
-- waiting on in docs/open-items.md.
alter table public.log_entries add column work_hours numeric;
alter table public.log_entries add column work_hourly_rate numeric;
alter table public.log_entries add column work_cost numeric;

-- The farm's remembered hourly rate. A default only.
--
-- **One column and not a table**, which is the one place this deviates from the
-- material pricelist, and for a reason: a material price is per material, so it
-- needed rows keyed on the material name, while an hourly rate is a single
-- number the farm states once ("my hour is worth 60"). So it lives with the
-- other farm-level settings, next to currency and area_unit, and is written
-- through the settings update path that already exists.
--
-- Nullable with no default: a farm that has never stated a rate has not stated
-- one, while 0 would be a rate it did state. That is the same distinction
-- spray.materialNoPrice draws in the UI.
--
-- Readable by every active member (settings_select), editable by owner/manager
-- only (settings_update). Both policies already exist in core_schema.sql and are
-- deliberately left untouched.
alter table public.settings add column work_hourly_rate numeric;
