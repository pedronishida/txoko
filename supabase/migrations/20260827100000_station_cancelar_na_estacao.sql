-- =============================================================
-- Txoko — Estacao: cancelamento direto na tela, com janela
-- =============================================================
-- O cancelamento nasceu atras do cartao do caixa, mas a operacao real e
-- assistida: a atendente digita o peso e erra na frente do cliente.
-- Corrigir nao pode exigir buscar um cartao — vira fila no buffet.
--
-- O compromisso e uma janela: a estacao desfaz sozinha o que acabou de
-- lancar (15 minutos); mais velho que isso continua sendo assunto do
-- caixa, que enxerga a comanda inteira e responde pelo desconto.
--
-- O item fixo da modalidade (o "a vontade" por pessoa) fica de fora:
-- quem mexe nele e a troca de modalidade e o numero de pessoas, nunca o
-- cancelamento avulso — cancela-lo deixaria a comanda numa modalidade
-- sem preco. Prato pesado (weight_grams) cancela normalmente: e ele que
-- a atendente digita errado.

-- -------------------------------------------------------------
-- 1. snapshot: cada item passa a dizer de que modalidade veio.
--    A tela usa isso pra (a) mostrar quantas pessoas ha no a vontade e
--    (b) nao oferecer cancelamento avulso pro item que a modalidade
--    gerencia.
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
        'service_mode', p.service_mode,
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
-- 2. station_cancel_own_item: a propria comanda desfaz um lancamento
--    recente. Mesmo comportamento do cancel do caixa (unitario > 1
--    decrementa; peso ou qty=1 cancela a linha), com duas barreiras a
--    mais: a janela de 15 min e o item fixo da modalidade.
-- -------------------------------------------------------------
create or replace function station_cancel_own_item(
  p_qr_token text,
  p_item_id  uuid
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
  v_item    order_items%rowtype;
  v_product products%rowtype;
begin
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

  select * into v_item
  from order_items
  where id = p_item_id and order_id = v_order.id;
  if not found then
    raise exception 'Item nao encontrado';
  end if;
  if v_item.status = 'cancelled' then
    raise exception 'Item ja cancelado';
  end if;

  select * into v_product from products where id = v_item.product_id;

  -- O fixo do a vontade nao cancela avulso: sem ele a comanda ficaria em
  -- modalidade sem preco. O caminho e ajustar pessoas ou trocar o modo.
  if v_product.service_mode is not null and v_item.weight_grams is null then
    raise exception 'Este item vem da modalidade — ajuste as pessoas ou troque a modalidade';
  end if;

  if v_item.created_at < now() - interval '15 minutes' then
    raise exception 'Item lancado ha mais de 15 min — cancele com o cartao do caixa';
  end if;

  if v_item.weight_grams is null and v_item.quantity > 1 then
    update order_items
    set quantity    = quantity - 1,
        total_price = total_price - v_item.unit_price
    where id = p_item_id;
  else
    update order_items
    set status       = 'cancelled',
        cancelled_by = 'station',
        cancelled_at = now()
    where id = p_item_id;
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

revoke all on function station_cancel_own_item(text, uuid) from public;
grant execute on function station_cancel_own_item(text, uuid) to anon, authenticated;
