-- Cancelamento de pedido com estorno e trilha de autorizacao.
--
-- Ate aqui o cancelamento existia so como status: nao havia motivo, nao havia
-- quem autorizou, nao havia estorno. Cancelamento, divisao de conta e estorno
-- sao as tres operacoes que mais geram chamada de suporte, e as unicas em que
-- "quem mandou fazer isso" precisa sobreviver ao turno.
--
-- order_items ja tinha cancelled_by/cancelled_at para o cancelamento item a
-- item da estacao. Isto aqui e o nivel do pedido, que e outra coisa.

-- -------------------------------------------------------------
-- 1. orders: motivo, autor e estorno
-- -------------------------------------------------------------
alter table orders
  add column if not exists cancel_reason  text null,
  add column if not exists cancelled_by   uuid null references auth.users(id) on delete set null,
  add column if not exists cancelled_at   timestamptz null,
  add column if not exists refunded_at    timestamptz null,
  add column if not exists refund_amount  numeric(10,2) null check (refund_amount >= 0);

comment on column orders.cancel_reason is
  'Motivo obrigatorio do cancelamento, escolhido de uma lista fechada.';
comment on column orders.cancelled_by is
  'Quem autorizou. So owner ou manager podem cancelar (ver policy abaixo).';
comment on column orders.refund_amount is
  'Soma dos pagamentos aprovados no momento do cancelamento. Null = sem estorno.';

-- -------------------------------------------------------------
-- 2. order_events: a trilha
--
-- Uma linha por evento do pedido — e o que o painel de Pedidos desenha como
-- horario / acao / quem. Guardamos o nome e o papel resolvidos no momento do
-- evento, e nao so o uuid: a trilha precisa continuar legivel depois que a
-- pessoa sai da equipe.
-- -------------------------------------------------------------
create table if not exists order_events (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  at            timestamptz not null default now(),
  action        text not null,
  reason        text null,
  -- Ator: null = automatico (integracao, gatilho, rotina)
  actor_id      uuid null references auth.users(id) on delete set null,
  actor_name    text null,
  actor_role    text null,
  metadata      jsonb not null default '{}'::jsonb
);

create index if not exists order_events_order_at_idx
  on order_events(order_id, at);
create index if not exists order_events_restaurant_at_idx
  on order_events(restaurant_id, at desc);

alter table order_events enable row level security;

create policy "tenant read order events" on order_events for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

-- A trilha e append-only: sem update e sem delete, nem para o dono. Uma trilha
-- que se edita nao serve para o que ela existe.
create policy "staff append order events" on order_events for insert to authenticated
  with check (
    auth_has_role(
      restaurant_id,
      array['owner','manager','waiter','cashier']::restaurant_role[]
    )
  );

-- -------------------------------------------------------------
-- 3. cancel_order_with_refund
--
-- Cancela, calcula o estorno a partir dos pagamentos aprovados, marca esses
-- pagamentos como estornados e grava a trilha — tudo numa transacao, para nao
-- existir pedido cancelado sem trilha nem estorno sem cancelamento.
-- -------------------------------------------------------------
create or replace function cancel_order_with_refund(
  p_order_id uuid,
  p_reason   text,
  p_refund   boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        orders%rowtype;
  v_restaurant   uuid;
  v_actor        uuid := auth.uid();
  v_actor_name   text;
  v_actor_role   text;
  v_refund_total numeric(10,2) := 0;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Pedido nao encontrado';
  end if;

  v_restaurant := v_order.restaurant_id;

  -- Autorizacao de gerente: cancelar pedido fechado ou em preparo mexe em
  -- dinheiro e em insumo, entao nao e acao de qualquer papel.
  if not auth_has_role(v_restaurant, array['owner','manager']::restaurant_role[]) then
    raise exception 'Apenas owner ou manager podem cancelar um pedido';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Pedido ja esta cancelado';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Motivo do cancelamento e obrigatorio';
  end if;

  -- restaurant_members nao guarda nome; o identificavel que existe hoje e o
  -- e-mail. Guardado aqui como texto para a trilha sobreviver a saida da
  -- pessoa da equipe.
  select rm.role::text,
         coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
    into v_actor_role, v_actor_name
    from restaurant_members rm
    join auth.users u on u.id = rm.user_id
   where rm.user_id = v_actor
     and rm.restaurant_id = v_restaurant
   limit 1;

  if p_refund then
    select coalesce(sum(amount), 0) into v_refund_total
      from payments
     where order_id = p_order_id
       and status = 'approved';

    if v_refund_total > 0 then
      update payments
         set status = 'refunded'
       where order_id = p_order_id
         and status = 'approved';
    end if;
  end if;

  update orders
     set status        = 'cancelled',
         cancel_reason = p_reason,
         cancelled_by  = v_actor,
         cancelled_at  = now(),
         refunded_at   = case when p_refund and v_refund_total > 0 then now() end,
         refund_amount = case when p_refund and v_refund_total > 0 then v_refund_total end
   where id = p_order_id;

  insert into order_events (order_id, restaurant_id, action, reason, actor_id, actor_name, actor_role)
  values (p_order_id, v_restaurant, 'cancelled', p_reason, v_actor, v_actor_name, v_actor_role);

  if p_refund and v_refund_total > 0 then
    insert into order_events (order_id, restaurant_id, action, actor_id, actor_name, actor_role, metadata)
    values (
      p_order_id, v_restaurant, 'refunded', null, null, null,
      jsonb_build_object('amount', v_refund_total)
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'refund_amount', case when p_refund and v_refund_total > 0 then v_refund_total end
  );
end;
$$;

revoke all on function cancel_order_with_refund(uuid, text, boolean) from public;
grant execute on function cancel_order_with_refund(uuid, text, boolean) to authenticated;
