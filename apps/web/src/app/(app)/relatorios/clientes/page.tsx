import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ClientesRelatorioView } from './clientes-relatorio-view'

export const dynamic = 'force-dynamic'

export type RFMCustomer = {
  id: string
  name: string
  phone: string | null
  email: string | null
  recencyDays: number
  frequency: number
  monetary: number
  segment: 'champion' | 'loyal' | 'at_risk' | 'lost' | 'new'
  lastVisit: string | null
}

function rfmSegment(recencyDays: number, frequency: number, monetary: number): RFMCustomer['segment'] {
  if (recencyDays <= 14 && frequency >= 5 && monetary >= 200) return 'champion'
  if (recencyDays <= 30 && frequency >= 3) return 'loyal'
  if (recencyDays > 30 && recencyDays <= 60 && frequency >= 2) return 'at_risk'
  if (recencyDays > 60) return 'lost'
  return 'new'
}

export default async function RelatoriosClientesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10) // last 3 months for RFM
  const toDate = now.toISOString().slice(0, 10)
  const fromISO = `${fromDate}T00:00:00`

  const [{ data: customersRaw }, { data: ordersRaw }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone, email, created_at')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('orders')
      .select('id, customer_id, total, created_at, closed_at, status')
      .eq('restaurant_id', restaurantId)
      .not('customer_id', 'is', null)
      .neq('status', 'cancelled')
      .gte('created_at', fromISO),
  ])

  type CustRow = { id: string; name: string; phone: string | null; email: string | null; created_at: string }
  type OrdRow = { id: string; customer_id: string | null; total: number; created_at: string; closed_at: string | null; status: string }

  const customers = (customersRaw ?? []) as CustRow[]
  const orders = (ordersRaw ?? []) as OrdRow[]

  // Aggregate per customer
  const statsById: Record<string, { total: number; count: number; lastVisit: string | null }> = {}
  for (const o of orders) {
    if (!o.customer_id) continue
    const s = (statsById[o.customer_id] ??= { total: 0, count: 0, lastVisit: null })
    s.total += Number(o.total)
    s.count += 1
    const visit = o.closed_at ?? o.created_at
    if (!s.lastVisit || new Date(visit) > new Date(s.lastVisit)) {
      s.lastVisit = visit
    }
  }

  const rfmCustomers: RFMCustomer[] = customers
    .filter((c) => statsById[c.id])
    .map((c) => {
      const s = statsById[c.id]!
      const recencyDays = s.lastVisit
        ? Math.floor((now.getTime() - new Date(s.lastVisit).getTime()) / 86400000)
        : 999
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        recencyDays,
        frequency: s.count,
        monetary: s.total,
        segment: rfmSegment(recencyDays, s.count, s.total),
        lastVisit: s.lastVisit,
      }
    })

  // New customers: registered in last 30 days
  const last30 = new Date(now)
  last30.setDate(last30.getDate() - 30)
  const newCustomersCount = customers.filter((c) => new Date(c.created_at) >= last30).length

  // Churn: customers with no orders in last 30/60/90 days
  const churn30 = rfmCustomers.filter((c) => c.recencyDays > 30).length
  const churn60 = rfmCustomers.filter((c) => c.recencyDays > 60).length
  const churn90 = rfmCustomers.filter((c) => c.recencyDays > 90).length

  // Segment counts
  const segments = rfmCustomers.reduce<Record<string, number>>((acc, c) => {
    acc[c.segment] = (acc[c.segment] ?? 0) + 1
    return acc
  }, {})

  // Top 20 by monetary
  const top20 = [...rfmCustomers].sort((a, b) => b.monetary - a.monetary).slice(0, 20)

  // LTV distribution buckets
  const ltvBuckets = [0, 50, 100, 200, 500, 1000, 2000, Infinity]
  const ltvDist = ltvBuckets.slice(0, -1).map((lo, i) => {
    const hi = ltvBuckets[i + 1]!
    return {
      label: hi === Infinity ? `R$${lo}+` : `R$${lo}–${hi}`,
      count: rfmCustomers.filter((c) => c.monetary >= lo && c.monetary < hi).length,
    }
  })

  // New customers over time (monthly for last 6 months)
  const monthlyNew: Record<string, number> = {}
  for (const c of customers) {
    const month = c.created_at.slice(0, 7)
    monthlyNew[month] = (monthlyNew[month] ?? 0) + 1
  }
  const monthlyNewSeries = Object.entries(monthlyNew)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, count]) => ({
      label: new Date(month + '-15').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      value: count,
    }))

  return (
    <ClientesRelatorioView
      rfmCustomers={rfmCustomers}
      segments={segments}
      top20={top20}
      ltvDist={ltvDist}
      churn30={rfmCustomers.length > 0 ? (churn30 / rfmCustomers.length) * 100 : 0}
      churn60={rfmCustomers.length > 0 ? (churn60 / rfmCustomers.length) * 100 : 0}
      churn90={rfmCustomers.length > 0 ? (churn90 / rfmCustomers.length) * 100 : 0}
      newCustomersCount={newCustomersCount}
      monthlyNewSeries={monthlyNewSeries}
      totalCustomers={rfmCustomers.length}
    />
  )
}
