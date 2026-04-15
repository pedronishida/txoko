-- =============================================================
-- Txoko — Seed: restaurante demo
-- Membership sera criada apos primeiro signup (use o dashboard
-- Supabase ou supabase/scripts/link-user.sql).
-- =============================================================

insert into restaurants (id, slug, name, legal_name, phone, email, settings, active)
values (
  '00000000-0000-0000-0000-000000000001',
  'txoko-demo',
  'Txoko Demo',
  'Txoko Restaurantes LTDA',
  '+5511999999999',
  'demo@txoko.com.br',
  '{"currency":"BRL","locale":"pt-BR","timezone":"America/Sao_Paulo"}'::jsonb,
  true
)
on conflict (id) do nothing;

-- Categorias
insert into categories (restaurant_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000001','Entradas',1),
  ('00000000-0000-0000-0000-000000000001','Pratos Principais',2),
  ('00000000-0000-0000-0000-000000000001','Sobremesas',3),
  ('00000000-0000-0000-0000-000000000001','Bebidas',4);

-- Produtos
with cats as (
  select id, name from categories
  where restaurant_id = '00000000-0000-0000-0000-000000000001'
)
insert into products (restaurant_id, category_id, name, description, price)
select
  '00000000-0000-0000-0000-000000000001',
  c.id, p.name, p.description, p.price
from (values
  ('Entradas','Bolinho de Bacalhau','8 unidades artesanais',38.00),
  ('Entradas','Pao de Alho','com manteiga de ervas',18.00),
  ('Entradas','Ceviche','peixe branco, leite de tigre',46.00),
  ('Pratos Principais','Picanha na Brasa','400g com acompanhamentos',89.00),
  ('Pratos Principais','Risoto de Camarao','camaroes VG',72.00),
  ('Pratos Principais','Bacalhau a Braz','tradicional portugues',95.00),
  ('Sobremesas','Pudim da Casa','receita tradicional',22.00),
  ('Sobremesas','Petit Gateau','com sorvete de creme',28.00),
  ('Bebidas','Caipirinha','limao, cachaca premium',28.00),
  ('Bebidas','Suco Natural','variados',12.00),
  ('Bebidas','Agua Mineral','500ml',6.00)
) as p(cat_name, name, description, price)
join cats c on c.name = p.cat_name;

-- Mesas (10)
insert into tables (restaurant_id, number, seats)
select '00000000-0000-0000-0000-000000000001', n, 4
from generate_series(1, 10) n;

-- Cliente demo
insert into customers (restaurant_id, name, phone, email)
values ('00000000-0000-0000-0000-000000000001','Cliente Demo','+5511988887777','cliente@demo.com');
