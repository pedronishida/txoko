-- =============================================================
-- Txoko — Codigo de barras na comanda (substitui o QR na operacao)
-- =============================================================
-- O cartao passa a ter dois codigos com papeis separados:
--   - CODIGO DE BARRAS -> operacao (estacao e caixa abrem a comanda).
--     Leitor 1D barato le mais rapido que QR, e muitos leem SO 1D.
--   - QR -> cliente (link editavel em /q/<slug>), nao abre comanda.
--
-- Por que o codigo de barras nao pode ser o numero impresso (1501):
-- as RPCs da estacao sao abertas ao anon (o tablet nao faz login). Com
-- numero sequencial, qualquer um lancaria itens na comanda de outro cliente
-- de fora do restaurante. Entao o codigo e aleatorio e nao adivinhavel; o
-- numero 1501 segue impresso grande, pra gente, e ninguem le codigo de
-- barras com o olho.
--
-- Formato: 'C' + 12 hex maiusculo (13 chars) -> ~2.8e14 combinacoes.
-- Code 128 com 13 chars da ~45mm impresso, que e o espaco da arte.
-- Comeca com letra de proposito: nunca colide com etiqueta de peso da
-- balanca (13 digitos iniciando em 2) nem com EAN de produto.
-- =============================================================

alter table comanda_cards
  add column if not exists barcode text;

-- Gerador reaproveitado pelo backfill e pelos cartoes novos
create or replace function comanda_barcode_novo()
returns text
language sql
volatile
as $$
  select 'C' || upper(substr(md5(gen_random_uuid()::text), 1, 12));
$$;

-- Backfill: cartoes que ja existem ganham codigo
update comanda_cards
set barcode = comanda_barcode_novo()
where barcode is null;

alter table comanda_cards
  alter column barcode set default comanda_barcode_novo();

create unique index if not exists comanda_cards_restaurant_barcode_uidx
  on comanda_cards(restaurant_id, barcode)
  where barcode is not null;

-- -------------------------------------------------------------
-- RPC: resolve o cartao pelo codigo de barras
-- -------------------------------------------------------------
-- Devolve o mesmo formato de station_resolve_scan, mais o qr_token — assim
-- a estacao segue usando as RPCs existentes (que recebem token) sem precisar
-- duplicar cada uma delas. O codigo de barras tem a mesma forca de segredo
-- que o token, entao trocar um pelo outro nao muda a exposicao.
create or replace function station_resolve_barcode(p_barcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card comanda_cards%rowtype;
begin
  select * into v_card
  from comanda_cards
  where barcode = upper(trim(p_barcode)) and is_active = true;

  if not found then
    raise exception 'Cartao invalido ou inativo';
  end if;

  if v_card.card_kind = 'cancel' then
    return jsonb_build_object(
      'kind', 'cancel',
      'restaurant_id', v_card.restaurant_id,
      'card_number', v_card.card_number,
      'qr_token', v_card.qr_token
    );
  end if;

  return jsonb_build_object(
    'kind', 'customer',
    'qr_token', v_card.qr_token,
    'session', station_open_session(v_card.qr_token)
  );
end;
$$;

grant execute on function comanda_barcode_novo()            to anon, authenticated;
grant execute on function station_resolve_barcode(text)     to anon, authenticated;
