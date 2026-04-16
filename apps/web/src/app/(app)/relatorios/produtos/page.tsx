import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ProdutosRelatorioView } from './produtos-relatorio-view'

export const dynamic = 'force-dynamic'

export type ProductABC = {
  id: string
  name: string
  category: string
  qty: number
  revenue: number
  cost: number
  cmv: number
  margin: number
  marginPct: number
  classBadge: 'A' | 'B' | 'C'
  cumulativePct: number
}

export default async function RelatoriosProdutosPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const toDate = now.toISOString().slice(0, 10)
  const fromISO = `${fromDate}T00:00:00`
  const toISO = `${toDate}T23:59:59`

  const [{ data: itemsRaw }, { data: productsRaw }] = await Promise.all([
    supabase
      .from('order_items')
      .select('product_id, quantity, total_price, order:orders!inner(restaurant_id, status, created_at)')
      .eq('order.restaurant_id', restaurantId)
      .neq('order.status', 'cancelled')
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
    supabase
      .from('products')
      .select('id, name, cost, category, price')
      .eq('restaurant_id', restaurantId),
  ])

  type ItemRow = { product_id: string; quantity: number; total_price: number }
  type ProdRow = { id: string; name: string; cost: number | null; category: string | null; price: number | null }

  const items = (itemsRaw ?? []) as ItemRow[]
  const products = (productsRaw ?? []) as ProdRow[]

  const productById = new Map(products.map((p) => [p.id, p]))

  // Aggregate sales
  const byProduct: Record<string, { qty: number; revenue: number }> = {}
  for (const it of items) {
    const agg = (byProduct[it.product_id] ??= { qty: 0, revenue: 0 })
    agg.qty += it.quantity
    agg.revenue += Number(it.total_price)
  }

  // Total revenue for ABC classification
  const totalRevenue = Object.values(byProduct).reduce((s, v) => s + v.revenue, 0)

  // Build rows sorted by revenue desc
  const sorted = Object.entries(byProduct)
    .map(([id, v]) => {
      const prod = productById.get(id)
      const cost = prod?.cost != null ? Number(prod.cost) : 0
      const cmv = cost * v.qty
      const margin = v.revenue - cmv
      const marginPct = v.revenue > 0 ? (margin / v.revenue) * 100 : 0
      return {
        id,
        name: prod?.name ?? 'Produto removido',
        category: prod?.category ?? '-',
        qty: v.qty,
        revenue: v.revenue,
        cost,
        cmv,
        margin,
        marginPct,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  // ABC classification
  let cumulative = 0
  const abcRows: ProductABC[] = sorted.map((row) => {
    cumulative += row.revenue
    const cumulativePct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0
    const pct = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0
    let classBadge: 'A' | 'B' | 'C'
    if (cumulativePct - pct < 80) {
      classBadge = 'A'
    } else if (cumulativePct - pct < 95) {
      classBadge = 'B'
    } else {
      classBadge = 'C'
    }
    return { ...row, classBadge, cumulativePct }
  })

  // Slow movers: <5 sales in period
  const slowMovers = abcRows.filter((r) => r.qty < 5)

  // Pareto data for chart
  const paretoData = abcRows.map((r, i) => ({
    label: i % Math.max(1, Math.floor(abcRows.length / 10)) === 0 ? String(i + 1) : '',
    value: r.revenue,
    secondaryValue: r.cumulativePct,
  }))

  return (
    <ProdutosRelatorioView
      products={abcRows}
      slowMovers={slowMovers}
      paretoData={paretoData}
      totalRevenue={totalRevenue}
      defaultFrom={fromDate}
      defaultTo={toDate}
    />
  )
}
