import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { FinanceiroRelatorioView } from './financeiro-relatorio-view'

export const dynamic = 'force-dynamic'

export default async function RelatoriosFinanceiroPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  // Default: current month
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const toDate = now.toISOString().slice(0, 10)
  const fromISO = `${fromDate}T00:00:00`
  const toISO = `${toDate}T23:59:59`

  const [
    { data: ordersRaw },
    { data: itemsRaw },
    { data: productsRaw },
    { data: expensesRaw },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total, subtotal, service_fee, delivery_fee, created_at, status, source')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'cancelled')
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
    supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_price, order:orders!inner(restaurant_id, status, created_at)')
      .eq('order.restaurant_id', restaurantId)
      .neq('order.status', 'cancelled')
      .gte('created_at', fromISO)
      .lte('created_at', toISO),
    supabase.from('products').select('id, name, cost').eq('restaurant_id', restaurantId),
    supabase
      .from('financial_transactions')
      .select('category, amount, paid_at, type')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'paid')
      .gte('paid_at', fromISO)
      .lte('paid_at', toISO),
  ])

  type OrderRow = {
    id: string
    total: number
    subtotal: number
    service_fee: number
    delivery_fee: number
    created_at: string
    status: string
    source?: string | null
  }
  type ItemRow = { order_id: string; product_id: string; quantity: number; total_price: number }
  type ProductRow = { id: string; name: string; cost: number | null }
  type ExpenseRow = { category: string; amount: number; paid_at: string; type: string }

  const orders = (ordersRaw ?? []) as OrderRow[]
  const items = (itemsRaw ?? []) as ItemRow[]
  const products = (productsRaw ?? []) as ProductRow[]
  const expenses = (expensesRaw ?? []) as ExpenseRow[]

  const productById = new Map(products.map((p) => [p.id, p]))

  // Aggregate metrics
  const revenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const subtotalSum = orders.reduce((s, o) => s + Number(o.subtotal), 0)
  const serviceFeeSum = orders.reduce((s, o) => s + Number(o.service_fee ?? 0), 0)
  const deliveryFeeSum = orders.reduce((s, o) => s + Number(o.delivery_fee ?? 0), 0)

  const cmv = items.reduce((s, it) => {
    const cost = productById.get(it.product_id)?.cost
    return cost != null ? s + Number(cost) * it.quantity : s
  }, 0)

  const grossProfit = subtotalSum - cmv

  const expensesByCategory: Record<string, number> = {}
  for (const e of expenses.filter((e) => e.type === 'expense')) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + Number(e.amount)
  }
  const totalExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0)
  const taxes = expensesByCategory['impostos'] ?? 0
  const fixedCosts = (expensesByCategory['aluguel'] ?? 0) + (expensesByCategory['pessoal'] ?? 0)
  const otherExpenses = totalExpenses - taxes - fixedCosts

  const operatingProfit = grossProfit - totalExpenses
  const netProfit = operatingProfit
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  // Daily series for chart — group by day
  const dayMap: Record<string, { revenue: number; expenses: number }> = {}
  for (const o of orders) {
    const day = o.created_at.slice(0, 10)
    const b = (dayMap[day] ??= { revenue: 0, expenses: 0 })
    b.revenue += Number(o.total)
  }
  for (const e of expenses.filter((ex) => ex.type === 'expense')) {
    const day = (e.paid_at ?? '').slice(0, 10)
    if (day) {
      const b = (dayMap[day] ??= { revenue: 0, expenses: 0 })
      b.expenses += Number(e.amount)
    }
  }
  const dailySeries = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      revenue: vals.revenue,
      expenses: vals.expenses,
    }))

  // Sales by source
  const bySource: Record<string, number> = {}
  for (const o of orders) {
    const src = o.source ?? 'balcao'
    bySource[src] = (bySource[src] ?? 0) + Number(o.total)
  }

  // Expenses by category for table
  const expenseCategories = Object.entries(expensesByCategory)
    .map(([cat, amount]) => ({ cat, amount }))
    .sort((a, b) => b.amount - a.amount)

  return (
    <FinanceiroRelatorioView
      revenue={revenue}
      subtotalSum={subtotalSum}
      serviceFeeSum={serviceFeeSum}
      deliveryFeeSum={deliveryFeeSum}
      cmv={cmv}
      grossProfit={grossProfit}
      totalExpenses={totalExpenses}
      taxes={taxes}
      fixedCosts={fixedCosts}
      otherExpenses={otherExpenses}
      operatingProfit={operatingProfit}
      netProfit={netProfit}
      netMargin={netMargin}
      dailySeries={dailySeries}
      bySource={bySource}
      expenseCategories={expenseCategories}
      defaultFrom={fromDate}
      defaultTo={toDate}
      restaurantId={restaurantId}
    />
  )
}
