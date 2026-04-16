import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { cn, formatCurrency } from '@/lib/utils'
import { MetricBand } from '@/components/metric-band'

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

  type DreRow = {
    label: string
    value: number
    bold?: boolean
    indent: number
    highlight?: boolean
  }
  const dreRows: DreRow[] = [
    { label: 'Receita bruta', value: revenue, bold: true, indent: 0 },
    { label: 'Taxas de servico', value: -serviceFeeSum, indent: 1 },
    { label: 'Taxas de entrega', value: -deliveryFeeSum, indent: 1 },
    { label: 'Subtotal liquido', value: subtotalSum, bold: true, indent: 0 },
    { label: 'CMV estimado', value: -cmv, indent: 1 },
    { label: 'Lucro bruto', value: grossProfit, bold: true, indent: 0 },
    { label: 'Pessoal', value: -personnel, indent: 1 },
    { label: 'Aluguel', value: -rent, indent: 1 },
    { label: 'Marketing', value: -marketing, indent: 1 },
    { label: 'Utilidades', value: -utilities, indent: 1 },
    { label: 'Outras despesas', value: -others, indent: 1 },
    { label: 'Lucro operacional', value: operatingProfit, bold: true, indent: 0 },
    { label: 'Impostos', value: -taxes, indent: 1 },
    { label: 'Lucro liquido', value: netProfit, bold: true, indent: 0, highlight: true },
  ]

  return (
    <div>
      {/* KPI band */}
      <MetricBand
        metrics={[
          { label: 'Receita do mes', value: formatCurrency(revenue) },
          { label: 'Despesas pagas', value: formatCurrency(totalExpenses) },
          {
            label: 'Lucro liquido',
            value: formatCurrency(netProfit),
            tone: netProfit >= 0 ? 'positive' : 'negative',
          },
          { label: 'Pedidos', value: orderCount.toLocaleString('pt-BR') },
        ]}
        columns={4}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
        {/* Revenue 7 days */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-6">
            Receita · ultimos 7 dias
          </h2>
          <div className="flex items-end gap-3 h-40">
            {days.map((d, i) => {
              const height = (d.revenue / maxRevenue) * 100
              const dayName = new Date(d.date + 'T00:00:00')
                .toLocaleDateString('pt-BR', { weekday: 'short' })
                .replace('.', '')
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-2"
                  title={formatCurrency(d.revenue)}
                >
                  <div className="w-full flex items-end h-full">
                    <div
                      className="w-full bg-stone-light/70 rounded-sm transition-all"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-data text-stone-dark capitalize">
                    {dayName}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Payment methods */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-6">
            Vendas por metodo
          </h2>
          {methodRows.length === 0 ? (
            <p className="text-[12px] text-stone tracking-tight">
              Nenhum pagamento registrado este mes
            </p>
          ) : (
            <div className="space-y-4">
              {methodRows.map((item) => (
                <div key={item.method}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[13px] text-cloud tracking-tight">
                      {METHOD_LABELS[item.method] ?? item.method}
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-[13px] font-data text-cloud">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark w-8 text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-0.5 bg-night-lighter rounded-full overflow-hidden">
                    <div
                      className="h-full bg-stone-light rounded-full transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* DRE */}
        <section className="lg:col-span-1">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-6">
            DRE · mes atual
          </h2>
          <div className="divide-y divide-night-lighter">
            {dreRows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  'py-2.5 flex items-baseline justify-between',
                  row.highlight && 'bg-night-light/40 -mx-4 px-4'
                )}
              >
                <span
                  className={cn(
                    'text-[12px] tracking-tight',
                    row.bold ? 'text-cloud font-medium' : 'text-stone-light'
                  )}
                  style={{ paddingLeft: `${row.indent * 16}px` }}
                >
                  {row.label}
                </span>
                <span
                  className={cn(
                    'text-[12px] font-data',
                    row.highlight && 'text-cloud font-medium',
                    !row.highlight && row.value < 0 && 'text-stone-dark',
                    !row.highlight && row.value >= 0 && row.bold && 'text-cloud',
                    !row.highlight && row.value >= 0 && !row.bold && 'text-stone-light'
                  )}
                >
                  {row.value < 0
                    ? `(${formatCurrency(Math.abs(row.value))})`
                    : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-dark tracking-tight mt-4">
            Despesas consolidadas de contas pagas em{' '}
            <a
              href="/financeiro/contas"
              className="text-stone-light hover:text-cloud transition-colors"
            >
              Contas
            </a>
            . CMV estimado por custo × quantidade.
          </p>
        </section>

        {/* Top products */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-6">
            Top produtos · mes atual
          </h2>
          {topProducts.length === 0 ? (
            <p className="text-[12px] text-stone tracking-tight">
              Nenhuma venda registrada este mes
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {topProducts.map((product, i) => (
                <div
                  key={product.id}
                  className="py-3 flex items-baseline gap-4"
                >
                  <span className="text-[11px] font-data text-stone-dark w-4">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-cloud tracking-tight truncate">
                      {product.name}
                    </p>
                    <p className="text-[10px] text-stone-dark tracking-tight mt-0.5 font-data">
                      {product.quantity} vendidos
                    </p>
                  </div>
                  <span className="text-[13px] font-data text-cloud tracking-tight">
                    {formatCurrency(product.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

