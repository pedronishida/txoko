-- =============================================================
-- Txoko — Fichas Tecnicas (Recipe Cards) com CMV
-- Extends existing product_recipes with full recipe metadata
-- and rich ingredient rows with waste_percent, unit, notes.
-- =============================================================

-- -------------------------------------------------------------
-- 1. recipe_metadata  (yield, prep_time, instructions per product)
-- -------------------------------------------------------------
create table if not exists recipe_metadata (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id) on delete cascade,
  product_id        uuid not null references products(id) on delete cascade,
  yield_quantity    numeric(10,3) not null default 1,
  yield_unit        text not null default 'porcao',
  prep_time_minutes int,
  instructions      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (product_id)
);
create index on recipe_metadata(restaurant_id);

create trigger trg_recipe_metadata_updated before update on recipe_metadata
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- 2. recipe_ingredients  (rich join: quantity, unit, waste, notes)
-- -------------------------------------------------------------
create table if not exists recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity      numeric(10,4) not null check (quantity > 0),
  unit          text not null,
  waste_percent numeric(5,2) not null default 0 check (waste_percent >= 0 and waste_percent <= 100),
  notes         text,
  sort_order    int not null default 0,
  unique (product_id, ingredient_id)
);
create index on recipe_ingredients(product_id);
create index on recipe_ingredients(ingredient_id);

-- Migrate existing product_recipes rows into recipe_ingredients
insert into recipe_ingredients (product_id, ingredient_id, quantity, unit, waste_percent, sort_order)
select
  pr.product_id,
  pr.ingredient_id,
  pr.quantity,
  coalesce(i.unit, 'un'),
  0,
  row_number() over (partition by pr.product_id order by pr.ingredient_id) - 1
from product_recipes pr
join ingredients i on i.id = pr.ingredient_id
on conflict (product_id, ingredient_id) do nothing;

-- Seed recipe_metadata for any product that already had recipes
insert into recipe_metadata (restaurant_id, product_id)
select distinct p.restaurant_id, pr.product_id
from product_recipes pr
join products p on p.id = pr.product_id
on conflict (product_id) do nothing;

-- -------------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------------
alter table recipe_metadata    enable row level security;
alter table recipe_ingredients enable row level security;

create policy "tenant read recipe_metadata" on recipe_metadata
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "managers write recipe_metadata" on recipe_metadata
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

create policy "tenant read recipe_ingredients" on recipe_ingredients
  for select to authenticated
  using (exists (
    select 1 from products p
    where p.id = product_id
      and p.restaurant_id = any(auth_restaurant_ids())
  ));

create policy "managers write recipe_ingredients" on recipe_ingredients
  for all to authenticated
  using (exists (
    select 1 from products p
    where p.id = product_id
      and auth_has_role(p.restaurant_id, array['owner','manager']::restaurant_role[])
  ))
  with check (exists (
    select 1 from products p
    where p.id = product_id
      and auth_has_role(p.restaurant_id, array['owner','manager']::restaurant_role[])
  ));

-- -------------------------------------------------------------
-- 4. Update stock-consumption trigger to use recipe_ingredients
-- -------------------------------------------------------------
create or replace function public.consume_stock_on_order_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'closed' and (OLD.status is distinct from 'closed') then
    update ingredients i
      set current_stock = i.current_stock - sub.consumed
      from (
        select
          ri.ingredient_id,
          sum(
            oi.quantity
            * ri.quantity
            * (1 + ri.waste_percent / 100.0)
          ) as consumed
        from order_items oi
        join recipe_ingredients ri on ri.product_id = oi.product_id
        where oi.order_id = NEW.id
          and oi.status <> 'cancelled'
        group by ri.ingredient_id
      ) sub
      where sub.ingredient_id = i.id;
  end if;
  return NEW;
end; $$;

-- -------------------------------------------------------------
-- 5. compute_recipe_cost(product_id) -> numeric
-- -------------------------------------------------------------
create or replace function public.compute_recipe_cost(p_product_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    ri.quantity * (1 + ri.waste_percent / 100.0) * i.cost_per_unit
  ), 0)
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  where ri.product_id = p_product_id
    and i.cost_per_unit is not null;
$$;
