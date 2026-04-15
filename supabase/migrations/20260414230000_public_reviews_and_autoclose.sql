-- =============================================================
-- Txoko — Avaliacao publica + Auto-close de pedidos nao-dine_in
-- =============================================================

-- -------------------------------------------------------------
-- RLS: permitir insert anon em reviews com source='qrcode'
-- (somente para restaurantes ativos)
-- -------------------------------------------------------------
create policy "public create qrcode review" on reviews
  for insert to anon
  with check (
    source = 'qrcode'
    and rating between 1 and 5
    and exists (
      select 1 from restaurants r
      where r.id = reviews.restaurant_id and r.is_active = true
    )
  );

-- -------------------------------------------------------------
-- Trigger: auto-close de pedidos nao-dine_in ja pagos
-- Quando um pedido (type != 'dine_in') chega em 'delivered' e
-- ja tem payment aprovado, fecha automaticamente.
-- Isso libera o garcom/caixa do trabalho manual em delivery/balcao.
-- -------------------------------------------------------------
create or replace function public.auto_close_paid_non_dine_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_payment boolean;
begin
  if NEW.status = 'delivered'
     and OLD.status is distinct from 'delivered'
     and NEW.type <> 'dine_in' then
    select exists (
      select 1 from payments
      where order_id = NEW.id and status = 'approved'
    ) into v_has_payment;

    if v_has_payment then
      update orders
        set status = 'closed', closed_at = now()
        where id = NEW.id;
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists on_order_delivered_autoclose on orders;
create trigger on_order_delivered_autoclose
  after update of status on orders
  for each row execute function auto_close_paid_non_dine_in();
