-- =============================================================
-- Txoko — Schema inicial
-- Multi-tenant (restaurant_id + RLS) com helpers em auth.uid().
-- =============================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------
-- ENUMS
-- -------------------------------------------------------------
create type restaurant_role as enum ('owner','manager','waiter','kitchen','cashier');
create type table_status   as enum ('free','occupied','reserved','cleaning');
create type order_status   as enum ('draft','open','in_kitchen','ready','served','paid','cancelled');
create type order_type     as enum ('dine_in','takeaway','delivery');
create type order_item_status as enum ('pending','preparing','ready','delivered','cancelled');

-- -------------------------------------------------------------
-- RESTAURANTS (tenant root)
-- -------------------------------------------------------------
create table restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  legal_name  text,
  cnpj        text,
  phone       text,
  email       text,
  address     jsonb,
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- MEMBERSHIPS (user <-> restaurant)
-- -------------------------------------------------------------
create table restaurant_members (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          restaurant_role not null default 'waiter',
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index on restaurant_members(user_id);

-- -------------------------------------------------------------
-- RLS helper functions
-- -------------------------------------------------------------
create or replace function public.auth_restaurant_ids()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(restaurant_id), '{}')
  from restaurant_members
  where user_id = auth.uid();
$$;

create or replace function public.auth_has_role(rest_id uuid, roles restaurant_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from restaurant_members
    where restaurant_id = rest_id
      and user_id = auth.uid()
      and role = any(roles)
  );
$$;

-- -------------------------------------------------------------
-- CATEGORIES
-- -------------------------------------------------------------
create table categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  description   text,
  sort_order    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on categories(restaurant_id);

-- -------------------------------------------------------------
-- PRODUCTS
-- -------------------------------------------------------------
create table products (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  category_id     uuid references categories(id) on delete set null,
  name            text not null,
  description     text,
  price           numeric(10,2) not null check (price >= 0),
  cost            numeric(10,2),
  image_url       text,
  sku             text,
  stock_tracked   boolean not null default false,
  stock_quantity  int,
  available       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on products(restaurant_id);
create index on products(category_id);

-- -------------------------------------------------------------
-- TABLES (mesas)
-- -------------------------------------------------------------
create table tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  number        int not null,
  label         text,
  seats         int not null default 4,
  status        table_status not null default 'free',
  created_at    timestamptz not null default now(),
  unique (restaurant_id, number)
);
create index on tables(restaurant_id);

-- -------------------------------------------------------------
-- CUSTOMERS
-- -------------------------------------------------------------
create table customers (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  name           text not null,
  phone          text,
  email          text,
  cpf            text,
  birthday       date,
  loyalty_points int not null default 0,
  created_at     timestamptz not null default now()
);
create index on customers(restaurant_id);
create index on customers(phone);

-- -------------------------------------------------------------
-- ORDERS
-- -------------------------------------------------------------
create table orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  number        bigserial not null,
  table_id      uuid references tables(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  waiter_id     uuid references auth.users(id) on delete set null,
  type          order_type not null default 'dine_in',
  status        order_status not null default 'open',
  subtotal      numeric(10,2) not null default 0,
  discount      numeric(10,2) not null default 0,
  service_fee   numeric(10,2) not null default 0,
  total         numeric(10,2) not null default 0,
  notes         text,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on orders(restaurant_id, status);
create index on orders(table_id);

-- -------------------------------------------------------------
-- ORDER ITEMS
-- -------------------------------------------------------------
create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id) on delete restrict,
  quantity    int not null check (quantity > 0),
  unit_price  numeric(10,2) not null,
  total       numeric(10,2) not null,
  notes       text,
  status      order_item_status not null default 'pending',
  created_at  timestamptz not null default now()
);
create index on order_items(order_id);

-- -------------------------------------------------------------
-- updated_at trigger
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger trg_restaurants_updated before update on restaurants
  for each row execute function set_updated_at();
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

-- =============================================================
-- RLS
-- =============================================================
alter table restaurants        enable row level security;
alter table restaurant_members enable row level security;
alter table categories         enable row level security;
alter table products           enable row level security;
alter table tables             enable row level security;
alter table customers          enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;

-- ---- restaurants ----
create policy "members read restaurant" on restaurants
  for select to authenticated
  using (id = any(auth_restaurant_ids()));

create policy "owners update restaurant" on restaurants
  for update to authenticated
  using (auth_has_role(id, array['owner']::restaurant_role[]))
  with check (auth_has_role(id, array['owner']::restaurant_role[]));

create policy "public read active restaurants" on restaurants
  for select to anon
  using (active = true);

-- ---- restaurant_members ----
create policy "read own memberships" on restaurant_members
  for select to authenticated
  using (user_id = auth.uid() or restaurant_id = any(auth_restaurant_ids()));

create policy "managers manage members" on restaurant_members
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- ---- categories ----
create policy "tenant read categories" on categories
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write categories" on categories
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));
create policy "public read active categories" on categories
  for select to anon
  using (active = true);

-- ---- products ----
create policy "tenant read products" on products
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write products" on products
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));
create policy "public read available products" on products
  for select to anon
  using (available = true);

-- ---- tables ----
create policy "tenant read tables" on tables
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write tables" on tables
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','waiter']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','waiter']::restaurant_role[]));

-- ---- customers ----
create policy "tenant read customers" on customers
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write customers" on customers
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]));

-- ---- orders ----
create policy "tenant read orders" on orders
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write orders" on orders
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier','kitchen']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier','kitchen']::restaurant_role[]));

-- ---- order_items (via parent order) ----
create policy "tenant read order_items" on order_items
  for select to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.restaurant_id = any(auth_restaurant_ids())
  ));
create policy "tenant write order_items" on order_items
  for all to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and auth_has_role(o.restaurant_id, array['owner','manager','waiter','cashier','kitchen']::restaurant_role[])
  ))
  with check (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and auth_has_role(o.restaurant_id, array['owner','manager','waiter','cashier','kitchen']::restaurant_role[])
  ));

-- =============================================================
-- Realtime: habilitar stream para tabelas transacionais
-- =============================================================
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table tables;
