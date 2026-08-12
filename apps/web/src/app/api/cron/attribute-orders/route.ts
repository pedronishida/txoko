/**
 * Cron: atribui pedidos recentes a campanhas de marketing via RPC.
 *
 * Protegido por Authorization: Bearer <CRON_SECRET>.
 * Query params: hours (janela, default 168, max 720), restaurant_id (opcional).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const windowHours = Math.min(Math.max(Number(url.searchParams.get('hours') ?? 168) | 0, 1), 720)
  const restaurantId = url.searchParams.get('restaurant_id')

  let supabase: ReturnType<typeof createServiceClient>
  try {
    supabase = createServiceClient()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const startedAt = Date.now()
  const { data, error } = await supabase.rpc('attribute_orders_to_campaigns', {
    p_restaurant_id: restaurantId,
    p_window_hours: windowHours,
  })

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: 'attribute_orders_to_campaigns RPC failed' },
      { status: 500 }
    )
  }

  const elapsedMs = Date.now() - startedAt

  return NextResponse.json({
    ok: true,
    attributed: data ?? 0,
    window_hours: windowHours,
    restaurant_id: restaurantId,
    elapsed_ms: elapsedMs,
  })
}
