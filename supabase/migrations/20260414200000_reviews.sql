-- =============================================================
-- Txoko — Avaliacoes dos clientes
-- =============================================================

create type review_sentiment as enum ('positive','neutral','negative');

create table reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  rating        int not null check (rating between 1 and 5),
  nps           int check (nps between 0 and 10),
  comment       text,
  sentiment     review_sentiment,
  is_anonymous  boolean not null default false,
  source        text not null default 'internal',
  created_at    timestamptz not null default now()
);
create index on reviews(restaurant_id, created_at desc);
create index on reviews(sentiment);

alter table reviews enable row level security;

create policy "tenant read reviews" on reviews
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant write reviews" on reviews
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]));

-- Leitura publica de avaliacoes ativas (para widget de vitrine/menu publico)
create policy "public read reviews" on reviews
  for select to anon
  using (true);

alter publication supabase_realtime add table reviews;
