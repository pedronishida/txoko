import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Marketing — Customer Scoring Engine
// =============================================================
// Calcula 3 scores por customer:
// 1. Engagement Score (0-100): baseado em campanhas recebidas/lidas
// 2. Churn Risk (0-100): probabilidade de nao voltar ao restaurante
// 3. Optimal Send Hour (0-23): hora que o cliente mais le mensagens
// =============================================================

type CustomerData = {
  id: string
  loyalty_points: number
  created_at: string
  birthday: string | null
}

type OrderAgg = {
  total_orders: number
  total_spent: number
  last_visit_at: string | null
  avg_ticket: number
  months_active: number
  recent_orders_30d: number
  recent_spent_30d: number
  prev_spent_30d: number
}

type CampaignAgg = {
  campaigns_received: number
  campaigns_delivered: number
  campaigns_read: number
}

// =============================================================
// Engagement Score (0-100)
// =============================================================
// Fatores:
//   30pts — taxa de leitura de campanhas (read/delivered)
//   25pts — frequencia de visitas (orders/month)
//   20pts — loyalty points (normalizado)
//   15pts — recencia (dias desde ultima visita, invertido)
//   10pts — gasto total (normalizado)
// =============================================================
function calculateEngagement(
  orders: OrderAgg,
  campaigns: CampaignAgg,
  customer: CustomerData
): number {
  let score = 0

  // Campaign read rate (30pts)
  if (campaigns.campaigns_delivered > 0) {
    const readRate = campaigns.campaigns_read / campaigns.campaigns_delivered
    score += Math.round(readRate * 30)
  } else {
    score += 15 // neutral if never received campaign
  }

  // Visit frequency (25pts) — orders per month
  if (orders.months_active > 0 && orders.total_orders > 0) {
    const ordersPerMonth = orders.total_orders / Math.max(1, orders.months_active)
    // 4+ orders/month = max, 0 = min
    score += Math.min(25, Math.round((ordersPerMonth / 4) * 25))
  }

  // Loyalty points (20pts)
  const loyaltyNorm = Math.min(1, customer.loyalty_points / 500)
  score += Math.round(loyaltyNorm * 20)

  // Recency (15pts) — days since last visit, inverted
  if (orders.last_visit_at) {
    const daysSince = Math.floor(
      (Date.now() - new Date(orders.last_visit_at).getTime()) / 86400000
    )
    // 0 days = 15pts, 30 days = 7pts, 90+ days = 0pts
    score += Math.max(0, Math.round(15 * (1 - daysSince / 90)))
  }

  // Total spent (10pts)
  const spentNorm = Math.min(1, orders.total_spent / 2000)
  score += Math.round(spentNorm * 10)

  return Math.max(0, Math.min(100, score))
}

// =============================================================
// Churn Risk (0-100)
// =============================================================
// Fatores:
//   40pts — dias desde ultima visita (mais dias = mais risco)
//   25pts — tendencia de gasto (negativa = mais risco)
//   20pts — frequencia declinante (menos orders recentes)
//   15pts — engagement baixo
// =============================================================
function calculateChurnRisk(
  orders: OrderAgg,
  engagement: number
): number {
  let risk = 0

  // Days since last visit (40pts)
  if (orders.last_visit_at) {
    const daysSince = Math.floor(
      (Date.now() - new Date(orders.last_visit_at).getTime()) / 86400000
    )
    // 0 days = 0 risk, 30 days = 20, 60 days = 30, 90+ = 40
    risk += Math.min(40, Math.round((daysSince / 90) * 40))
  } else {
    risk += 20 // unknown = medium risk
  }

  // Spending trend (25pts)
  if (orders.prev_spent_30d > 0) {
    const trend =
      (orders.recent_spent_30d - orders.prev_spent_30d) / orders.prev_spent_30d
    // Negative trend = higher risk
    if (trend < -0.5) risk += 25
    else if (trend < -0.2) risk += 15
    else if (trend < 0) risk += 8
    // Positive trend = lower risk (no addition)
  }

  // Declining frequency (20pts)
  if (orders.total_orders > 3) {
    const expectedMonthly = orders.total_orders / Math.max(1, orders.months_active)
    const recentMonthly = orders.recent_orders_30d
    if (recentMonthly < expectedMonthly * 0.3) risk += 20
    else if (recentMonthly < expectedMonthly * 0.6) risk += 10
  }

  // Low engagement (15pts)
  if (engagement < 20) risk += 15
  else if (engagement < 40) risk += 8

  return Math.max(0, Math.min(100, risk))
}

// =============================================================
// Optimal Send Hour (0-23)
// =============================================================
// Baseado no horario que o cliente leu mais campanhas.
// Fallback: hora das ultimas visitas (orders).
// =============================================================
async function calculateOptimalHour(
  supabase: SupabaseClient,
  customerId: string,
  restaurantId: string
): Promise<number | null> {
  // Check campaign read times
  const { data: reads } = await supabase
    .from('campaign_recipients')
    .select('read_at')
    .eq('customer_id', customerId)
    .not('read_at', 'is', null)
    .limit(50)

  if (reads && reads.length >= 3) {
    const hours: Record<number, number> = {}
    for (const r of reads) {
      const h = new Date(r.read_at as string).getHours()
      hours[h] = (hours[h] ?? 0) + 1
    }
    const best = Object.entries(hours).sort((a, b) => b[1] - a[1])[0]
    if (best) return Number(best[0])
  }

  // Fallback: order creation times
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (orders && orders.length >= 3) {
    const hours: Record<number, number> = {}
    for (const o of orders) {
      const h = new Date(o.created_at as string).getHours()
      hours[h] = (hours[h] ?? 0) + 1
    }
    const best = Object.entries(hours).sort((a, b) => b[1] - a[1])[0]
    if (best) return Number(best[0])
  }

  return null
}

// =============================================================
// Main: Score all customers of a restaurant
// =============================================================
export async function scoreAllCustomers(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<{ scored: number; errors: number }> {
  const { data: customers } = await supabase
    .from('customers')
    .select('id, loyalty_points, created_at, birthday')
    .eq('restaurant_id', restaurantId)

  if (!customers || customers.length === 0) return { scored: 0, errors: 0 }

  // Load all orders for aggregation
  const { data: allOrders } = await supabase
    .from('orders')
    .select('customer_id, total, created_at, status')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'cancelled')

  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 86400000
  const sixtyDaysAgo = now - 60 * 86400000

  // Aggregate orders by customer
  const orderAggs: Record<string, OrderAgg> = {}
  for (const c of customers) {
    const cid = c.id as string
    const cOrders = (allOrders ?? []).filter((o) => o.customer_id === cid)
    const total = cOrders.reduce((s, o) => s + Number(o.total), 0)
    const sorted = cOrders.sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    )
    const firstOrder = sorted[sorted.length - 1]
    const monthsActive = firstOrder
      ? Math.max(
          1,
          Math.ceil(
            (now - new Date(firstOrder.created_at as string).getTime()) /
              (30 * 86400000)
          )
        )
      : 0

    const recent30d = cOrders.filter(
      (o) => new Date(o.created_at as string).getTime() >= thirtyDaysAgo
    )
    const prev30d = cOrders.filter((o) => {
      const t = new Date(o.created_at as string).getTime()
      return t >= sixtyDaysAgo && t < thirtyDaysAgo
    })

    orderAggs[cid] = {
      total_orders: cOrders.length,
      total_spent: total,
      last_visit_at: sorted[0]
        ? (sorted[0].created_at as string)
        : null,
      avg_ticket: cOrders.length > 0 ? total / cOrders.length : 0,
      months_active: monthsActive,
      recent_orders_30d: recent30d.length,
      recent_spent_30d: recent30d.reduce((s, o) => s + Number(o.total), 0),
      prev_spent_30d: prev30d.reduce((s, o) => s + Number(o.total), 0),
    }
  }

  // Load campaign recipient stats by customer
  const { data: campRecips } = await supabase
    .from('campaign_recipients')
    .select('customer_id, status')
    .in(
      'customer_id',
      customers.map((c) => c.id as string)
    )

  const campAggs: Record<string, CampaignAgg> = {}
  for (const r of campRecips ?? []) {
    const cid = r.customer_id as string
    const agg = (campAggs[cid] ??= {
      campaigns_received: 0,
      campaigns_delivered: 0,
      campaigns_read: 0,
    })
    agg.campaigns_received++
    if (['delivered', 'read'].includes(r.status as string))
      agg.campaigns_delivered++
    if (r.status === 'read') agg.campaigns_read++
  }

  let scored = 0
  let errors = 0
  const nowIso = new Date().toISOString()

  for (const c of customers) {
    const cid = c.id as string
    const orders = orderAggs[cid] ?? {
      total_orders: 0,
      total_spent: 0,
      last_visit_at: null,
      avg_ticket: 0,
      months_active: 0,
      recent_orders_30d: 0,
      recent_spent_30d: 0,
      prev_spent_30d: 0,
    }
    const camps = campAggs[cid] ?? {
      campaigns_received: 0,
      campaigns_delivered: 0,
      campaigns_read: 0,
    }

    try {
      const engagement = calculateEngagement(orders, camps, c as CustomerData)
      const churnRisk = calculateChurnRisk(orders, engagement)
      const optimalHour = await calculateOptimalHour(supabase, cid, restaurantId)

      const spendingTrend =
        orders.prev_spent_30d > 0
          ? ((orders.recent_spent_30d - orders.prev_spent_30d) /
              orders.prev_spent_30d) *
            100
          : 0

      await supabase
        .from('customers')
        .update({
          engagement_score: engagement,
          engagement_updated_at: nowIso,
          churn_risk: churnRisk,
          churn_updated_at: nowIso,
          optimal_send_hour: optimalHour,
          optimal_send_updated_at: nowIso,
          spending_trend: Math.round(spendingTrend * 100) / 100,
        })
        .eq('id', cid)

      scored++
    } catch {
      errors++
    }
  }

  return { scored, errors }
}

/**
 * Score a single customer (usado em triggers).
 */
export async function scoreCustomer(
  supabase: SupabaseClient,
  customerId: string,
  restaurantId: string
): Promise<{ engagement: number; churnRisk: number; optimalHour: number | null }> {
  // Simplified version for single customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, loyalty_points, created_at, birthday')
    .eq('id', customerId)
    .maybeSingle()

  if (!customer) return { engagement: 0, churnRisk: 50, optimalHour: null }

  const { data: orders } = await supabase
    .from('orders')
    .select('total, created_at, status')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .neq('status', 'cancelled')

  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 86400000
  const sixtyDaysAgo = now - 60 * 86400000
  const cOrders = orders ?? []
  const sorted = [...cOrders].sort(
    (a, b) =>
      new Date(b.created_at as string).getTime() -
      new Date(a.created_at as string).getTime()
  )

  const recent30d = cOrders.filter(
    (o) => new Date(o.created_at as string).getTime() >= thirtyDaysAgo
  )
  const prev30d = cOrders.filter((o) => {
    const t = new Date(o.created_at as string).getTime()
    return t >= sixtyDaysAgo && t < thirtyDaysAgo
  })

  const orderAgg: OrderAgg = {
    total_orders: cOrders.length,
    total_spent: cOrders.reduce((s, o) => s + Number(o.total), 0),
    last_visit_at: sorted[0] ? (sorted[0].created_at as string) : null,
    avg_ticket:
      cOrders.length > 0
        ? cOrders.reduce((s, o) => s + Number(o.total), 0) / cOrders.length
        : 0,
    months_active: sorted.length > 0
      ? Math.max(
          1,
          Math.ceil(
            (now -
              new Date(sorted[sorted.length - 1]!.created_at as string).getTime()) /
              (30 * 86400000)
          )
        )
      : 0,
    recent_orders_30d: recent30d.length,
    recent_spent_30d: recent30d.reduce((s, o) => s + Number(o.total), 0),
    prev_spent_30d: prev30d.reduce((s, o) => s + Number(o.total), 0),
  }

  const { data: campRecips } = await supabase
    .from('campaign_recipients')
    .select('status')
    .eq('customer_id', customerId)

  const campAgg: CampaignAgg = {
    campaigns_received: (campRecips ?? []).length,
    campaigns_delivered: (campRecips ?? []).filter((r) =>
      ['delivered', 'read'].includes(r.status as string)
    ).length,
    campaigns_read: (campRecips ?? []).filter((r) => r.status === 'read')
      .length,
  }

  const engagement = calculateEngagement(orderAgg, campAgg, customer as CustomerData)
  const churnRisk = calculateChurnRisk(orderAgg, engagement)
  const optimalHour = await calculateOptimalHour(supabase, customerId, restaurantId)

  const spendingTrend =
    orderAgg.prev_spent_30d > 0
      ? ((orderAgg.recent_spent_30d - orderAgg.prev_spent_30d) /
          orderAgg.prev_spent_30d) *
        100
      : 0

  await supabase
    .from('customers')
    .update({
      engagement_score: engagement,
      engagement_updated_at: new Date().toISOString(),
      churn_risk: churnRisk,
      churn_updated_at: new Date().toISOString(),
      optimal_send_hour: optimalHour,
      optimal_send_updated_at: new Date().toISOString(),
      spending_trend: Math.round(spendingTrend * 100) / 100,
    })
    .eq('id', customerId)

  return { engagement, churnRisk, optimalHour }
}
