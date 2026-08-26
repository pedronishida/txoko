-- Tarifas das modalidades, para a estacao precificar a escolha.
--
-- No desenho da frente da estacao as duas opcoes aparecem lado a lado ja com
-- numero — "por kg R$ 89,90/kg" contra "a vontade R$ 44,90 fixo" — para a
-- escolha deixar de ser as cegas. A estacao nao conseguia montar essa tela:
-- as tarifas vivem em products.service_mode, mas station_resolve_barcode
-- devolve so qr_token e a sessao no ramo do cliente, entao o cliente nunca
-- soube de que restaurante a comanda e.
--
-- Isto resolve sem expor restaurant_id: recebe o token do cartao e devolve o
-- que aquele restaurante cobra em cada modalidade.
--
-- Exposicao: quem tem um token de cartao valido ja consegue ler a comanda
-- inteira pelas RPCs existentes. Somar a isso a tabela de precos, que e
-- publica no balcao, nao abre superficie nova.

create or replace function station_rates(p_qr_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_card    comanda_cards%rowtype;
  v_product products;
  v_mode    text;
  v_ready   boolean;
  v_out     jsonb := '{}'::jsonb;
begin
  select * into v_card
  from comanda_cards
  where qr_token = p_qr_token and is_active = true;

  if not found then
    raise exception 'Cartao invalido ou inativo';
  end if;

  -- Sempre as tres chaves, mesmo as nao configuradas: assim a tela consegue
  -- desabilitar a opcao e dizer o que falta, em vez de deixar o operador
  -- escolher uma modalidade que so vai falhar no lancamento.
  foreach v_mode in array array['avontade', 'por_kg', 'por_kg_2mix'] loop
    v_product := station_mode_product(v_card.restaurant_id, v_mode);

    if v_mode = 'avontade' then
      v_ready := v_product.id is not null
             and v_product.price is not null
             and v_product.price > 0;
    else
      v_ready := v_product.id is not null
             and v_product.price_per_kg is not null
             and v_product.price_per_kg > 0;
    end if;

    v_out := v_out || jsonb_build_object(
      v_mode,
      jsonb_build_object(
        'ready', v_ready,
        'name',  v_product.name,
        'price', case when v_mode = 'avontade' then v_product.price end,
        'price_per_kg', case when v_mode <> 'avontade' then v_product.price_per_kg end
      )
    );
  end loop;

  return v_out;
end;
$$;

revoke all on function station_rates(text) from public;
grant execute on function station_rates(text) to anon, authenticated;
