/**
 * Cron: detecta picos de opt-out por restaurante na ultima hora e emite
 * notificacao critica (threshold: 5 opt-outs / 60 min).
 *
 * Protegido por Authorization: Bearer <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { emitNotification } from '@/lib/server/emit-notification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const windowStart = new Date(Date.now() - 3_600_000).toISOString()

  const { data: optOuts } = await supabase
    .from('opt_outs')
    .select('restaurant_id')
    .gte('created_at', windowStart)

  const countsByRestaurant = new Map<string, number>()
  for (const row of optOuts ?? []) {
    const restaurantId = row.restaurant_id
    countsByRestaurant.set(restaurantId, (countsByRestaurant.get(restaurantId) ?? 0) + 1)
  }

  const triggered: Array<{ restaurant_id: string; count: number }> = []
  for (const [restaurantId, count] of countsByRestaurant.entries()) {
    if (count < 5) continue
    await emitNotification(supabase, {
      restaurantId,
      type: 'optout_spike',
      title: `${count} opt-outs na ultima hora`,
      body: 'Volume incomum — pode ser sinal de campanha errada ou risco de ban no canal. Pause envios e investigue.',
      href: '/marketing/roi',
      severity: 'critical',
      dedupKey: `optout_spike:${restaurantId}:${new Date(windowStart).toISOString().slice(0, 13)}`,
      metadata: { count, window_minutes: 60 },
    })
    triggered.push({ restaurant_id: restaurantId, count })
  }

  return NextResponse.json({
    ok: true,
    checked: countsByRestaurant.size,
    triggered,
    window_minutes: 60,
    threshold: 5,
  })
}
