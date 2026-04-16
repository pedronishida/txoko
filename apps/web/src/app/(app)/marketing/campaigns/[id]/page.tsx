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
    />
  )
}
