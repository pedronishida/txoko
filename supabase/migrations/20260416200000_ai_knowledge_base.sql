-- =============================================
-- AI Knowledge Base + Auto-Agent settings
-- =============================================
-- Adds:
--  - ai_knowledge_entries: restaurant KB entries for auto-reply
--  - restaurants.ai_agent_enabled: toggle per restaurant
--  - restaurants.ai_agent_config: persona + escalation config
--  - conversation_event_type: bot_replied
-- =============================================

-- 1. Knowledge base entries
create table if not exists ai_knowledge_entries (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  title           text not null,
  category        text, -- 'horarios', 'cardapio', 'reserva', 'entrega', 'pagamento', 'outros'
  content         text not null check (length(content) between 10 and 8000),
  keywords        text[] not null default '{}',
  enabled         boolean not null default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ai_knowledge_entries_restaurant_enabled_idx
  on ai_knowledge_entries(restaurant_id, enabled);

create index if not exists ai_knowledge_entries_keywords_idx
  on ai_knowledge_entries using gin(keywords);

create trigger trg_ai_knowledge_entries_updated
  before update on ai_knowledge_entries
  for each row execute function set_updated_at();

alter table ai_knowledge_entries enable row level security;

create policy "tenant read ai_knowledge_entries" on ai_knowledge_entries
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "managers write ai_knowledge_entries" on ai_knowledge_entries
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- 2. Restaurant-level AI agent settings
alter table restaurants
  add column if not exists ai_agent_enabled boolean not null default false,
  add column if not exists ai_agent_config jsonb not null default '{}'::jsonb;

-- 3. Extend conversation_event_type enum
do $$
begin
  begin
    alter type conversation_event_type add value if not exists 'bot_replied';
  exception when duplicate_object then null;
  end;
  begin
    alter type conversation_event_type add value if not exists 'bot_escalated';
  exception when duplicate_object then null;
  end;
end $$;

-- 4. Realtime for knowledge entries
alter publication supabase_realtime add table ai_knowledge_entries;
