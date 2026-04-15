-- =============================================================
-- Txoko — Pagamentos
-- =============================================================

create type payment_method as enum ('cash','credit','debit','pix','voucher','online');
create type payment_status as enum ('pending','approved','cancelled','refunded');

create table payments (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  method        payment_method not null,
  amount        numeric(10,2) not null check (amount >= 0),
  status        payment_status not null default 'approved',
  card_brand    text,
  card_last_four text,
  nsu           text,
  authorization_code text,
  created_at    timestamptz not null default now()
);

create index on payments(restaurant_id);
create index on payments(order_id);

alter table payments enable row level security;

create policy "tenant read payments" on payments
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant write payments" on payments
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]));

alter publication supabase_realtime add table payments;
