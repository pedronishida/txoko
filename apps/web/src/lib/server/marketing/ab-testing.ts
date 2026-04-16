import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Marketing — A/B Testing Engine
// =============================================================
// Assign recipients to variants, track performance, pick winner.
// =============================================================

export type AbVariantStats = {
  variant: 'a' | 'b'
  templateId: string | null
  sent: number
  delivered: number
  read: number
  failed: number
  deliveryRate: number
  readRate: number
}

/**
 * Atribui variant (a ou b) a um recipient baseado no split percentage.
 * Deterministico por indice pra reproducibilidade.
 */
export function assignVariant(
  recipientIndex: number,
  splitPctA: number
): 'a' | 'b' {
  // Use modulo 100 pra distribuicao uniforme
  const bucket = recipientIndex % 100
  return bucket < splitPctA ? 'a' : 'b'
}

/**
 * Carrega stats de performance A/B de uma campanha.
 */
export async function loadAbStats(
  supabase: SupabaseClient,
  campaignId: string
): Promise<AbVariantStats[]> {
  const { data: variants } = await supabase
    .from('campaign_ab_variants')
    .select('variant, template_id, stats_sent, stats_delivered, stats_read, stats_failed')
    .eq('campaign_id', campaignId)
    .order('variant')

  if (!variants || variants.length === 0) return []

  return variants.map((v) => {
    const sent = Number(v.stats_sent ?? 0)
    const delivered = Number(v.stats_delivered ?? 0)
    const read = Number(v.stats_read ?? 0)
    const failed = Number(v.stats_failed ?? 0)
    return {
      variant: v.variant as 'a' | 'b',
      templateId: v.template_id as string | null,
      sent,
      delivered,
      read,
      failed,
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : 0,
      readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
    }
  })
}

/**
 * Determina winner do teste A/B baseado em read rate.
 * Requer minimo de 20 sent por variante pra significancia.
 */
export function pickWinner(
  stats: AbVariantStats[]
): { winner: 'a' | 'b' | null; confidence: 'low' | 'medium' | 'high'; reason: string } {
  if (stats.length < 2) {
    return { winner: null, confidence: 'low', reason: 'Menos de 2 variantes' }
  }

  const a = stats.find((s) => s.variant === 'a')
  const b = stats.find((s) => s.variant === 'b')

  if (!a || !b) {
    return { winner: null, confidence: 'low', reason: 'Variante faltando' }
  }

  const minSample = 20
  if (a.sent < minSample || b.sent < minSample) {
    return {
      winner: null,
      confidence: 'low',
      reason: `Amostra insuficiente (min ${minSample} por variante)`,
    }
  }

  const diff = Math.abs(a.readRate - b.readRate)
  const winner = a.readRate >= b.readRate ? 'a' : 'b'

  if (diff < 3) {
    return {
      winner: null,
      confidence: 'low',
      reason: `Diferenca muito pequena (${diff}pp)`,
    }
  }

  const confidence = diff >= 15 ? 'high' : diff >= 8 ? 'medium' : 'low'

  return {
    winner,
    confidence,
    reason: `Variante ${winner.toUpperCase()} com +${diff}pp de leitura`,
  }
}

/**
 * Atualiza stats de A/B variants baseado nos recipients.
 */
export async function refreshAbStats(
  supabase: SupabaseClient,
  campaignId: string
) {
  const { data: variants } = await supabase
    .from('campaign_ab_variants')
    .select('id, variant')
    .eq('campaign_id', campaignId)

  for (const v of variants ?? []) {
    const variant = v.variant as string
    const variantId = v.id as string

    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('status')
      .eq('campaign_id', campaignId)
      .eq('ab_variant', variant)

    if (!recipients) continue

    const stats = {
      stats_sent: recipients.filter((r) =>
        ['sent', 'delivered', 'read'].includes(r.status as string)
      ).length,
      stats_delivered: recipients.filter((r) =>
        ['delivered', 'read'].includes(r.status as string)
      ).length,
      stats_read: recipients.filter((r) => r.status === 'read').length,
      stats_failed: recipients.filter((r) => r.status === 'failed').length,
    }

    await supabase
      .from('campaign_ab_variants')
      .update(stats)
      .eq('id', variantId)
  }
}
