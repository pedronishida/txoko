import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '@txoko/shared'
import { classifyConversationMessages } from './classify-conversation'

// =============================================================
// Executa classificacao e persiste em conversations
// =============================================================

export async function runClassifyConversation(
  supabase: SupabaseClient,
  conversationId: string,
  options: { actorUserId?: string | null } = {}
) {
  const { data: messages, error: mErr } = await supabase
    .from('messages')
    .select('id, direction, sender_type, body, created_at, conversation_id, status')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(60)

  if (mErr) return { ok: false, error: mErr.message }
  if (!messages || messages.length === 0)
    return { ok: false, error: 'Conversa sem mensagens' }

  const result = await classifyConversationMessages(messages as unknown as Message[])

  const metadata: Record<string, unknown> = {
    classified_at: new Date().toISOString(),
    classified_message_count: messages.length,
  }
  // Carrega metadata atual pra merge
  const { data: current } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()
  const mergedMetadata = {
    ...((current?.metadata ?? {}) as Record<string, unknown>),
    ai_classify: metadata,
  }

  const { error: upErr } = await supabase
    .from('conversations')
    .update({
      ai_summary: result.summary,
      ai_intent: result.intent,
      ai_sentiment: result.sentiment,
      metadata: mergedMetadata,
    })
    .eq('id', conversationId)

  if (upErr) return { ok: false, error: upErr.message }

  await supabase.from('conversation_events').insert({
    conversation_id: conversationId,
    actor_user_id: options.actorUserId ?? null,
    type: 'ai_classified',
    data: {
      intent: result.intent,
      sentiment: result.sentiment,
      model: 'claude-haiku-4-5',
      message_count: messages.length,
    },
  })

  return { ok: true, result }
}
