-- =============================================================
-- Txoko — Estacao: comanda mista (a vontade + por quilo juntos)
-- =============================================================
-- Duas pessoas num cartao so, uma no fixo e outra na balanca, e mesa
-- comum — e o modelo de "uma modalidade por comanda" obrigava a escolher.
-- A comanda passa a ser mista: o fixo do a vontade conta as pessoas
-- (quantidade do item) e os pratos por peso convivem com ele.
--
-- Tres mudancas:
--   1. peso entra em qualquer comanda com modalidade — na comanda a
--      vontade ele se precifica pelo produto por quilo (e a pessoa que
--      come na balanca);
--   2. station_set_avontade_people ajusta as pessoas do fixo sem mexer
--      nos pesos — e o que a troca de modalidade nao pode fazer, de
--      proposito;
--   3. o teto (station_convert_to_avontade) vira SOMA de gente: converte
--      os pesos em +1 pessoa no fixo, em vez de recomecar a contagem.

-- -------------------------------------------------------------
-- 1. Peso em comanda mista
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

  -- Peso sempre se precifica pela modalidade de peso. Na comanda a
  -- vontade ele tambem entra — e a comanda mista: um come no fixo, outro
  -- na balanca.
  if v_mode = 'avontade' then
    v_mode := 'por_kg';
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
-- 2. Pessoas do a vontade, sem tocar nos pesos
-- -------------------------------------------------------------
create or replace function station_set_avontade_people(
  p_qr_token text,
  p_people   int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_order   orders%rowtype;
  v_product products;
  v_item    order_items%rowtype;
  v_has_weight boolean;
begin
  if p_people is null or p_people < 0 or p_people > 20 then
    raise exception 'Numero de pessoas invalido (0 a 20)';
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
    raise exception 'Comanda nao aberta';
  end if;

  v_product := station_mode_product(v_order.restaurant_id, 'avontade');
  if v_product.id is null or v_product.price is null then
    raise exception 'Produto da modalidade "a vontade" nao cadastrado';
  end if;

  select * into v_item
  from order_items
  where order_id = v_order.id
    and product_id = v_product.id
    and weight_grams is null
    and status <> 'cancelled'
  order by created_at
  limit 1;

  if p_people = 0 then
    -- Zerar so faz sentido na comanda mista: sobra o por quilo. Comanda
    -- puramente a vontade sai pela troca de modalidade, que ja cuida do
    -- estado inteiro.
    select exists (
      select 1 from order_items
      where order_id = v_order.id
        and status <> 'cancelled'
        and weight_grams is not null
    ) into v_has_weight;

    if not v_has_weight then
      raise exception 'Sem prato por peso na comanda — troque a modalidade em vez de zerar';
    end if;

    if v_item.id is not null then
      update order_items
      set status       = 'cancelled',
          cancelled_by = 'station:pessoas',
          cancelled_at = now()
      where id = v_item.id;
    end if;

    update orders set service_mode = 'por_kg' where id = v_order.id;
  else
    if v_item.id is not null then
      update order_items
      set quantity    = p_people,
          unit_price  = v_product.price,
          total_price = round((v_product.price * p_people)::numeric, 2)
      where id = v_item.id;
    else
      insert into order_items (
        order_id, product_id, quantity, unit_price, total_price, status
      )
      values (
        v_order.id, v_product.id, p_people, v_product.price,
        round((v_product.price * p_people)::numeric, 2), 'pending'
      );
    end if;

    -- Base da comanda: se ainda nao havia modalidade, o a vontade define;
    -- se ja era por quilo, segue por quilo — o fixo convive como item.
    if v_order.service_mode is null then
      update orders set service_mode = 'avontade' where id = v_order.id;
    end if;
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

revoke all on function station_set_avontade_people(text, int) from public;
grant execute on function station_set_avontade_people(text, int) to anon, authenticated;

-- -------------------------------------------------------------
-- 3. Teto soma gente: os pesos viram +N pessoas no fixo existente
-- -------------------------------------------------------------
create or replace function station_convert_to_avontade(
  p_qr_token text,
  p_people   int default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_order   orders%rowtype;
  v_product products;
  v_item    order_items%rowtype;
  v_qty     int;
begin
  if p_people is null or p_people < 1 or p_people > 20 then
    raise exception 'Numero de pessoas invalido (1 a 20)';
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
    raise exception 'Comanda nao aberta';
  end if;

  v_product := station_mode_product(v_order.restaurant_id, 'avontade');
  if v_product.id is null or v_product.price is null then
    raise exception 'Produto da modalidade "a vontade" nao cadastrado';
  end if;

  -- Quem ja esta no fixo continua contado: o teto converte os PESOS em
  -- mais gente, nao recomeca a contagem.
  select * into v_item
  from order_items
  where order_id = v_order.id
    and product_id = v_product.id
    and weight_grams is null
    and status <> 'cancelled'
  order by created_at
  limit 1;

  v_qty := coalesce(v_item.quantity, 0) + p_people;
  if v_qty > 20 then
    raise exception 'Numero de pessoas invalido (1 a 20)';
  end if;

  -- Saem so os pratos por peso; bebidas e o proprio fixo ficam.
  update order_items
  set status       = 'cancelled',
      cancelled_by = 'station:virou-avontade',
      cancelled_at = now()
  where order_id = v_order.id
    and status <> 'cancelled'
    and weight_grams is not null;

  update orders set service_mode = 'avontade' where id = v_order.id;

  if v_item.id is not null then
    update order_items
    set quantity    = v_qty,
        unit_price  = v_product.price,
        total_price = round((v_product.price * v_qty)::numeric, 2)
    where id = v_item.id;
  else
    insert into order_items (
      order_id, product_id, quantity, unit_price, total_price, status
    )
    values (
      v_order.id, v_product.id, v_qty, v_product.price,
      round((v_product.price * v_qty)::numeric, 2), 'pending'
    );
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;
