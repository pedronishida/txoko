/**
 * Cron: envia o briefing diario via WhatsApp para os agentes admin com
 * briefing habilitado na hora alvo (UTC).
 *
 * Protegido por Authorization: Bearer <CRON_SECRET>.
 * Query params: hour (0-23, default: hora UTC atual).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendBriefing, type BriefingFormat } from '@/lib/server/admin-agent/briefing'

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

  const currentUtcHour = new Date().getUTCHours()
  const hourParam = new URL(req.url).searchParams.get('hour')
  const targetHour = hourParam !== null ? parseInt(hourParam, 10) : currentUtcHour

  const { data: agents, error } = await supabase
    .from('admin_agents')
    .select('restaurant_id, briefing_phone, briefing_hour, briefing_format, briefing_voice')
    .eq('enabled', true)
    .eq('briefing_enabled', true)
    .eq('briefing_hour', targetHour)
    .not('briefing_phone', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, target_hour: targetHour, eligible: 0, results: [] })
  }

  const results: Array<{
    restaurant_id: string
    phone: string
    status: 'delivered' | 'failed'
    reason?: string
  }> = []

  for (const agent of agents) {
    const restaurantId = agent.restaurant_id as string
    const phone = agent.briefing_phone as string

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

    const result = await sendBriefing(supabase, {
      restaurantId,
      restaurantName: restaurant?.name ?? 'Restaurante',
      recipientPhone: phone,
      channel: channel ? { id: channel.id, config: channel.config } : null,
      format: (agent.briefing_format as BriefingFormat | null) ?? 'text',
      voice: agent.briefing_voice ?? 'nova',
    })

    results.push({
      restaurant_id: restaurantId,
      phone,
      status: result.ok ? 'delivered' : 'failed',
      reason: result.ok ? undefined : result.reason,
    })
  }

  return NextResponse.json({
    ok: true,
    target_hour: targetHour,
    eligible: agents.length,
    results,
    elapsed_ms: Date.now() - startedAt,
  })
}
