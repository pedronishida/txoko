-- =============================================================
-- Txoko — Marketing Automation / Broadcast System
-- =============================================================
-- 10 tabelas: campaigns, campaign_templates, campaign_steps,
-- campaign_audiences, campaign_recipients, campaign_ab_variants,
-- campaign_events, opt_outs, ai_message_variations
-- =============================================================

-- -------------------------------------------------------------
-- ENUMS
-- -------------------------------------------------------------
create type campaign_type as enum ('one_shot', 'recurring', 'triggered');
create type campaign_status as enum ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'error');
create type campaign_channel as enum ('whatsapp', 'email', 'sms');
create type campaign_step_type as enum ('send_message', 'wait', 'condition', 'ab_split', 'update_contact', 'end');
create type recipient_status as enum ('pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'opted_out', 'skipped');
create type opt_out_channel as enum ('whatsapp', 'email', 'sms', 'all');

-- -------------------------------------------------------------
-- CAMPAIGN_AUDIENCES — definido antes de campaigns (FK)
-- -------------------------------------------------------------
create table campaign_audiences (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  name             text not null,
  description      text,
  filters          jsonb not null default '[]'::jsonb,
  cached_count     int not null default 0,
  cached_at        timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on campaign_audiences(restaurant_id);
create trigger trg_campaign_audiences_updated before update on campaign_audiences
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- CAMPAIGN_TEMPLATES
-- -------------------------------------------------------------
create table campaign_templates (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  name             text not null,
  category         text,

  -- WhatsApp content
  wa_body          text,
  wa_image_url     text,
  wa_document_url  text,
  wa_document_ext  text,
  wa_link_url      text,
  wa_link_title    text,
  wa_link_description text,
  wa_buttons       jsonb,

  -- Email content
  email_subject    text,
  email_html       text,
  email_plain      text,
  email_from_name  text,

  -- SMS content
  sms_body         text,

  -- Variables
  variables        text[] not null default '{}',

  -- AI variation config
  ai_variation_enabled  boolean not null default false,
  ai_variation_count    int not null default 5,
  ai_variation_temp     numeric(3,2) not null default 0.70,

  usage_count      int not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on campaign_templates(restaurant_id);
create index on campaign_templates(restaurant_id, category);
create trigger trg_campaign_templates_updated before update on campaign_templates
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- CAMPAIGNS
-- -------------------------------------------------------------
create table campaigns (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  name             text not null,
  description      text,
  type             campaign_type not null default 'one_shot',
  status           campaign_status not null default 'draft',
  channel          campaign_channel not null default 'whatsapp',

  -- Audience
  audience_id      uuid references campaign_audiences(id) on delete set null,
  audience_count   int not null default 0,

  -- Scheduling
  scheduled_at     timestamptz,
  timezone         text not null default 'America/Sao_Paulo',
  recurring_cron   text,
  next_run_at      timestamptz,

  -- Trigger config
  trigger_event    text,
  trigger_config   jsonb not null default '{}'::jsonb,

  -- Stats (denormalized)
  stats_total      int not null default 0,
  stats_sent       int not null default 0,
  stats_delivered  int not null default 0,
  stats_read       int not null default 0,
  stats_failed     int not null default 0,
  stats_opted_out  int not null default 0,

  -- Execution
  started_at       timestamptz,
  completed_at     timestamptz,
  error_message    text,

  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on campaigns(restaurant_id, status);
create index on campaigns(restaurant_id, type);
create index on campaigns(restaurant_id, created_at desc);
create index on campaigns(status) where status in ('scheduled', 'running');
create trigger trg_campaigns_updated before update on campaigns
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- CAMPAIGN_STEPS (flow engine)
-- -------------------------------------------------------------
create table campaign_steps (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  step_order       int not null,
  step_type        campaign_step_type not null,

  -- send_message
  template_id      uuid references campaign_templates(id) on delete set null,
  channel_override campaign_channel,

  -- wait
  wait_duration    interval,
  wait_until_time  time,

  -- condition
  condition_field  text,
  condition_op     text,
  condition_value  text,
  condition_true_step  uuid references campaign_steps(id),
  condition_false_step uuid references campaign_steps(id),

  -- ab_split
  ab_variant_a_step    uuid references campaign_steps(id),
  ab_variant_b_step    uuid references campaign_steps(id),
  ab_split_pct         int not null default 50,

  -- update_contact
  update_field     text,
  update_value     text,

  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),

  unique (campaign_id, step_order)
);
create index on campaign_steps(campaign_id, step_order);

-- -------------------------------------------------------------
-- CAMPAIGN_RECIPIENTS
-- -------------------------------------------------------------
create table campaign_recipients (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  customer_id      uuid not null references customers(id) on delete cascade,
  contact_id       uuid references contacts(id) on delete set null,

  -- Flow state
  current_step_id  uuid references campaign_steps(id) on delete set null,
  step_entered_at  timestamptz,

  -- Delivery
  status           recipient_status not null default 'pending',
  channel          campaign_channel not null,
  external_message_id text,

  -- Variation
  variant_index    int,
  ab_variant       text,

  -- Timestamps
  queued_at        timestamptz,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  failed_at        timestamptz,
  failure_reason   text,

  -- Retry
  retry_count      int not null default 0,
  next_retry_at    timestamptz,

  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),

  unique (campaign_id, customer_id)
);
create index on campaign_recipients(campaign_id, status);
create index on campaign_recipients(campaign_id, current_step_id);
create index on campaign_recipients(customer_id);
create index on campaign_recipients(external_message_id) where external_message_id is not null;
create index on campaign_recipients(status, next_retry_at) where status = 'failed' and next_retry_at is not null;

-- -------------------------------------------------------------
-- CAMPAIGN_AB_VARIANTS
-- -------------------------------------------------------------
create table campaign_ab_variants (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  step_id          uuid not null references campaign_steps(id) on delete cascade,
  variant          text not null check (variant in ('a', 'b')),
  template_id      uuid references campaign_templates(id) on delete set null,

  stats_sent       int not null default 0,
  stats_delivered  int not null default 0,
  stats_read       int not null default 0,
  stats_failed     int not null default 0,

  created_at       timestamptz not null default now(),

  unique (campaign_id, step_id, variant)
);
create index on campaign_ab_variants(campaign_id, step_id);

-- -------------------------------------------------------------
-- CAMPAIGN_EVENTS (audit log)
-- -------------------------------------------------------------
create table campaign_events (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  recipient_id     uuid references campaign_recipients(id) on delete cascade,
  event_type       text not null,
  data             jsonb not null default '{}'::jsonb,
  actor_user_id    uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index on campaign_events(campaign_id, created_at desc);
create index on campaign_events(recipient_id, created_at desc) where recipient_id is not null;

-- -------------------------------------------------------------
-- OPT_OUTS
-- -------------------------------------------------------------
create table opt_outs (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  customer_id      uuid not null references customers(id) on delete cascade,
  channel          opt_out_channel not null,
  reason           text,
  opted_out_at     timestamptz not null default now(),

  unique (restaurant_id, customer_id, channel)
);
create index on opt_outs(restaurant_id, channel);
create index on opt_outs(customer_id);

-- -------------------------------------------------------------
-- AI_MESSAGE_VARIATIONS (cache)
-- -------------------------------------------------------------
create table ai_message_variations (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references campaign_templates(id) on delete cascade,
  variant_index    int not null,
  channel          campaign_channel not null,
  body             text not null,
  image_url        text,
  subject          text,
  hash             text not null,
  created_at       timestamptz not null default now(),

  unique (template_id, variant_index, channel)
);
create index on ai_message_variations(template_id, channel);

-- =============================================================
-- RLS
-- =============================================================
alter table campaigns             enable row level security;
alter table campaign_templates    enable row level security;
alter table campaign_steps        enable row level security;
alter table campaign_audiences    enable row level security;
alter table campaign_recipients   enable row level security;
alter table campaign_ab_variants  enable row level security;
alter table campaign_events       enable row level security;
alter table opt_outs              enable row level security;
alter table ai_message_variations enable row level security;

-- campaigns
create policy "tenant read campaigns" on campaigns
  for select to authenticated using (restaurant_id = any(auth_restaurant_ids()));
create policy "managers write campaigns" on campaigns
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- campaign_templates
create policy "tenant read campaign_templates" on campaign_templates
  for select to authenticated using (restaurant_id = any(auth_restaurant_ids()));
create policy "managers write campaign_templates" on campaign_templates
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- campaign_steps
create policy "tenant read campaign_steps" on campaign_steps
  for select to authenticated
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.restaurant_id = any(auth_restaurant_ids())));
create policy "managers write campaign_steps" on campaign_steps
  for all to authenticated
  using (exists (select 1 from campaigns c where c.id = campaign_id and auth_has_role(c.restaurant_id, array['owner','manager']::restaurant_role[])))
  with check (exists (select 1 from campaigns c where c.id = campaign_id and auth_has_role(c.restaurant_id, array['owner','manager']::restaurant_role[])));

-- campaign_audiences
create policy "tenant read campaign_audiences" on campaign_audiences
  for select to authenticated using (restaurant_id = any(auth_restaurant_ids()));
create policy "managers write campaign_audiences" on campaign_audiences
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- campaign_recipients
create policy "tenant read campaign_recipients" on campaign_recipients
  for select to authenticated
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.restaurant_id = any(auth_restaurant_ids())));

-- campaign_ab_variants
create policy "tenant read campaign_ab_variants" on campaign_ab_variants
  for select to authenticated
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.restaurant_id = any(auth_restaurant_ids())));

-- campaign_events
create policy "tenant read campaign_events" on campaign_events
  for select to authenticated
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.restaurant_id = any(auth_restaurant_ids())));

-- opt_outs
create policy "tenant read opt_outs" on opt_outs
  for select to authenticated using (restaurant_id = any(auth_restaurant_ids()));
create policy "managers write opt_outs" on opt_outs
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

-- ai_message_variations
create policy "tenant read ai_variations" on ai_message_variations
  for select to authenticated
  using (exists (select 1 from campaign_templates ct where ct.id = template_id and ct.restaurant_id = any(auth_restaurant_ids())));

-- =============================================================
-- Realtime
-- =============================================================
alter publication supabase_realtime add table campaigns;
alter publication supabase_realtime add table campaign_recipients;
alter publication supabase_realtime add table campaign_events;

-- =============================================================
-- TRIGGER: auto-update campaign stats on recipient status change
-- =============================================================
create or replace function public.update_campaign_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update campaigns set
    stats_total = (select count(*) from campaign_recipients where campaign_id = NEW.campaign_id),
    stats_sent = (select count(*) from campaign_recipients where campaign_id = NEW.campaign_id and status in ('sent', 'delivered', 'read')),
    stats_delivered = (select count(*) from campaign_recipients where campaign_id = NEW.campaign_id and status in ('delivered', 'read')),
    stats_read = (select count(*) from campaign_recipients where campaign_id = NEW.campaign_id and status = 'read'),
    stats_failed = (select count(*) from campaign_recipients where campaign_id = NEW.campaign_id and status = 'failed'),
    stats_opted_out = (select count(*) from campaign_recipients where campaign_id = NEW.campaign_id and status = 'opted_out'),
    updated_at = now()
  where id = NEW.campaign_id;
  return NEW;
end; $$;

create trigger trg_campaign_recipient_stats
  after insert or update of status on campaign_recipients
  for each row execute function update_campaign_stats();
