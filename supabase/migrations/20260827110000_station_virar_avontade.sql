-- =============================================================
-- Txoko — Estacao: virar a vontade no meio da comanda por quilo
-- =============================================================
-- O teto existe desde o seletor: um prato acima do ponto de equilibrio ja
-- entra como a vontade. Mas o cliente que comeca leve e volta pro segundo
-- prato fura o teto por partes — a soma dos pratos passa do preco fixo e
-- ele pagaria mais comendo menos. Quando a soma alcanca o teto, a estacao
-- converte: os pesos lancados saem (cancelados, com autoria) e o fixo
-- entra no lugar. Bebidas e demais unitarios ficam.
--
-- station_set_service_mode nao serve aqui de proposito: ele recusa trocar
-- com peso lancado, porque trocar nao pode apagar cobranca feita sem dizer
-- por que. Esta funcao existe pra dizer por que — cancelled_by
-- 'station:virou-avontade' e o rastro do teto aplicado.

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

  -- Sai a comida por peso e qualquer fixo de modalidade anterior. O fixo
  -- novo entra logo abaixo, entao cancelar um fixo de a vontade que ja
  -- exista aqui nao perde nada — evita duplicar.
  update order_items oi
  set status       = 'cancelled',
      cancelled_by = 'station:virou-avontade',
      cancelled_at = now()
  from products p
  where oi.product_id = p.id
    and oi.order_id = v_order.id
    and oi.status <> 'cancelled'
    and (oi.weight_grams is not null or p.service_mode is not null);

  update orders set service_mode = 'avontade' where id = v_order.id;

  insert into order_items (
    order_id, product_id, quantity, unit_price, total_price, status
  )
  values (
    v_order.id, v_product.id, p_people, v_product.price,
    round((v_product.price * p_people)::numeric, 2), 'pending'
  );

  perform recalc_order_totals(v_order.id);

  return station_order_snapshot(v_order.id);
end;
$$;

revoke all on function station_convert_to_avontade(text, int) from public;
grant execute on function station_convert_to_avontade(text, int) to anon, authenticated;
