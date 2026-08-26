-- Catalogo de produtos de unidade, para a estacao funcionar sem rede.
--
-- Offline, bipar uma bebida nao pode virar "R$ ?": o codigo de barras e
-- resolvido no servidor, entao sem catalogo em maos o cliente nao sabe nem o
-- nome nem o preco do que acabou de entrar na comanda.
--
-- Sao poucas dezenas de linhas — cabe em qualquer aparelho. Como as demais
-- RPCs da estacao, recebe o token do cartao e nao expoe restaurant_id.

create or replace function station_catalog(p_qr_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_card comanda_cards%rowtype;
  v_out  jsonb;
begin
  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;

  if not found then
    raise exception 'Cartao invalido ou inativo';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'barcode', p.barcode,
             'name',    p.name,
             'price',   p.price
           ) order by p.name
         ), '[]'::jsonb)
    into v_out
    from products p
   where p.restaurant_id = v_card.restaurant_id
     and p.is_active = true
     and p.sold_by_weight = false
     and p.barcode is not null;

  return v_out;
end;
$$;

revoke all on function station_catalog(text) from public;
grant execute on function station_catalog(text) to anon, authenticated;
