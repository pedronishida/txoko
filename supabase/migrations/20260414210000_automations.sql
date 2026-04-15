-- =============================================================
-- Txoko — Automacoes (catalogo + logs + triggers reais)
-- =============================================================

create table automations (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  code             text not null,
  trigger          text not null,
  action           text not null,
  area             text not null,
  enabled          boolean not null default true,
  executions_today int not null default 0,
  last_run_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (restaurant_id, code)
);
create index on automations(restaurant_id);

create table automation_logs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  trigger_desc  text not null,
  action_desc   text not null,
  status        text not null default 'success' check (status in ('success','error')),
  error_message text,
  executed_at   timestamptz not null default now()
);
create index on automation_logs(restaurant_id, executed_at desc);
create index on automation_logs(automation_id);

alter table automations     enable row level security;
alter table automation_logs enable row level security;

create policy "tenant read automations" on automations
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));
create policy "tenant write automations" on automations
  for all to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]))
  with check (auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[]));

create policy "tenant read automation_logs" on automation_logs
  for select to authenticated
  using (restaurant_id = any(auth_restaurant_ids()));

alter publication supabase_realtime add table automations;
alter publication supabase_realtime add table automation_logs;

-- =============================================================
-- Helper: registra execucao de automacao (idempotent para enabled=false)
-- =============================================================
create or replace function public.log_automation(
  p_restaurant_id uuid,
  p_code text,
  p_trigger text,
  p_action text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto_id uuid;
  v_enabled boolean;
  v_last_date date;
begin
  select id, enabled, last_run_at::date
    into v_auto_id, v_enabled, v_last_date
  from automations
  where restaurant_id = p_restaurant_id and code = p_code;

  if v_auto_id is null or not v_enabled then
    return;
  end if;

  insert into automation_logs (restaurant_id, automation_id, trigger_desc, action_desc, status)
  values (p_restaurant_id, v_auto_id, p_trigger, p_action, 'success');

  update automations set
    last_run_at = now(),
    executions_today =
      case when v_last_date = current_date then executions_today + 1 else 1 end
  where id = v_auto_id;
end; $$;

-- =============================================================
-- TRIGGER 1: stock_low — insumo cai abaixo do minimo
-- =============================================================
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
  end if;
  return NEW;
end; $$;

drop trigger if exists auto_stock_low on ingredients;
create trigger auto_stock_low
  after update on ingredients
  for each row execute function auto_trigger_stock_low();

-- =============================================================
-- TRIGGER 2: sale_finalized — pedido fechado
-- =============================================================
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
  end if;
  return NEW;
end; $$;

drop trigger if exists auto_sale_finalized on orders;
create trigger auto_sale_finalized
  after update of status on orders
  for each row execute function auto_trigger_sale_finalized();

-- =============================================================
-- TRIGGER 3: negative_review — review com sentimento negativo
-- =============================================================
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
  end if;
  return NEW;
end; $$;

drop trigger if exists auto_negative_review on reviews;
create trigger auto_negative_review
  after insert on reviews
  for each row execute function auto_trigger_negative_review();

-- =============================================================
-- Seed: catalogo de 20 automacoes no restaurante demo
-- =============================================================
insert into automations (restaurant_id, code, trigger, action, area, enabled) values
  ('00000000-0000-0000-0000-000000000001','stock_low','Estoque atinge nivel minimo','Gera ordem de compra e notifica gestor','estoque',true),
  ('00000000-0000-0000-0000-000000000001','delivery_received','Pedido delivery recebido','Envia para KDS + atualiza tempo + notifica cliente','operacao',true),
  ('00000000-0000-0000-0000-000000000001','sale_finalized','Venda finalizada','Baixa estoque + registra financeiro + emite NFC-e','fiscal',true),
  ('00000000-0000-0000-0000-000000000001','churn_30d','Cliente 30 dias sem voltar','Envia cupom de desconto via WhatsApp','marketing',true),
  ('00000000-0000-0000-0000-000000000001','birthday','Aniversario do cliente','Envia mensagem personalizada + cupom especial','marketing',true),
  ('00000000-0000-0000-0000-000000000001','negative_review','Avaliacao negativa recebida','Alerta gestor + sugere acao de recuperacao','crm',true),
  ('00000000-0000-0000-0000-000000000001','day_close','Fechamento do dia','Gera relatorio completo + envia por email ao dono','financeiro',true),
  ('00000000-0000-0000-0000-000000000001','ifood_new','Novo pedido no iFood','Aceita automaticamente + imprime na cozinha','operacao',true),
  ('00000000-0000-0000-0000-000000000001','recipe_updated','Ficha tecnica atualizada','Recalcula preco de venda sugerido','estoque',false),
  ('00000000-0000-0000-0000-000000000001','punch_clock','Funcionario bate ponto','Registra presenca + calcula horas extras','rh',false),
  ('00000000-0000-0000-0000-000000000001','table_idle','Mesa parada 15min sem pedido','Alerta garcom responsavel','operacao',true),
  ('00000000-0000-0000-0000-000000000001','kitchen_late','Pedido atrasado na cozinha','Alerta KDS com destaque visual e sonoro','operacao',true),
  ('00000000-0000-0000-0000-000000000001','low_nps','Conta fechada com NPS < 7','Registra no CRM + agenda follow-up','crm',true),
  ('00000000-0000-0000-0000-000000000001','supplier_cheaper','Fornecedor com nota mais barata','Sugere troca de fornecedor para o insumo','estoque',false),
  ('00000000-0000-0000-0000-000000000001','promo_scheduled','Promocao agendada ativa','Atualiza precos no cardapio digital e iFood','operacao',true),
  ('00000000-0000-0000-0000-000000000001','month_end','Final do mes','Gera pacote XML + envia para contabilidade','fiscal',true),
  ('00000000-0000-0000-0000-000000000001','vip_identified','Cliente VIP identificado','Notifica garcom com preferencias e historico','crm',true),
  ('00000000-0000-0000-0000-000000000001','new_customer','Novo cadastro de cliente','Envia boas-vindas + cupom de primeira compra','marketing',true),
  ('00000000-0000-0000-0000-000000000001','cash_adjust','Sangria/suprimento registrado','Exige justificativa + registra no audit log','financeiro',true),
  ('00000000-0000-0000-0000-000000000001','out_of_stock','Item em falta no estoque','Bloqueia item no cardapio digital','estoque',true)
on conflict (restaurant_id, code) do nothing;
