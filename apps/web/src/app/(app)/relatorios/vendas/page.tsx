import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { VendasRelatorioView } from './vendas-relatorio-view'

export const dynamic = 'force-dynamic'

export default async function RelatoriosVendasPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const toDate = now.toISOString().slice(0, 10)
  const fromISO = `${fromDate}T00:00:00`
  const toISO = `${toDate}T23:59:59`

  const [{ data: ordersRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total, created_at, status, source, type')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'cancelled')
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
    supabase
      .from('payments')
      .select('method, amount, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'approved')
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
  ])

  type OrderRow = { id: string; total: number; created_at: string; status: string; source?: string | null; type?: string | null }
  type PayRow = { method: string; amount: number; created_at: string }

  const orders = (ordersRaw ?? []) as OrderRow[]
  const payments = (paymentsRaw ?? []) as PayRow[]

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const orderCount = orders.length
  const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0

  // Daily series
  const dayMap: Record<string, { revenue: number; count: number }> = {}
  for (const o of orders) {
    const day = o.created_at.slice(0, 10)
    const b = (dayMap[day] ??= { revenue: 0, count: 0 })
    b.revenue += Number(o.total)
    b.count += 1
  }
  const dailySeries = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      revenue: vals.revenue,
      count: vals.count,
    }))

  // Heatmap: weekday (0=Mon..6=Sun) × hour (0-23)
  const heatmapData: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const o of orders) {
    const d = new Date(o.created_at)
    const dow = (d.getDay() + 6) % 7 // Mon=0
    const hour = d.getHours()
    heatmapData[dow]![hour]! += Number(o.total)
  }
  const DOW_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
  const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i % 3 === 0 ? String(i).padStart(2, '0') : '')

  // By type / source
  const byType: Record<string, number> = {}
  for (const o of orders) {
    const t = o.type ?? o.source ?? 'other'
    byType[t] = (byType[t] ?? 0) + Number(o.total)
  }

  // By payment method
  const byMethod: Record<string, number> = {}
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount)
  }

  // Top 10 days by revenue
  const topDays = dailySeries.sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  return (
    <VendasRelatorioView
      totalRevenue={totalRevenue}
      orderCount={orderCount}
      avgTicket={avgTicket}
      dailySeries={dailySeries.sort((a, b) => a.date.localeCompare(b.date))}
      heatmapData={heatmapData}
      heatmapRowLabels={DOW_LABELS}
      heatmapColLabels={HOUR_LABELS}
      byType={byType}
      byMethod={byMethod}
      topDays={topDays}
      defaultFrom={fromDate}
      defaultTo={toDate}
    />
  )
}
