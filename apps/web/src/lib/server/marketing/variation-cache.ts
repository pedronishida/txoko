import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateVariations,
  hashTemplateBody,
  type Variation,
} from '../ai/message-variation'

// =============================================================
// Marketing — Variation Cache
// =============================================================
// Gerencia cache de variacoes de templates no banco.
// Hash-based: regenera apenas quando o template body muda.
// =============================================================

export async function getOrCreateVariations(
  supabase: SupabaseClient,
  templateId: string,
  channel: 'whatsapp' | 'email' | 'sms',
  options: {
    templateBody: string
    count: number
    temperature: number
    restaurantName: string
    restaurantType?: string
  }
): Promise<Variation[]> {
  const hash = hashTemplateBody(options.templateBody)

  // Check cache
  const { data: cached } = await supabase
    .from('ai_message_variations')
    .select('variant_index, body, subject')
    .eq('template_id', templateId)
    .eq('channel', channel)
    .eq('hash', hash)
    .order('variant_index')

  if (cached && cached.length >= options.count) {
    return cached.map((v) => ({
      body: v.body as string,
      subject: (v.subject as string) ?? undefined,
    }))
  }

  // Generate new variations
  const variations = await generateVariations({
    templateBody: options.templateBody,
    channel,
    count: options.count,
    temperature: options.temperature,
    restaurantName: options.restaurantName,
    restaurantType: options.restaurantType,
  })

  // Clear old cache
  await supabase
    .from('ai_message_variations')
    .delete()
    .eq('template_id', templateId)
    .eq('channel', channel)

  // Insert new
  const rows = variations.map((v, i) => ({
    template_id: templateId,
    variant_index: i,
    channel,
    body: v.body,
    subject: v.subject ?? null,
    hash,
  }))

  await supabase.from('ai_message_variations').insert(rows)

  return variations
}

/**
 * Seleciona variacao por indice do recipient (round-robin determinístico).
 */
export function selectVariation(
  recipientIndex: number,
  totalVariations: number
): number {
  return recipientIndex % totalVariations
}
