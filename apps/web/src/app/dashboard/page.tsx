import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { cn, formatCurrency } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowRight,
  Armchair,
  DollarSign,
  Receipt,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

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
type IngredientRow = { name: string; current_stock: number; min_stock: number; unit: string }

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Aberto', color: 'text-warm', bg: 'bg-warm/10' },
  preparing: { label: 'Preparando', color: 'text-warm', bg: 'bg-warm/10' },
  ready: { label: 'Pronto', color: 'text-leaf', bg: 'bg-leaf/10' },
  delivered: { label: 'Entregue', color: 'text-stone-light', bg: 'bg-stone/10' },
  closed: { label: 'Fechado', color: 'text-stone', bg: 'bg-stone/10' },
  cancelled: { label: 'Cancelado', color: 'text-coral', bg: 'bg-coral/10' },
}

export default async function DashboardPage() {
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
      .limit(6),
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

  // KPIs
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
  const tablePercent = totalTables > 0 ? (occupiedTables / totalTables) * 100 : 0

  // Alertas estoque
  const stockCritical = ingredients.filter(
    (i) => Number(i.current_stock) <= Number(i.min_stock)
  )

  const metrics = [
    {
      label: 'Vendas Hoje',
      value: formatCurrency(revenueToday),
      change: `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}%`,
      trend: revenueChange >= 0 ? ('up' as const) : ('down' as const),
      icon: DollarSign,
    },
    {
      label: 'Pedidos',
      value: String(orderCountToday),
      change: `${orderChange >= 0 ? '+' : ''}${orderChange.toFixed(1)}%`,
      trend: orderChange >= 0 ? ('up' as const) : ('down' as const),
      icon: ShoppingBag,
    },
    {
      label: 'Ticket Medio',
      value: formatCurrency(avgTicket),
      change: '—',
      trend: 'up' as const,
      icon: Receipt,
    },
    {
      label: 'Mesas Ocupadas',
      value: `${occupiedTables} / ${totalTables}`,
      change: `${tablePercent.toFixed(0)}%`,
      trend: 'up' as const,
      icon: Armchair,
    },
  ]

  function relativeTime(iso: string) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins} min`
    if (mins < 1440) return `${Math.floor(mins / 60)}h`
    return `${Math.floor(mins / 1440)}d`
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-stone">{greeting},</p>
          <h1 className="text-3xl font-bold text-cloud tracking-tight mt-0.5">
            {restaurant?.name ?? 'Txoko'}
          </h1>
          <p className="text-sm text-stone mt-1">
            Aqui esta o resumo de hoje, {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link
          href="/dashboard/pdv"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
        >
          Abrir PDV
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, i) => (
          <div
            key={metric.label}
            className={cn(
              'bg-night-light border border-night-lighter rounded-2xl p-5 animate-fade-in-up',
              `stagger-${i + 1}`
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-stone">{metric.label}</span>
              <div className="p-2 rounded-lg bg-night">
                <metric.icon size={16} className="text-stone-light" />
              </div>
            </div>
            <p className="text-2xl font-bold text-cloud font-data tracking-tight">
              {metric.value}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              {metric.trend === 'up' ? (
                <TrendingUp size={14} className="text-leaf" />
              ) : (
                <TrendingDown size={14} className="text-coral" />
              )}
              <span
                className={cn(
                  'text-xs font-semibold font-data',
                  metric.trend === 'up' ? 'text-leaf' : 'text-coral'
                )}
              >
                {metric.change}
              </span>
              <span className="text-xs text-stone">vs ontem</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-night-light border border-night-lighter rounded-2xl">
          <div className="px-5 py-4 border-b border-night-lighter flex items-center justify-between">
            <h2 className="font-semibold text-cloud">Pedidos Recentes</h2>
            <Link
              href="/dashboard/pedidos"
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-night-lighter">
            {recentOrders.length === 0 && (
              <p className="px-5 py-10 text-sm text-stone text-center">
                Nenhum pedido recente. Quando rolar uma venda, ela aparece aqui.
              </p>
            )}
            {recentOrders.map((order) => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.open
              const label =
                order.table_id
                  ? 'Mesa'
                  : order.type === 'delivery'
                  ? 'Delivery'
                  : order.type === 'takeaway'
                  ? 'Retirada'
                  : 'Balcao'
              return (
                <div
                  key={order.id}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-data text-primary font-semibold">
                      #{order.id.slice(0, 6)}
                    </span>
                    <span className="text-sm text-cloud">{label}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-data text-cloud font-semibold">
                      {formatCurrency(Number(order.total))}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        cfg.bg,
                        cfg.color
                      )}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-xs text-stone font-data w-10 text-right">
                      {relativeTime(order.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-night-light border border-night-lighter rounded-2xl">
            <div className="px-5 py-4 border-b border-night-lighter flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star size={14} className="text-accent fill-accent" />
                <h2 className="font-semibold text-cloud text-sm">Avaliacoes</h2>
              </div>
              <Link
                href="/dashboard/avaliacoes"
                className="text-xs text-primary hover:underline font-medium"
              >
                Ver todas
              </Link>
            </div>
            <div className="divide-y divide-night-lighter">
              {recentReviews.length === 0 && (
                <p className="px-5 py-6 text-xs text-stone text-center">
                  Nenhuma avaliacao ainda
                </p>
              )}
              {recentReviews.map((r) => (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-center gap-1 mb-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        size={11}
                        className={
                          i < Number(r.rating)
                            ? 'text-accent fill-accent'
                            : 'text-stone/30'
                        }
                      />
                    ))}
                    {r.sentiment === 'positive' && (
                      <span className="ml-1 text-[9px] text-leaf font-medium">
                        POSITIVO
                      </span>
                    )}
                    {r.sentiment === 'negative' && (
                      <span className="ml-1 text-[9px] text-coral font-medium">
                        NEGATIVO
                      </span>
                    )}
                  </div>
                  {r.comment && (
                    <p className="text-xs text-stone-light line-clamp-2">
                      &ldquo;{r.comment}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {stockCritical.length > 0 && (
            <div className="bg-coral/5 border border-coral/30 rounded-2xl">
              <div className="px-5 py-4 border-b border-coral/20 flex items-center gap-2">
                <AlertTriangle size={14} className="text-coral" />
                <h2 className="font-semibold text-coral text-sm">
                  Estoque Critico
                </h2>
              </div>
              <div className="divide-y divide-coral/10">
                {stockCritical.slice(0, 4).map((i) => (
                  <div
                    key={i.name}
                    className="px-5 py-2.5 flex items-center justify-between"
                  >
                    <span className="text-xs text-cloud truncate">{i.name}</span>
                    <span className="text-xs font-data text-coral font-semibold">
                      {Number(i.current_stock)} / {Number(i.min_stock)} {i.unit}
                    </span>
                  </div>
                ))}
              </div>
              {stockCritical.length > 4 && (
                <Link
                  href="/dashboard/estoque"
                  className="block px-5 py-2.5 text-xs text-coral hover:underline text-center border-t border-coral/10 font-medium"
                >
                  +{stockCritical.length - 4} outros itens
                </Link>
              )}
            </div>
          )}

          <Link
            href="/dashboard/assistente"
            className="block bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/20 rounded-2xl p-5 hover:border-primary/40 transition-colors group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-primary" />
              <h2 className="font-semibold text-cloud text-sm">Assistente IA</h2>
            </div>
            <p className="text-xs text-stone leading-relaxed">
              Pergunte em linguagem natural sobre vendas, estoque, clientes. O
              Claude responde com dados reais.
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold mt-3 group-hover:gap-2 transition-all">
              Abrir chat <ArrowRight size={12} />
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
