import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ClientesInsightsView, type CustomerInsight } from './insights-view'

export const dynamic = 'force-dynamic'

export default async function ClientesInsightsPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: metrics } = await supabase
    .from('customer_metrics')
    .select('customer_id, total_orders, total_spent, last_visit_at, churn_risk, engagement_score')
    .eq('restaurant_id', restaurantId)

  const customerIds = (metrics ?? []).map((metric) => metric.customer_id)
  const { data: customers } =
    customerIds.length > 0
      ? await supabase.from('customers').select('id, name, phone, email').in('id', customerIds)
      : { data: [] }

  const customerInfo: Record<
    string,
    { name: string | null; phone: string | null; email: string | null }
  > = {}
  for (const customer of customers ?? []) {
    customerInfo[customer.id] = {
      name: customer.name ?? null,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
    }
  }

  const insights: CustomerInsight[] = (metrics ?? []).map((metric) => {
    const customerId = metric.customer_id
    const info = customerInfo[customerId]
    return {
      customer_id: customerId,
      name: info?.name ?? null,
      phone: info?.phone ?? null,
      email: info?.email ?? null,
      total_orders: Number(metric.total_orders ?? 0),
      total_spent: Number(metric.total_spent ?? 0),
      last_visit_at: metric.last_visit_at ?? null,
      churn_risk: Number(metric.churn_risk ?? 0),
      engagement_score: Number(metric.engagement_score ?? 0),
    }
  })

  return <ClientesInsightsView insights={insights} />
}
