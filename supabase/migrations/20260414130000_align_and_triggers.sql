-- =============================================================
-- Txoko — Alinhar schema aos types compartilhados + triggers
-- =============================================================

-- -------------------------------------------------------------
-- Renomear colunas para padronizar em is_active
-- -------------------------------------------------------------
alter table restaurants rename column active to is_active;
alter table categories  rename column active to is_active;
alter table products    rename column available to is_active;

-- -------------------------------------------------------------
-- Produtos: colunas adicionais (matching packages/shared types)
-- -------------------------------------------------------------
alter table products
  add column if not exists prep_time_minutes int,
  add column if not exists allergens text[] not null default '{}',
  add column if not exists tags      text[] not null default '{}',
  add column if not exists sort_order int   not null default 0;

-- -------------------------------------------------------------
-- Auto-link: novo usuario vira owner do restaurante demo
-- (apenas dev; substituir por onboarding real em producao)
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into restaurant_members (restaurant_id, user_id, role)
  values (demo_id, new.id, 'owner')
  on conflict (restaurant_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
