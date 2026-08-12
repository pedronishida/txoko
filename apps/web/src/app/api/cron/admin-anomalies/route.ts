/**
 * Cron: roda a deteccao de anomalias operacionais (faturamento, cancelamentos,
 * estoque) para cada restaurante com alertas do agente admin habilitados e
 * entrega os alertas (notificacao in-app + WhatsApp quando ha canal).
 *
 * Protegido por Authorization: Bearer <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { detectAnomalies, deliverAnomalies } from '@/lib/server/admin-agent/anomalies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startedAt = Date.now()

  const { data: agents, error } = await supabase
    .from('admin_agents')
    .select('restaurant_id, briefing_phone, alerts_enabled')
    .eq('enabled', true)
    .eq('alerts_enabled', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, anomalies_total: 0 })
  }

  const summary: Array<{
    restaurant_id: string
    anomalies: number
    delivered: number
    skipped: number
  }> = []

  for (const agent of agents) {
    const restaurantId = agent.restaurant_id as string
    const anomalies = await detectAnomalies(supabase, restaurantId)
    if (anomalies.length === 0) {
      summary.push({ restaurant_id: restaurantId, anomalies: 0, delivered: 0, skipped: 0 })
      continue
    }

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('name')
      .eq('id', restaurantId)
      .maybeSingle()
    const { data: channel } = await supabase
      .from('channels')
      .select('id, config')
      .eq('restaurant_id', restaurantId)
      .eq('type', 'whatsapp_zapi')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const delivery = await deliverAnomalies(supabase, {
      restaurantId,
      restaurantName: restaurant?.name ?? 'Restaurante',
      anomalies,
      sendToPhone: agent.briefing_phone ?? null,
      channel: channel ? { id: channel.id, config: channel.config } : null,
    })

    summary.push({
      restaurant_id: restaurantId,
      anomalies: anomalies.length,
      delivered: delivery.delivered,
      skipped: delivery.skipped,
    })
  }

  return NextResponse.json({
    ok: true,
    checked: agents.length,
    anomalies_total: summary.reduce((sum, row) => sum + row.anomalies, 0),
    delivered_total: summary.reduce((sum, row) => sum + row.delivered, 0),
    skipped_total: summary.reduce((sum, row) => sum + row.skipped, 0),
    elapsed_ms: Date.now() - startedAt,
    summary,
  })
}
