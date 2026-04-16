-- =============================================================
-- Txoko — Customer Scoring + Predictive Send Time
-- =============================================================
-- Adiciona campos de engagement score, churn risk e
-- optimal send time no customers pra marketing inteligente.
-- =============================================================

-- Engagement score (0-100): baseado em opens, delivery, campaigns
alter table customers add column if not exists engagement_score int not null default 0;
alter table customers add column if not exists engagement_updated_at timestamptz;

-- Churn risk (0-100): probabilidade de nao voltar
alter table customers add column if not exists churn_risk int not null default 0;
alter table customers add column if not exists churn_updated_at timestamptz;

-- Optimal send hour (0-23): hora que o cliente mais le mensagens
alter table customers add column if not exists optimal_send_hour int;
alter table customers add column if not exists optimal_send_updated_at timestamptz;

-- Spending trend: variacao de gasto nos ultimos 3 meses
alter table customers add column if not exists spending_trend numeric(5,2) default 0;

-- Indexes pra queries de segmentacao rapida
create index if not exists idx_customers_engagement on customers(restaurant_id, engagement_score desc);
create index if not exists idx_customers_churn on customers(restaurant_id, churn_risk desc);
create index if not exists idx_customers_optimal_hour on customers(restaurant_id, optimal_send_hour) where optimal_send_hour is not null;
