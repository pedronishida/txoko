'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'
import { EditOrderModal } from '@/components/pedidos/edit-order-modal'
import { SplitBillModal } from '@/components/pedidos/split-bill-modal'
import { CancelOrderModal } from '@/components/pedidos/cancel-order-modal'
import { OrderTrail } from '@/components/pedidos/order-trail'
import { EmptyState } from '@/components/states'
import type {
  Address,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  Product,
  Table,
} from '@txoko/shared'
import {
  Pencil,
  SplitSquareVertical,
  Printer,
  X,
  List,
  LayoutGrid,
  Clock,
} from 'lucide-react'
import { setOrderStatus, currentUserCanCancel } from './actions'
import { closeOrderWithPayment } from '@/lib/server/payments'
import { safeAction } from '@/lib/safe-action'
import type { PaymentMethod } from '@txoko/shared'

type TypeFilter = 'all' | OrderType
type StatusFilter = 'active' | 'completed' | 'cancelled' | 'all'
type ViewMode = 'lista' | 'quadro'

const ACTIVE_STATUSES: OrderStatus[] = ['open', 'preparing', 'ready']
const COMPLETED_STATUSES: OrderStatus[] = ['delivered', 'closed']

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'dine_in', label: 'Salao' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'takeaway', label: 'Retirada' },
]

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  closed: 'Fechado',
  cancelled: 'Cancelado',
}

const SOURCE_LABEL: Record<string, string> = {
  pos: 'PDV',
  station: 'Estacao',
  qrcode: 'QR',
  ifood: 'iFood',
  rappi: 'Rappi',
  whatsapp: 'WhatsApp',
  website: 'Site',
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
  voucher: 'Voucher',
  online: 'Online',
}

// O quadro mostra o fluxo operacional; fechado e cancelado sao historia e
// ficam na lista.
const KANBAN_COLS: {
  status: OrderStatus
  label: string
  advance: OrderStatus | 'checkout'
  advanceLabel: string
}[] = [
  { status: 'open', label: 'Aberto', advance: 'preparing', advanceLabel: 'Iniciar preparo' },
  { status: 'preparing', label: 'Preparando', advance: 'ready', advanceLabel: 'Marcar pronto' },
  { status: 'ready', label: 'Pronto', advance: 'delivered', advanceLabel: 'Marcar entregue' },
  { status: 'delivered', label: 'Entregue', advance: 'checkout', advanceLabel: 'Fechar conta' },
]

function getMinutesAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

// Tempo parado colore por urgencia — so em pedido que ainda esta em jogo.
function ageTone(minutes: number, status: OrderStatus): string {
  if (!ACTIVE_STATUSES.includes(status)) return 'text-ink-muted'
  if (minutes >= 30) return 'text-red'
  if (minutes >= 15) return 'text-amber-text'
  return 'text-ink-muted'
}

// Statuses that cannot be edited or further acted upon
const TERMINAL_STATUSES: OrderStatus[] = ['closed', 'cancelled']
const BLOCKED_EDIT_STATUSES: OrderStatus[] = ['closed', 'cancelled', 'delivered']

type Props = {
  orders: Order[]
  items: OrderItem[]
  products: Pick<Product, 'id' | 'name' | 'price'>[]
  tables: Pick<Table, 'id' | 'number'>[]
  customers: Pick<import('@txoko/shared').Customer, 'id' | 'name' | 'phone'>[]
  /** Numero impresso de cada cartao de comanda, pra traduzir comanda_card_id. */
  cards: { id: string; card_number: number }[]
  restaurantId: string
}

export function PedidosView({
  orders: initialOrders,
  items: initialItems,
  products,
  tables,
  customers,
  cards,
  restaurantId,
}: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [items, setItems] = useState(initialItems)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [view, setView] = useState<ViewMode>('lista')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutMethod, setCheckoutMethod] = useState<PaymentMethod>('pix')
  const [, setTick] = useState(0)
  const [pending, startTransition] = useTransition()
  const [editOrderId, setEditOrderId] = useState<string | null>(null)
  const [splitOrderId, setSplitOrderId] = useState<string | null>(null)
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null)
  // Falha de action (fechar conta, mudar status) aparece aqui em vez de
  // derrubar a tela no error boundary.
  const [actionError, setActionError] = useState<string | null>(null)
  // Recarrega a trilha depois de um cancelamento, sem recarregar a tela.
  const [trailKey, setTrailKey] = useState(0)
  // Gate do botao de cancelar. A RPC tambem recusa quem nao pode — isto aqui
  // so evita oferecer uma acao que vai falhar.
  const [canCancel, setCanCancel] = useState(false)

  useEffect(() => {
    void currentUserCanCancel().then(setCanCancel)
    if (localStorage.getItem('txoko_pedidos_view') === 'quadro') setView('quadro')
  }, [])

  function changeView(v: ViewMode) {
    setView(v)
    localStorage.setItem('txoko_pedidos_view', v)
  }

  useEffect(() => {
    const supabase = createClient()

    const ordersChannel = supabase
      .channel(`pedidos-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Order
              return prev.some((o) => o.id === row.id) ? prev : [row, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Order
              return prev.map((o) => (o.id === row.id ? row : o))
            }
            if (payload.eventType === 'DELETE') {
              const row = payload.old as Order
              return prev.filter((o) => o.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    const itemsChannel = supabase
      .channel(`pedidos-items-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as OrderItem
              return prev.some((i) => i.id === row.id) ? prev : [...prev, row]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as OrderItem
              return prev.map((i) => (i.id === row.id ? row : i))
            }
            if (payload.eventType === 'DELETE') {
              const row = payload.old as OrderItem
              return prev.filter((i) => i.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(itemsChannel)
    }
  }, [restaurantId])

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(i)
  }, [])

  const itemsByOrder = useMemo(() => {
    const map: Record<string, OrderItem[]> = {}
    for (const it of items) {
      ;(map[it.order_id] ??= []).push(it)
    }
    return map
  }, [items])

  const cardNumberByCardId = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cards) m.set(c.id, c.card_number)
    return m
  }, [cards])

  // O codigo que identifica o pedido pra equipe: numero da comanda quando o
  // pedido nasceu de um cartao; o hex interno so como ultimo recurso.
  function comandaCode(o: Order): { label: string; isCard: boolean } {
    const n = o.comanda_card_id
      ? cardNumberByCardId.get(o.comanda_card_id)
      : undefined
    if (n != null) return { label: `#${String(n).padStart(3, '0')}`, isCard: true }
    return { label: `#${o.id.slice(0, 6)}`, isCard: false }
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (typeFilter !== 'all' && o.type !== typeFilter) return false
      if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(o.status)) return false
      if (statusFilter === 'completed' && !COMPLETED_STATUSES.includes(o.status)) return false
      if (statusFilter === 'cancelled' && o.status !== 'cancelled') return false
      return true
    })
  }, [orders, typeFilter, statusFilter])

  // O quadro ignora o filtro de status (as colunas SAO o status) mas respeita
  // o de tipo.
  const boardOrders = useMemo(
    () => orders.filter((o) => typeFilter === 'all' || o.type === typeFilter),
    [orders, typeFilter]
  )

  const counts = useMemo(
    () => ({
      all: orders.length,
      active: orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
      completed: orders.filter((o) => COMPLETED_STATUSES.includes(o.status)).length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    }),
    [orders]
  )

  const selectedOrder = selectedOrderId
    ? orders.find((o) => o.id === selectedOrderId)
    : null
  const selectedItems = selectedOrder ? (itemsByOrder[selectedOrder.id] ?? []) : []
  const selectedTable = selectedOrder?.table_id
    ? tables.find((t) => t.id === selectedOrder.table_id)
    : null
  const selectedCustomer = selectedOrder?.customer_id
    ? customers.find((c) => c.id === selectedOrder.customer_id)
    : null

  const editOrder = editOrderId ? orders.find((o) => o.id === editOrderId) : null
  const editItems = editOrderId ? (itemsByOrder[editOrderId] ?? []) : []

  const splitOrder = splitOrderId ? orders.find((o) => o.id === splitOrderId) : null
  const splitItems = splitOrderId ? (itemsByOrder[splitOrderId] ?? []) : []
  const cancelTarget = cancelOrderId
    ? (orders.find((o) => o.id === cancelOrderId) ?? null)
    : null

  function flagError(text: string) {
    setActionError(text)
    setTimeout(() => setActionError(null), 5000)
  }

  function doSetStatus(id: string, status: OrderStatus) {
    startTransition(async () => {
      const res = await safeAction(setOrderStatus(id, status))
      if (res && 'error' in res && res.error) flagError(res.error)
    })
  }

  function doCheckout() {
    if (!selectedOrder) return
    const id = selectedOrder.id
    const total = selectedOrder.total
    startTransition(async () => {
      const res = await safeAction(
        closeOrderWithPayment({
          orderId: id,
          method: checkoutMethod,
          amount: total,
        })
      )
      if (res && 'error' in res && res.error) {
        flagError(res.error)
        return
      }
      setShowCheckout(false)
      setSelectedOrderId(null)
      // Comprovante na termica ao fechar, como no PDV — mesma preferencia
      // do aparelho; popup bloqueado nao trava nada.
      if (localStorage.getItem('txoko_pdv_auto_print') !== 'off') {
        window.open(`/pedidos/${id}/imprimir`, '_blank', 'width=420,height=640')
      }
    })
  }

  function openEdit(orderId: string) {
    setEditOrderId(orderId)
  }

  function openSplit(orderId: string) {
    setSplitOrderId(orderId)
  }

  function openPrint(orderId: string) {
    window.open(`/pedidos/${orderId}/imprimir`, '_blank')
  }

  function openComanda(orderId: string) {
    window.open(`/pedidos/${orderId}/comanda`, '_blank')
  }

  function locationOf(order: Order): string {
    const table = order.table_id
      ? tables.find((t) => t.id === order.table_id)
      : null
    if (table) return `Mesa ${table.number}`
    if (order.type === 'delivery') return 'Delivery'
    if (order.type === 'takeaway') return 'Retirada'
    return 'Balcao'
  }

  const STATUS_FILTERS: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'active', label: 'Em andamento', count: counts.active },
    { key: 'completed', label: 'Concluidos', count: counts.completed },
    { key: 'cancelled', label: 'Cancelados', count: counts.cancelled },
    { key: 'all', label: 'Todos', count: counts.all },
  ]

  return (
    <div className="-mx-8 -my-6 flex min-h-0 flex-1 flex-col">
      {/* Cabecalho da tela: titulo e filtros ficam — so as listas rolam. */}
      <div className="shrink-0 border-b border-rule-faint px-8 pb-4 pt-6">
        <PageHeader
          title="Pedidos"
          subtitle={`${orders.length} ${orders.length === 1 ? 'pedido recente' : 'pedidos recentes'}`}
          border={false}
        />
        <div className="flex items-center justify-between gap-4">
          {view === 'lista' ? (
            <TabBar
              variant="chip"
              aria-label="Situacao do pedido"
              tabs={STATUS_FILTERS.map((s) => ({
                key: s.key,
                label: s.label,
                count: s.count,
              }))}
              active={statusFilter}
              onChange={(key) => setStatusFilter(key as StatusFilter)}
            />
          ) : (
            <p className="text-[12px] text-ink-muted">
              Fluxo dos pedidos em andamento — fechados e cancelados ficam na
              lista.
            </p>
          )}

          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-center gap-1">
              {TYPE_TABS.map((t) => {
                const active = typeFilter === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setTypeFilter(t.key)}
                    aria-pressed={active}
                    className={cn(
                      'flex h-11 items-center rounded-[9px] px-2.5 text-[11.5px] font-medium tracking-tight transition-colors',
                      active
                        ? 'text-ink'
                        : 'text-ink-muted hover:bg-sunken hover:text-ink'
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            <div
              role="group"
              aria-label="Formato de exibicao"
              className="flex h-11 items-center gap-0.5 rounded-[12px] border border-rule p-1"
            >
              <button
                onClick={() => changeView('lista')}
                aria-pressed={view === 'lista'}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-semibold transition-colors',
                  view === 'lista'
                    ? 'bg-teal-soft text-teal-deep'
                    : 'text-ink-soft hover:bg-sunken hover:text-ink'
                )}
              >
                <List size={13} strokeWidth={2} aria-hidden />
                Lista
              </button>
              <button
                onClick={() => changeView('quadro')}
                aria-pressed={view === 'quadro'}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[12px] font-semibold transition-colors',
                  view === 'quadro'
                    ? 'bg-teal-soft text-teal-deep'
                    : 'text-ink-soft hover:bg-sunken hover:text-ink'
                )}
              >
                <LayoutGrid size={13} strokeWidth={2} aria-hidden />
                Quadro
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {view === 'lista' ? (
          /* Lista — rola sozinha; cabecalho e painel de detalhe ficam. */
          <section className="thin-scroll min-w-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState
                title="Nenhum pedido neste filtro"
                hint="Troque o status ou o tipo de pedido para ver os outros."
              />
            ) : (
              <div className="divide-y divide-rule-faint">
                {filtered.map((order) => {
                  const orderItems = itemsByOrder[order.id] ?? []
                  const minutes = getMinutesAgo(order.created_at)
                  const active = selectedOrderId === order.id
                  const code = comandaCode(order)
                  const isTerminal = TERMINAL_STATUSES.includes(order.status)

                  return (
                    <div
                      key={order.id}
                      className={cn(
                        'group relative flex items-center gap-4 px-8 py-4 transition-colors',
                        active ? 'bg-teal-tint' : 'hover:bg-sunken'
                      )}
                    >
                      {active && (
                        <span className="absolute bottom-0 left-0 top-0 w-px bg-teal" />
                      )}

                      {/* Clickable main area */}
                      <button
                        onClick={() => setSelectedOrderId(order.id)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        {/* Numero da comanda: e o codigo que a equipe fala.
                            Pedido sem cartao cai no hex curto, apagado. */}
                        <span
                          className={cn(
                            'font-data w-14 shrink-0',
                            code.isCard
                              ? 'text-[13px] font-semibold text-ink'
                              : 'text-[11px] text-ink-muted'
                          )}
                        >
                          {code.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-medium tracking-tight text-ink">
                              {locationOf(order)}
                            </span>
                            <span className="text-[11px] tracking-tight text-ink-muted">·</span>
                            <span className="text-[11px] tracking-tight text-ink-muted">
                              {STATUS_LABEL[order.status] ?? order.status}
                            </span>
                            <span className="text-[11px] tracking-tight text-ink-muted">·</span>
                            <span className="text-[11px] tracking-tight text-ink-muted">
                              {SOURCE_LABEL[order.source] ?? order.source}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] tracking-tight text-ink-muted">
                            {orderItems.length}{' '}
                            {orderItems.length === 1 ? 'item' : 'itens'} —{' '}
                            {orderItems
                              .map((i) => {
                                const p = products.find((pr) => pr.id === i.product_id)
                                return `${i.quantity}× ${p?.name || '?'}`
                              })
                              .join(', ')}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-data text-[13px] font-medium tracking-tight text-ink">
                            {formatCurrency(order.total)}
                          </span>
                          <span
                            className={cn(
                              'font-data text-[10px]',
                              ageTone(minutes, order.status)
                            )}
                          >
                            {minutes}m
                          </span>
                        </div>
                      </button>

                      {/* Row action buttons */}
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(order.id)}
                          disabled={BLOCKED_EDIT_STATUSES.includes(order.status)}
                          title="Editar pedido"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => openSplit(order.id)}
                          disabled={isTerminal}
                          title="Dividir conta"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <SplitSquareVertical size={12} />
                        </button>
                        <button
                          onClick={() => openPrint(order.id)}
                          title="Imprimir recibo"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                        >
                          <Printer size={12} />
                        </button>
                        {!isTerminal && (
                          <button
                            onClick={() => setCancelOrderId(order.id)}
                            title="Cancelar pedido"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-red-tint hover:text-red"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : (
          /* Quadro — colunas por status, cada uma com rolagem propria. */
          <section className="thin-scroll min-w-0 flex-1 overflow-x-auto">
            <div className="flex h-full min-w-max gap-4 px-8 py-5">
              {KANBAN_COLS.map((col) => {
                const colOrders = boardOrders.filter((o) => o.status === col.status)
                return (
                  <div
                    key={col.status}
                    className="flex h-full w-[270px] shrink-0 flex-col rounded-[14px] border border-rule-faint bg-panel-veil"
                  >
                    <header className="flex shrink-0 items-baseline justify-between px-4 pb-2 pt-3.5">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                        {col.label}
                      </span>
                      <span className="font-data text-[11px] text-ink-soft">
                        {colOrders.length}
                      </span>
                    </header>
                    <div className="thin-scroll flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5">
                      {colOrders.length === 0 ? (
                        <p className="px-1.5 py-6 text-center text-[11.5px] text-ink-muted">
                          Nenhum pedido
                        </p>
                      ) : (
                        colOrders.map((order) => {
                          const code = comandaCode(order)
                          const orderItems = itemsByOrder[order.id] ?? []
                          const minutes = getMinutesAgo(order.created_at)
                          const active = selectedOrderId === order.id
                          return (
                            <div
                              key={order.id}
                              className={cn(
                                'rounded-[12px] border bg-panel transition-colors',
                                active
                                  ? 'border-teal'
                                  : 'border-rule-faint hover:border-teal'
                              )}
                            >
                              <button
                                onClick={() => setSelectedOrderId(order.id)}
                                className="w-full p-3 text-left"
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span
                                    className={cn(
                                      'font-data',
                                      code.isCard
                                        ? 'text-[13px] font-semibold text-ink'
                                        : 'text-[11px] text-ink-muted'
                                    )}
                                  >
                                    {code.label}
                                  </span>
                                  <span className="font-data text-[12.5px] text-ink">
                                    {formatCurrency(order.total)}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-[11.5px] text-ink-soft">
                                  {locationOf(order)} · {orderItems.length}{' '}
                                  {orderItems.length === 1 ? 'item' : 'itens'}
                                </p>
                                <p
                                  className={cn(
                                    'mt-1.5 flex items-center gap-1 font-data text-[10.5px]',
                                    ageTone(minutes, order.status)
                                  )}
                                >
                                  <Clock size={10} aria-hidden />
                                  {minutes}m
                                  <span className="ml-auto font-sans text-[10px] text-ink-muted">
                                    {SOURCE_LABEL[order.source] ?? order.source}
                                  </span>
                                </p>
                              </button>
                              <div className="px-3 pb-2.5">
                                <button
                                  onClick={() => {
                                    if (col.advance === 'checkout') {
                                      setSelectedOrderId(order.id)
                                      setShowCheckout(true)
                                    } else {
                                      doSetStatus(order.id, col.advance)
                                    }
                                  }}
                                  disabled={pending}
                                  className="h-9 w-full rounded-[8px] border border-rule text-[11.5px] font-semibold text-ink-soft transition-colors hover:border-teal hover:bg-teal-soft hover:text-teal-deep disabled:opacity-40"
                                >
                                  {col.advanceLabel}
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Detail panel */}
        {selectedOrder && (
          <aside
            data-pane="detail"
            className="flex min-h-0 w-[360px] shrink-0 flex-col border-l border-rule"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-rule-faint px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-data text-[13px] font-semibold text-ink">
                    {comandaCode(selectedOrder).label}
                  </span>
                  <span className="text-[13px] font-medium tracking-tight text-ink">
                    {selectedTable
                      ? `Mesa ${selectedTable.number}`
                      : selectedOrder.type === 'delivery'
                        ? 'Delivery'
                        : selectedOrder.type === 'takeaway'
                          ? 'Retirada'
                          : 'Balcao'}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[11px] tracking-tight text-ink-muted">
                    {STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status}
                  </span>
                  <span className="text-[11px] text-ink-muted">·</span>
                  <span className="text-[11px] tracking-tight text-ink-muted">
                    {SOURCE_LABEL[selectedOrder.source] ?? selectedOrder.source}
                  </span>
                  <span className="text-[11px] text-ink-muted">·</span>
                  <span className="font-data text-[11px] text-ink-muted">
                    {getMinutesAgo(selectedOrder.created_at)}m
                  </span>
                  {comandaCode(selectedOrder).isCard && (
                    <>
                      <span className="text-[11px] text-ink-muted">·</span>
                      <span className="font-data text-[10px] text-ink-muted">
                        {selectedOrder.id.slice(0, 6)}
                      </span>
                    </>
                  )}
                </div>
                {selectedCustomer && (
                  <p className="mt-1.5 text-[11px] tracking-tight text-ink-soft">
                    {selectedCustomer.name}
                    {selectedCustomer.phone && (
                      <span className="font-data text-ink-muted">
                        {' '}
                        · {selectedCustomer.phone}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Quick action buttons in panel header */}
                <button
                  onClick={() => openComanda(selectedOrder.id)}
                  title="Imprimir comanda"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                >
                  <Printer size={13} />
                </button>
                <button
                  onClick={() => setSelectedOrderId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                  aria-label="Fechar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {selectedOrder.delivery_address && (
              <div className="shrink-0 border-b border-rule-faint px-6 py-4">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                  Entrega
                </p>
                <p className="text-[12px] tracking-tight text-ink">
                  {(selectedOrder.delivery_address as Address).street},{' '}
                  {(selectedOrder.delivery_address as Address).number}
                </p>
                <p className="text-[11px] tracking-tight text-ink-muted">
                  {(selectedOrder.delivery_address as Address).neighborhood} ·{' '}
                  {(selectedOrder.delivery_address as Address).city}
                </p>
                {selectedOrder.notes && (
                  <p className="mt-2 text-[11px] tracking-tight text-amber-text">
                    {selectedOrder.notes}
                  </p>
                )}
              </div>
            )}

            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
              {/* Trilha: o cancelamento e o estorno so valem alguma coisa se
                  sobreviver o registro de quem autorizou e por que. */}
              <div className="border-b border-rule px-6 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  Trilha
                </p>
                <OrderTrail orderId={selectedOrder.id} refreshKey={trailKey} />
              </div>

              <div className="px-6 py-4">
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                  Itens
                </p>
                <div className="space-y-3">
                  {selectedItems.map((item) => {
                    const product = products.find((p) => p.id === item.product_id)
                    return (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] tracking-tight text-ink">
                            <span className="font-data mr-1.5 text-ink-muted">
                              {item.quantity}×
                            </span>
                            {product?.name}
                          </p>
                          {item.notes && (
                            <p className="ml-5 mt-0.5 text-[10px] tracking-tight text-amber-text">
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <span className="font-data shrink-0 text-[11px] text-ink-muted">
                          {formatCurrency(item.total_price)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Totais presos no rodape do painel — com muitos itens, o total
                nao pode morar la embaixo do scroll. */}
            <div className="shrink-0 space-y-1.5 border-t border-rule-faint px-6 py-4">
              <Row label="Subtotal" value={formatCurrency(selectedOrder.subtotal)} />
              {selectedOrder.service_fee > 0 && (
                <Row
                  label="Taxa de servico"
                  value={formatCurrency(selectedOrder.service_fee)}
                />
              )}
              {selectedOrder.delivery_fee > 0 && (
                <Row
                  label="Taxa de entrega"
                  value={formatCurrency(selectedOrder.delivery_fee)}
                />
              )}
              {selectedOrder.discount > 0 && (
                <Row
                  label="Desconto"
                  value={`-${formatCurrency(selectedOrder.discount)}`}
                  accent
                />
              )}
              <div className="mt-1 flex items-baseline justify-between border-t border-rule-faint pt-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  Total
                </span>
                <span className="font-data text-[16px] font-medium tracking-tight text-ink">
                  {formatCurrency(selectedOrder.total)}
                </span>
              </div>
            </div>

            {/* Actions */}
            {selectedOrder.status !== 'closed' &&
              selectedOrder.status !== 'cancelled' && (
                <div className="shrink-0 border-t border-rule-faint px-6 py-5">
                  {!showCheckout ? (
                    <div className="space-y-2">
                      {/* Edit + Split quick buttons */}
                      <div className="mb-1 flex gap-2">
                        <button
                          onClick={() => openEdit(selectedOrder.id)}
                          disabled={BLOCKED_EDIT_STATUSES.includes(selectedOrder.status)}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-rule text-[11px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Pencil size={11} />
                          Editar
                        </button>
                        <button
                          onClick={() => openSplit(selectedOrder.id)}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-rule text-[11px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                        >
                          <SplitSquareVertical size={11} />
                          Dividir
                        </button>
                      </div>

                      {selectedOrder.status === 'open' && (
                        <button
                          onClick={() => doSetStatus(selectedOrder.id, 'preparing')}
                          className="h-10 w-full rounded-md bg-teal text-[13px] font-medium text-on-teal transition-colors hover:bg-teal-deep"
                        >
                          Aceitar pedido
                        </button>
                      )}
                      {selectedOrder.status === 'preparing' && (
                        <button
                          onClick={() => doSetStatus(selectedOrder.id, 'ready')}
                          className="h-10 w-full rounded-md bg-teal text-[13px] font-medium text-on-teal transition-colors hover:bg-teal-deep"
                        >
                          Marcar pronto
                        </button>
                      )}
                      {selectedOrder.status === 'ready' && (
                        <button
                          onClick={() => doSetStatus(selectedOrder.id, 'delivered')}
                          className="h-10 w-full rounded-md bg-teal text-[13px] font-medium text-on-teal transition-colors hover:bg-teal-deep"
                        >
                          Marcar entregue
                        </button>
                      )}
                      {(selectedOrder.status === 'delivered' ||
                        selectedOrder.status === 'ready') && (
                        <button
                          onClick={() => setShowCheckout(true)}
                          className="h-10 w-full rounded-md bg-teal text-[13px] font-medium text-on-teal transition-colors hover:bg-teal-deep"
                        >
                          Fechar conta
                        </button>
                      )}
                      {/* Cancelar deixou de ser uma troca de status solta: agora
                          pede motivo, decide o estorno e registra quem
                          autorizou. */}
                      <button
                        onClick={() => setCancelOrderId(selectedOrder.id)}
                        className="h-11 w-full rounded-[11px] border border-rule text-[12.5px] font-semibold text-red transition-colors hover:bg-red-tint"
                      >
                        Cancelar pedido
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Metodo de pagamento
                      </p>
                      <div className="grid grid-cols-4 gap-1">
                        {(['pix', 'credit', 'debit', 'cash'] as const).map((m) => {
                          const active = checkoutMethod === m
                          return (
                            <button
                              key={m}
                              onClick={() => setCheckoutMethod(m)}
                              className={cn(
                                'h-9 rounded-md text-[11px] font-medium tracking-tight transition-colors',
                                active
                                  ? 'bg-teal text-on-teal'
                                  : 'text-ink-soft hover:bg-sunken hover:text-ink'
                              )}
                            >
                              {PAYMENT_LABEL[m]}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCheckout(false)}
                          className="h-9 flex-1 rounded-md text-[12px] text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
                        >
                          Voltar
                        </button>
                        <button
                          onClick={doCheckout}
                          disabled={pending}
                          className="h-9 flex-1 rounded-md bg-teal text-[12px] font-medium text-on-teal transition-colors hover:bg-teal-deep disabled:opacity-40"
                        >
                          {pending
                            ? 'Processando'
                            : `Confirmar ${formatCurrency(selectedOrder.total)}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </aside>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red bg-red-tint px-4 py-2.5 text-[13px] font-medium text-red shadow-e3"
        >
          {actionError}
        </div>
      )}

      {/* Edit Order Modal */}
      {editOrder && (
        <EditOrderModal
          order={editOrder}
          items={editItems}
          products={products}
          onClose={() => setEditOrderId(null)}
          onSaved={() => setEditOrderId(null)}
        />
      )}

      {/* Split Bill Modal */}
      {splitOrder && (
        <SplitBillModal
          order={splitOrder}
          items={splitItems}
          products={products}
          onClose={() => setSplitOrderId(null)}
          onDone={() => {
            setSplitOrderId(null)
            setSelectedOrderId(null)
          }}
        />
      )}

      {/* Cancelamento com estorno e trilha */}
      {cancelTarget && (
        <CancelOrderModal
          orderId={cancelTarget.id}
          orderStatus={cancelTarget.status}
          orderTotal={cancelTarget.total}
          sourceLabel={SOURCE_LABEL[cancelTarget.source] ?? cancelTarget.source}
          canCancel={canCancel}
          onClose={() => setCancelOrderId(null)}
          onCancelled={() => {
            setCancelOrderId(null)
            setTrailKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

function Row({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="tracking-tight text-ink-muted">{label}</span>
      <span className={cn('font-data', accent ? 'text-teal-deep' : 'text-ink-soft')}>
        {value}
      </span>
    </div>
  )
}
