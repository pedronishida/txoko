-- Estoque por produto, para os itens vendidos por unidade.
--
-- products.stock_quantity ja existia e o PDV ja o lia — se stock_tracked e a
-- quantidade chega a zero, o produto aparece desabilitado com "sem estoque".
-- So que nada nunca escrevia nessa coluna, entao o controle era decorativo.
--
-- Isto liga a coluna de verdade. O modelo e proposital: unidade, nao receita.
-- Uma lata de guarana e uma unidade; ficha tecnica ali seria ruido. O buffet
-- por quilo e outro problema (producao -> cuba -> venda por peso) e nao entra
-- aqui — produtos com sold_by_weight ficam de fora.

-- -------------------------------------------------------------
-- 1. O minimo, que faltava
-- -------------------------------------------------------------
alter table products
  add column if not exists stock_min int null;

comment on column products.stock_min is
  'Abaixo disto o produto entra no alerta de estoque. Null = sem alerta.';
comment on column products.stock_quantity is
  'Saldo atual. E cache mantido por record_stock_movement — a verdade esta em stock_movements.';

-- -------------------------------------------------------------
-- 2. O livro-razao
--
-- Toda alteracao de saldo vira uma linha. Sem isso nao da pra responder "por
-- que esta em 3?" nem auditar diferenca de inventario — que e exatamente o
-- que falta no estoque de insumos, onde current_stock e sobrescrito no lugar.
-- -------------------------------------------------------------
create table if not exists stock_movements (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  -- venda, compra/recebimento, ajuste de inventario, perda, devolucao
  kind          text not null check (kind in ('sale','purchase','adjustment','loss','return')),
  -- Assinada: negativa consome, positiva repoe.
  quantity      int not null check (quantity <> 0),
  -- Saldo depois deste movimento. Redundante de proposito: e o que torna a
  -- auditoria legivel sem refazer a soma inteira.
  balance_after int not null,
  order_id      uuid null references orders(id) on delete set null,
  note          text null,
  actor_id      uuid null references auth.users(id) on delete set null,
  at            timestamptz not null default now()
);

create index if not exists stock_movements_product_at_idx
  on stock_movements(product_id, at desc);
create index if not exists stock_movements_restaurant_at_idx
  on stock_movements(restaurant_id, at desc);
create index if not exists stock_movements_order_idx
  on stock_movements(order_id) where order_id is not null;

alter table stock_movements enable row level security;

create policy "tenant read stock movements" on stock_movements for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

-- Livro-razao e append-only: sem update e sem delete. Erro se corrige com um
-- movimento de ajuste, nao apagando o anterior.
create policy "staff append stock movements" on stock_movements for insert to authenticated
  with check (
    auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[])
  );

-- -------------------------------------------------------------
-- 3. O unico caminho de escrita
--
-- Trava a linha do produto, calcula o saldo, atualiza o cache e grava o
-- movimento na mesma transacao. Duas vendas simultaneas do ultimo guarana nao
-- podem as duas ler 1 e gravar 0.
-- -------------------------------------------------------------
create or replace function record_stock_movement(
  p_product_id uuid,
  p_kind       text,
  p_quantity   int,
  p_order_id   uuid default null,
  p_note       text default null
)
returns stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products%rowtype;
  v_balance int;
  v_row     stock_movements%rowtype;
begin
  select * into v_product from products where id = p_product_id for update;
  if not found then
    raise exception 'Produto nao encontrado';
  end if;

  if not v_product.stock_tracked then
    raise exception 'Produto "%" nao controla estoque', v_product.name;
  end if;

  -- Produto vendido por peso nao tem saldo em unidade: o que se controla ali
  -- e producao, nao contagem.
  if v_product.sold_by_weight then
    raise exception 'Produto "%" e vendido por peso e nao controla estoque por unidade', v_product.name;
  end if;

  v_balance := coalesce(v_product.stock_quantity, 0) + p_quantity;

  update products set stock_quantity = v_balance where id = p_product_id;

  insert into stock_movements (
    restaurant_id, product_id, kind, quantity, balance_after, order_id, note, actor_id
  )
  values (
    v_product.restaurant_id, p_product_id, p_kind, p_quantity, v_balance,
    p_order_id, p_note, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function record_stock_movement(uuid, text, int, uuid, text) from public;
grant execute on function record_stock_movement(uuid, text, int, uuid, text) to authenticated;

-- -------------------------------------------------------------
-- 4. Baixa na venda e devolucao no cancelamento
--
-- Mesmo gatilho do consumo de insumo (fechamento do pedido), mas em funcao
-- separada: os dois controles sao independentes e um pode ser desligado sem
-- o outro.
--
-- A devolucao existe porque o cancelamento com estorno passou a existir: sem
-- ela, cancelar um pedido ja fechado devolvia o dinheiro e comia o estoque.
-- -------------------------------------------------------------
create or replace function public.move_product_stock_on_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sign int;
  v_kind text;
begin
  if NEW.status = 'closed' and OLD.status is distinct from 'closed' then
    v_sign := -1;
    v_kind := 'sale';
  elsif NEW.status = 'cancelled' and OLD.status = 'closed' then
    -- So devolve o que chegou a sair: pedido cancelado antes de fechar nunca
    -- consumiu nada.
    v_sign := 1;
    v_kind := 'return';
  else
    return NEW;
  end if;

  for r in
    select oi.product_id, sum(oi.quantity)::int as qty
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = NEW.id
      and oi.status <> 'cancelled'
      and p.stock_tracked = true
      and p.sold_by_weight = false
    group by oi.product_id
  loop
    if r.qty > 0 then
      perform record_stock_movement(
        r.product_id, v_kind, v_sign * r.qty, NEW.id, null
      );
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists on_order_status_move_product_stock on orders;
create trigger on_order_status_move_product_stock
  after update of status on orders
  for each row execute function move_product_stock_on_order_status();

-- -------------------------------------------------------------
-- 5. Alerta de estoque baixo, no mesmo formato do de insumo
-- -------------------------------------------------------------
create or replace function public.notify_low_product_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.stock_tracked
     and NEW.stock_min is not null
     and NEW.stock_quantity is not null
     and NEW.stock_quantity <= NEW.stock_min
     and coalesce(OLD.stock_quantity, 0) > NEW.stock_min then
    insert into notifications (restaurant_id, type, title, body, href)
    values (
      NEW.restaurant_id,
      'stock_low',
      'Estoque baixo',
      format('%s caiu para %s (minimo %s)',
             NEW.name, NEW.stock_quantity, NEW.stock_min),
      '/estoque/produtos'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_product_stock_low on products;
create trigger on_product_stock_low
  after update of stock_quantity on products
  for each row execute function notify_low_product_stock();
