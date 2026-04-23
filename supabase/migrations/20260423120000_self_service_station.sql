-- =============================================================
-- Txoko — Self-Service Station (registro por peso + barcode)
-- Novo canal: tablet da estacao + balanca + leitor fixo USB
-- Apenas aditivo: nao altera comportamento de PDV/menu/KDS existentes
-- =============================================================

-- -------------------------------------------------------------
-- 1. products: flags pra venda por peso + barcode unitario
-- -------------------------------------------------------------
alter table products
  add column if not exists sold_by_weight boolean not null default false,
  add column if not exists price_per_kg   numeric null,
  add column if not exists barcode        text    null;

-- barcode unico por restaurante (quando informado)
create unique index if not exists products_restaurant_barcode_uidx
  on products(restaurant_id, barcode)
  where barcode is not null;

-- se sold_by_weight=true, price_per_kg deve existir e ser positivo
alter table products
  drop constraint if exists products_weight_price_chk;
alter table products
  add constraint products_weight_price_chk
  check (
    sold_by_weight = false
    or (sold_by_weight = true and price_per_kg is not null and price_per_kg > 0)
  );

-- -------------------------------------------------------------
-- 2. order_items: peso em gramas (null = item unitario)
-- -------------------------------------------------------------
alter table order_items
  add column if not exists weight_grams integer null;

alter table order_items
  drop constraint if exists order_items_weight_chk;
alter table order_items
  add constraint order_items_weight_chk
  check (weight_grams is null or weight_grams > 0);

-- -------------------------------------------------------------
-- 3. comanda_cards: pool reutilizavel de cartoes QR
-- -------------------------------------------------------------
create table if not exists comanda_cards (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  card_number     int  not null,
  qr_token        text not null unique,
  service_mode    text not null check (service_mode in ('avontade','por_kg')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  deactivated_at  timestamptz,
  unique (restaurant_id, card_number)
);

create index if not exists comanda_cards_restaurant_idx
  on comanda_cards(restaurant_id);

create index if not exists comanda_cards_token_active_idx
  on comanda_cards(qr_token)
  where is_active = true;

alter table comanda_cards enable row level security;

drop policy if exists "tenant read comanda_cards" on comanda_cards;
create policy "tenant read comanda_cards" on comanda_cards
  for select
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant write comanda_cards" on comanda_cards;
create policy "tenant write comanda_cards" on comanda_cards
  for all
  using (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]));

-- -------------------------------------------------------------
-- 4. orders: vinculo opcional com cartao da estacao
-- -------------------------------------------------------------
alter table orders
  add column if not exists comanda_card_id uuid null references comanda_cards(id);

create index if not exists orders_comanda_card_open_idx
  on orders(comanda_card_id)
  where comanda_card_id is not null;

-- -------------------------------------------------------------
-- 5. Helper: recalcular totais de um order
-- -------------------------------------------------------------
create or replace function recalc_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub numeric;
begin
  select coalesce(sum(total_price), 0) into v_sub
  from order_items
  where order_id = p_order_id
    and status <> 'cancelled';

  update orders
  set subtotal = v_sub,
      total    = v_sub + coalesce(service_fee, 0) + coalesce(delivery_fee, 0) - coalesce(discount, 0)
  where id = p_order_id;
end;
$$;

-- -------------------------------------------------------------
-- 6. Helper interno: snapshot do order da comanda atual
--    (usado pelas 3 RPCs pra retornar estado unificado)
-- -------------------------------------------------------------
create or replace function station_order_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_id',      o.id,
    'status',        o.status,
    'total',         o.total,
    'subtotal',      o.subtotal,
    'comanda_card', (
      select jsonb_build_object(
        'id',           c.id,
        'card_number',  c.card_number,
        'service_mode', c.service_mode
      )
      from comanda_cards c where c.id = o.comanda_card_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',           oi.id,
        'product_id',   oi.product_id,
        'product_name', p.name,
        'quantity',     oi.quantity,
        'weight_grams', oi.weight_grams,
        'unit_price',   oi.unit_price,
        'total_price',  oi.total_price,
        'created_at',   oi.created_at
      ) order by oi.created_at)
      from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = o.id and oi.status <> 'cancelled'
    ), '[]'::jsonb)
  )
  from orders o
  where o.id = p_order_id;
$$;

-- -------------------------------------------------------------
-- 7. RPC: station_open_session
--    Valida o QR token, abre (ou retorna) a comanda ativa.
--    Se cartao for "avontade", lanca 1x Self-Service a Vontade.
-- -------------------------------------------------------------
create or replace function station_open_session(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_order_id uuid;
  v_avontade_product_id uuid;
  v_avontade_price numeric;
begin
  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;

  if not found then
    raise exception 'Cartao invalido ou inativo';
  end if;

  -- Existe comanda ativa pra esse cartao?
  select id into v_order_id
  from orders
  where comanda_card_id = v_card.id
    and status in ('open','preparing','ready','delivered')
  order by created_at desc
  limit 1;

  if v_order_id is null then
    -- Abre nova comanda
    insert into orders (
      restaurant_id, type, status, source, comanda_card_id,
      subtotal, total, discount, service_fee, delivery_fee, opened_at
    )
    values (
      v_card.restaurant_id, 'counter', 'open', 'station', v_card.id,
      0, 0, 0, 0, 0, now()
    )
    returning id into v_order_id;

    -- Se for "a vontade", ja lanca 1x Self-Service a Vontade
    if v_card.service_mode = 'avontade' then
      select id, price into v_avontade_product_id, v_avontade_price
      from products
      where restaurant_id = v_card.restaurant_id
        and sold_by_weight = false
        and is_active = true
        and name ilike 'Self-Service a Vontade%'
      order by created_at
      limit 1;

      if v_avontade_product_id is null then
        raise exception 'Produto "Self-Service a Vontade" nao cadastrado';
      end if;

      insert into order_items (
        order_id, product_id, quantity, unit_price, total_price, status
      )
      values (
        v_order_id, v_avontade_product_id, 1, v_avontade_price, v_avontade_price, 'pending'
      );

      perform recalc_order_totals(v_order_id);
    end if;
  end if;

  return station_order_snapshot(v_order_id);
end;
$$;

-- -------------------------------------------------------------
-- 8. RPC: station_add_weight_item
--    Adiciona item pesado (busca o produto "Self-Service por Kg")
-- -------------------------------------------------------------
create or replace function station_add_weight_item(
  p_qr_token text,
  p_weight_grams int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_order   orders%rowtype;
  v_product products%rowtype;
  v_total   numeric;
begin
  if p_weight_grams is null or p_weight_grams <= 0 then
    raise exception 'Peso invalido';
  end if;

  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;
  if not found then
    raise exception 'Cartao invalido';
  end if;

  if v_card.service_mode <> 'por_kg' then
    raise exception 'Este cartao nao eh por kg';
  end if;

  -- Busca comanda ativa + lock para evitar race entre estacoes
  select * into v_order
  from orders
  where comanda_card_id = v_card.id
    and status in ('open','preparing','ready','delivered')
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Comanda nao aberta (escaneie o QR primeiro)';
  end if;

  select * into v_product
  from products
  where restaurant_id = v_order.restaurant_id
    and sold_by_weight = true
    and is_active = true
  order by created_at
  limit 1;
  if not found then
    raise exception 'Produto "Self-Service por Kg" nao cadastrado';
  end if;

  v_total := round((v_product.price_per_kg * p_weight_grams / 1000.0)::numeric, 2);

  insert into order_items (
    order_id, product_id, quantity, weight_grams, unit_price, total_price, status
  )
  values (
    v_order.id, v_product.id, 1, p_weight_grams, v_product.price_per_kg, v_total, 'pending'
  );

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

-- -------------------------------------------------------------
-- 9. RPC: station_add_barcode_item
--    Adiciona item unitario lido por codigo de barras
-- -------------------------------------------------------------
create or replace function station_add_barcode_item(
  p_qr_token text,
  p_barcode  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_order   orders%rowtype;
  v_product products%rowtype;
begin
  if p_barcode is null or length(trim(p_barcode)) = 0 then
    raise exception 'Codigo de barras invalido';
  end if;

  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;
  if not found then
    raise exception 'Cartao invalido';
  end if;

  select * into v_order
  from orders
  where comanda_card_id = v_card.id
    and status in ('open','preparing','ready','delivered')
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Comanda nao aberta (escaneie o QR primeiro)';
  end if;

  select * into v_product
  from products
  where restaurant_id = v_order.restaurant_id
    and barcode = trim(p_barcode)
    and is_active = true
    and sold_by_weight = false
  limit 1;
  if not found then
    raise exception 'Produto nao encontrado (codigo: %)', p_barcode;
  end if;

  insert into order_items (
    order_id, product_id, quantity, unit_price, total_price, status
  )
  values (
    v_order.id, v_product.id, 1, v_product.price, v_product.price, 'pending'
  );

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

-- -------------------------------------------------------------
-- 10. Permissoes: anon + authenticated podem chamar RPCs
--     (sao security definer e validam via qr_token)
-- -------------------------------------------------------------
grant execute on function station_open_session(text)              to anon, authenticated;
grant execute on function station_add_weight_item(text, int)      to anon, authenticated;
grant execute on function station_add_barcode_item(text, text)    to anon, authenticated;
grant execute on function station_order_snapshot(uuid)            to anon, authenticated;
