-- =============================================================
-- Txoko — Estacao: 3 modalidades + escolha na balanca + peso manual
-- =============================================================
-- Contexto operacional (self-service com balanca sem etiquetadora):
--   1. cliente pega um cartao QUALQUER (nao mais separado por modalidade)
--   2. na balanca, a atendente bipa o cartao e escolhe a modalidade:
--        1 = a vontade (preco fixo POR PESSOA)
--        2 = por quilo
--        3 = por quilo 2 misturas (preco/kg diferente)
--   3. se for por quilo, ela le o peso no visor e digita em gramas —
--      o sistema calcula (preco/kg x gramas / 1000), como ja fazia com
--      a etiqueta da balanca
--   4. bebidas continuam entrando por codigo de barras
--
-- O que muda em relacao ao desenho anterior:
--   - a modalidade saia do CARTAO (lote impresso por modo); agora mora na
--     COMANDA e e escolhida na estacao
--   - existia so 'avontade' e 'por_kg'; entra 'por_kg_2mix'
--   - os produtos eram achados por convencao (nome ilike / primeiro
--     sold_by_weight); agora ha vinculo explicito modalidade -> produto,
--     com a busca antiga preservada como fallback
--
-- Compatibilidade: cartoes antigos (com modalidade gravada) continuam
-- funcionando — a modalidade deles vira o padrao da comanda.
-- Aditivo: nao altera PDV, menu, KDS nem o caixa existentes.
-- =============================================================

-- -------------------------------------------------------------
-- 1. products: vinculo explicito modalidade -> produto
-- -------------------------------------------------------------
alter table products
  add column if not exists service_mode text null;

alter table products
  drop constraint if exists products_service_mode_chk;
alter table products
  add constraint products_service_mode_chk
  check (
    service_mode is null
    or service_mode in ('avontade', 'por_kg', 'por_kg_2mix')
  );

-- Um produto ativo por modalidade em cada restaurante — evita a ambiguidade
-- do "primeiro sold_by_weight" quando existem duas faixas de preco por kg.
create unique index if not exists products_restaurant_service_mode_uidx
  on products(restaurant_id, service_mode)
  where service_mode is not null and is_active = true;

-- -------------------------------------------------------------
-- 2. comanda_cards: cartao generico + terceira modalidade
-- -------------------------------------------------------------
-- service_mode do cartao passa a ser OPCIONAL tambem pros cartoes de
-- cliente: null = generico (a modalidade e escolhida na estacao).
alter table comanda_cards
  drop constraint if exists comanda_cards_kind_mode_chk;
alter table comanda_cards
  add constraint comanda_cards_kind_mode_chk check (
    (
      card_kind = 'customer'
      and (
        service_mode is null
        or service_mode in ('avontade', 'por_kg', 'por_kg_2mix')
      )
    )
    or (card_kind = 'cancel' and service_mode is null)
  );

-- -------------------------------------------------------------
-- 3. orders: a modalidade agora e da comanda
-- -------------------------------------------------------------
alter table orders
  add column if not exists service_mode text null;

alter table orders
  drop constraint if exists orders_service_mode_chk;
alter table orders
  add constraint orders_service_mode_chk
  check (
    service_mode is null
    or service_mode in ('avontade', 'por_kg', 'por_kg_2mix')
  );

-- Backfill: comandas abertas herdam a modalidade do cartao que as abriu
update orders o
set service_mode = c.service_mode
from comanda_cards c
where o.comanda_card_id = c.id
  and o.service_mode is null
  and c.service_mode is not null;

-- -------------------------------------------------------------
-- 4. Helper: resolve o produto de uma modalidade
--    Preferencia: products.service_mode explicito.
--    Fallback: convencao antiga (nome / sold_by_weight), pra nao quebrar
--    restaurantes ja configurados antes desta migration.
-- -------------------------------------------------------------
create or replace function station_mode_product(
  p_restaurant_id uuid,
  p_mode text
)
returns products
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product products;
begin
  select * into v_product
  from products
  where restaurant_id = p_restaurant_id
    and service_mode = p_mode
    and is_active = true
  limit 1;

  if found then
    return v_product;
  end if;

  -- Fallback compativel com o desenho anterior (2 modalidades)
  if p_mode = 'avontade' then
    select * into v_product
    from products
    where restaurant_id = p_restaurant_id
      and sold_by_weight = false
      and is_active = true
      and name ilike 'Self-Service a Vontade%'
    order by created_at
    limit 1;
  elsif p_mode = 'por_kg' then
    select * into v_product
    from products
    where restaurant_id = p_restaurant_id
      and sold_by_weight = true
      and is_active = true
    order by created_at
    limit 1;
  end if;

  -- 'por_kg_2mix' e novo: nao tem fallback, exige cadastro explicito
  return v_product;
end;
$$;

-- -------------------------------------------------------------
-- 5. Snapshot: expoe a modalidade efetiva da comanda
--    (a estacao usa pra saber se ainda precisa perguntar)
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
    -- modalidade efetiva: a da comanda, ou a do cartao (legado), ou null
    'service_mode',  coalesce(
                       o.service_mode,
                       (select c.service_mode from comanda_cards c
                         where c.id = o.comanda_card_id)
                     ),
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
-- 6. RPC: station_set_service_mode
--    A atendente aperta 1 / 2 / 3 na estacao.
--    'avontade' lanca o preco fixo x numero de pessoas; chamar de novo
--    com outro numero CORRIGE a quantidade (nao duplica o lancamento).
-- -------------------------------------------------------------
create or replace function station_set_service_mode(
  p_qr_token text,
  p_mode     text,
  p_people   int default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_card      comanda_cards;
  v_order     orders;
  v_product   products;
  v_item      order_items;
  v_has_items boolean;
begin
  if p_mode is null or p_mode not in ('avontade', 'por_kg', 'por_kg_2mix') then
    raise exception 'Modalidade invalida';
  end if;

  if p_people is null or p_people < 1 or p_people > 20 then
    raise exception 'Numero de pessoas invalido (1 a 20)';
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

  -- Trocar de modalidade com itens ja lancados bagunca a cobranca.
  -- Excecao: continuar em 'avontade' so pra ajustar o numero de pessoas.
  if v_order.service_mode is not null and v_order.service_mode <> p_mode then
    select exists (
      select 1 from order_items
      where order_id = v_order.id and status <> 'cancelled'
    ) into v_has_items;

    if v_has_items then
      raise exception 'Comanda ja tem itens — cancele antes de trocar a modalidade';
    end if;
  end if;

  update orders set service_mode = p_mode where id = v_order.id;

  if p_mode = 'avontade' then
    v_product := station_mode_product(v_order.restaurant_id, 'avontade');

    if v_product.id is null then
      raise exception 'Produto da modalidade "a vontade" nao cadastrado';
    end if;

    -- Ja existe o lancamento? Entao so corrige a quantidade de pessoas.
    select * into v_item
    from order_items
    where order_id = v_order.id
      and product_id = v_product.id
      and status <> 'cancelled'
    order by created_at
    limit 1;

    if found then
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

    perform recalc_order_totals(v_order.id);
  end if;

  return station_order_snapshot(v_order.id);
end;
$$;

-- -------------------------------------------------------------
-- 7. RPC: station_add_weight_item (atualizada)
--    - valida contra a modalidade da COMANDA (cai pro cartao no legado)
--    - escolhe o produto conforme a modalidade (2 faixas de preco/kg)
--    - o peso pode vir da etiqueta da balanca OU digitado a mao
-- -------------------------------------------------------------
create or replace function station_add_weight_item(
  p_qr_token     text,
  p_weight_grams int
)
returns jsonb
language plpgsql
volatile
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

  -- Teto de sanidade: a etiqueta da balanca so carrega 5 digitos e nenhum
  -- prato de self-service passa disso. A confirmacao pra pesos altos (erro
  -- de digitacao, ex. 4850 no lugar de 485) fica na UI da estacao.
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

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

-- -------------------------------------------------------------
-- 8. RPC: station_open_session (atualizada)
--    Cartao generico (service_mode null) abre a comanda SEM modalidade —
--    a estacao pergunta em seguida. Cartao legado (com modalidade) mantem
--    o comportamento antigo: grava o modo na comanda e, se for a vontade,
--    ja lanca 1 pessoa.
-- -------------------------------------------------------------
create or replace function station_open_session(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card     comanda_cards%rowtype;
  v_order_id uuid;
  v_product  products;
begin
  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;

  if not found then
    raise exception 'Cartao invalido ou inativo';
  end if;

  if v_card.card_kind <> 'customer' then
    raise exception 'Este cartao nao abre comanda';
  end if;

  -- Existe comanda ativa pra esse cartao?
  select id into v_order_id
  from orders
  where comanda_card_id = v_card.id
    and status in ('open','preparing','ready','delivered')
  order by created_at desc
  limit 1;

  if v_order_id is null then
    insert into orders (
      restaurant_id, type, status, source, comanda_card_id, service_mode,
      subtotal, total, discount, service_fee, delivery_fee, opened_at
    )
    values (
      v_card.restaurant_id, 'counter', 'open', 'station', v_card.id,
      v_card.service_mode,
      0, 0, 0, 0, 0, now()
    )
    returning id into v_order_id;

    -- Cartao legado "a vontade": lanca 1 pessoa, como antes.
    -- Cartao generico nao lanca nada aqui — quem lanca e station_set_service_mode.
    if v_card.service_mode = 'avontade' then
      v_product := station_mode_product(v_card.restaurant_id, 'avontade');

      if v_product.id is null then
        raise exception 'Produto da modalidade "a vontade" nao cadastrado';
      end if;

      insert into order_items (
        order_id, product_id, quantity, unit_price, total_price, status
      )
      values (
        v_order_id, v_product.id, 1, v_product.price, v_product.price, 'pending'
      );

      perform recalc_order_totals(v_order_id);
    end if;
  end if;

  return station_order_snapshot(v_order_id);
end;
$$;

-- -------------------------------------------------------------
-- 9. Permissoes (mesmo padrao das RPCs existentes da estacao)
-- -------------------------------------------------------------
grant execute on function station_mode_product(uuid, text)          to anon, authenticated;
grant execute on function station_set_service_mode(text, text, int) to anon, authenticated;
grant execute on function station_add_weight_item(text, int)        to anon, authenticated;
grant execute on function station_open_session(text)                to anon, authenticated;
