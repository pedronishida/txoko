-- Idempotencia no lancamento de item da estacao.
--
-- Com fila offline, a estacao guarda o que nao conseguiu enviar e reenvia
-- quando a rede volta. Reenvio sem chave duplica item: a conexao cai depois
-- do servidor gravar e antes da resposta chegar, o cliente acha que falhou e
-- manda de novo. Numa rede fraca isso nao e caso raro, e o caso comum.
--
-- A chave vive numa tabela propria, e nao numa coluna de order_items, porque
-- station_add_barcode_item AGRUPA: bebida repetida soma quantidade num item
-- existente em vez de criar linha. Sem linha nova, nao ha onde pendurar a
-- chave.

create table if not exists station_applied_keys (
  order_id   uuid not null references orders(id) on delete cascade,
  client_key text not null,
  applied_at timestamptz not null default now(),
  primary key (order_id, client_key)
);

comment on table station_applied_keys is
  'Chaves de lancamento ja aplicadas, para o reenvio da fila offline nao duplicar item.';

-- Sem policy nenhuma: ninguem le nem escreve direto. Quem grava sao as
-- funcoes abaixo, que sao security definer.
alter table station_applied_keys enable row level security;

-- Assinatura muda (ganha um parametro), entao a antiga precisa sair antes.
drop function if exists station_add_weight_item(text, int);
drop function if exists station_add_barcode_item(text, text);

-- -------------------------------------------------------------
-- Peso
-- -------------------------------------------------------------
create or replace function station_add_weight_item(
  p_qr_token     text,
  p_weight_grams int,
  p_client_key   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards;
  v_order   orders;
  v_product products;
  v_mode    text;
  v_total   numeric;
begin
  if p_weight_grams is null or p_weight_grams <= 0 then
    raise exception 'Peso invalido';
  end if;

  if p_weight_grams > 9999 then
    raise exception 'Peso acima do limite (9999 g) — confira a digitacao';
  end if;

  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;

  if not found then
    raise exception 'Cartao nao encontrado';
  end if;

  if v_card.card_kind <> 'customer' then
    raise exception 'Este cartao nao abre comanda';
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

  -- Reenvio do que ja entrou: devolve o estado atual sem lancar de novo.
  -- Silencioso de proposito — pra fila, reenviar e a operacao normal, nao
  -- erro a reportar.
  if p_client_key is not null then
    if exists (
      select 1 from station_applied_keys
      where order_id = v_order.id and client_key = p_client_key
    ) then
      return station_order_snapshot(v_order.id);
    end if;
  end if;

  v_mode := coalesce(v_order.service_mode, v_card.service_mode);

  if v_mode is null then
    raise exception 'Escolha a modalidade antes de pesar';
  end if;

  if v_mode = 'avontade' then
    raise exception 'Comanda a vontade nao lanca peso';
  end if;

  v_product := station_mode_product(v_order.restaurant_id, v_mode);

  if v_product.id is null then
    raise exception 'Produto da modalidade "%" nao cadastrado', v_mode;
  end if;

  if v_product.price_per_kg is null or v_product.price_per_kg <= 0 then
    raise exception 'Produto da modalidade "%" sem preco por kg', v_mode;
  end if;

  v_total := round((v_product.price_per_kg * p_weight_grams / 1000.0)::numeric, 2);

  insert into order_items (
    order_id, product_id, quantity, weight_grams, unit_price, total_price, status
  )
  values (
    v_order.id, v_product.id, 1, p_weight_grams, v_product.price_per_kg, v_total, 'pending'
  );

  if p_client_key is not null then
    insert into station_applied_keys (order_id, client_key)
    values (v_order.id, p_client_key);
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

-- -------------------------------------------------------------
-- Codigo de barras
-- -------------------------------------------------------------
create or replace function station_add_barcode_item(
  p_qr_token   text,
  p_barcode    text,
  p_client_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card     comanda_cards%rowtype;
  v_order    orders%rowtype;
  v_product  products%rowtype;
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

  if p_client_key is not null then
    if exists (
      select 1 from station_applied_keys
      where order_id = v_order.id and client_key = p_client_key
    ) then
      return station_order_snapshot(v_order.id);
    end if;
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

  if p_client_key is not null then
    insert into station_applied_keys (order_id, client_key)
    values (v_order.id, p_client_key);
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

grant execute on function station_add_weight_item(text, int, text)   to anon, authenticated;
grant execute on function station_add_barcode_item(text, text, text) to anon, authenticated;
