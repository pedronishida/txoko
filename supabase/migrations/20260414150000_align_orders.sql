-- =============================================================
-- Txoko — Alinhar orders/order_items aos types compartilhados
-- =============================================================

-- -------------------------------------------------------------
-- order_type: adicionar 'counter'
-- -------------------------------------------------------------
alter type order_type add value if not exists 'counter';

-- -------------------------------------------------------------
-- order_status: recriar com valores do @txoko/shared
--   open | preparing | ready | delivered | closed | cancelled
-- -------------------------------------------------------------
alter table orders alter column status drop default;
alter table orders alter column status type text;
drop type order_status;
create type order_status as enum (
  'open','preparing','ready','delivered','closed','cancelled'
);
alter table orders alter column status type order_status
  using (
    case status
      when 'draft'      then 'open'
      when 'in_kitchen' then 'preparing'
      when 'served'     then 'delivered'
      when 'paid'       then 'closed'
      else status
    end
  )::order_status;
alter table orders alter column status set default 'open'::order_status;

-- -------------------------------------------------------------
-- orders: colunas adicionais
-- -------------------------------------------------------------
alter table orders
  add column if not exists delivery_fee     numeric(10,2) not null default 0,
  add column if not exists source           text not null default 'pos',
  add column if not exists external_id      text,
  add column if not exists delivery_address jsonb,
  add column if not exists estimated_time   int;

-- -------------------------------------------------------------
-- order_items: alinhar colunas
-- -------------------------------------------------------------
alter table order_items rename column total to total_price;
alter table order_items
  add column if not exists addons             jsonb not null default '[]'::jsonb,
  add column if not exists sent_to_kitchen_at timestamptz,
  add column if not exists ready_at           timestamptz;
