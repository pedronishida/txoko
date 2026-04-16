/**
 * Cron endpoint for time-based automation triggers.
 *
 * Call this endpoint periodically (e.g. every hour) via an external scheduler.
 * It handles: birthdays today, inactive customers (>X days), low stock.
 *
 * Protected by a secret token in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * When called without auth (dev/test), it accepts requests from localhost.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runScheduledAutomations } from '@/lib/server/automations/runner'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createClient()

  // Get all restaurant IDs that have enabled automations
  const { data: rows, error } = await supabase
    .from('automations')
    .select('restaurant_id')
    .eq('enabled', true)
    .in('trigger_type', ['birthday', 'no_visit_30d', 'low_stock'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const restaurantIds = [...new Set((rows ?? []).map((r) => r.restaurant_id as string))]

  const summary: Array<{
    restaurantId: string
    triggered: number
    errors: string[]
  }> = []

  for (const restaurantId of restaurantIds) {
    const result = await runScheduledAutomations(supabase, restaurantId)
    summary.push({ restaurantId, ...result })
  }

  return NextResponse.json({ ok: true, summary, at: new Date().toISOString() })
}
