-- =============================================================
-- Txoko — Notificacoes do dashboard
-- =============================================================

create type notification_type as enum (
  'stock_low',
  'negative_review',
  'sale_finalized',
  'new_order',
  'system'
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  type          notification_type not null,
  title         text not null,
  body          text,
  href          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index on notifications(restaurant_id, created_at desc);
create index on notifications(restaurant_id) where read_at is null;

alter table notifications enable row level security;

create policy "tenant read notifications" on notifications
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant update notifications" on notifications
  for update to authenticated
  using (restaurant_id = any(auth_restaurant_ids()))
  with check (restaurant_id = any(auth_restaurant_ids()));

create policy "tenant delete notifications" on notifications
  for delete to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

alter publication supabase_realtime add table notifications;

-- =============================================================
-- Atualiza triggers existentes pra criar notificacoes
-- =============================================================

-- Stock low
create or replace function public.auto_trigger_stock_low()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.current_stock <= NEW.min_stock
     and OLD.current_stock > OLD.min_stock then
    perform log_automation(
      NEW.restaurant_id,
      'stock_low',
      format('Insumo %s abaixo do minimo (%s/%s %s)',
             NEW.name, NEW.current_stock, NEW.min_stock, NEW.unit),
      'Alerta gerado para o gestor'
    );
    insert into notifications (restaurant_id, type, title, body, href)
    values (
      NEW.restaurant_id,
      'stock_low',
      'Estoque critico',
      format('%s caiu abaixo do minimo (%s %s)',
             NEW.name, NEW.current_stock, NEW.unit),
      '/dashboard/estoque'
    );
  end if;
  return NEW;
end; $$;

-- Sale finalized
create or replace function public.auto_trigger_sale_finalized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'closed' and OLD.status is distinct from 'closed' then
    perform log_automation(
      NEW.restaurant_id,
      'sale_finalized',
      format('Pedido #%s fechado', substring(NEW.id::text from 1 for 6)),
      format('Estoque baixado + registrado em caixa (R$ %s)', NEW.total::text)
    );
    insert into notifications (restaurant_id, type, title, body, href)
    values (
      NEW.restaurant_id,
      'sale_finalized',
      'Venda finalizada',
      format('Pedido #%s fechado — R$ %s',
             substring(NEW.id::text from 1 for 6), NEW.total::text),
      '/dashboard/pedidos'
    );
  end if;
  return NEW;
end; $$;

-- Negative review
create or replace function public.auto_trigger_negative_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.sentiment = 'negative' then
    perform log_automation(
      NEW.restaurant_id,
      'negative_review',
      format('Avaliacao %s/5 com sentimento negativo', NEW.rating),
      'Gestor alertado para acao de recuperacao'
    );
    insert into notifications (restaurant_id, type, title, body, href)
    values (
      NEW.restaurant_id,
      'negative_review',
      'Avaliacao negativa',
      format('Cliente deu %s/5 estrelas. Acao de recuperacao sugerida.',
             NEW.rating),
      '/dashboard/avaliacoes'
    );
  end if;
  return NEW;
end; $$;

-- New order (novo trigger — quando PDV cria um pedido)
create or replace function public.auto_trigger_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (restaurant_id, type, title, body, href)
  values (
    NEW.restaurant_id,
    'new_order',
    'Novo pedido',
    format('Pedido #%s — R$ %s',
           substring(NEW.id::text from 1 for 6), NEW.total::text),
    '/dashboard/pedidos'
  );
  return NEW;
end; $$;

drop trigger if exists on_new_order_notify on orders;
create trigger on_new_order_notify
  after insert on orders
  for each row execute function auto_trigger_new_order();
