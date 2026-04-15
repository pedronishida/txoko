-- =============================================================
-- Txoko — Inbox omnichannel (Fase 1)
-- =============================================================

-- -------------------------------------------------------------
-- ENUMS
-- -------------------------------------------------------------
create type channel_type as enum (
  'whatsapp_zapi',
  'instagram',
  'facebook_messenger',
  'ifood_chat',
  'google_reviews',
  'internal_qr'
);

create type channel_status as enum (
  'active', 'disconnected', 'error', 'pending_setup'
);

create type conversation_status as enum (
  'open', 'pending_customer', 'pending_agent', 'resolved', 'closed', 'spam'
);

create type conversation_priority as enum (
  'low', 'normal', 'high', 'urgent'
);

create type conversation_intent as enum (
  'question', 'complaint', 'order', 'praise', 'reservation', 'spam', 'other'
);

create type message_direction as enum ('inbound', 'outbound');

create type message_sender_type as enum ('contact', 'agent', 'bot', 'system');

create type message_status as enum (
  'pending', 'sent', 'delivered', 'read', 'failed'
);

create type conversation_event_type as enum (
  'created',
  'status_changed',
  'priority_changed',
  'assigned',
  'unassigned',
  'tagged',
  'untagged',
  'note_added',
  'ai_summary_generated',
  'ai_classified',
  'merged',
  'closed',
  'reopened'
);

-- -------------------------------------------------------------
-- CHANNELS — uma integracao configurada por restaurante
-- -------------------------------------------------------------
create table channels (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  type           channel_type not null,
  name           text not null,
  status         channel_status not null default 'pending_setup',
  config         jsonb not null default '{}'::jsonb,
  external_id    text,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on channels(restaurant_id);
create index on channels(restaurant_id, type);

create trigger trg_channels_updated before update on channels
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- CONTACTS — pessoa externa unificada
-- -------------------------------------------------------------
create table contacts (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  customer_id      uuid references customers(id) on delete set null,
  display_name     text not null default 'Cliente',
  avatar_url       text,
  locale           text default 'pt-BR',
  notes            text,
  tags             text[] not null default '{}',
  first_contact_at timestamptz not null default now(),
  last_contact_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on contacts(restaurant_id);
create index on contacts(restaurant_id, customer_id) where customer_id is not null;
create index on contacts using gin(tags);

create trigger trg_contacts_updated before update on contacts
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- CONTACT_IDENTITIES — uma pessoa pode ter varias identidades
-- -------------------------------------------------------------
create table contact_identities (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references contacts(id) on delete cascade,
  channel_id     uuid not null references channels(id) on delete cascade,
  channel_type   channel_type not null,
  external_id    text not null,
  display_name   text,
  verified       boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (channel_id, external_id)
);
create index on contact_identities(contact_id);
create index on contact_identities(channel_type, external_id);

-- -------------------------------------------------------------
-- CONVERSATIONS — thread unificada
-- -------------------------------------------------------------
create table conversations (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants(id) on delete cascade,
  contact_id           uuid not null references contacts(id) on delete cascade,
  channel_id           uuid not null references channels(id) on delete cascade,
  external_thread_id   text,
  subject              text,
  status               conversation_status not null default 'open',
  priority             conversation_priority not null default 'normal',
  assignee_id          uuid references auth.users(id) on delete set null,
  unread_count         int not null default 0,
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  ai_summary           text,
  ai_intent            conversation_intent,
  ai_sentiment         review_sentiment,
  sla_due_at           timestamptz,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on conversations(restaurant_id, status, last_message_at desc);
create index on conversations(restaurant_id, assignee_id, status);
create index on conversations(restaurant_id, channel_id, status);
create index on conversations(contact_id);

create trigger trg_conversations_updated before update on conversations
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- MESSAGES — eventos individuais
-- -------------------------------------------------------------
create table messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references conversations(id) on delete cascade,
  direction           message_direction not null,
  sender_type         message_sender_type not null,
  sender_user_id      uuid references auth.users(id) on delete set null,
  body                text,
  attachments         jsonb not null default '[]'::jsonb,
  external_message_id text,
  status              message_status not null default 'sent',
  reply_to_id         uuid references messages(id) on delete set null,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index on messages(conversation_id, created_at desc);
create index on messages(conversation_id) where status = 'pending';

-- -------------------------------------------------------------
-- MESSAGE_TEMPLATES — quick replies
-- -------------------------------------------------------------
create table message_templates (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  name           text not null,
  body           text not null,
  shortcut       text,
  category       text,
  channels       text[] not null default '{}',
  usage_count    int not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on message_templates(restaurant_id);

-- -------------------------------------------------------------
-- CONVERSATION_EVENTS — audit log
-- -------------------------------------------------------------
create table conversation_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  actor_user_id   uuid references auth.users(id) on delete set null,
  type            conversation_event_type not null,
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index on conversation_events(conversation_id, created_at desc);

-- =============================================================
-- RLS — tenant isolation
-- =============================================================
alter table channels             enable row level security;
alter table contacts             enable row level security;
alter table contact_identities   enable row level security;
alter table conversations        enable row level security;
alter table messages             enable row level security;
alter table message_templates    enable row level security;
alter table conversation_events  enable row level security;

-- ----- channels -----
create policy "tenant read channels" on channels
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "managers write channels" on channels
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- ----- contacts -----
create policy "tenant read contacts" on contacts
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "staff write contacts" on contacts
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[]));

-- ----- contact_identities -----
create policy "tenant read identities" on contact_identities
  for select to authenticated
  using (exists (
    select 1 from contacts c
    where c.id = contact_id and c.restaurant_id = any(auth_restaurant_ids())
  ));
create policy "staff write identities" on contact_identities
  for all to authenticated
  using (exists (
    select 1 from contacts c
    where c.id = contact_id
      and auth_has_role(c.restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[])
  ))
  with check (exists (
    select 1 from contacts c
    where c.id = contact_id
      and auth_has_role(c.restaurant_id, array['owner','manager','waiter','cashier']::restaurant_role[])
  ));

-- ----- conversations -----
-- owner/manager/cashier veem tudo; waiter/kitchen so o atribuido a si
create policy "managers read all conversations" on conversations
  for select to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','cashier']::restaurant_role[]));
create policy "staff read assigned conversations" on conversations
  for select to authenticated
  using (
    auth_has_role(restaurant_id, array['waiter','kitchen']::restaurant_role[])
    and assignee_id = auth.uid()
  );
create policy "staff write conversations" on conversations
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[]));

-- ----- messages -----
create policy "tenant read messages" on messages
  for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and c.restaurant_id = any(auth_restaurant_ids())
  ));
create policy "staff write messages" on messages
  for all to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[])
  ))
  with check (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[])
  ));

-- ----- message_templates -----
create policy "tenant read templates" on message_templates
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "managers write templates" on message_templates
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- ----- conversation_events -----
create policy "tenant read events" on conversation_events
  for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and c.restaurant_id = any(auth_restaurant_ids())
  ));
create policy "staff insert events" on conversation_events
  for insert to authenticated
  with check (exists (
    select 1 from conversations c
    where c.id = conversation_id
      and auth_has_role(c.restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[])
  ));

-- =============================================================
-- Realtime publication
-- =============================================================
alter publication supabase_realtime add table channels;
alter publication supabase_realtime add table contacts;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversation_events;

-- =============================================================
-- TRIGGER: ao inserir message, atualiza conversa (last_message, unread)
-- =============================================================
create or replace function public.on_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
    set
      last_message_at = NEW.created_at,
      last_message_preview = left(coalesce(NEW.body, '(midia)'), 140),
      unread_count = case
        when NEW.direction = 'inbound' then unread_count + 1
        else unread_count
      end,
      status = case
        when NEW.direction = 'inbound' and status in ('resolved','closed') then 'open'
        else status
      end,
      updated_at = now()
    where id = NEW.conversation_id;
  return NEW;
end; $$;

drop trigger if exists on_message_insert on messages;
create trigger on_message_insert
  after insert on messages
  for each row execute function on_message_inserted();

-- =============================================================
-- TRIGGER: review → conversation (MERGE do canal interno QR)
-- =============================================================
create or replace function public.review_to_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_display_name text;
  v_customer_id uuid;
  v_customer_name text;
begin
  -- 1. Acha ou cria o channel internal_qr pro restaurante
  select id into v_channel_id
  from channels
  where restaurant_id = NEW.restaurant_id and type = 'internal_qr';

  if v_channel_id is null then
    insert into channels (restaurant_id, type, name, status)
    values (NEW.restaurant_id, 'internal_qr', 'QR Code Interno', 'active')
    returning id into v_channel_id;
  end if;

  -- 2. Resolve display name (cliente vinculado ou anonimo)
  v_customer_id := NEW.customer_id;
  if v_customer_id is not null then
    select name into v_customer_name from customers where id = v_customer_id;
  end if;
  v_display_name := coalesce(
    v_customer_name,
    case when NEW.is_anonymous then 'Cliente anonimo' else 'Cliente' end
  );

  -- 3. Cria contato novo (nao tentamos unificar com reviews anonimas)
  insert into contacts (
    restaurant_id, customer_id, display_name,
    first_contact_at, last_contact_at
  )
  values (
    NEW.restaurant_id, v_customer_id, v_display_name,
    NEW.created_at, NEW.created_at
  )
  returning id into v_contact_id;

  -- 4. Cria conversa com metadata do review (rating, review_id)
  insert into conversations (
    restaurant_id, contact_id, channel_id,
    external_thread_id, subject, status, priority,
    last_message_at, last_message_preview,
    ai_sentiment, metadata
  )
  values (
    NEW.restaurant_id,
    v_contact_id,
    v_channel_id,
    NEW.id::text,
    format('Avaliacao %s★ via QR', NEW.rating),
    'pending_agent',
    case
      when NEW.rating <= 2 then 'high'::conversation_priority
      when NEW.rating = 3 then 'normal'::conversation_priority
      else 'low'::conversation_priority
    end,
    NEW.created_at,
    left(coalesce(NEW.comment, format('Avaliacao %s estrelas, sem comentario', NEW.rating)), 140),
    NEW.sentiment,
    jsonb_build_object(
      'review_id', NEW.id,
      'rating', NEW.rating,
      'nps', NEW.nps,
      'source', NEW.source
    )
  )
  returning id into v_conversation_id;

  -- 5. Cria mensagem com o conteudo da review
  insert into messages (
    conversation_id, direction, sender_type, body, metadata
  )
  values (
    v_conversation_id,
    'inbound',
    'contact',
    coalesce(NEW.comment, format('%s/5 estrelas', NEW.rating)),
    jsonb_build_object('rating', NEW.rating)
  );

  -- 6. Event log
  insert into conversation_events (conversation_id, type, data)
  values (
    v_conversation_id,
    'created',
    jsonb_build_object('source', 'review', 'review_id', NEW.id)
  );

  return NEW;
end; $$;

drop trigger if exists on_review_created on reviews;
create trigger on_review_created
  after insert on reviews
  for each row execute function review_to_conversation();

-- =============================================================
-- BACKFILL: reviews existentes viram conversas (inline)
-- =============================================================
do $$
declare
  rev reviews%rowtype;
  v_channel_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_display_name text;
  v_customer_name text;
begin
  for rev in
    select * from reviews
    where not exists (
      select 1 from conversations c
      where c.external_thread_id = reviews.id::text
    )
    order by created_at asc
  loop
    select id into v_channel_id
    from channels
    where restaurant_id = rev.restaurant_id and type = 'internal_qr';

    if v_channel_id is null then
      insert into channels (restaurant_id, type, name, status)
      values (rev.restaurant_id, 'internal_qr', 'QR Code Interno', 'active')
      returning id into v_channel_id;
    end if;

    v_customer_name := null;
    if rev.customer_id is not null then
      select name into v_customer_name from customers where id = rev.customer_id;
    end if;
    v_display_name := coalesce(
      v_customer_name,
      case when rev.is_anonymous then 'Cliente anonimo' else 'Cliente' end
    );

    insert into contacts (
      restaurant_id, customer_id, display_name,
      first_contact_at, last_contact_at
    )
    values (
      rev.restaurant_id, rev.customer_id, v_display_name,
      rev.created_at, rev.created_at
    )
    returning id into v_contact_id;

    insert into conversations (
      restaurant_id, contact_id, channel_id,
      external_thread_id, subject, status, priority,
      last_message_at, last_message_preview,
      ai_sentiment, metadata
    )
    values (
      rev.restaurant_id,
      v_contact_id,
      v_channel_id,
      rev.id::text,
      format('Avaliacao %s★ via QR', rev.rating),
      'pending_agent',
      case
        when rev.rating <= 2 then 'high'::conversation_priority
        when rev.rating = 3 then 'normal'::conversation_priority
        else 'low'::conversation_priority
      end,
      rev.created_at,
      left(coalesce(rev.comment, format('Avaliacao %s estrelas', rev.rating)), 140),
      rev.sentiment,
      jsonb_build_object(
        'review_id', rev.id,
        'rating', rev.rating,
        'nps', rev.nps,
        'source', rev.source
      )
    )
    returning id into v_conversation_id;

    insert into messages (
      conversation_id, direction, sender_type, body, metadata, created_at
    )
    values (
      v_conversation_id,
      'inbound',
      'contact',
      coalesce(rev.comment, format('%s/5 estrelas', rev.rating)),
      jsonb_build_object('rating', rev.rating),
      rev.created_at
    );

    insert into conversation_events (conversation_id, type, data)
    values (
      v_conversation_id,
      'created',
      jsonb_build_object('source', 'review_backfill', 'review_id', rev.id)
    );
  end loop;
end; $$;

-- =============================================================
-- Default templates pro demo
-- =============================================================
insert into message_templates (restaurant_id, name, body, shortcut, category, channels) values
  ('00000000-0000-0000-0000-000000000001','Agradecer avaliacao','Oi {contact_name}! Muito obrigado pelo carinho 🙏 Vamos sempre buscar entregar nosso melhor pra voce!','/thanks','elogio',array['internal_qr','whatsapp_zapi','instagram']),
  ('00000000-0000-0000-0000-000000000001','Pedido de desculpas','Oi {contact_name}, sinto muito pelo ocorrido. Vou encaminhar seu feedback pra nossa equipe e um gerente vai entrar em contato com voce em breve.','/desculpas','reclamacao',array['internal_qr','whatsapp_zapi']),
  ('00000000-0000-0000-0000-000000000001','Horario de funcionamento','Nosso horario e de terca a domingo, das 11:30 as 23:00. Estamos fechados as segundas!','/horario','info',array['whatsapp_zapi','instagram','facebook_messenger']),
  ('00000000-0000-0000-0000-000000000001','Delivery via iFood','Nosso delivery e pelo iFood! Busque por Txoko e faca seu pedido 🛵','/delivery','info',array['whatsapp_zapi','instagram']),
  ('00000000-0000-0000-0000-000000000001','Reserva','Legal! Quantas pessoas e pra qual dia/horario? Assim ja consigo verificar disponibilidade 📅','/reserva','reserva',array['whatsapp_zapi','instagram','facebook_messenger'])
on conflict do nothing;
