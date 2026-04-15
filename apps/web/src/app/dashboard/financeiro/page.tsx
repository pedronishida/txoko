import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  PieChart,
  BarChart3,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

type PaymentRow = {
  method: string
  amount: number
  created_at: string
}
type OrderRow = {
  id: string
  status: string
  subtotal: number
  service_fee: number
  delivery_fee: number
  total: number
  created_at: string
}
type OrderItemRow = {
  order_id: string
  product_id: string
  quantity: number
  total_price: number
}
type ProductRow = { id: string; name: string; cost: number | null }

const METHOD_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
  voucher: 'Voucher',
  online: 'Online',
}
const METHOD_COLORS: Record<string, string> = {
  pix: 'bg-leaf/60',
  credit: 'bg-warm/60',
  debit: 'bg-warm/40',
  cash: 'bg-stone-light/40',
  voucher: 'bg-cloud/30',
  online: 'bg-cloud/30',
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function daysAgo(n: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

export default async function FinanceiroPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const monthStart = startOfMonth().toISOString()
  const last7Start = daysAgo(6).toISOString()

  const [
    { data: monthOrdersRaw },
    { data: monthPaymentsRaw },
    { data: last7OrdersRaw },
    { data: monthItemsRaw },
    { data: productsRaw },
    { data: monthExpensesRaw },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, subtotal, service_fee, delivery_fee, total, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', monthStart)
      .neq('status', 'cancelled'),
    supabase
      .from('payments')
      .select('method, amount, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', monthStart)
      .eq('status', 'approved'),
    supabase
      .from('orders')
      .select('id, status, subtotal, service_fee, delivery_fee, total, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', last7Start)
      .neq('status', 'cancelled'),
    supabase
      .from('order_items')
      .select('order_id, product_id, quantity, total_price, order:orders!inner(restaurant_id)')
      .eq('order.restaurant_id', restaurantId)
      .gte('created_at', monthStart),
    supabase.from('products').select('id, name, cost').eq('restaurant_id', restaurantId),
    supabase
      .from('financial_transactions')
      .select('category, amount, status, paid_at')
      .eq('restaurant_id', restaurantId)
      .eq('type', 'expense')
      .eq('status', 'paid')
      .gte('paid_at', monthStart),
  ])

  const monthOrders = (monthOrdersRaw ?? []) as OrderRow[]
  const monthPayments = (monthPaymentsRaw ?? []) as PaymentRow[]
  const last7Orders = (last7OrdersRaw ?? []) as OrderRow[]
  const monthItems = (monthItemsRaw ?? []) as OrderItemRow[]
  const products = (productsRaw ?? []) as ProductRow[]
  const productById = new Map(products.map((p) => [p.id, p]))

  type ExpenseRow = { category: string; amount: number }
  const monthExpenses = (monthExpensesRaw ?? []) as ExpenseRow[]
  const expensesByCategory: Record<string, number> = {}
  for (const e of monthExpenses) {
    expensesByCategory[e.category] =
      (expensesByCategory[e.category] ?? 0) + Number(e.amount)
  }
  const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const personnel = expensesByCategory['pessoal'] ?? 0
  const rent = expensesByCategory['aluguel'] ?? 0
  const marketing = expensesByCategory['marketing'] ?? 0
  const utilities = expensesByCategory['utilidades'] ?? 0
  const taxes = expensesByCategory['impostos'] ?? 0
  const others =
    totalExpenses - personnel - rent - marketing - utilities - taxes

  // KPIs
  const revenue = monthOrders.reduce((s, o) => s + Number(o.total), 0)
  const subtotalSum = monthOrders.reduce((s, o) => s + Number(o.subtotal), 0)
  const serviceFeeSum = monthOrders.reduce((s, o) => s + Number(o.service_fee), 0)
  const deliveryFeeSum = monthOrders.reduce((s, o) => s + Number(o.delivery_fee), 0)
  const orderCount = monthOrders.length
  const avgTicket = orderCount > 0 ? revenue / orderCount : 0

  // CMV estimado via products.cost
  const cmv = monthItems.reduce((s, it) => {
    const cost = productById.get(it.product_id)?.cost
    return cost != null ? s + Number(cost) * it.quantity : s
  }, 0)
  const grossProfit = subtotalSum - cmv

  // Serie diaria (ultimos 7 dias)
  const days: { date: string; revenue: number; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    days.push({ date: d.toISOString().slice(0, 10), revenue: 0, count: 0 })
  }
  for (const o of last7Orders) {
    const key = o.created_at.slice(0, 10)
    const bucket = days.find((d) => d.date === key)
    if (bucket) {
      bucket.revenue += Number(o.total)
      bucket.count += 1
    }
  }
  const maxRevenue = Math.max(1, ...days.map((d) => d.revenue))

  // Breakdown por metodo de pagamento
  const byMethod: Record<string, number> = {}
  for (const p of monthPayments) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount)
  }
  const methodTotal = Object.values(byMethod).reduce((s, v) => s + v, 0)
  const methodRows = Object.entries(byMethod)
    .map(([method, amount]) => ({
      method,
      amount,
      percentage: methodTotal > 0 ? Math.round((amount / methodTotal) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  // Top 5 produtos
  const byProduct: Record<string, { quantity: number; revenue: number }> = {}
  for (const it of monthItems) {
    const agg = (byProduct[it.product_id] ??= { quantity: 0, revenue: 0 })
    agg.quantity += it.quantity
    agg.revenue += Number(it.total_price)
  }
  const topProducts = Object.entries(byProduct)
    .map(([id, v]) => ({
      id,
      name: productById.get(id)?.name ?? 'Desconhecido',
      ...v,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const operatingProfit = grossProfit - personnel - rent - marketing - utilities - others
  const netProfit = operatingProfit - taxes

  const kpis = [
    { label: 'Receita do Mes', value: revenue, icon: DollarSign, accent: 'text-leaf' },
    { label: 'Despesas Pagas', value: totalExpenses, icon: TrendingDown, accent: 'text-coral' },
    {
      label: 'Lucro Liquido',
      value: netProfit,
      icon: TrendingUp,
      accent: netProfit >= 0 ? 'text-leaf' : 'text-coral',
    },
    { label: 'Pedidos', value: orderCount, icon: ShoppingCart, accent: 'text-cloud', raw: true },
  ]

  type DreRow = {
    label: string
    value: number
    bold?: boolean
    indent: number
    highlight?: boolean
  }
  const dreRows: DreRow[] = [
    { label: 'Receita Bruta (total)', value: revenue, bold: true, indent: 0 },
    { label: '(-) Taxas de Servico', value: -serviceFeeSum, indent: 1 },
    { label: '(-) Taxas de Entrega', value: -deliveryFeeSum, indent: 1 },
    { label: '= Subtotal Liquido', value: subtotalSum, bold: true, indent: 0 },
    { label: '(-) CMV estimado', value: -cmv, indent: 1 },
    { label: '= Lucro Bruto', value: grossProfit, bold: true, indent: 0 },
    { label: '(-) Pessoal', value: -personnel, indent: 1 },
    { label: '(-) Aluguel', value: -rent, indent: 1 },
    { label: '(-) Marketing', value: -marketing, indent: 1 },
    { label: '(-) Utilidades', value: -utilities, indent: 1 },
    { label: '(-) Outras despesas', value: -others, indent: 1 },
    { label: '= Lucro Operacional', value: operatingProfit, bold: true, indent: 0 },
    { label: '(-) Impostos', value: -taxes, indent: 1 },
    { label: '= Lucro Liquido', value: netProfit, bold: true, indent: 0, highlight: true },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-night-light border border-night-lighter rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-stone">{kpi.label}</span>
              <div className="p-2 rounded-lg bg-night">
                <kpi.icon size={16} className="text-stone-light" />
              </div>
            </div>
            <p className={`text-2xl font-bold ${kpi.accent} font-data`}>
              {kpi.raw ? kpi.value.toLocaleString('pt-BR') : formatCurrency(kpi.value)}
            </p>
            <p className="text-xs text-stone mt-1">mes atual</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter flex items-center gap-2">
            <BarChart3 size={16} className="text-stone-light" />
            <h2 className="font-semibold text-cloud text-sm">
              Receita — Ultimos 7 dias
            </h2>
          </div>
          <div className="p-5">
            <div className="flex items-end gap-2 h-40">
              {days.map((d, i) => {
                const height = (d.revenue / maxRevenue) * 100
                const dayName = new Date(d.date + 'T00:00:00')
                  .toLocaleDateString('pt-BR', { weekday: 'short' })
                  .replace('.', '')
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end h-32">
                      <div
                        className="w-full bg-leaf/30 rounded-t-sm"
                        style={{ height: `${height}%` }}
                        title={`${d.revenue.toLocaleString('pt-BR')}`}
                      />
                    </div>
                    <span className="text-[10px] text-stone capitalize">{dayName}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-leaf/30" />
                <span className="text-[10px] text-stone">Receita diaria</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter flex items-center gap-2">
            <PieChart size={16} className="text-stone-light" />
            <h2 className="font-semibold text-cloud text-sm">Vendas por Forma de Pagamento</h2>
          </div>
          <div className="p-5 space-y-3">
            {methodRows.length === 0 && (
              <p className="text-sm text-stone py-6 text-center">
                Nenhum pagamento registrado este mes
              </p>
            )}
            {methodRows.map((item) => (
              <div key={item.method}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-cloud">
                    {METHOD_LABELS[item.method] ?? item.method}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-data text-cloud">
                      {formatCurrency(item.amount)}
                    </span>
                    <span className="text-xs font-data text-stone">{item.percentage}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-night rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${METHOD_COLORS[item.method] ?? 'bg-cloud/30'}`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter">
            <h2 className="font-semibold text-cloud text-sm">DRE Simplificado — Mes Atual</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {dreRows.map((row, i) => (
              <div
                key={i}
                className={`px-5 py-2 flex items-center justify-between ${
                  row.highlight ? 'bg-leaf/5' : ''
                }`}
              >
                <span
                  className={`text-sm ${row.bold ? 'font-semibold text-cloud' : 'text-stone-light'}`}
                  style={{ paddingLeft: `${row.indent * 16}px` }}
                >
                  {row.label}
                </span>
                <span
                  className={`text-sm font-data ${
                    row.highlight
                      ? 'text-leaf font-bold'
                      : row.value < 0
                      ? 'text-coral'
                      : row.bold
                      ? 'text-cloud font-semibold'
                      : 'text-stone-light'
                  }`}
                >
                  {row.value < 0
                    ? `(${formatCurrency(Math.abs(row.value))})`
                    : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-2 border-t border-night-lighter">
            <p className="text-[10px] text-stone">
              Despesas consolidadas de contas pagas em{' '}
              <a href="/dashboard/financeiro/contas" className="text-leaf hover:underline">
                Financeiro / Contas
              </a>
              . CMV estimado por <code className="text-leaf">products.cost * quantity</code>.
            </p>
          </div>
        </div>

        <div className="bg-night-light border border-night-lighter rounded-xl">
          <div className="px-5 py-4 border-b border-night-lighter">
            <h2 className="font-semibold text-cloud text-sm">Top 5 Produtos — Mes Atual</h2>
          </div>
          <div className="divide-y divide-night-lighter">
            {topProducts.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-stone">
                Nenhuma venda registrada este mes
              </p>
            )}
            {topProducts.map((product, i) => (
              <div key={product.id} className="px-5 py-3 flex items-center gap-4">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0
                      ? 'bg-leaf/20 text-leaf'
                      : i === 1
                      ? 'bg-warm/20 text-warm'
                      : 'bg-night-lighter text-stone'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cloud truncate">{product.name}</p>
                  <p className="text-xs text-stone font-data">{product.quantity} vendidos</p>
                </div>
                <span className="text-sm font-data font-semibold text-cloud">
                  {formatCurrency(product.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
