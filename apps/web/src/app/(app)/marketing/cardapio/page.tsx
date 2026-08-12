import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import {
  CardapioFunnelView,
  type MenuFunnelRow,
  type MenuSessionRow,
} from './cardapio-funnel-view'

export const dynamic = 'force-dynamic'

export default async function CardapioFunnelPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const funnelSince = new Date()
  funnelSince.setDate(funnelSince.getDate() - 14)

  const { data: funnel } = await supabase
    .from('menu_funnel')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .gte('day', funnelSince.toISOString().slice(0, 10))
    .order('day', { ascending: false })

  const sessionsSince = new Date()
  sessionsSince.setDate(sessionsSince.getDate() - 7)

  const { data: sessions } = await supabase
    .from('menu_sessions')
    .select(
      'id, client_session_id, started_at, last_seen_at, source, cart_items_count, cart_total_cents, device_type, abandoned_at, alert_sent_at, submitted_at, order_id, customer_id'
    )
    .eq('restaurant_id', restaurantId)
    .gte('started_at', sessionsSince.toISOString())
    .order('started_at', { ascending: false })
    .limit(50)

  const customerIds = Array.from(
    new Set((sessions ?? []).map((s) => s.customer_id).filter((id) => id !== null))
  )
  const { data: customers } =
    customerIds.length > 0
      ? await supabase.from('customers').select('id, name').in('id', customerIds)
      : { data: [] }

  const customerNames: Record<string, string | null> = {}
  for (const customer of customers ?? []) customerNames[customer.id] = customer.name

  const sessionRows: MenuSessionRow[] = (sessions ?? []).map((s) => ({
    id: s.id,
    client_session_id: s.client_session_id,
    started_at: s.started_at,
    last_seen_at: s.last_seen_at,
    source: s.source,
    cart_items_count: s.cart_items_count,
    cart_total_cents: s.cart_total_cents,
    device_type: s.device_type,
    abandoned_at: s.abandoned_at,
    alert_sent_at: s.alert_sent_at,
    submitted_at: s.submitted_at,
    order_id: s.order_id,
    customer_id: s.customer_id,
    customer_name: s.customer_id ? customerNames[s.customer_id] ?? null : null,
  }))

  return (
    <CardapioFunnelView
      funnel={(funnel ?? []) as unknown as MenuFunnelRow[]}
      sessions={sessionRows}
    />
  )
}
