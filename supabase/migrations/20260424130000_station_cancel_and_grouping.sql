-- =============================================================
-- Txoko — Station: cartoes de cancelamento + agrupamento de unitarios
-- =============================================================

-- -------------------------------------------------------------
-- 1. comanda_cards: novo campo card_kind ('customer' | 'cancel')
-- -------------------------------------------------------------
alter table comanda_cards
  add column if not exists card_kind text not null default 'customer';

-- Remove check antigo (forcado a avontade/por_kg) — agora depende do kind
alter table comanda_cards
  drop constraint if exists comanda_cards_service_mode_check;

-- service_mode vira opcional (cancel cards nao tem modo)
alter table comanda_cards
  alter column service_mode drop not null;

alter table comanda_cards
  drop constraint if exists comanda_cards_kind_mode_chk;
alter table comanda_cards
  add constraint comanda_cards_kind_mode_chk check (
    (card_kind = 'customer' and service_mode in ('avontade', 'por_kg'))
    or (card_kind = 'cancel' and service_mode is null)
  );

alter table comanda_cards
  drop constraint if exists comanda_cards_card_kind_check;
alter table comanda_cards
  add constraint comanda_cards_card_kind_check
  check (card_kind in ('customer', 'cancel'));

-- -------------------------------------------------------------
-- 2. order_items: colunas de auditoria de cancelamento
-- -------------------------------------------------------------
alter table order_items
  add column if not exists cancelled_by text null,
  add column if not exists cancelled_at timestamptz null;

-- -------------------------------------------------------------
-- 3. station_add_barcode_item: agrupar item unitario repetido
--    (se ja existe mesmo produto aberto na comanda, soma qty)
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
  v_existing order_items%rowtype;
begin
  if p_barcode is null or length(trim(p_barcode)) = 0 then
    raise exception 'Codigo de barras invalido';
  end if;

  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token
    and is_active = true
    and card_kind = 'customer';
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

  -- Ja existe item aberto desse produto na comanda? Soma qty
  select * into v_existing
  from order_items
  where order_id = v_order.id
    and product_id = v_product.id
    and weight_grams is null
    and status <> 'cancelled'
  limit 1;

  if v_existing.id is not null then
    update order_items
    set quantity    = quantity + 1,
        total_price = total_price + v_product.price
    where id = v_existing.id;
  else
    insert into order_items (
      order_id, product_id, quantity, unit_price, total_price, status
    )
    values (
      v_order.id, v_product.id, 1, v_product.price, v_product.price, 'pending'
    );
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

-- -------------------------------------------------------------
-- 4. station_resolve_scan: classifica o QR escaneado
--    Retorna kind='customer' (com a sessao aberta) ou kind='cancel'
-- -------------------------------------------------------------
create or replace function station_resolve_scan(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_session jsonb;
begin
  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;
  if not found then
    raise exception 'Cartao invalido ou inativo';
  end if;

  if v_card.card_kind = 'cancel' then
    return jsonb_build_object(
      'kind', 'cancel',
      'restaurant_id', v_card.restaurant_id,
      'card_number', v_card.card_number
    );
  end if;

  -- customer: delega pra open_session (retorna snapshot completo)
  v_session := station_open_session(p_qr_token);
  return jsonb_build_object('kind', 'customer', 'session', v_session);
end;
$$;

-- -------------------------------------------------------------
-- 5. station_cancel_item: caixa cancela item usando cartao de cancel
--    - Se unit com qty > 1: decrementa
--    - Se peso OU qty=1: cancela linha (status='cancelled' + audit)
-- -------------------------------------------------------------
create or replace function station_cancel_item(
  p_cancel_token text,
  p_order_id     uuid,
  p_item_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card  comanda_cards%rowtype;
  v_order orders%rowtype;
  v_item  order_items%rowtype;
begin
  -- Valida cartao de cancelamento
  select * into v_card
  from comanda_cards
  where qr_token = p_cancel_token
    and is_active = true
    and card_kind = 'cancel';
  if not found then
    raise exception 'Cartao de cancelamento invalido';
  end if;

  -- Valida order
  select * into v_order
  from orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Comanda nao encontrada';
  end if;
  if v_order.restaurant_id <> v_card.restaurant_id then
    raise exception 'Cartao de outro restaurante';
  end if;
  if v_order.status not in ('open','preparing','ready','delivered') then
    raise exception 'Comanda ja fechada';
  end if;

  -- Valida item
  select * into v_item
  from order_items
  where id = p_item_id and order_id = p_order_id;
  if not found then
    raise exception 'Item nao encontrado';
  end if;
  if v_item.status = 'cancelled' then
    raise exception 'Item ja cancelado';
  end if;

  -- Decrementa ou cancela linha inteira
  if v_item.weight_grams is null and v_item.quantity > 1 then
    update order_items
    set quantity    = quantity - 1,
        total_price = total_price - v_item.unit_price
    where id = p_item_id;
  else
    update order_items
    set status       = 'cancelled',
        cancelled_by = 'cashier',
        cancelled_at = now()
    where id = p_item_id;
  end if;

  perform recalc_order_totals(p_order_id);

  return station_order_snapshot(p_order_id);
end;
$$;

-- -------------------------------------------------------------
-- 6. Grants
-- -------------------------------------------------------------
grant execute on function station_resolve_scan(text)          to anon, authenticated;
grant execute on function station_cancel_item(text, uuid, uuid) to anon, authenticated;
