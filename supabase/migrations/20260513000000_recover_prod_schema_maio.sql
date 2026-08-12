-- =============================================================
-- Txoko — Recuperacao do schema de producao (mudancas 05/05–13/05)
-- =============================================================
-- Reconstruido por introspecao read-only do banco de producao
-- (amrigajsegjztylucdnc) em 11/08/2026. Estes objetos existem em
-- prod mas nao estavam em nenhuma migration do repo (foram criados
-- via SQL editor / execute_sql, sem registro em schema_migrations).
--
-- ATENCAO: NAO aplicar em producao — os objetos ja existem la.
-- Esta migration serve para alinhar ambientes novos (dev/CI) e para
-- registrar o schema no repo. Em prod, marcar como aplicada com
-- `supabase migration repair --status applied 20260513000000`.
--
-- Blocos: short links (tracked_links/link_clicks + rota /l/[code]),
-- tracking de menu (menu_sessions), atribuicao de pedidos a campanhas,
-- pedidos por chat (order_drafts), agente admin WhatsApp (admin_agent*),
-- saude/limite diario de canais (channels + channel_send_log),
-- severidade de notificacoes, resposta a reviews, views de analytics,
-- buckets inbox-media e admin-briefings.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Enums: papel do agente admin + novos tipos de notificacao
-- -------------------------------------------------------------
create type admin_agent_role as enum ('owner','manager','kitchen','cashier','waiter');

alter type notification_type add value if not exists 'campaign_milestone';
alter type notification_type add value if not exists 'vip_just_messaged';
alter type notification_type add value if not exists 'ai_escalated';
alter type notification_type add value if not exists 'optout_spike';

-- -------------------------------------------------------------
-- 2. tracked_links: short links rastreaveis (rota /l/[code])
-- -------------------------------------------------------------
create table if not exists tracked_links (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  campaign_id    uuid references campaigns(id) on delete set null,
  recipient_id   uuid references campaign_recipients(id) on delete set null,
  customer_id    uuid references customers(id) on delete set null,
  short_code     text not null unique,
  target_url     text not null,
  source         text not null default 'manual'
                 check (source in ('manual','campaign','inbox','menu_share','automation','system')),
  label          text,
  clicks_count   int  not null default 0,
  unique_clicks  int  not null default 0,
  first_click_at timestamptz,
  last_click_at  timestamptz,
  expires_at     timestamptz,
  is_disabled    boolean not null default false,
  metadata       jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tracked_links_restaurant_idx on tracked_links(restaurant_id, created_at desc);
create index if not exists tracked_links_campaign_idx   on tracked_links(campaign_id)  where campaign_id is not null;
create index if not exists tracked_links_recipient_idx  on tracked_links(recipient_id) where recipient_id is not null;
create index if not exists tracked_links_customer_idx   on tracked_links(customer_id)  where customer_id is not null;
create index if not exists tracked_links_expires_idx    on tracked_links(expires_at)   where expires_at is not null;

create trigger trg_tracked_links_updated
  before update on tracked_links
  for each row execute function set_updated_at();

-- -------------------------------------------------------------
-- 3. link_clicks: clicks individuais dos short links
-- -------------------------------------------------------------
create table if not exists link_clicks (
  id              uuid primary key default gen_random_uuid(),
  tracked_link_id uuid not null references tracked_links(id) on delete cascade,
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  clicked_at      timestamptz not null default now(),
  ip_hash         text,
  user_agent      text,
  referrer        text,
  country         text,
  city            text,
  is_bot          boolean not null default false,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  device_type     text
);

create index if not exists link_clicks_tracked_link_idx on link_clicks(tracked_link_id, clicked_at desc);
create index if not exists link_clicks_restaurant_idx   on link_clicks(restaurant_id, clicked_at desc);
create index if not exists link_clicks_bot_filter_idx   on link_clicks(restaurant_id, clicked_at desc) where is_bot = false;

-- Agrega stats no tracked_link a cada click
CREATE OR REPLACE FUNCTION public.tracked_link_stats_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_first_click_for_ip boolean;
begin
  is_first_click_for_ip := false;
  if new.ip_hash is not null and new.is_bot = false then
    -- Conta como unique se NEW eh a row de menor id no grupo
    -- (tracked_link_id, ip_hash). Tie-break por uuid eh determinístico
    -- e funciona pra inserts unitarios e em batch.
    select not exists (
      select 1 from link_clicks
      where tracked_link_id = new.tracked_link_id
        and ip_hash = new.ip_hash
        and id < new.id
    ) into is_first_click_for_ip;
  end if;

  update tracked_links
  set
    clicks_count   = clicks_count + case when new.is_bot then 0 else 1 end,
    unique_clicks  = unique_clicks + case when is_first_click_for_ip then 1 else 0 end,
    first_click_at = coalesce(first_click_at, new.clicked_at),
    last_click_at  = greatest(coalesce(last_click_at, new.clicked_at), new.clicked_at),
    updated_at     = now()
  where id = new.tracked_link_id;

  return new;
end;
$function$;

-- Propaga click de link de campanha como campaign_event + read do recipient
CREATE OR REPLACE FUNCTION public.tracked_link_campaign_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_campaign_id uuid;
  v_recipient_id uuid;
begin
  if new.is_bot then
    return new;
  end if;

  select campaign_id, recipient_id
    into v_campaign_id, v_recipient_id
  from tracked_links
  where id = new.tracked_link_id;

  if v_campaign_id is not null then
    insert into campaign_events (campaign_id, recipient_id, event_type, data)
    values (
      v_campaign_id,
      v_recipient_id,
      'link_click',
      jsonb_build_object(
        'tracked_link_id', new.tracked_link_id,
        'click_id', new.id,
        'country', new.country,
        'device_type', new.device_type,
        'utm_campaign', new.utm_campaign
      )
    );

    -- Se for o primeiro click do recipient, atualiza recipient.read_at se ainda null
    -- (read implica click, mas nem todo canal envia read; click eh sinal forte)
    if v_recipient_id is not null then
      update campaign_recipients
      set
        read_at = coalesce(read_at, new.clicked_at),
        status  = case
                    when status in ('sent', 'delivered') then 'read'::recipient_status
                    else status
                  end
      where id = v_recipient_id;
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_link_clicks_stats
  after insert on link_clicks
  for each row execute function tracked_link_stats_apply();

create trigger trg_link_clicks_campaign_event
  after insert on link_clicks
  for each row execute function tracked_link_campaign_event();

-- -------------------------------------------------------------
-- 4. menu_sessions: tracking de sessao do cardapio publico
-- -------------------------------------------------------------
create table if not exists menu_sessions (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  client_session_id   uuid not null,
  recipient_id        uuid references campaign_recipients(id) on delete set null,
  campaign_id         uuid references campaigns(id) on delete set null,
  customer_id         uuid references customers(id) on delete set null,
  table_id            uuid references tables(id) on delete set null,
  source              text not null default 'direct'
                      check (source in ('direct','campaign','inbox','menu_share','qr_table','organic')),
  event_count         int not null default 0,
  pageview_count      int not null default 0,
  item_view_count     int not null default 0,
  add_to_cart_count   int not null default 0,
  cart_items_count    int not null default 0,
  cart_total_cents    int not null default 0,
  cart_snapshot       jsonb not null default '[]'::jsonb,
  started_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  checkout_started_at timestamptz,
  submitted_at        timestamptz,
  abandoned_at        timestamptz,
  alert_sent_at       timestamptz,
  order_id            uuid references orders(id) on delete set null,
  device_type         text,
  country             text,
  city                text,
  ip_hash             text,
  user_agent          text,
  referrer            text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,
  utm_term            text,
  metadata            jsonb not null default '{}'::jsonb,
  unique (restaurant_id, client_session_id)
);

create index if not exists menu_sessions_restaurant_idx on menu_sessions(restaurant_id, started_at desc);
create index if not exists menu_sessions_recipient_idx  on menu_sessions(recipient_id) where recipient_id is not null;
create index if not exists menu_sessions_customer_idx   on menu_sessions(customer_id)  where customer_id is not null;
create index if not exists menu_sessions_abandoned_idx  on menu_sessions(restaurant_id, last_seen_at)
  where abandoned_at is null and submitted_at is null and cart_items_count > 0;
create index if not exists menu_sessions_alert_pending_idx on menu_sessions(restaurant_id, abandoned_at)
  where abandoned_at is not null and alert_sent_at is null;

-- Marca sessoes com carrinho parado como abandonadas (chamada por cron)
CREATE OR REPLACE FUNCTION public.mark_abandoned_menu_sessions(p_restaurant_id uuid DEFAULT NULL::uuid, p_idle_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_marked int := 0;
begin
  update menu_sessions
  set abandoned_at = now()
  where abandoned_at is null
    and submitted_at is null
    and cart_items_count > 0
    and last_seen_at < now() - (p_idle_minutes || ' minutes')::interval
    and (p_restaurant_id is null or restaurant_id = p_restaurant_id);

  get diagnostics v_marked = row_count;
  return v_marked;
end;
$function$;

-- -------------------------------------------------------------
-- 5. orders: atribuicao a campanhas + vinculo com sessao de menu
-- -------------------------------------------------------------
alter table orders
  add column if not exists attributed_recipient_id uuid references campaign_recipients(id) on delete set null,
  add column if not exists attributed_at           timestamptz,
  add column if not exists menu_session_id         uuid references menu_sessions(id) on delete set null;

create index if not exists orders_attributed_recipient_idx on orders(attributed_recipient_id)
  where attributed_recipient_id is not null;
create index if not exists orders_menu_session_idx on orders(menu_session_id)
  where menu_session_id is not null;
create index if not exists orders_customer_status_idx on orders(customer_id, status, created_at desc)
  where customer_id is not null;

-- Atribui pedidos recentes ao envio de campanha mais recente dentro da janela
CREATE OR REPLACE FUNCTION public.attribute_orders_to_campaigns(p_restaurant_id uuid DEFAULT NULL::uuid, p_window_hours integer DEFAULT 168)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attributed int := 0;
begin
  with candidate_orders as (
    select o.id, o.customer_id, o.created_at
    from orders o
    where o.attributed_recipient_id is null
      and o.customer_id is not null
      and o.status not in ('cancelled')
      and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
      and o.created_at > now() - (p_window_hours || ' hours')::interval
  ),
  matched as (
    select distinct on (co.id)
      co.id as order_id,
      cr.id as recipient_id
    from candidate_orders co
    join campaign_recipients cr on cr.customer_id = co.customer_id
    where cr.sent_at is not null
      and cr.sent_at <= co.created_at
      and cr.sent_at > co.created_at - (p_window_hours || ' hours')::interval
    order by co.id, cr.sent_at desc  -- atribui ao envio mais recente dentro da janela
  )
  update orders o
  set
    attributed_recipient_id = m.recipient_id,
    attributed_at           = now()
  from matched m
  where o.id = m.order_id;

  get diagnostics v_attributed = row_count;
  return v_attributed;
end;
$function$;

-- -------------------------------------------------------------
-- 6. order_drafts: pedido em construcao via chat (bot do inbox)
-- -------------------------------------------------------------
create table if not exists order_drafts (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references restaurants(id) on delete cascade,
  conversation_id    uuid not null references conversations(id) on delete cascade,
  customer_id        uuid references customers(id) on delete set null,
  items              jsonb not null default '[]'::jsonb,
  delivery_type      text check (delivery_type in ('pickup','delivery','dine_in')),
  delivery_address   jsonb,
  payment_method     text check (payment_method in ('pix','cash','credit','debit')),
  notes              text,
  status             text not null default 'building'
                     check (status in ('building','confirmed','cancelled','expired')),
  confirmed_order_id uuid references orders(id) on delete set null,
  expires_at         timestamptz not null default now() + interval '24 hours',
  confirmed_at       timestamptz,
  cancelled_at       timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists order_drafts_one_active_per_conversation
  on order_drafts(conversation_id) where status = 'building';
create index if not exists order_drafts_restaurant_idx   on order_drafts(restaurant_id, status, created_at desc);
create index if not exists order_drafts_conversation_idx on order_drafts(conversation_id, status);
create index if not exists order_drafts_expires_idx      on order_drafts(expires_at) where status = 'building';

create trigger trg_order_drafts_updated
  before update on order_drafts
  for each row execute function set_updated_at();

-- Expira drafts em construcao ha mais de 24h (chamada por cron)
CREATE OR REPLACE FUNCTION public.expire_old_order_drafts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  update order_drafts
  set status = 'expired'
  where status = 'building'
    and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- -------------------------------------------------------------
-- 7. Agente admin via WhatsApp: config, usuarios, acoes, briefings
-- -------------------------------------------------------------
create table if not exists admin_agents (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null unique references restaurants(id) on delete cascade,
  enabled             boolean not null default false,
  persona             text default 'um co-piloto operacional eficiente e direto',
  tone                text default 'casual' check (tone in ('formal','casual','direto')),
  confirm_above_brl   int not null default 100,
  confirm_destructive boolean not null default true,
  briefing_enabled    boolean not null default true,
  briefing_hour       int not null default 8 check (briefing_hour >= 0 and briefing_hour <= 23),
  briefing_phone      text,
  alerts_enabled      boolean not null default true,
  max_actions_per_hour int not null default 50,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  briefing_format     text not null default 'text' check (briefing_format in ('text','audio','both')),
  briefing_voice      text not null default 'nova' check (briefing_voice in ('alloy','echo','fable','onyx','nova','shimmer'))
);

create trigger trg_admin_agents_updated
  before update on admin_agents
  for each row execute function set_updated_at();

create table if not exists admin_agent_users (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  phone          text not null,
  display_name   text not null,
  role           admin_agent_role not null default 'manager',
  user_id        uuid references auth.users(id) on delete set null,
  active         boolean not null default true,
  actions_count  int not null default 0,
  last_action_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint phone_format check (phone ~ '^\d{10,15}$'),
  unique (restaurant_id, phone)
);

create index if not exists admin_agent_users_restaurant_idx on admin_agent_users(restaurant_id);
create index if not exists admin_agent_users_phone_idx      on admin_agent_users(phone) where active = true;

create trigger trg_admin_agent_users_updated
  before update on admin_agent_users
  for each row execute function set_updated_at();

create table if not exists admin_agent_actions (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants(id) on delete cascade,
  admin_user_id        uuid references admin_agent_users(id) on delete set null,
  admin_phone          text not null,
  conversation_id      uuid references conversations(id) on delete set null,
  input_kind           text not null check (input_kind in ('text','audio','image','pdf','mixed')),
  input_excerpt        text,
  input_attachment_url text,
  tool_name            text not null,
  tool_input           jsonb not null default '{}'::jsonb,
  tool_result          jsonb,
  status               text not null
                       check (status in ('success','failed','confirmation_pending','rejected_by_user','denied_by_rbac')),
  error_message        text,
  iterations           int,
  tokens_in            int,
  tokens_out           int,
  cost_brl             numeric(10,4),
  duration_ms          int,
  created_at           timestamptz not null default now()
);

create index if not exists admin_agent_actions_restaurant_idx on admin_agent_actions(restaurant_id, created_at desc);
create index if not exists admin_agent_actions_phone_idx      on admin_agent_actions(admin_phone, created_at desc);
create index if not exists admin_agent_actions_status_idx     on admin_agent_actions(restaurant_id, status, created_at desc);
create index if not exists admin_agent_actions_tool_idx       on admin_agent_actions(restaurant_id, tool_name, created_at desc);

create table if not exists admin_agent_briefings (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  recipient_phone text not null,
  briefing_date   date not null,
  payload         jsonb not null default '{}'::jsonb,
  text_summary    text,
  audio_url       text,
  delivered_at    timestamptz,
  delivery_error  text,
  created_at      timestamptz not null default now(),
  unique (restaurant_id, recipient_phone, briefing_date)
);

create index if not exists admin_agent_briefings_restaurant_idx on admin_agent_briefings(restaurant_id, briefing_date desc);

-- Rate limit: acoes do admin numa janela (default 60min)
CREATE OR REPLACE FUNCTION public.count_admin_actions_in_window(p_admin_phone text, p_window_minutes integer DEFAULT 60)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int
  from admin_agent_actions
  where admin_phone = p_admin_phone
    and created_at >= now() - (p_window_minutes || ' minutes')::interval;
$function$;

CREATE OR REPLACE FUNCTION public.increment_admin_user_actions(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update admin_agent_users
  set actions_count = actions_count + 1,
      last_action_at = now()
  where id = p_user_id;
end;
$function$;

-- -------------------------------------------------------------
-- 8. reviews: resposta do restaurante (via dashboard ou agente)
-- -------------------------------------------------------------
alter table reviews
  add column if not exists reply    text,
  add column if not exists reply_at timestamptz,
  add column if not exists reply_by uuid references admin_agent_users(id) on delete set null;

create index if not exists reviews_pending_reply_idx on reviews(restaurant_id, created_at desc)
  where reply is null and rating <= 3;

-- -------------------------------------------------------------
-- 9. channels: saude da conexao + limite diario de envios
-- -------------------------------------------------------------
alter table channels
  add column if not exists health_status        text
                          check (health_status in ('unknown','connected','disconnected','degraded')),
  add column if not exists health_checked_at    timestamptz,
  add column if not exists health_detail        text,
  add column if not exists connected_phone      text,
  add column if not exists warmup_started_at    timestamptz,
  add column if not exists daily_limit_override int,
  add column if not exists daily_send_count     int  not null default 0,
  add column if not exists daily_send_date      date not null default current_date;

create index if not exists channels_health_idx on channels(restaurant_id, health_status, type);

-- Log de envios por canal (auditoria de rate limit; sem RLS — so service role)
create table if not exists channel_send_log (
  id            bigserial primary key,
  channel_id    uuid not null references channels(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  target_phone  text not null,
  kind          text not null check (kind in ('campaign','inbox','agent','automation','share')),
  sent_at       timestamptz not null default now()
);

create index if not exists channel_send_log_sent_at_idx on channel_send_log(sent_at);
create index if not exists channel_send_log_phone_idx   on channel_send_log(channel_id, target_phone, sent_at desc);

-- Incrementa contador diario do canal (reseta ao virar o dia)
CREATE OR REPLACE FUNCTION public.increment_channel_send_count(p_channel_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  update channels
  set
    daily_send_count = case
      when daily_send_date <> current_date then 1
      else daily_send_count + 1
    end,
    daily_send_date = current_date
  where id = p_channel_id
  returning daily_send_count into v_count;

  return coalesce(v_count, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.purge_old_channel_send_logs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  delete from channel_send_log where sent_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- -------------------------------------------------------------
-- 10. notifications: severidade
-- -------------------------------------------------------------
alter table notifications
  add column if not exists severity text not null default 'info'
                          check (severity in ('info','success','warning','critical'));

create index if not exists notifications_severity_idx on notifications(restaurant_id, severity, created_at desc)
  where read_at is null;

-- -------------------------------------------------------------
-- 11. Views de analytics (definicoes exatas de prod)
-- -------------------------------------------------------------
create or replace view campaign_revenue as
 SELECT c.id AS campaign_id,
    c.restaurant_id,
    c.name,
    c.channel,
    c.status,
    count(DISTINCT cr.id) AS recipients_total,
    count(DISTINCT cr.id) FILTER (WHERE cr.sent_at IS NOT NULL) AS recipients_sent,
    count(DISTINCT cr.id) FILTER (WHERE cr.delivered_at IS NOT NULL) AS recipients_delivered,
    count(DISTINCT cr.id) FILTER (WHERE cr.read_at IS NOT NULL) AS recipients_read,
    count(DISTINCT tl.id) AS tracked_links_count,
    COALESCE(sum(tl.clicks_count), 0::bigint) AS total_clicks,
    COALESCE(sum(tl.unique_clicks), 0::bigint) AS unique_clicks,
    count(DISTINCT o.id) AS orders_attributed,
    COALESCE(sum(o.total) FILTER (WHERE o.status <> 'cancelled'::order_status), 0::numeric) AS revenue_attributed
   FROM campaigns c
     LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id
     LEFT JOIN tracked_links tl ON tl.campaign_id = c.id
     LEFT JOIN orders o ON o.attributed_recipient_id = cr.id
  GROUP BY c.id, c.restaurant_id, c.name, c.channel, c.status;

create or replace view customer_metrics as
 SELECT c.id AS customer_id,
    c.restaurant_id,
    c.churn_risk,
    c.engagement_score,
    c.optimal_send_hour,
    count(o.*) FILTER (WHERE o.status <> 'cancelled'::order_status) AS total_orders,
    COALESCE(sum(o.total) FILTER (WHERE o.status <> 'cancelled'::order_status), 0::numeric) AS total_spent,
    max(o.created_at) FILTER (WHERE o.status <> 'cancelled'::order_status) AS last_visit_at,
    max(o.created_at) FILTER (WHERE o.status = ANY (ARRAY['closed'::order_status, 'delivered'::order_status])) AS last_completed_at
   FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id
  GROUP BY c.id;

create or replace view menu_funnel as
 SELECT restaurant_id,
    date_trunc('day'::text, started_at) AS day,
    source,
    count(*) AS sessions,
    count(*) FILTER (WHERE pageview_count > 0) AS with_pageview,
    count(*) FILTER (WHERE add_to_cart_count > 0) AS with_cart,
    count(*) FILTER (WHERE checkout_started_at IS NOT NULL) AS with_checkout,
    count(*) FILTER (WHERE submitted_at IS NOT NULL) AS with_submit,
    count(*) FILTER (WHERE abandoned_at IS NOT NULL) AS abandoned,
    COALESCE(sum(
        CASE
            WHEN submitted_at IS NOT NULL THEN cart_total_cents
            ELSE NULL::integer
        END), 0::bigint) AS revenue_cents
   FROM menu_sessions ms
  GROUP BY restaurant_id, (date_trunc('day'::text, started_at)), source;

-- -------------------------------------------------------------
-- 12. RLS + policies (channel_send_log fica SEM rls — so service role)
-- -------------------------------------------------------------
alter table tracked_links         enable row level security;
alter table link_clicks           enable row level security;
alter table menu_sessions         enable row level security;
alter table order_drafts          enable row level security;
alter table admin_agents          enable row level security;
alter table admin_agent_users     enable row level security;
alter table admin_agent_actions   enable row level security;
alter table admin_agent_briefings enable row level security;

drop policy if exists "tenant read tracked_links" on tracked_links;
create policy "tenant read tracked_links" on tracked_links
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant write tracked_links" on tracked_links;
create policy "tenant write tracked_links" on tracked_links
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

drop policy if exists "tenant read link_clicks" on link_clicks;
create policy "tenant read link_clicks" on link_clicks
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant read menu_sessions" on menu_sessions;
create policy "tenant read menu_sessions" on menu_sessions
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant read order_drafts" on order_drafts;
create policy "tenant read order_drafts" on order_drafts
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant read admin_agents" on admin_agents;
create policy "tenant read admin_agents" on admin_agents
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant write admin_agents" on admin_agents;
create policy "tenant write admin_agents" on admin_agents
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

drop policy if exists "tenant read admin_agent_users" on admin_agent_users;
create policy "tenant read admin_agent_users" on admin_agent_users
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant write admin_agent_users" on admin_agent_users;
create policy "tenant write admin_agent_users" on admin_agent_users
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

drop policy if exists "tenant read admin_agent_actions" on admin_agent_actions;
create policy "tenant read admin_agent_actions" on admin_agent_actions
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

drop policy if exists "tenant read admin_agent_briefings" on admin_agent_briefings;
create policy "tenant read admin_agent_briefings" on admin_agent_briefings
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

-- -------------------------------------------------------------
-- 13. Realtime
-- -------------------------------------------------------------
alter publication supabase_realtime add table tracked_links;
alter publication supabase_realtime add table link_clicks;
alter publication supabase_realtime add table menu_sessions;
alter publication supabase_realtime add table order_drafts;
alter publication supabase_realtime add table admin_agent_users;
alter publication supabase_realtime add table admin_agent_actions;

-- -------------------------------------------------------------
-- 14. Storage: buckets inbox-media e admin-briefings
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inbox-media',
  'inbox-media',
  true,
  26214400, -- 25MB
  null
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-briefings',
  'admin-briefings',
  true,
  5242880, -- 5MB
  array['audio/mpeg','audio/mp3','audio/ogg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read inbox media" on storage.objects;
create policy "public read inbox media"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'inbox-media');

drop policy if exists "staff upload inbox media" on storage.objects;
create policy "staff upload inbox media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inbox-media'
    and exists (
      select 1 from restaurant_members
      where user_id = auth.uid()
        and role in ('owner','manager','waiter','cashier')
    )
  );

drop policy if exists "staff delete inbox media" on storage.objects;
create policy "staff delete inbox media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inbox-media'
    and exists (
      select 1 from restaurant_members
      where user_id = auth.uid()
        and role in ('owner','manager')
    )
  );

drop policy if exists "admin_briefings_public_read" on storage.objects;
create policy "admin_briefings_public_read"
  on storage.objects for select
  using (bucket_id = 'admin-briefings');

drop policy if exists "admin_briefings_service_write" on storage.objects;
create policy "admin_briefings_service_write"
  on storage.objects for insert to service_role
  with check (bucket_id = 'admin-briefings');
