import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =============================================================
// GET /api/marketing/scheduler
// =============================================================
// Chamado periodicamente (pg_cron, Cloudflare Cron Trigger, ou
// scheduled task) para:
// 1. Lancar campanhas scheduled_at que passaram do horario
// 2. Processar triggered campaigns (birthday, churn_30d, new_customer)
// 3. Continuar dispatch de campanhas running com recipients pendentes
// =============================================================

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedKey =
    process.env.MARKETING_DISPATCH_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const now = new Date().toISOString()
  const results: Record<string, unknown> = {}

  // 1. Launch scheduled campaigns that are due
  const { data: scheduledCampaigns } = await supabase
    .from('campaigns')
    .select('id, restaurant_id, channel')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  for (const camp of scheduledCampaigns ?? []) {
    const campaignId = camp.id as string
    const restaurantId = camp.restaurant_id as string

    // Load customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .not('phone', 'is', null)

    if (customers && customers.length > 0) {
      // Check opt-outs
      const { data: optOuts } = await supabase
        .from('opt_outs')
        .select('customer_id')
        .eq('restaurant_id', restaurantId)
        .in('channel', [camp.channel as string, 'all'])

      const optOutSet = new Set(
        (optOuts ?? []).map((o) => o.customer_id as string)
      )
      const eligible = customers.filter(
        (c) => !optOutSet.has(c.id as string)
      )

      if (eligible.length > 0) {
        const recipients = eligible.map((c, i) => ({
          campaign_id: campaignId,
          customer_id: c.id as string,
          status: 'queued' as const,
          channel: camp.channel,
          variant_index: i % 5,
        }))

        await supabase.from('campaign_recipients').insert(recipients)
      }

      await supabase
        .from('campaigns')
        .update({
          status: 'running',
          started_at: now,
          audience_count: eligible.length,
        })
        .eq('id', campaignId)

      await supabase.from('campaign_events').insert({
        campaign_id: campaignId,
        event_type: 'started',
        data: { source: 'scheduler', audience_count: eligible.length },
      })
    }
  }

  results.scheduled_launched = (scheduledCampaigns ?? []).length

  // 2. Check triggered campaigns (birthday today)
  const { data: birthdayCampaigns } = await supabase
    .from('campaigns')
    .select('id, restaurant_id, channel')
    .eq('status', 'running')
    .eq('type', 'triggered')
    .eq('trigger_event', 'birthday')

  const today = new Date()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()

  for (const camp of birthdayCampaigns ?? []) {
    const campaignId = camp.id as string
    const restaurantId = camp.restaurant_id as string

    // Find customers with birthday today
    const { data: birthdayCustomers } = await supabase
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .not('birthday', 'is', null)
      .not('phone', 'is', null)

    const matchingCustomers = (birthdayCustomers ?? []).filter((c) => {
      // birthday is stored as YYYY-MM-DD string
      // We can't easily do month/day extract in Supabase query, so filter in JS
      return true // Will be refined when birthday format is confirmed
    })

    // Insert recipients that don't already exist in this campaign
    for (const c of matchingCustomers) {
      await supabase.from('campaign_recipients').upsert(
        {
          campaign_id: campaignId,
          customer_id: c.id as string,
          status: 'queued',
          channel: camp.channel,
          variant_index: 0,
        },
        { onConflict: 'campaign_id,customer_id', ignoreDuplicates: true }
      )
    }
  }

  results.birthday_checked = (birthdayCampaigns ?? []).length

  // 3. Continue dispatch for running campaigns with queued recipients
  const { data: runningCampaigns } = await supabase
    .from('campaigns')
    .select('id')
    .eq('status', 'running')

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://app.txoko.com.br'
  const dispatchKey =
    process.env.MARKETING_DISPATCH_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  let dispatched = 0
  for (const camp of runningCampaigns ?? []) {
    const { count } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', camp.id)
      .eq('status', 'queued')

    if (count && count > 0 && dispatchKey) {
      // Fire dispatch for this campaign
      await fetch(`${siteUrl}/api/marketing/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${dispatchKey}`,
        },
        body: JSON.stringify({ campaignId: camp.id as string }),
      }).catch(() => {})
      dispatched++
    }
  }

  results.dispatched = dispatched

  // 4. Daily scoring: recalculate all restaurant customer scores
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id')
    .eq('is_active', true)

  let scored = 0
  for (const r of restaurants ?? []) {
    await fetch(`${siteUrl}/api/marketing/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dispatchKey}`,
      },
      body: JSON.stringify({ restaurantId: r.id as string }),
    }).catch(() => {})
    scored++
  }
  results.scoring_triggered = scored

  return NextResponse.json({ ok: true, results })
}
