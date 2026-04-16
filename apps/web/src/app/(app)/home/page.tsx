import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { cn, formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type OrderRow = {
  id: string
  status: string
  type: string
  total: number
  table_id: string | null
  created_at: string
}
type PaymentRow = { amount: number; created_at: string }
type TableRow = { status: string }
type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  sentiment: string | null
  created_at: string
}
type IngredientRow = {
  name: string
  current_stock: number
  min_stock: number
  unit: string
}

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function daysAgo(n: number) {
  const d = startOfDay()
  d.setDate(d.getDate() - n)
  return d
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  closed: 'Fechado',
  cancelled: 'Cancelado',
}

export default async function HomePage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const todayStart = startOfDay().toISOString()
  const yesterdayStart = daysAgo(1).toISOString()

  const [
    { data: todayOrdersRaw },
    { data: yesterdayOrdersRaw },
    { data: todayPaymentsRaw },
    { data: yesterdayPaymentsRaw },
    { data: tablesRaw },
    { data: recentOrdersRaw },
    { data: recentReviewsRaw },
    { data: ingredientsRaw },
    { data: restaurant },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, type, total, table_id, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', todayStart)
      .neq('status', 'cancelled'),
    supabase
      .from('orders')
      .select('id, total, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart)
      .neq('status', 'cancelled'),
    supabase
      .from('payments')
      .select('amount, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'approved')
      .gte('created_at', todayStart),
    supabase
      .from('payments')
      .select('amount, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'approved')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    supabase.from('tables').select('status').eq('restaurant_id', restaurantId),
    supabase
      .from('orders')
      .select('id, status, type, total, table_id, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('reviews')
      .select('id, rating, comment, sentiment, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('ingredients')
      .select('name, current_stock, min_stock, unit')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('restaurants')
      .select('name, slug')
      .eq('id', restaurantId)
      .maybeSingle(),
  ])

  const todayOrders = (todayOrdersRaw ?? []) as OrderRow[]
  const yesterdayOrders = (yesterdayOrdersRaw ?? []) as OrderRow[]
  const todayPayments = (todayPaymentsRaw ?? []) as PaymentRow[]
  const yesterdayPayments = (yesterdayPaymentsRaw ?? []) as PaymentRow[]
  const tables = (tablesRaw ?? []) as TableRow[]
  const recentOrders = (recentOrdersRaw ?? []) as OrderRow[]
  const recentReviews = (recentReviewsRaw ?? []) as ReviewRow[]
  const ingredients = (ingredientsRaw ?? []) as IngredientRow[]

  const revenueToday = todayPayments.reduce((s, p) => s + Number(p.amount), 0)
  const revenueYesterday = yesterdayPayments.reduce(
    (s, p) => s + Number(p.amount),
    0
  )
  const revenueChange =
    revenueYesterday > 0
      ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100
      : revenueToday > 0
        ? 100
        : 0

  const orderCountToday = todayOrders.length
  const orderCountYesterday = yesterdayOrders.length
  const orderChange =
    orderCountYesterday > 0
      ? ((orderCountToday - orderCountYesterday) / orderCountYesterday) * 100
      : orderCountToday > 0
        ? 100
        : 0

  const avgTicket = orderCountToday > 0 ? revenueToday / orderCountToday : 0

  const totalTables = tables.length
  const occupiedTables = tables.filter((t) => t.status === 'occupied').length

  const stockCritical = ingredients.filter(
    (i) => Number(i.current_stock) <= Number(i.min_stock)
  )

  type Metric = {
    label: string
    value: string
    delta?: string
    trend?: 'up' | 'down' | 'flat'
    caption?: string
  }

  const metrics: Metric[] = [
    {
      label: 'Receita hoje',
      value: formatCurrency(revenueToday),
      delta: formatDelta(revenueChange),
      trend: deltaTrend(revenueChange),
      caption: `vs ${formatCurrency(revenueYesterday)} ontem`,
    },
    {
      label: 'Pedidos',
      value: String(orderCountToday),
      delta: formatDelta(orderChange),
      trend: deltaTrend(orderChange),
      caption: `${orderCountYesterday} ontem`,
    },
    {
      label: 'Ticket medio',
      value: formatCurrency(avgTicket),
      caption: orderCountToday > 0 ? `${orderCountToday} pedidos` : 'Sem pedidos',
    },
    {
      label: 'Mesas ocupadas',
      value: totalTables > 0 ? `${occupiedTables}/${totalTables}` : '—',
      caption:
        totalTables > 0
          ? `${Math.round((occupiedTables / totalTables) * 100)}% em uso`
          : 'Nenhuma mesa',
    },
  ]

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  const today = new Date().toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="-mx-8 -mt-6">
      {/* Page header */}
      <header className="px-8 pt-6 pb-10 border-b border-night-lighter">
        <p className="text-[11px] text-stone-dark tracking-tight uppercase font-medium">
          {greeting} — {today}
        </p>
        <div className="flex items-end justify-between mt-3">
          <h1 className="text-[28px] font-medium tracking-[-0.03em] text-cloud leading-none">
            {restaurant?.name ?? 'Txoko'}
          </h1>
          <Link
            href="/pdv"
            className="hidden sm:inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
          >
            Abrir PDV
            <span aria-hidden>→</span>
          </Link>
        </div>
      </header>

      {/* KPI band */}
      <section className="px-8 py-8 border-b border-night-lighter">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-8">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                {m.label}
              </p>
              <div className="flex items-baseline gap-2.5 mt-3">
                <p className="text-[28px] font-medium text-cloud tracking-[-0.03em] leading-none font-data">
                  {m.value}
                </p>
                {m.delta && m.trend && (
                  <span
                    className={cn(
                      'text-[11px] font-medium tracking-tight',
                      m.trend === 'up' && 'text-leaf',
                      m.trend === 'down' && 'text-primary',
                      m.trend === 'flat' && 'text-stone'
                    )}
                  >
                    {m.delta}
                  </span>
                )}
              </div>
              {m.caption && (
                <p className="text-[11px] text-stone-dark mt-2 tracking-tight">
                  {m.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="px-8 py-10 grid grid-cols-1 lg:grid-cols-3 gap-x-12 gap-y-10">
        {/* Recent orders */}
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Pedidos recentes
            </h2>
            <Link
              href="/pedidos"
              className="text-[11px] text-stone-light hover:text-cloud transition-colors tracking-tight"
            >
              Ver todos →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="py-10 text-[13px] text-stone tracking-tight">
              Nenhum pedido ainda
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {recentOrders.map((order) => {
                const label = order.table_id
                  ? 'Mesa'
                  : order.type === 'delivery'
                    ? 'Delivery'
                    : order.type === 'takeaway'
                      ? 'Retirada'
                      : 'Balcao'
                return (
                  <div
                    key={order.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-[11px] font-data text-stone-dark w-14">
                        #{order.id.slice(0, 6)}
                      </span>
                      <span className="text-[13px] text-cloud tracking-tight">
                        {label}
                      </span>
                      <span className="text-[11px] text-stone tracking-tight">
                        ·{' '}
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-5 shrink-0">
                      <span className="text-[13px] font-medium text-cloud tracking-tight font-data">
                        {formatCurrency(Number(order.total))}
                      </span>
                      <span className="text-[11px] font-data text-stone-dark w-10 text-right">
                        {relativeTime(order.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Right column */}
        <aside className="space-y-10">
          {/* Reviews */}
          <section>
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                Ultimas avaliacoes
              </h2>
              <Link
                href="/avaliacoes"
                className="text-[11px] text-stone-light hover:text-cloud transition-colors tracking-tight"
              >
                Ver todas →
              </Link>
            </div>

            {recentReviews.length === 0 ? (
              <p className="py-6 text-[12px] text-stone tracking-tight">
                Sem avaliacoes ainda
              </p>
            ) : (
              <div className="space-y-5">
                {recentReviews.map((r) => (
                  <div key={r.id}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[13px] font-medium text-cloud font-data tracking-tight">
                        {Number(r.rating).toFixed(1)}
                      </span>
                      <span className="text-[10px] text-stone-dark tracking-tight">
                        {Array.from({ length: 5 }, (_, i) =>
                          i < Number(r.rating) ? '★' : '·'
                        ).join('')}
                      </span>
                      {r.sentiment && (
                        <span
                          className={cn(
                            'text-[10px] tracking-tight ml-auto',
                            r.sentiment === 'positive' && 'text-leaf',
                            r.sentiment === 'negative' && 'text-primary',
                            r.sentiment === 'neutral' && 'text-stone'
                          )}
                        >
                          {r.sentiment === 'positive'
                            ? 'positivo'
                            : r.sentiment === 'negative'
                              ? 'negativo'
                              : 'neutro'}
                        </span>
                      )}
                    </div>
                    {r.comment && (
                      <p className="text-[12px] text-stone-light leading-relaxed line-clamp-2 tracking-tight">
                        {r.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Stock critical */}
          {stockCritical.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-5">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
                  Estoque critico
                </h2>
                <span className="text-[11px] font-data text-primary">
                  {stockCritical.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {stockCritical.slice(0, 4).map((i) => (
                  <div
                    key={i.name}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-[12px] text-cloud truncate tracking-tight">
                      {i.name}
                    </span>
                    <span className="text-[11px] font-data text-stone-light shrink-0">
                      {Number(i.current_stock)} / {Number(i.min_stock)} {i.unit}
                    </span>
                  </div>
                ))}
                {stockCritical.length > 4 && (
                  <Link
                    href="/estoque"
                    className="block pt-2 text-[11px] text-primary hover:text-primary/70 tracking-tight transition-colors"
                  >
                    +{stockCritical.length - 4} outros itens →
                  </Link>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function relativeTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h`
  return `${Math.floor(mins / 1440)}d`
}

function formatDelta(pct: number): string {
  if (pct === 0) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function deltaTrend(pct: number): 'up' | 'down' | 'flat' {
  if (pct > 0.1) return 'up'
  if (pct < -0.1) return 'down'
  return 'flat'
}
