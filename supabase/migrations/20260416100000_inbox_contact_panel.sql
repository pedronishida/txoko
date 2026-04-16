-- =============================================
-- Inbox Contact Panel Features
-- =============================================
-- Adds:
--  - conversation_notes: internal notes per conversation (invisible to customer)
--  - conversations.ai_paused: toggle AI auto-responses per conversation
--  - conversations.ai_summary_generated_at: tracks when summary was last generated
--  - ai_suggested_replies: cache of generated reply suggestions (optional, short TTL)
-- =============================================

-- 1. Add ai_paused + ai_summary_generated_at to conversations
alter table conversations
  add column if not exists ai_paused boolean not null default false,
  add column if not exists ai_summary_generated_at timestamptz;

create index if not exists conversations_ai_paused_idx
  on conversations(restaurant_id, ai_paused)
  where ai_paused = true;

-- 2. conversation_notes table (internal notes visible only to agents)
create table if not exists conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_id       uuid references auth.users(id) on delete set null,
  body            text not null check (length(body) between 1 and 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists conversation_notes_conversation_id_idx
  on conversation_notes(conversation_id, created_at desc);

create trigger trg_conversation_notes_updated
  before update on conversation_notes
  for each row execute function set_updated_at();

alter table conversation_notes enable row level security;

create policy "tenant read conversation_notes" on conversation_notes
  for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and c.restaurant_id = any(auth_restaurant_ids())
  ));

create policy "staff write conversation_notes" on conversation_notes
  for all to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[])
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[])
  ));

-- 3. ai_suggested_replies — short-lived cache of generated suggestions
create table if not exists ai_suggested_replies (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  -- Hash of the last 5 message bodies used to generate — invalidates when thread changes
  context_hash    text not null,
  suggestions     jsonb not null, -- array of { text: string, tone?: string }
  model           text,
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '1 hour')
);

create index if not exists ai_suggested_replies_conversation_id_idx
  on ai_suggested_replies(conversation_id, generated_at desc);

create index if not exists ai_suggested_replies_expires_idx
  on ai_suggested_replies(expires_at);

alter table ai_suggested_replies enable row level security;

create policy "tenant read ai_suggested_replies" on ai_suggested_replies
  for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and c.restaurant_id = any(auth_restaurant_ids())
  ));

create policy "staff write ai_suggested_replies" on ai_suggested_replies
  for all to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[])
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[])
  ));

-- 4. Extend conversation_event_type enum to cover new events
do $$
begin
  begin
    alter type conversation_event_type add value if not exists 'ai_summary_refreshed';
  exception when duplicate_object then null;
  end;
  begin
    alter type conversation_event_type add value if not exists 'ai_suggestions_generated';
  exception when duplicate_object then null;
  end;
  begin
    alter type conversation_event_type add value if not exists 'ai_paused';
  exception when duplicate_object then null;
  end;
  begin
    alter type conversation_event_type add value if not exists 'ai_resumed';
  exception when duplicate_object then null;
  end;
end $$;

-- 5. Add realtime subscription for new tables
alter publication supabase_realtime add table conversation_notes;
