-- =============================================================
-- Txoko — Resgates de fidelidade
-- =============================================================

create table loyalty_redemptions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  points        int not null check (points > 0),
  reward        text not null,
  order_id      uuid references orders(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on loyalty_redemptions(restaurant_id, created_at desc);
create index on loyalty_redemptions(customer_id);

alter table loyalty_redemptions enable row level security;

create policy "tenant read loyalty" on loyalty_redemptions
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant write loyalty" on loyalty_redemptions
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[]));

-- -------------------------------------------------------------
-- RPC atomica: subtrai pontos + insere redemption
-- -------------------------------------------------------------
create or replace function public.redeem_loyalty_points(
  p_customer_id uuid,
  p_points int,
  p_reward text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer customers%rowtype;
  v_redemption_id uuid;
begin
  if p_points <= 0 then
    raise exception 'Pontos devem ser maior que zero';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Cliente nao encontrado';
  end if;

  -- Verifica se o usuario pode operar esse restaurante
  if not auth_has_role(v_customer.restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[]) then
    raise exception 'Sem permissao para resgatar pontos deste cliente';
  end if;

  if v_customer.loyalty_points < p_points then
    raise exception 'Saldo insuficiente (atual: %, requerido: %)',
      v_customer.loyalty_points, p_points;
  end if;

  update customers
    set loyalty_points = loyalty_points - p_points
    where id = p_customer_id;

  insert into loyalty_redemptions (restaurant_id, customer_id, points, reward)
  values (v_customer.restaurant_id, p_customer_id, p_points, p_reward)
  returning id into v_redemption_id;

  return v_redemption_id;
end; $$;

grant execute on function public.redeem_loyalty_points(uuid, int, text) to authenticated;

alter publication supabase_realtime add table loyalty_redemptions;
