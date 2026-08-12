import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { computeRoas, estimateCosts } from './roi-cost'
import {
  RoiDashboardView,
  type RoiCampaignRow,
  type RoiChannelBreakdown,
  type RoiRecentOrder,
  type RoiSourceRow,
} from './roi-dashboard-view'

export const dynamic = 'force-dynamic'

const PERIOD_OPTIONS = [7, 30, 90]

export default async function RoiPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const requested = typeof params.period === 'string' ? Number(params.period) : 30
  const periodDays = PERIOD_OPTIONS.includes(requested) ? requested : 30

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const since = new Date(Date.now() - 24 * periodDays * 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  const [campaignsRes, clickEventsRes, trackedLinksRes, funnelRes, draftsRes, ordersRes] =
    await Promise.all([
      supabase
        .from('campaigns')
        .select(
          'id, name, channel, status, stats_total, stats_sent, stats_delivered, stats_read, stats_failed, created_at'
        )
        .eq('restaurant_id', restaurantId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('campaign_events')
        .select('campaign_id, event_type, created_at, campaigns!inner(restaurant_id)')
        .eq('campaigns.restaurant_id', restaurantId)
        .eq('event_type', 'link_click')
        .gte('created_at', sinceIso),
      supabase
        .from('tracked_links')
        .select('id, clicks_count, unique_clicks, source, campaign_id')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', sinceIso),
      supabase
        .from('menu_funnel')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .gte('day', since.toISOString().slice(0, 10)),
      supabase
        .from('order_drafts')
        .select('id, status, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', sinceIso),
      supabase
        .from('orders')
        .select(
          'id, total, status, source, attributed_recipient_id, menu_session_id, customer_id, created_at, customer:customers(name)'
        )
        .eq('restaurant_id', restaurantId)
        .neq('status', 'cancelled')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(500),
    ])

  const campaigns = campaignsRes.data ?? []
  const clickEvents = clickEventsRes.data ?? []
  const trackedLinks = trackedLinksRes.data ?? []
  const funnel = funnelRes.data ?? []
  const drafts = draftsRes.data ?? []
  const orders = ordersRes.data ?? []

  const channels: Record<string, RoiChannelBreakdown> = {
    whatsapp: {
      channel: 'whatsapp',
      recipients_sent: 0,
      recipients_delivered: 0,
      link_clicks: 0,
      unique_clicks: 0,
      cost_brl: 0,
      campaigns_count: 0,
    },
    email: {
      channel: 'email',
      recipients_sent: 0,
      recipients_delivered: 0,
      link_clicks: 0,
      unique_clicks: 0,
      cost_brl: 0,
      campaigns_count: 0,
    },
    sms: {
      channel: 'sms',
      recipients_sent: 0,
      recipients_delivered: 0,
      link_clicks: 0,
      unique_clicks: 0,
      cost_brl: 0,
      campaigns_count: 0,
    },
  }
  const campaignChannel = new Map<string, string>()
  for (const campaign of campaigns) {
    campaignChannel.set(campaign.id, campaign.channel)
    const channel = campaign.channel
    if (channels[channel]) {
      channels[channel].campaigns_count += 1
      channels[channel].recipients_sent += Number(campaign.stats_sent ?? 0)
      channels[channel].recipients_delivered += Number(campaign.stats_delivered ?? 0)
    }
  }
  for (const link of trackedLinks) {
    if (!link.campaign_id) continue
    const channel = campaignChannel.get(link.campaign_id)
    if (channel && channels[channel]) {
      channels[channel].link_clicks += Number(link.clicks_count ?? 0)
      channels[channel].unique_clicks += Number(link.unique_clicks ?? 0)
    }
  }

  const campaignIds = campaigns.map((campaign) => campaign.id)
  const campaignRows: RoiCampaignRow[] = (
    (campaignIds.length > 0
      ? await supabase
          .from('campaign_revenue')
          .select(
            'campaign_id, name, channel, recipients_delivered, unique_clicks, orders_attributed, revenue_attributed'
          )
          .in('campaign_id', campaignIds)
      : { data: [] }
    ).data ?? []
  )
    .map((row) => ({
      id: row.campaign_id,
      name: row.name ?? '—',
      channel: row.channel ?? '',
      status: campaigns.find((campaign) => campaign.id === row.campaign_id)?.status ?? '',
      recipients_delivered: Number(row.recipients_delivered ?? 0),
      unique_clicks: Number(row.unique_clicks ?? 0),
      orders_attributed: Number(row.orders_attributed ?? 0),
      revenue_attributed: Number(row.revenue_attributed ?? 0),
    }))
    .sort((a, b) => b.revenue_attributed - a.revenue_attributed)

  const bySource = new Map<
    string,
    {
      source: string
      sessions: number
      with_pageview: number
      with_cart: number
      with_checkout: number
      with_submit: number
      abandoned: number
      revenue_cents: number
    }
  >()
  for (const row of funnel) {
    const source = row.source
    const existing = bySource.get(source)
    const next = existing
      ? {
          source,
          sessions: existing.sessions + Number(row.sessions ?? 0),
          with_pageview: existing.with_pageview + Number(row.with_pageview ?? 0),
          with_cart: existing.with_cart + Number(row.with_cart ?? 0),
          with_checkout: existing.with_checkout + Number(row.with_checkout ?? 0),
          with_submit: existing.with_submit + Number(row.with_submit ?? 0),
          abandoned: existing.abandoned + Number(row.abandoned ?? 0),
          revenue_cents: existing.revenue_cents + Number(row.revenue_cents ?? 0),
        }
      : {
          source,
          sessions: Number(row.sessions ?? 0),
          with_pageview: Number(row.with_pageview ?? 0),
          with_cart: Number(row.with_cart ?? 0),
          with_checkout: Number(row.with_checkout ?? 0),
          with_submit: Number(row.with_submit ?? 0),
          abandoned: Number(row.abandoned ?? 0),
          revenue_cents: Number(row.revenue_cents ?? 0),
        }
    bySource.set(source, next)
  }

  const sourceRows: RoiSourceRow[] = Array.from(bySource.values())
    .map((row) => ({
      source: row.source,
      sessions: row.sessions,
      with_cart: row.with_cart,
      submitted: row.with_submit,
      abandoned: row.abandoned,
      revenue_brl: row.revenue_cents / 100,
    }))
    .sort((a, b) => b.revenue_brl - a.revenue_brl)

  const menuTotals = sourceRows.reduce(
    (acc, row) => ({
      sessions: acc.sessions + row.sessions,
      with_cart: acc.with_cart + row.with_cart,
      submitted: acc.submitted + row.submitted,
      abandoned: acc.abandoned + row.abandoned,
      revenue: acc.revenue + row.revenue_brl,
    }),
    { sessions: 0, with_cart: 0, submitted: 0, abandoned: 0, revenue: 0 }
  )

  const draftStatusCounts = drafts.reduce<Record<string, number>>((acc, draft) => {
    const status = draft.status
    acc[status] = (acc[status] ?? 0) + 1
    return acc
  }, {})

  const aiOrders = orders.filter((order) => order.source === 'ai_agent')
  const revenueAiAgent = aiOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0)

  let revenueAttributed = 0
  let ordersAttributed = 0
  let revenueCampaign = 0
  let revenueMenuSession = 0
  for (const order of orders) {
    const total = Number(order.total ?? 0)
    if (order.source === 'ai_agent') {
      ordersAttributed += 1
      revenueAttributed += total
      continue
    }
    if (order.attributed_recipient_id) {
      revenueCampaign += total
      revenueAttributed += total
      ordersAttributed += 1
      continue
    }
    if (order.menu_session_id) {
      revenueMenuSession += total
      revenueAttributed += total
      ordersAttributed += 1
      continue
    }
  }

  const costs = estimateCosts({
    recipientsSentWhatsapp: channels.whatsapp.recipients_sent,
    recipientsSentEmail: channels.email.recipients_sent,
    recipientsSentSms: channels.sms.recipients_sent,
    chatRepliesHaiku: 0,
    agentOrdersConfirmed: aiOrders.length,
    agentDraftsInflight: (draftStatusCounts.building ?? 0) + (draftStatusCounts.cancelled ?? 0),
    zapiSubscriptionMonthly: 197,
    daysInPeriod: periodDays,
  })
  channels.whatsapp.cost_brl = costs.whatsapp + costs.zapi_subscription
  channels.email.cost_brl = costs.email
  channels.sms.cost_brl = costs.sms

  const roas = computeRoas(revenueAttributed, costs.total)

  const recentOrders: RoiRecentOrder[] = orders
    .filter(
      (order) =>
        order.source === 'ai_agent' || order.attributed_recipient_id || order.menu_session_id
    )
    .slice(0, 30)
    .map((order) => {
      let origin: RoiRecentOrder['origin']
      let originLabel: string
      const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer
      if (order.source === 'ai_agent') {
        origin = 'ai_agent'
        originLabel = 'Agente IA'
      } else if (order.attributed_recipient_id) {
        origin = 'campaign'
        originLabel = 'Campanha'
      } else if (order.menu_session_id) {
        origin = 'menu_session'
        originLabel = 'Cardapio'
      } else {
        origin = 'other'
        originLabel = 'Outro'
      }
      return {
        id: order.id,
        total: Number(order.total ?? 0),
        source: order.source ?? '—',
        origin,
        origin_label: originLabel,
        customer_name: customer?.name ?? null,
        created_at: order.created_at,
      }
    })

  const linkClicks = clickEvents.length
  const totalSent =
    channels.whatsapp.recipients_sent +
    channels.email.recipients_sent +
    channels.sms.recipients_sent
  const totalDelivered =
    channels.whatsapp.recipients_delivered +
    channels.email.recipients_delivered +
    channels.sms.recipients_delivered

  return (
    <RoiDashboardView
      periodDays={periodDays}
      summary={{
        revenue_attributed: revenueAttributed,
        orders_attributed: ordersAttributed,
        revenue_ai_agent: revenueAiAgent,
        revenue_campaign: revenueCampaign,
        revenue_menu_session: revenueMenuSession,
        cost_total: costs.total,
        cost_breakdown: costs,
        roas,
        recipients_sent: totalSent,
        recipients_delivered: totalDelivered,
        link_clicks: linkClicks,
        menu_sessions: menuTotals.sessions,
        menu_with_cart: menuTotals.with_cart,
        menu_submitted: menuTotals.submitted,
        menu_abandoned: menuTotals.abandoned,
        ai_drafts_total: drafts.length,
        ai_drafts_confirmed: draftStatusCounts.confirmed ?? 0,
        ai_drafts_cancelled: draftStatusCounts.cancelled ?? 0,
        ai_drafts_building: draftStatusCounts.building ?? 0,
        ai_drafts_expired: draftStatusCounts.expired ?? 0,
      }}
      channelBreakdown={Object.values(channels)}
      campaignRows={campaignRows.slice(0, 10)}
      sourceRows={sourceRows}
      recentOrders={recentOrders}
    />
  )
}
