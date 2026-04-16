-- =============================================
-- Z-API Test Suite — Tables for tracking runs, results and webhook events
-- =============================================

-- Test runs — each invocation of the suite
create table if not exists test_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  branch          text,
  commit_sha      text,
  env             text not null default 'staging',      -- 'staging' | 'production'
  total_cases     int not null default 0,
  passed          int not null default 0,
  failed          int not null default 0,
  skipped         int not null default 0,
  config          jsonb not null default '{}'::jsonb,
  notes           text
);

create index on test_runs(started_at desc);

-- Individual test results
create table if not exists test_results (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references test_runs(id) on delete cascade,
  test_id         text not null,                         -- e.g. "media.image.001"
  category        text not null,                         -- 'media' | 'buttons' | 'carousel' | ...
  endpoint        text not null,                         -- Z-API endpoint path tested
  variation_seed  text,                                  -- identifies specific variation within a category
  -- Outcome per layer
  api_status      text,                                  -- 'pass' | 'fail' | 'skip'
  api_message_id  text,
  api_zaap_id     text,
  api_latency_ms  int,
  api_error       text,
  webhook_status  text,                                  -- 'pass' | 'fail' | 'skip'
  webhook_event_types text[] not null default '{}',      -- on-message-send, on-message-status
  webhook_latency_ms int,
  webhook_error   text,
  render_status   text,                                  -- 'pass' | 'fail' | 'skip'
  render_assertions_passed int not null default 0,
  render_assertions_total  int not null default 0,
  render_error    text,
  -- Aggregate
  final_status    text not null,                         -- 'pass' | 'fail' | 'skipped_by_platform' | 'error'
  error_category  text,                                  -- 'API_ERROR' | 'WEBHOOK_TIMEOUT' | 'RENDER_ERROR' | ...
  screenshot_path text,
  payload         jsonb,                                 -- request payload for reproduction
  response        jsonb,                                 -- api response
  created_at      timestamptz not null default now()
);

create index on test_results(run_id, category);
create index on test_results(run_id, final_status);
create index on test_results(test_id, created_at desc);

-- Raw Z-API webhook events (for matching + auditing)
create table if not exists zapi_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid references test_runs(id) on delete set null,
  test_id         text,                                  -- from x-test-id header if present
  event_type      text not null,                         -- on-message-send | on-message-received | on-message-status | on-message-delete | on-presence-chat
  message_id      text,
  from_me         boolean,
  phone           text,
  status          text,                                  -- SENT | RECEIVED | READ | PLAYED
  payload         jsonb not null,
  received_at     timestamptz not null default now()
);

create index on zapi_webhook_events(run_id, event_type);
create index on zapi_webhook_events(message_id);
create index on zapi_webhook_events(test_id) where test_id is not null;
create index on zapi_webhook_events(received_at desc);

-- RLS: permissive for service_role, blocked for anon
alter table test_runs enable row level security;
alter table test_results enable row level security;
alter table zapi_webhook_events enable row level security;

-- No policies = service role only (default)
