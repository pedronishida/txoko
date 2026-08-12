/**
 * Cron: checa a saude de todos os canais Z-API, repara webhooks dos canais
 * conectados e purga logs antigos de envio via RPC.
 *
 * Protegido por Authorization: Bearer <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkZapiHealth, repairZapiWebhooks } from '@/lib/server/zapi/health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startedAt = Date.now()

  const { data: channels, error } = await supabase
    .from('channels')
    .select('id, restaurant_id, name')
    .eq('type', 'whatsapp_zapi')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{
    id: string
    name: string | null
    status: string
    detail?: string
    webhooks_repaired?: number
    webhooks_skipped?: string
    webhooks_error?: string
  }> = []
  let webhooksRepairedTotal = 0
  let webhooksErrorsTotal = 0

  for (const channel of channels ?? []) {
    let webhooksRepaired: number | undefined
    let webhooksSkipped: string | undefined
    let webhooksError: string | undefined

    const health = await checkZapiHealth(supabase, channel.id)
    if (health.status === 'connected') {
      const repair = await repairZapiWebhooks(supabase, channel.id)
      if (repair.ok) {
        webhooksRepaired = repair.updated
        webhooksSkipped = repair.skipped_reason
        webhooksRepairedTotal += repair.updated
      } else {
        webhooksError = repair.error
        webhooksErrorsTotal += 1
      }
    }

    results.push({
      id: channel.id,
      name: channel.name ?? null,
      status: health.status,
      detail: health.detail,
      webhooks_repaired: webhooksRepaired,
      webhooks_skipped: webhooksSkipped,
      webhooks_error: webhooksError,
    })
  }

  let purgedSendLogs = 0
  const { data: purged } = await supabase.rpc('purge_old_channel_send_logs')
  if (typeof purged === 'number') purgedSendLogs = purged

  return NextResponse.json({
    ok: true,
    checked: results.length,
    purged_send_logs: purgedSendLogs,
    webhooks_repaired: webhooksRepairedTotal,
    webhooks_errors: webhooksErrorsTotal,
    elapsed_ms: Date.now() - startedAt,
    results,
  })
}
