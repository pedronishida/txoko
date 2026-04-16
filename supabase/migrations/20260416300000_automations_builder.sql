-- =============================================================
-- Txoko — Automation Builder: extend schema with rich trigger/action model
-- =============================================================

-- Add new columns to automations for the builder
alter table automations
  add column if not exists name        text,
  add column if not exists description text,
  add column if not exists trigger_type text
    check (trigger_type in (
      'new_customer','no_visit_30d','birthday','low_stock',
      'new_order','order_completed','review_negative'
    )),
  add column if not exists trigger_config jsonb not null default '{}',
  add column if not exists action_type  text
    check (action_type in (
      'send_whatsapp','send_email','create_task',
      'notify_staff','apply_discount'
    )),
  add column if not exists action_config jsonb not null default '{}',
  add column if not exists run_count    int  not null default 0;

-- Backfill name from trigger+action for existing rows
update automations
set name = code
where name is null;

-- automation_runs: separate from automation_logs (keep logs for legacy triggers)
create table if not exists automation_runs (
  id               uuid primary key default gen_random_uuid(),
  automation_id    uuid references automations(id) on delete cascade,
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  triggered_at     timestamptz not null default now(),
  status           text not null default 'success'
    check (status in ('success','failed')),
  target_entity_id text,
  result           jsonb
);

create index if not exists automation_runs_automation_id_idx
  on automation_runs(automation_id);
create index if not exists automation_runs_restaurant_id_idx
  on automation_runs(restaurant_id, triggered_at desc);

alter table automation_runs enable row level security;

create policy "tenant read automation_runs" on automation_runs
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant write automation_runs" on automation_runs
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

alter publication supabase_realtime add table automation_runs;
