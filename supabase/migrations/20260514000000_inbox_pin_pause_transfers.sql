-- =============================================================
-- Txoko — Inbox: fixar conversa, modos de pausa da IA e transferencias
-- =============================================================
-- Schema que FALTA em producao. O deploy de 13/05/2026 subiu codigo
-- que referencia estes objetos, mas as migrations nunca foram
-- aplicadas — hoje em prod as tres features falham em runtime:
--   - toggleConversationPin        -> conversations.is_pinned
--   - setConversationAiPauseMode   -> conversations.ai_pause_mode / ai_paused_until
--   - transferConversation         -> tabela conversation_transfers
--     respondConversationTransfer
--
-- Ao contrario da 20260513000000 (que apenas registra o que ja existe
-- em prod), esta migration PRECISA ser aplicada em producao para as
-- features funcionarem.
--
-- Formato derivado do codigo compilado de producao (nomes de coluna,
-- valores de status e de modo, nome do constraint de FK).
-- =============================================================

-- -------------------------------------------------------------
-- CONVERSATIONS — pin + pausa da IA com expiracao
-- -------------------------------------------------------------
-- ai_paused (bool) ja existe. As colunas abaixo dao granularidade:
-- quem pausou e ate quando. Modos usados pelo app:
--   'default'    -> pausa curta (30 min)   [Date.now() + 18e5]
--   'manual'     -> pausa longa (60 min)   [Date.now() + 36e5]
--   'indefinite' -> pausa sem expiracao
--   'ended'      -> encerrada pelo atendente (sem expiracao)
--   null         -> IA ativa (ai_paused = false)
alter table conversations
  add column if not exists is_pinned       boolean not null default false,
  add column if not exists ai_pause_mode   text,
  add column if not exists ai_paused_until timestamptz;

alter table conversations
  drop constraint if exists conversations_ai_pause_mode_check;
alter table conversations
  add constraint conversations_ai_pause_mode_check
  check (ai_pause_mode is null or ai_pause_mode in ('default', 'manual', 'indefinite', 'ended'));

-- Lista do inbox ordena fixadas primeiro, depois por ultima mensagem
create index if not exists conversations_restaurant_pinned_idx
  on conversations(restaurant_id, is_pinned desc, last_message_at desc);

-- Retomada automatica da IA precisa varrer pausas vencidas
create index if not exists conversations_ai_paused_until_idx
  on conversations(ai_paused_until)
  where ai_paused_until is not null;

-- -------------------------------------------------------------
-- CONVERSATION_TRANSFERS — transferencia de atendimento
-- -------------------------------------------------------------
-- Fluxo: um atendente cria a transferencia (status 'pending'); apenas
-- o destinatario aceita ou rejeita. No accept, o app move o
-- conversations.assignee_id para o to_user_id.
create table if not exists conversation_transfers (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  -- O nome do constraint importa: o app faz embed PostgREST usando
  -- `conversation_transfers_from_user_id_fkey` explicitamente.
  from_user_id    uuid not null
                    constraint conversation_transfers_from_user_id_fkey
                    references auth.users(id) on delete cascade,
  to_user_id      uuid not null
                    constraint conversation_transfers_to_user_id_fkey
                    references auth.users(id) on delete cascade,
  reason          text,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'rejected')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

-- Badge de "transferencias pendentes pra mim"
create index if not exists conversation_transfers_to_user_pending_idx
  on conversation_transfers(to_user_id, status, created_at desc);
create index if not exists conversation_transfers_conversation_idx
  on conversation_transfers(conversation_id, created_at desc);
create index if not exists conversation_transfers_restaurant_idx
  on conversation_transfers(restaurant_id, status);

-- Uma transferencia pendente por conversa evita corrida entre atendentes
create unique index if not exists conversation_transfers_one_pending_idx
  on conversation_transfers(conversation_id)
  where status = 'pending';

-- -------------------------------------------------------------
-- RLS — mesmo padrao das demais tabelas do inbox
-- -------------------------------------------------------------
alter table conversation_transfers enable row level security;

drop policy if exists "tenant read conversation transfers" on conversation_transfers;
create policy "tenant read conversation transfers" on conversation_transfers
  for select to authenticated
  using (auth_has_role(restaurant_id, array['owner','manager','cashier','waiter','kitchen']::restaurant_role[]));

drop policy if exists "staff create conversation transfers" on conversation_transfers;
create policy "staff create conversation transfers" on conversation_transfers
  for insert to authenticated
  with check (
    auth_has_role(restaurant_id, array['owner','manager','cashier','waiter']::restaurant_role[])
    and from_user_id = auth.uid()
  );

-- Resolver (aceitar/rejeitar) e do destinatario; gestores destravam casos presos
drop policy if exists "recipient or manager resolves transfers" on conversation_transfers;
create policy "recipient or manager resolves transfers" on conversation_transfers
  for update to authenticated
  using (
    to_user_id = auth.uid()
    or auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[])
  )
  with check (
    to_user_id = auth.uid()
    or auth_has_role(restaurant_id, array['owner','manager']::restaurant_role[])
  );
