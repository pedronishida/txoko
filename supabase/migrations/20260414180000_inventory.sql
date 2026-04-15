-- =============================================================
-- Txoko — Estoque: fornecedores, ingredientes, fichas tecnicas
-- + triggers de consumo e fidelidade ao fechar pedido
-- =============================================================

-- -------------------------------------------------------------
-- SUPPLIERS
-- -------------------------------------------------------------
create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  document      text,
  phone         text,
  email         text,
  address       jsonb,
  notes         text,
  created_at    timestamptz not null default now()
);
create index on suppliers(restaurant_id);

-- -------------------------------------------------------------
-- INGREDIENTS
-- -------------------------------------------------------------
create table ingredients (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  name             text not null,
  unit             text not null default 'un',
  current_stock    numeric(10,3) not null default 0,
  min_stock        numeric(10,3) not null default 0,
  cost_per_unit    numeric(10,4),
  supplier_id      uuid references suppliers(id) on delete set null,
  storage_location text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on ingredients(restaurant_id);
create index on ingredients(supplier_id);

create trigger trg_ingredients_updated before update on ingredients
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- PRODUCT RECIPES (fichas tecnicas: produto -> ingredientes)
-- -------------------------------------------------------------
create table product_recipes (
  product_id    uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity      numeric(10,3) not null check (quantity > 0),
  created_at    timestamptz not null default now(),
  primary key (product_id, ingredient_id)
);
create index on product_recipes(ingredient_id);

-- =============================================================
-- RLS
-- =============================================================
alter table suppliers       enable row level security;
alter table ingredients     enable row level security;
alter table product_recipes enable row level security;

create policy "tenant read suppliers" on suppliers
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write suppliers" on suppliers
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

create policy "tenant read ingredients" on ingredients
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write ingredients" on ingredients
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','kitchen']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','kitchen']::restaurant_role[]));

create policy "tenant read recipes" on product_recipes
  for select to authenticated
  using (exists (
    select 1 from products p
    where p.id = product_id and p.restaurant_id = any(auth_restaurant_ids())
  ));
create policy "tenant write recipes" on product_recipes
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

-- =============================================================
-- TRIGGER: consumir estoque quando pedido e fechado
-- =============================================================
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
        select pr.ingredient_id, sum(oi.quantity * pr.quantity) as consumed
        from order_items oi
        join product_recipes pr on pr.product_id = oi.product_id
        where oi.order_id = NEW.id
          and oi.status <> 'cancelled'
        group by pr.ingredient_id
      ) sub
      where sub.ingredient_id = i.id;
  end if;
  return NEW;
end; $$;

drop trigger if exists on_order_closed_consume_stock on orders;
create trigger on_order_closed_consume_stock
  after update of status on orders
  for each row execute function consume_stock_on_order_closed();

-- =============================================================
-- TRIGGER: pontos de fidelidade quando pedido e fechado
-- Regra simples: 1 ponto a cada R$ 10 do total
-- =============================================================
create or replace function public.update_loyalty_on_order_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'closed'
     and (OLD.status is distinct from 'closed')
     and NEW.customer_id is not null then
    update customers
      set loyalty_points = loyalty_points + floor(NEW.total / 10)::int
      where id = NEW.customer_id;
  end if;
  return NEW;
end; $$;

drop trigger if exists on_order_closed_update_loyalty on orders;
create trigger on_order_closed_update_loyalty
  after update of status on orders
  for each row execute function update_loyalty_on_order_closed();

-- Realtime
alter publication supabase_realtime add table ingredients;
