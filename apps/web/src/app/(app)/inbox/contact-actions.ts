'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ConversationNote, Contact, Customer } from '@txoko/shared'

// =============================================================
// Contact Panel — server actions
// =============================================================

export type ContactDetails = {
  contact: Pick<Contact, 'id' | 'display_name' | 'avatar_url' | 'tags' | 'notes'>
  customer: Pick<
    Customer,
    | 'id'
    | 'name'
    | 'phone'
    | 'email'
    | 'loyalty_points'
    | 'total_orders'
    | 'total_spent'
    | 'last_visit_at'
  > | null
  stats: {
    totalMessages: number
    firstMessageAt: string | null
  }
}

export async function getContactDetails(
  conversationId: string
): Promise<{ ok: true; data: ContactDetails } | { error: string }> {
  const supabase = await createClient()

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (convErr || !conv) return { error: convErr?.message ?? 'Conversa nao encontrada' }

  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .select('id, display_name, avatar_url, tags, notes, customer_id')
    .eq('id', conv.contact_id)
    .maybeSingle()

  if (contactErr || !contact) return { error: contactErr?.message ?? 'Contato nao encontrado' }

  let customer: ContactDetails['customer'] = null
  if (contact.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select(
        'id, name, phone, email, loyalty_points, total_orders, total_spent, last_visit_at'
      )
      .eq('id', contact.customer_id)
      .maybeSingle()
    if (cust) customer = cust
  }

  const { count: totalMessages } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)

  const { data: firstMsg } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return {
    ok: true,
    data: {
      contact: {
        id: contact.id,
        display_name: contact.display_name,
        avatar_url: contact.avatar_url,
        tags: contact.tags ?? [],
        notes: contact.notes ?? null,
      },
      customer,
      stats: {
        totalMessages: totalMessages ?? 0,
        firstMessageAt: firstMsg?.created_at ?? null,
      },
    },
  }
}

export async function getConversationNotes(
  conversationId: string
): Promise<{ ok: true; notes: ConversationNote[] } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversation_notes')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  return { ok: true, notes: (data ?? []) as unknown as ConversationNote[] }
}

export async function createConversationNote(input: {
  conversationId: string
  body: string
}): Promise<{ ok: true } | { error: string }> {
  const trimmed = input.body.trim()
  if (!trimmed) return { error: 'Nota vazia' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('conversation_notes').insert({
    conversation_id: input.conversationId,
    author_id: user?.id ?? null,
    body: trimmed,
  })
  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}

export async function deleteConversationNote(
  noteId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversation_notes')
    .delete()
    .eq('id', noteId)
  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}

export async function toggleConversationAiPause(input: {
  conversationId: string
  paused: boolean
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('conversations')
    .update({ ai_paused: input.paused })
    .eq('id', input.conversationId)
  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}

export async function generateConversationSummary(
  conversationId: string
): Promise<{ ok: true; summary: string } | { error: string }> {
  const supabase = await createClient()

  // Busca as ultimas mensagens para gerar o resumo
  const { data: messages, error: msgErr } = await supabase
    .from('messages')
    .select('direction, body, created_at')
    .eq('conversation_id', conversationId)
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30)
  if (msgErr) return { error: msgErr.message }

  if (!messages || messages.length === 0) {
    return { error: 'Sem mensagens para resumir' }
  }

  // Monta o contexto para a IA
  const transcript = messages
    .reverse()
    .map((m) => `[${m.direction === 'outbound' ? 'Atendente' : 'Cliente'}]: ${m.body}`)
    .join('\n')

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Voce e um assistente de atendimento ao cliente para um restaurante. Resuma em 2-3 frases curtas o que foi discutido nesta conversa, focando no problema/pedido do cliente e o desfecho. Seja conciso e direto. Responda em portugues.\n\nConversa:\n${transcript}`,
        },
      ],
    })

    const summary =
      msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''

    if (!summary) return { error: 'Resumo vazio gerado' }

    await supabase
      .from('conversations')
      .update({
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    revalidatePath('/inbox')
    return { ok: true, summary }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateContactTags(input: {
  contactId: string
  tags: string[]
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contacts')
    .update({ tags: input.tags })
    .eq('id', input.contactId)
  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}

export async function updateContactNotes(input: {
  contactId: string
  notes: string
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contacts')
    .update({ notes: input.notes })
    .eq('id', input.contactId)
  if (error) return { error: error.message }

  revalidatePath('/inbox')
  return { ok: true }
}
