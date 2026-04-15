-- =============================================================
-- Txoko — Station routing (KDS) + Onboarding real por signup
-- =============================================================

-- -------------------------------------------------------------
-- 1. Station routing: campo em categories
-- -------------------------------------------------------------
alter table categories
  add column if not exists station text not null default 'kitchen'
  check (station in ('kitchen','bar','dessert'));

-- Atualiza categorias do demo com estacoes corretas
update categories set station = 'kitchen'
  where restaurant_id = '00000000-0000-0000-0000-000000000001'
    and name in ('Entradas','Pratos Principais');
update categories set station = 'dessert'
  where restaurant_id = '00000000-0000-0000-0000-000000000001'
    and name = 'Sobremesas';
update categories set station = 'bar'
  where restaurant_id = '00000000-0000-0000-0000-000000000001'
    and name = 'Bebidas';

-- -------------------------------------------------------------
-- 2. Onboarding: novos signups ganham restaurante proprio + seed
--    (substitui a versao anterior que linkava todos ao demo)
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_base_slug text;
  v_slug text;
  v_counter int := 0;
  v_name text;
begin
  -- Se o usuario ja tem algum membership (migracao manual, seed, etc), nao faz nada
  if exists (select 1 from restaurant_members where user_id = new.id) then
    return new;
  end if;

  -- Gera slug e nome a partir do email
  v_base_slug := lower(regexp_replace(split_part(coalesce(new.email, 'restaurante'), '@', 1), '[^a-z0-9]', '', 'gi'));
  if length(v_base_slug) = 0 then
    v_base_slug := 'restaurante';
  end if;
  v_slug := v_base_slug;
  v_name := initcap(v_base_slug);

  -- Garante slug unico
  while exists (select 1 from restaurants where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  end loop;

  -- Cria restaurant com settings default
  insert into restaurants (slug, name, email, settings, is_active)
  values (
    v_slug,
    v_name,
    new.email,
    jsonb_build_object(
      'currency','BRL',
      'locale','pt-BR',
      'timezone','America/Sao_Paulo',
      'service_rate',10,
      'loyalty_points_per',10,
      'open_time','11:30',
      'close_time','23:00'
    ),
    true
  )
  returning id into v_restaurant_id;

  -- Owner
  insert into restaurant_members (restaurant_id, user_id, role)
  values (v_restaurant_id, new.id, 'owner');

  -- Seed de categorias com station
  insert into categories (restaurant_id, name, sort_order, station) values
    (v_restaurant_id, 'Entradas', 1, 'kitchen'),
    (v_restaurant_id, 'Pratos Principais', 2, 'kitchen'),
    (v_restaurant_id, 'Sobremesas', 3, 'dessert'),
    (v_restaurant_id, 'Bebidas', 4, 'bar');

  -- Seed de 5 mesas (nao 10 — novo restaurante comeca menor)
  insert into tables (restaurant_id, number, capacity)
  select v_restaurant_id, n, 4 from generate_series(1, 5) n;

  -- Catalogo completo de automacoes (as 3 LIVE e as outras ficam enabled=true como mock)
  insert into automations (restaurant_id, code, trigger, action, area, enabled) values
    (v_restaurant_id,'stock_low','Estoque atinge nivel minimo','Gera ordem de compra e notifica gestor','estoque',true),
    (v_restaurant_id,'delivery_received','Pedido delivery recebido','Envia para KDS + atualiza tempo + notifica cliente','operacao',true),
    (v_restaurant_id,'sale_finalized','Venda finalizada','Baixa estoque + registra financeiro + emite NFC-e','fiscal',true),
    (v_restaurant_id,'churn_30d','Cliente 30 dias sem voltar','Envia cupom de desconto via WhatsApp','marketing',true),
    (v_restaurant_id,'birthday','Aniversario do cliente','Envia mensagem personalizada + cupom especial','marketing',true),
    (v_restaurant_id,'negative_review','Avaliacao negativa recebida','Alerta gestor + sugere acao de recuperacao','crm',true),
    (v_restaurant_id,'day_close','Fechamento do dia','Gera relatorio completo + envia por email ao dono','financeiro',true),
    (v_restaurant_id,'table_idle','Mesa parada 15min sem pedido','Alerta garcom responsavel','operacao',true),
    (v_restaurant_id,'kitchen_late','Pedido atrasado na cozinha','Alerta KDS com destaque visual e sonoro','operacao',true),
    (v_restaurant_id,'low_nps','Conta fechada com NPS < 7','Registra no CRM + agenda follow-up','crm',true),
    (v_restaurant_id,'new_customer','Novo cadastro de cliente','Envia boas-vindas + cupom de primeira compra','marketing',true),
    (v_restaurant_id,'out_of_stock','Item em falta no estoque','Bloqueia item no cardapio digital','estoque',true);

  return new;
end; $$;
