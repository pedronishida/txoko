'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { runClassifyConversation } from '@/lib/server/ai/run-classify'
import { generateDetailedSummary } from '@/lib/server/ai/classify-conversation'
import {
  generateSuggestedReplies,
  buildContextHash,
} from '@/lib/server/ai/suggest-replies'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'
import type {
  ConversationNote,
  ConversationPriority,
  ConversationStatus,
  AiSuggestedReply,
  AiSuggestionsBatch,
  Contact,
  Customer,
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

// =============================================================
// Schemas de validacao Zod
// =============================================================

const conversationIdSchema = z.string().uuid()
const noteIdSchema = z.string().uuid()
const contactIdSchema = z.string().uuid()

const createNoteSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1, 'Nota nao pode ser vazia').max(4000),
})

const updateNoteSchema = z.object({
  noteId: z.string().uuid(),
  body: z.string().min(1, 'Nota nao pode ser vazia').max(4000),
})

const toggleAiPauseSchema = z.object({
  conversationId: z.string().uuid(),
  paused: z.boolean(),
})

const updateContactNotesSchema = z.object({
  contactId: z.string().uuid(),
  notes: z.string().max(4000),
})

const updateContactTagsSchema = z.object({
  contactId: z.string().uuid(),
  tags: z.array(z.string().min(1).max(100)).max(50),
})

// =============================================================
// Notas de conversa
// =============================================================

export async function getConversationNotes(conversationId: string) {
  const parsed = conversationIdSchema.safeParse(conversationId)
  if (!parsed.success) return { error: 'ID de conversa invalido' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversation_notes')
    .select('*')
    .eq('conversation_id', parsed.data)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message }
  return { ok: true, notes: (data ?? []) as ConversationNote[] }
}

export async function createConversationNote(input: {
  conversationId: string
  body: string
}) {
  const parsed = createNoteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: note, error } = await supabase
    .from('conversation_notes')
    .insert({
      conversation_id: parsed.data.conversationId,
      author_id: user.id,
      body: parsed.data.body,
    })
    .select('*')
    .single()

  if (error) return { error: error.message }

  await supabase.from('conversation_events').insert({
    conversation_id: parsed.data.conversationId,
    actor_user_id: user.id,
    type: 'note_added',
    data: { note_id: note.id, kind: 'internal_note' },
  })

  revalidatePath('/inbox')
  return { ok: true, note: note as ConversationNote }
}

export async function deleteConversationNote(noteId: string) {
  const parsed = noteIdSchema.safeParse(noteId)
  if (!parsed.success) return { error: 'ID de nota invalido' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  // Busca a nota para pegar conversation_id (necessario para o evento)
  const { data: existing, error: fetchErr } = await supabase
    .from('conversation_notes')
    .select('id, conversation_id, author_id')
    .eq('id', parsed.data)
    .maybeSingle()

  if (fetchErr) return { error: fetchErr.message }
  if (!existing) return { error: 'Nota nao encontrada' }

  const { error } = await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', parsed.data)

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}

export async function updateConversationNote(input: {
  noteId: string
  body: string
}) {
  const parsed = updateNoteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: note, error } = await supabase
    .from('conversation_notes')
    .update({ body: parsed.data.body })
    .eq('id', parsed.data.noteId)
    .select('*')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true, note: note as ConversationNote }
}

// =============================================================
// IA — pausa / retomada
// =============================================================

export async function toggleConversationAiPause(input: {
  conversationId: string
  paused: boolean
}) {
  const parsed = toggleAiPauseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { error } = await supabase
    .from('conversations')
    .update({ ai_paused: parsed.data.paused })
    .eq('id', parsed.data.conversationId)

  if (error) return { error: error.message }

  await supabase.from('conversation_events').insert({
    conversation_id: parsed.data.conversationId,
    actor_user_id: user.id,
    type: parsed.data.paused ? 'ai_paused' : 'ai_resumed',
    data: { ai_paused: parsed.data.paused },
  })

  revalidatePath('/inbox')
  return { ok: true }
}

// =============================================================
// IA — gerar resumo detalhado
// =============================================================

export async function generateConversationSummary(conversationId: string) {
  const parsed = conversationIdSchema.safeParse(conversationId)
  if (!parsed.success) return { error: 'ID de conversa invalido' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { data: messages, error: mErr } = await supabase
    .from('messages')
    .select('id, direction, sender_type, body, created_at, conversation_id, status')
    .eq('conversation_id', parsed.data)
    .order('created_at', { ascending: true })
    .limit(30)

  if (mErr) return { error: mErr.message }
  if (!messages || messages.length === 0) {
    return { error: 'Conversa sem mensagens' }
  }

  const { summary } = await generateDetailedSummary(messages as unknown as Message[])
  const now = new Date().toISOString()

  const { error: upErr } = await supabase
    .from('conversations')
    .update({
      ai_summary: summary,
      ai_summary_generated_at: now,
    })
    .eq('id', parsed.data)

  if (upErr) return { error: upErr.message }

  await supabase.from('conversation_events').insert({
    conversation_id: parsed.data,
    actor_user_id: user.id,
    type: 'ai_summary_refreshed',
    data: { model: 'claude-haiku-4-5', message_count: messages.length },
  })

  revalidatePath('/inbox')
  return { ok: true, summary }
}

// =============================================================
// IA — sugestoes de resposta rapida
// =============================================================

export async function generateSuggestedRepliesAction(conversationId: string) {
  const parsed = conversationIdSchema.safeParse(conversationId)
  if (!parsed.success) return { error: 'ID de conversa invalido' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  // Carrega as mensagens recentes
  const { data: messages, error: mErr } = await supabase
    .from('messages')
    .select('id, direction, sender_type, body, created_at, conversation_id, status')
    .eq('conversation_id', parsed.data)
    .order('created_at', { ascending: true })
    .limit(20)

  if (mErr) return { error: mErr.message }
  if (!messages || messages.length === 0) {
    return { error: 'Conversa sem mensagens' }
  }

  const typedMessages = messages as unknown as Message[]
  const contextHash = buildContextHash(typedMessages)

  // Verifica cache existente e valido
  const { data: cached } = await supabase
    .from('ai_suggested_replies')
    .select('*')
    .eq('conversation_id', parsed.data)
    .eq('context_hash', contextHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (cached) {
    return {
      ok: true,
      suggestions: (cached as AiSuggestionsBatch).suggestions,
      cached: true,
    }
  }

  // Busca nome do restaurante para o prompt
  const restaurantId = await getActiveRestaurantId()
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', restaurantId)
    .maybeSingle()
  const restaurantName = restaurant?.name ?? 'Restaurante'

  const suggestions = await generateSuggestedReplies(typedMessages, restaurantName)

  // Persiste no cache (expira em 30 minutos)
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

  // Upsert: remove anterior para a mesma conversa e insere novo
  await supabase
    .from('ai_suggested_replies')
    .delete()
    .eq('conversation_id', parsed.data)

  const { data: batch, error: insertErr } = await supabase
    .from('ai_suggested_replies')
    .insert({
      conversation_id: parsed.data,
      context_hash: contextHash,
      suggestions: suggestions as unknown as AiSuggestedReply[],
      model: 'claude-haiku-4-5',
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (insertErr) {
    // Cache falhou mas retorna as sugestoes mesmo assim
    return { ok: true, suggestions, cached: false }
  }

  await supabase.from('conversation_events').insert({
    conversation_id: parsed.data,
    actor_user_id: user.id,
    type: 'ai_suggestions_generated',
    data: {
      model: 'claude-haiku-4-5',
      count: suggestions.length,
      context_hash: contextHash,
    },
  })

  return {
    ok: true,
    suggestions: (batch as AiSuggestionsBatch).suggestions,
    cached: false,
  }
}

// =============================================================
// Detalhes do contato (painel lateral)
// =============================================================

export type ContactDetails = {
  contact: Contact
  customer: Customer | null
  stats: {
    total_messages: number
    first_message_at: string | null
  }
}

export async function getContactDetails(conversationId: string) {
  const parsed = conversationIdSchema.safeParse(conversationId)
  if (!parsed.success) return { error: 'ID de conversa invalido' }

  const supabase = await createClient()

  // Busca conversa com contato
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', parsed.data)
    .maybeSingle()

  if (convErr) return { error: convErr.message }
  if (!conv) return { error: 'Conversa nao encontrada' }

  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', conv.contact_id)
    .maybeSingle()

  if (contactErr) return { error: contactErr.message }
  if (!contact) return { error: 'Contato nao encontrado' }

  // Busca cliente vinculado (se existir)
  let customer: Customer | null = null
  if (contact.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('*')
      .eq('id', contact.customer_id)
      .maybeSingle()
    customer = (cust ?? null) as Customer | null
  }

  // Stats: total de mensagens e primeira mensagem
  const { data: statsData, error: statsErr } = await supabase
    .from('messages')
    .select('id, created_at')
    .eq('conversation_id', parsed.data)
    .order('created_at', { ascending: true })

  if (statsErr) return { error: statsErr.message }

  const messages = statsData ?? []
  const total_messages = messages.length
  const first_message_at =
    messages.length > 0 ? (messages[0] as { created_at: string }).created_at : null

  const result: ContactDetails = {
    contact: contact as unknown as Contact,
    customer,
    stats: { total_messages, first_message_at },
  }

  return { ok: true, data: result }
}

// =============================================================
// Atualizacoes de contato
// =============================================================

export async function updateContactNotes(input: {
  contactId: string
  notes: string
}) {
  const parsed = updateContactNotesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const { error } = await supabase
    .from('contacts')
    .update({ notes: parsed.data.notes })
    .eq('id', parsed.data.contactId)

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}

export async function updateContactTags(input: {
  contactId: string
  tags: string[]
}) {
  const parsed = updateContactTagsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  // Normaliza: lowercase, sem duplicatas, sem espacos extras
  const normalizedTags = [
    ...new Set(parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ]

  const { error } = await supabase
    .from('contacts')
    .update({ tags: normalizedTags })
    .eq('id', parsed.data.contactId)

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}
