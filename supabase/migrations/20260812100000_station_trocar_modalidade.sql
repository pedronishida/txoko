-- =============================================================
-- Txoko — Estacao: permitir corrigir a modalidade escolhida errada
-- =============================================================
-- Problema: a atendente aperta 1 (a vontade) por engano. Como esse modo
-- lanca o valor fixo na hora, a comanda passa a ter item e a troca era
-- recusada — ela ficava presa, dependendo do cartao de cancelamento.
--
-- Regra nova ao trocar de modalidade:
--   - ja existe item PESADO na comanda -> recusa (trocar mudaria o preco do
--     que ja foi cobrado; a correcao certa e o cartao de cancelamento)
--   - senao -> cancela sozinho o item que a PROPRIA modalidade lancou (o
--     fixo do "a vontade") e aplica a nova
--   - bebidas e outros itens unitarios ficam intactos
-- =============================================================

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
  v_card       comanda_cards;
  v_order      orders;
  v_product    products;
  v_item       order_items;
  v_has_weight boolean;
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

  if v_order.service_mode is not null and v_order.service_mode <> p_mode then
    select exists (
      select 1 from order_items
      where order_id = v_order.id
        and status <> 'cancelled'
        and weight_grams is not null
    ) into v_has_weight;

    if v_has_weight then
      raise exception 'Ja tem peso lancado — cancele o item antes de trocar a modalidade';
    end if;

    -- Cancela o que a modalidade anterior lancou sozinha (fixo do "a
    -- vontade"). Bebidas e demais itens seguem na comanda.
    update order_items oi
    set status       = 'cancelled',
        cancelled_by = 'station:troca-modalidade',
        cancelled_at = now()
    from products p
    where oi.product_id = p.id
      and oi.order_id = v_order.id
      and oi.status <> 'cancelled'
      and p.service_mode is not null;
  end if;

  update orders set service_mode = p_mode where id = v_order.id;

  if p_mode = 'avontade' then
    v_product := station_mode_product(v_order.restaurant_id, 'avontade');

    if v_product.id is null then
      raise exception 'Produto da modalidade "a vontade" nao cadastrado';
    end if;

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
  end if;

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

grant execute on function station_set_service_mode(text, text, int) to anon, authenticated;
