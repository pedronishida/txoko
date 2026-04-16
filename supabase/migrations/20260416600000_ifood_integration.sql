-- =============================================================
-- Txoko — iFood Integration
-- Tabelas para credenciais, eventos e mapeamento de produtos.
-- =============================================================

-- -------------------------------------------------------------
-- 1. ifood_integrations  (credenciais por restaurante)
-- -------------------------------------------------------------
create table if not exists ifood_integrations (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id) on delete cascade,
  merchant_id       text not null,
  client_id         text,
  client_secret     text,
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  enabled           boolean not null default false,
  webhook_secret    text not null default encode(gen_random_bytes(32), 'hex'),
  last_polled_at    timestamptz,
  last_order_id     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (restaurant_id)
);

create index on ifood_integrations(restaurant_id);
create index on ifood_integrations(enabled) where enabled = true;

create trigger trg_ifood_integrations_updated before update on ifood_integrations
  for each row execute function set_updated_at();

alter table ifood_integrations enable row level security;

create policy "tenant read ifood_integrations" on ifood_integrations
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "managers write ifood_integrations" on ifood_integrations
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- -------------------------------------------------------------
-- 2. ifood_events  (log de eventos recebidos — auditoria e debug)
-- -------------------------------------------------------------
create table if not exists ifood_events (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  event_id            text not null,
  event_type          text not null,
  order_external_id   text,
  payload             jsonb not null,
  processed           boolean not null default false,
  processing_error    text,
  order_id            uuid references orders(id) on delete set null,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz
);

create index on ifood_events(restaurant_id, event_type, received_at desc);
create index on ifood_events(event_id);
create index on ifood_events(processed) where processed = false;
create index on ifood_events(order_id) where order_id is not null;

alter table ifood_events enable row level security;

create policy "tenant read ifood_events" on ifood_events
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

-- Apenas gestores podem ver dados de auditoria; sem write via RLS (servico usa service_role)
create policy "managers write ifood_events" on ifood_events
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- -------------------------------------------------------------
-- 3. ifood_product_mappings  (SKU iFood -> produto interno)
-- -------------------------------------------------------------
create table if not exists ifood_product_mappings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  ifood_sku     text not null,
  ifood_name    text,
  product_id    uuid references products(id) on delete set null,
  auto_create   boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, ifood_sku)
);

create index on ifood_product_mappings(restaurant_id);
create index on ifood_product_mappings(product_id) where product_id is not null;

create trigger trg_ifood_product_mappings_updated before update on ifood_product_mappings
  for each row execute function set_updated_at();

alter table ifood_product_mappings enable row level security;

create policy "tenant read ifood_product_mappings" on ifood_product_mappings
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "managers write ifood_product_mappings" on ifood_product_mappings
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- -------------------------------------------------------------
-- 4. Estender orders com colunas de origem externa
--    (idempotente — add column if not exists)
-- -------------------------------------------------------------
alter table orders
  add column if not exists external_source text,
  add column if not exists external_id     text;

-- Remover a coluna source adicionada em 20260414150000 se ainda era generico:
-- (nao removemos pois pode ter dados — apenas garantimos external_source)

create index if not exists orders_external_idx
  on orders(restaurant_id, external_source, external_id)
  where external_id is not null;
