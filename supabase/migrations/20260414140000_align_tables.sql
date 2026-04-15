-- =============================================================
-- Txoko — Alinhar tabela `tables` aos types compartilhados
-- =============================================================

-- Renomear enum value: free -> available
alter type table_status rename value 'free' to 'available';

-- Renomear coluna seats -> capacity
alter table tables rename column seats to capacity;

-- Mudar default do status para 'available'
alter table tables alter column status set default 'available';

-- Colunas adicionais
alter table tables
  add column if not exists area        text not null default 'main',
  add column if not exists position_x  int,
  add column if not exists position_y  int,
  add column if not exists occupied_at timestamptz,
  add column if not exists current_order_id uuid references orders(id) on delete set null;

create index if not exists tables_current_order_idx on tables(current_order_id);
