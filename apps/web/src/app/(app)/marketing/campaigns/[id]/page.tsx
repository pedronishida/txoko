import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Campaign, CampaignRecipient } from '@txoko/shared'
import { CampaignDetailView } from './campaign-detail-view'

export const dynamic = 'force-dynamic'

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) notFound()

  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('id, customer_id, status, channel, sent_at, delivered_at, read_at, failed_at, failure_reason, variant_index, ab_variant')
    .eq('campaign_id', id)
    .order('created_at')
    .limit(500)

  const { data: events } = await supabase
    .from('campaign_events')
    .select('id, event_type, data, created_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Load customer names for recipients
  const customerIds = [
    ...new Set((recipients ?? []).map((r) => r.customer_id as string)),
  ]
  const { data: customers } = customerIds.length > 0
    ? await supabase
        .from('customers')
        .select('id, name, phone')
        .in('id', customerIds)
    : { data: [] }

  const customerMap: Record<string, { name: string; phone: string | null }> = {}
  for (const c of customers ?? []) {
    customerMap[c.id as string] = {
      name: c.name as string,
      phone: c.phone as string | null,
    }
  }

  // Tracking de links + receita atribuida
  const [{ data: trackedLinks }, { data: revenue }] = await Promise.all([
    supabase
      .from('tracked_links')
      .select(
        'id, short_code, target_url, label, clicks_count, unique_clicks, first_click_at, last_click_at'
      )
      .eq('campaign_id', id)
      .order('clicks_count', { ascending: false })
      .limit(50),
    supabase
      .from('campaign_revenue')
      .select(
        'total_clicks, unique_clicks, tracked_links_count, orders_attributed, revenue_attributed, recipients_delivered'
      )
      .eq('campaign_id', id)
      .maybeSingle(),
  ])

  return (
    <CampaignDetailView
      campaign={campaign as unknown as Campaign}
      recipients={(recipients ?? []) as unknown as CampaignRecipient[]}
      events={(events ?? []) as Array<{
        id: string
        event_type: string
        data: Record<string, unknown>
        created_at: string
      }>}
      customerMap={customerMap}
      trackedLinks={(trackedLinks ?? []) as unknown as Array<{
        id: string
        short_code: string
        target_url: string
        label: string | null
        clicks_count: number
        unique_clicks: number
        last_click_at: string | null
      }>}
      revenue={
        (revenue ?? null) as {
          total_clicks: number
          unique_clicks: number
          recipients_delivered: number
          orders_attributed: number
          revenue_attributed: number
        } | null
      }
    />
  )
}
