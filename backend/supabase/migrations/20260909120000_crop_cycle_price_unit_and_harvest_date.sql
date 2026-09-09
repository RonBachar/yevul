-- Two columns on the forecast: the unit the PRICE is quoted in, and when the
-- crop is expected to be picked.
--
-- Ido and the founder, on the plot screens, 2026-09-09. A farmer states his
-- yield in tons per dunam and his price in shekels per kilo, and the app had
-- exactly one unit column for both. So "3" and "4" were multiplied together as
-- if they shared a unit, and a farmer who meant 4 per kilo but typed 4000 per
-- ton got a number that looked just as plausible either way. Splitting the unit
-- in two is what lets the app convert (1 ton = 1000 kg) instead of guessing, and
-- it is what makes the plain-Hebrew arithmetic sentence under the fields
-- possible at all.
--
-- **Additive only.** No drops, no rewrites of existing values, no policy
-- changes. Every existing row keeps the free-text yield_unit it already has and
-- reads back exactly as it did; price_unit is simply null on all of them, and
-- packages/shared/src/yieldUnits.ts reads a null price unit as "quoted in the
-- yield's own unit", which is precisely the arithmetic those rows were saved
-- under. Nothing a farmer entered changes meaning or value.
--
-- **No CHECK constraint on the two unit columns, deliberately.** The product
-- decision narrows the choice to three units (kg / ton / unit) and the pickers
-- in both clients now offer exactly those three. A database constraint would
-- have to be reconciled with rows that already hold 'ארגזים' or anything else a
-- farmer typed when the column was free text, and reconciling means either
-- rewriting his data or refusing to add the constraint. Neither is worth it:
-- the narrowing belongs where the value is chosen, and the read path maps what
-- maps and leaves the rest readable.

-- The unit expected_price_per_unit is quoted in. Free text like yield_unit, and
-- for the same reason: this table is deliberately crop-agnostic, and the layer
-- that turns text into one of three known units is shared code that both
-- clients call. Null means "the same unit as yield_unit", which is what every
-- row written before today meant.
alter table public.crop_cycles add column price_unit text;

-- מועד קטיף משוער. A date and not a timestamp: a farmer picks a day off a
-- calendar, and the time of day carries no information here. Nullable, because
-- a plot whose picking date is not yet known is the normal state for most of
-- the year -- the same reason expected_yield_per_area is nullable.
alter table public.crop_cycles add column expected_harvest_date date;

-- The column-level SELECT grant from 20260824080000 enumerates columns, so new
-- ones are not covered by it and have to be named. Both are added for the same
-- reason yield_unit is on that list: they are descriptive, not money. The two
-- masked columns (expected_yield_per_area, expected_price_per_unit) stay off it
-- and stay reachable only through crop_cycles_view, exactly as before.
grant select (price_unit, expected_harvest_date) on public.crop_cycles to authenticated;

-- The view is the only way the clients read this table, so the two columns have
-- to be on it or they do not exist as far as the app is concerned.
--
-- CREATE OR REPLACE and not DROP + CREATE: replacing keeps the grant on the view
-- and every dependency intact, and Postgres allows it as long as the existing
-- columns keep their names, types and order and the new ones are appended at the
-- end. That is what this does -- the ten original columns are byte-for-byte the
-- ones in 20260820120000_core_schema.sql, including the two role-masked cases,
-- and price_unit / expected_harvest_date follow them.
--
-- **Neither new column is masked from a worker.** The masking rule in this
-- schema covers money, and it covers it because a worker must not see what the
-- farm earns. A unit name is not money -- yield_unit has never been masked -- and
-- a picking date is operational information a worker in the field has more use
-- for than anyone.
create or replace view public.crop_cycles_view
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
  created_at,
  price_unit,
  expected_harvest_date
from public.crop_cycles
where farm_id in (select private.active_member_farm_ids())
  and deleted_at is null;
