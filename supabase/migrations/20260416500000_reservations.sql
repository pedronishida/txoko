create type reservation_status as enum ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show');

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  table_id uuid references tables(id) on delete set null,
  -- Guest info (filled even if not a known customer)
  guest_name text not null,
  guest_phone text not null,
  guest_email text,
  guest_count int not null check (guest_count between 1 and 50),
  -- When
  scheduled_for timestamptz not null,
  duration_minutes int not null default 90,
  -- Status
  status reservation_status not null default 'pending',
  source text not null default 'manual', -- 'manual' | 'public_menu' | 'whatsapp' | 'ifood'
  notes text,
  special_requests text,
  -- Confirmation
  confirmed_at timestamptz,
  confirmation_sent_at timestamptz,
  reminder_sent_at timestamptz,
  -- Lifecycle
  seated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Meta
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on reservations(restaurant_id, scheduled_for);
create index on reservations(restaurant_id, status) where status in ('pending', 'confirmed');
create index on reservations(table_id) where table_id is not null;
create index on reservations(customer_id) where customer_id is not null;

create trigger trg_reservations_updated before update on reservations
  for each row execute function set_updated_at();

alter table reservations enable row level security;

create policy "tenant read reservations" on reservations for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "staff write reservations" on reservations for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]));

-- Public create: allow anonymous insert for public bookings (but only with status=pending and source=public_menu)
create policy "public insert reservations" on reservations for insert to anon
  with check (status = 'pending' and source = 'public_menu');

alter publication supabase_realtime add table reservations;

-- Helper view for upcoming reservations
create or replace view v_upcoming_reservations as
  select
    r.*,
    c.name as customer_name,
    t.number as table_number,
    t.capacity as table_capacity
  from reservations r
  left join customers c on c.id = r.customer_id
  left join tables t on t.id = r.table_id
  where r.status in ('pending','confirmed','seated')
    and r.scheduled_for >= now() - interval '2 hours'
  order by r.scheduled_for asc;
