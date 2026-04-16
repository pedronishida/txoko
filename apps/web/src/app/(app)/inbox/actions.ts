'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { runClassifyConversation } from '@/lib/server/ai/run-classify'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'
import type {
  ConversationPriority,
  ConversationStatus,
  Message,
} from '@txoko/shared'

export async function getMessages(conversationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message }
  return { ok: true, messages: (data ?? []) as unknown as Message[] }
}

export async function sendMessage(input: {
  conversationId: string
  body: string
}) {
  const trimmed = input.body.trim()
  if (trimmed.length === 0) return { error: 'Mensagem vazia' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Carrega conversa + canal
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select(
      `id, channel_id, contact_id,
       channel:channels(id, type, config, status)`
    )
    .eq('id', input.conversationId)
    .maybeSingle()

  if (convErr || !conv) return { error: convErr?.message ?? 'Conversa nao encontrada' }

  const channel = Array.isArray(conv.channel) ? conv.channel[0] : conv.channel

  // Busca identity separadamente (contact_identities nao tem FK direto com conversations)
  const { data: identity } = await supabase
    .from('contact_identities')
    .select('external_id, channel_id')
    .eq('contact_id', conv.contact_id)
    .eq('channel_id', conv.channel_id)
    .maybeSingle()

  // Envia via Z-API (se canal whatsapp_zapi ativo)
  let externalMessageId: string | null = null
  let initialStatus: 'pending' | 'sent' | 'failed' = 'sent'

  if (channel?.type === 'whatsapp_zapi' && channel.status === 'active' && identity) {
    const cfg = (channel.config ?? {}) as Partial<ZapiChannelConfig>
    if (cfg.instance_id && cfg.token) {
      try {
        const client = new ZapiClient(cfg as ZapiChannelConfig)
        const res = await client.sendText({
          phone: identity.external_id,
          message: trimmed,
        })
        externalMessageId = res.messageId
        initialStatus = 'pending'
      } catch (e) {
        const msg = e instanceof ZapiError ? e.message : (e as Error).message
        return { error: `Z-API: ${msg}` }
      }
    }
  }

  const { error } = await supabase.from('messages').insert({
    conversation_id: input.conversationId,
    direction: 'outbound',
    sender_type: 'agent',
    sender_user_id: user?.id ?? null,
    body: trimmed,
    external_message_id: externalMessageId,
    status: initialStatus,
  })
  if (error) return { error: error.message }

  await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', input.conversationId)

  await supabase.from('conversation_events').insert({
    conversation_id: input.conversationId,
    actor_user_id: user?.id ?? null,
    type: 'note_added',
    data: { kind: 'reply', via_zapi: externalMessageId !== null },
  })

  revalidatePath('/inbox')
  return { ok: true }
}

export async function updateConversationStatus(input: {
  conversationId: string
  status: ConversationStatus
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('conversations')
    .update({ status: input.status })
    .eq('id', input.conversationId)
  if (error) return { error: error.message }

  await supabase.from('conversation_events').insert({
    conversation_id: input.conversationId,
    actor_user_id: user?.id ?? null,
    type: 'status_changed',
    data: { status: input.status },
  })

  revalidatePath('/inbox')
  return { ok: true }
}

export async function updateConversationPriority(input: {
  conversationId: string
  priority: ConversationPriority
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('conversations')
    .update({ priority: input.priority })
    .eq('id', input.conversationId)
  if (error) return { error: error.message }

  await supabase.from('conversation_events').insert({
    conversation_id: input.conversationId,
    actor_user_id: user?.id ?? null,
    type: 'priority_changed',
    data: { priority: input.priority },
  })

  revalidatePath('/inbox')
  return { ok: true }
}

export async function markConversationRead(conversationId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId)
  if (error) return { error: error.message }

  // Envia read receipt pro Z-API quando possivel (fire-and-forget)
  const { data: conv } = await supabase
    .from('conversations')
    .select(
      `channel_id, contact_id,
       channel:channels(type, config, status)`
    )
    .eq('id', conversationId)
    .maybeSingle()

  const channel = conv?.channel
    ? Array.isArray(conv.channel)
      ? conv.channel[0]
      : conv.channel
    : null

  let identity: { external_id: string } | null = null
  if (conv) {
    const { data: ident } = await supabase
      .from('contact_identities')
      .select('external_id')
      .eq('contact_id', conv.contact_id)
      .eq('channel_id', conv.channel_id)
      .maybeSingle()
    identity = ident
  }

  if (
    channel?.type === 'whatsapp_zapi' &&
    channel.status === 'active' &&
    identity
  ) {
    const cfg = (channel.config ?? {}) as Partial<ZapiChannelConfig>
    if (cfg.instance_id && cfg.token) {
      try {
        const client = new ZapiClient(cfg as ZapiChannelConfig)
        await client.markChatRead(identity.external_id)
      } catch {
        // fire-and-forget: nao bloqueia a UI
      }
    }
  }

  return { ok: true }
}

export async function assignConversationToMe(conversationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { error } = await supabase
    .from('conversations')
    .update({ assignee_id: user.id })
    .eq('id', conversationId)
  if (error) return { error: error.message }

  await supabase.from('conversation_events').insert({
    conversation_id: conversationId,
    actor_user_id: user.id,
    type: 'assigned',
    data: { assignee_id: user.id },
  })

  revalidatePath('/inbox')
  return { ok: true }
}

export async function classifyConversation(conversationId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const res = await runClassifyConversation(supabase, conversationId, {
    actorUserId: user?.id ?? null,
  })
  if (!res.ok) return { error: res.error }

  revalidatePath('/inbox')
  return { ok: true, result: res.result }
}

export async function createManualConversation(input: {
  channelId: string
  displayName: string
  body: string
}) {
  const trimmed = input.body.trim()
  if (trimmed.length === 0) return { error: 'Mensagem vazia' }
  if (input.displayName.trim().length === 0)
    return { error: 'Nome do contato obrigatorio' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .insert({
      restaurant_id,
      display_name: input.displayName.trim(),
    })
    .select('id')
    .single()
  if (contactErr || !contact) return { error: contactErr?.message ?? 'Erro ao criar contato' }

  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .insert({
      restaurant_id,
      contact_id: contact.id,
      channel_id: input.channelId,
      status: 'open',
      priority: 'normal',
      last_message_preview: trimmed.slice(0, 140),
    })
    .select('id')
    .single()
  if (convErr || !conversation)
    return { error: convErr?.message ?? 'Erro ao criar conversa' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'outbound',
    sender_type: 'agent',
    sender_user_id: user?.id ?? null,
    body: trimmed,
    status: 'sent',
  })

  await supabase.from('conversation_events').insert({
    conversation_id: conversation.id,
    actor_user_id: user?.id ?? null,
    type: 'created',
    data: { source: 'manual' },
  })

  revalidatePath('/inbox')
  return { ok: true, conversationId: conversation.id }
}
