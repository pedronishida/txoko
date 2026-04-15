import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelType, ConversationIntent } from '@txoko/shared'

export type InboundPayload = {
  restaurantId: string
  channelId: string
  channelType: ChannelType
  externalContactId: string
  externalMessageId?: string | null
  externalThreadId?: string | null
  contactDisplayName?: string | null
  contactAvatarUrl?: string | null
  body: string | null
  attachments?: unknown[]
  aiIntent?: ConversationIntent | null
  occurredAt?: string
}

export type IngestResult =
  | {
      ok: true
      conversationId: string
      messageId: string
      contactId: string
      contactCreated: boolean
      created: boolean
    }
  | { ok: false; error: string }

/**
 * Ingere uma mensagem recebida por um canal externo.
 *
 * Fluxo:
 *  1. Resolve (ou cria) o contact via contact_identities lookup por (channel_id, external_id)
 *  2. Resolve (ou cria) a conversa pelo external_thread_id OU pela conversa aberta mais recente do contato
 *  3. Insere a mensagem (o trigger `on_message_insert` atualiza last_message_preview/unread_count)
 *
 * Idempotente quando externalMessageId vier preenchido: retorna a mensagem existente.
 */
export async function ingestInboundMessage(
  supabase: SupabaseClient,
  payload: InboundPayload
): Promise<IngestResult> {
  // 1. Dedup por external_message_id
  if (payload.externalMessageId) {
    const { data: existing } = await supabase
      .from('messages')
      .select('id, conversation_id, conversations!inner(contact_id)')
      .eq('external_message_id', payload.externalMessageId)
      .maybeSingle<{
        id: string
        conversation_id: string
        conversations: { contact_id: string } | { contact_id: string }[]
      }>()
    if (existing) {
      const conv = Array.isArray(existing.conversations)
        ? existing.conversations[0]
        : existing.conversations
      return {
        ok: true,
        conversationId: existing.conversation_id,
        messageId: existing.id,
        contactId: conv?.contact_id ?? '',
        contactCreated: false,
        created: false,
      }
    }
  }

  // 2. Resolve identity → contact
  let contactId: string | null = null
  let contactCreated = false
  const { data: identity } = await supabase
    .from('contact_identities')
    .select('contact_id')
    .eq('channel_id', payload.channelId)
    .eq('external_id', payload.externalContactId)
    .maybeSingle()

  if (identity) {
    contactId = identity.contact_id as string
  } else {
    contactCreated = true
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        restaurant_id: payload.restaurantId,
        display_name: payload.contactDisplayName ?? 'Cliente',
        avatar_url: payload.contactAvatarUrl ?? null,
      })
      .select('id')
      .single()
    if (contactErr || !newContact) {
      return { ok: false, error: contactErr?.message ?? 'Falha ao criar contato' }
    }
    contactId = newContact.id as string

    const { error: identErr } = await supabase.from('contact_identities').insert({
      contact_id: contactId,
      channel_id: payload.channelId,
      channel_type: payload.channelType,
      external_id: payload.externalContactId,
      display_name: payload.contactDisplayName ?? null,
    })
    if (identErr) return { ok: false, error: identErr.message }
  }

  // 3. Resolve ou cria conversa
  let conversationId: string | null = null

  if (payload.externalThreadId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('restaurant_id', payload.restaurantId)
      .eq('channel_id', payload.channelId)
      .eq('external_thread_id', payload.externalThreadId)
      .maybeSingle()
    if (existing) conversationId = existing.id as string
  }

  if (!conversationId) {
    const { data: openConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('restaurant_id', payload.restaurantId)
      .eq('contact_id', contactId)
      .eq('channel_id', payload.channelId)
      .in('status', ['open', 'pending_agent', 'pending_customer'])
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (openConv) conversationId = openConv.id as string
  }

  if (!conversationId) {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        restaurant_id: payload.restaurantId,
        contact_id: contactId,
        channel_id: payload.channelId,
        external_thread_id: payload.externalThreadId ?? null,
        status: 'pending_agent',
        priority: 'normal',
        ai_intent: payload.aiIntent ?? null,
      })
      .select('id')
      .single()
    if (convErr || !newConv) {
      return { ok: false, error: convErr?.message ?? 'Falha ao criar conversa' }
    }
    conversationId = newConv.id as string

    await supabase.from('conversation_events').insert({
      conversation_id: conversationId,
      type: 'created',
      data: { source: payload.channelType },
    })
  }

  // 4. Insere mensagem — trigger atualiza last_message_preview/unread_count
  const { data: newMessage, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      direction: 'inbound',
      sender_type: 'contact',
      body: payload.body,
      attachments: payload.attachments ?? [],
      external_message_id: payload.externalMessageId ?? null,
      status: 'delivered',
      metadata: {},
      ...(payload.occurredAt ? { created_at: payload.occurredAt } : {}),
    })
    .select('id')
    .single()
  if (msgErr || !newMessage) {
    return { ok: false, error: msgErr?.message ?? 'Falha ao inserir mensagem' }
  }

  return {
    ok: true,
    conversationId,
    messageId: newMessage.id as string,
    contactId: contactId!,
    contactCreated,
    created: true,
  }
}
