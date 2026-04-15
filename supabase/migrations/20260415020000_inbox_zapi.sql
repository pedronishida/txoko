-- =============================================================
-- Txoko — Inbox Z-API (deduplicacao + status PLAYED)
-- =============================================================

-- -------------------------------------------------------------
-- UNIQUE parcial em external_message_id
-- Garante idempotencia de webhooks Z-API que podem reentregar.
-- NULL ignorado para mensagens manuais criadas no Inbox.
-- -------------------------------------------------------------
create unique index if not exists messages_external_message_id_uidx
  on messages (conversation_id, external_message_id)
  where external_message_id is not null;

-- -------------------------------------------------------------
-- Extensao do enum message_status: adicionar 'played'
-- (Z-API reporta 'PLAYED' quando o audio/video foi reproduzido)
-- -------------------------------------------------------------
alter type message_status add value if not exists 'played';
