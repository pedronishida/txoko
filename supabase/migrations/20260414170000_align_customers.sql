-- =============================================================
-- Txoko — Alinhar `customers` aos types compartilhados
-- =============================================================

-- cpf -> document (nome generico, aceita CPF/CNPJ/passaporte)
alter table customers rename column cpf to document;

alter table customers
  add column if not exists address jsonb,
  add column if not exists notes   text;

create index if not exists customers_name_idx on customers(restaurant_id, name);
