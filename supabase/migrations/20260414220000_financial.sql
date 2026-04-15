-- =============================================================
-- Txoko — Financeiro: contas a pagar / receber
-- =============================================================

create type financial_type   as enum ('income','expense','transfer');
create type financial_status as enum ('pending','paid','overdue','cancelled');

create table financial_transactions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  type           financial_type not null,
  category       text not null,
  description    text,
  amount         numeric(10,2) not null check (amount >= 0),
  due_date       date,
  paid_at        timestamptz,
  status         financial_status not null default 'pending',
  recurrence     text,
  payment_method text,
  document_url   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on financial_transactions(restaurant_id, status);
create index on financial_transactions(restaurant_id, due_date);
create index on financial_transactions(type);

create trigger trg_financial_updated before update on financial_transactions
  for each row execute function set_updated_at();

alter table financial_transactions enable row level security;

create policy "tenant read financial" on financial_transactions
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant write financial" on financial_transactions
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]));

alter publication supabase_realtime add table financial_transactions;

-- =============================================================
-- Trigger: marca como 'overdue' ao ler, via view? Nao — usamos client-side
-- =============================================================
