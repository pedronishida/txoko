import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Customer } from '@txoko/shared'
import { ClientesView, type CustomerWithStats } from './clientes-view'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: customersRaw }, { data: ordersRaw }] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true }),
    supabase
      .from('orders')
      .select('customer_id, total, closed_at, created_at, status')
      .eq('restaurant_id', restaurantId)
      .not('customer_id', 'is', null),
  ])

  const customers = (customersRaw ?? []) as unknown as Customer[]
  type OrderAgg = {
    customer_id: string | null
    total: number
    closed_at: string | null
    created_at: string
    status: string
  }
  const orders = (ordersRaw ?? []) as unknown as OrderAgg[]

  const statsById: Record<string, { total_orders: number; total_spent: number; last_visit_at: string | null }> = {}
  for (const o of orders) {
    if (!o.customer_id) continue
    const s = (statsById[o.customer_id] ??= { total_orders: 0, total_spent: 0, last_visit_at: null })
    if (o.status !== 'cancelled') {
      s.total_orders += 1
      s.total_spent += Number(o.total)
      const visit = o.closed_at ?? o.created_at
      if (!s.last_visit_at || new Date(visit) > new Date(s.last_visit_at)) {
        s.last_visit_at = visit
      }
    }
  }

  const enriched: CustomerWithStats[] = customers.map((c) => {
    const raw = c as unknown as Record<string, unknown>
    return {
      ...c,
      total_orders: statsById[c.id]?.total_orders ?? 0,
      total_spent: statsById[c.id]?.total_spent ?? 0,
      last_visit_at: statsById[c.id]?.last_visit_at ?? null,
      engagement_score: typeof raw.engagement_score === 'number' ? raw.engagement_score : undefined,
      churn_risk: typeof raw.churn_risk === 'number' ? raw.churn_risk : undefined,
      optimal_send_hour: raw.optimal_send_hour != null ? Number(raw.optimal_send_hour) : null,
      spending_trend: typeof raw.spending_trend === 'number' ? Number(raw.spending_trend) : undefined,
    }
  })

  return <ClientesView customers={enriched} />
}
