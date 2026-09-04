-- Spray materials pricelist and per-spray cost.
--
-- Ido's request (docs/open-items.md items (ה)/(ו)): the farmer enters a
-- material price once, then on each spray enters the material and a quantity,
-- and the app computes the cost.
--
-- The one decision that shapes the schema: a price is HISTORY, not a value. A
-- material costs differently between purchases, and a spray from six months ago
-- must keep the price it had THEN. A single mutable price-per-material would
-- retroactively rewrite the cost of every past spray the moment it is updated,
-- and break the profit number. So the cost is frozen ONTO the spray row at write
-- time, and the pricelist below is only a default that pre-fills the next entry,
-- never read back to re-value a row that already exists.
--
-- Manual entry always wins: spray_cost can be typed directly, with no quantity
-- and no unit price. quantity x unit_price only pre-fills a suggestion that the
-- farmer can overwrite.

-- Unit of a spray material. Mirrors SPRAY_UNITS in
-- packages/shared/src/sprayEntry.ts; keep the two lists in sync, exactly like
-- the value domains in 20260824070000_value_domains.sql and settings.ts.
create domain public.spray_unit as text
  check (value in ('liter', 'kg'));

-- Cost fields frozen on the spray row at write time. All nullable: a spray with
-- no cost is a valid record, and only sprays carry them (writePayload forces
-- them to null for every other log type).
--
-- quantity + quantity_unit are operational (the farmer who sprayed knows them).
-- unit_price + cost are money. They are NOT masked from a worker yet: worker
-- mode does not exist until stage 6, and whether a worker sees spray cost is a
-- worker-mode design decision that belongs there. Tracked in docs/open-items.md.
alter table public.log_entries add column spray_quantity numeric;
alter table public.log_entries add column spray_quantity_unit public.spray_unit;
alter table public.log_entries add column spray_unit_price numeric;
alter table public.log_entries add column spray_cost numeric;

-- Per-farm remembered price for a material. A default only.
--
-- Modeled on task_cost_memory: a "last value for a named thing" keyed on the
-- normalized name, upserted, with no soft delete, because a price is overwritten
-- and never deleted. material_normalized mirrors normalizeSprayMaterial() in
-- packages/shared/src/sprayEntry.ts.
create table public.spray_material_prices (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  material_normalized text not null,
  unit_price numeric not null,
  unit public.spray_unit not null,
  updated_at timestamptz not null default now(),
  unique (farm_id, material_normalized)
);
create index spray_material_prices_farm_id_idx on public.spray_material_prices (farm_id);

alter table public.spray_material_prices enable row level security;

-- Money table: worker blocked at row level, owner/manager only, exactly like
-- task_cost_memory. A per-kg price is a cost figure.
create policy "spray_material_prices_select" on public.spray_material_prices
  for select to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "spray_material_prices_insert" on public.spray_material_prices
  for insert to authenticated
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

create policy "spray_material_prices_update" on public.spray_material_prices
  for update to authenticated
  using (private.farm_role(farm_id) in ('owner', 'manager'))
  with check (private.farm_role(farm_id) in ('owner', 'manager'));

-- No DELETE grant: a remembered price is overwritten via upsert, never deleted.
grant select, insert, update on public.spray_material_prices to authenticated;
