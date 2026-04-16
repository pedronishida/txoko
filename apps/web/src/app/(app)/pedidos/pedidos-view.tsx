'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'
import type {
  Address,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  Product,
  Table,
} from '@txoko/shared'
import { X } from 'lucide-react'
import { setOrderStatus } from './actions'
import { closeOrderWithPayment } from '@/lib/server/payments'
import type { PaymentMethod } from '@txoko/shared'

type TypeFilter = 'all' | OrderType
type StatusFilter = 'all' | OrderStatus

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

function getMinutesAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

type Props = {
  orders: Order[]
  items: OrderItem[]
  products: Pick<Product, 'id' | 'name'>[]
  tables: Pick<Table, 'id' | 'number'>[]
  customers: Pick<import('@txoko/shared').Customer, 'id' | 'name' | 'phone'>[]
  restaurantId: string
}

export function PedidosView({
  orders: initialOrders,
  items: initialItems,
  products,
  tables,
  customers,
  restaurantId,
}: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [items, setItems] = useState(initialItems)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutMethod, setCheckoutMethod] = useState<PaymentMethod>('pix')
  const [, setTick] = useState(0)
  const [pending, startTransition] = useTransition()

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

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (typeFilter !== 'all' && o.type !== typeFilter) return false
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      return true
    })
  }, [orders, typeFilter, statusFilter])

  const counts = useMemo(
    () => ({
      all: orders.length,
      open: orders.filter((o) => o.status === 'open').length,
      preparing: orders.filter((o) => o.status === 'preparing').length,
      ready: orders.filter((o) => o.status === 'ready').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
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

  function doSetStatus(id: string, status: OrderStatus) {
    startTransition(() => {
      void setOrderStatus(id, status)
    })
  }

  function doCheckout() {
    if (!selectedOrder) return
    const id = selectedOrder.id
    const total = selectedOrder.total
    startTransition(async () => {
      await closeOrderWithPayment({
        orderId: id,
        method: checkoutMethod,
        amount: total,
      })
      setShowCheckout(false)
      setSelectedOrderId(null)
    })
  }

  const STATUS_FILTERS: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: counts.all },
    { key: 'open', label: 'Abertos', count: counts.open },
    { key: 'preparing', label: 'Preparando', count: counts.preparing },
    { key: 'ready', label: 'Prontos', count: counts.ready },
    { key: 'delivered', label: 'Entregues', count: counts.delivered },
  ]

  return (
    <div className="-mx-8 -mt-6">
      {/* Header */}
      <div className="px-8 pt-6">
        <PageHeader
          title="Pedidos"
          subtitle={`${orders.length} ${orders.length === 1 ? 'pedido recente' : 'pedidos recentes'}`}
          border={false}
        />
        <div className="flex items-end justify-between gap-4">
          <TabBar
            tabs={STATUS_FILTERS.map((s) => ({
              key: s.key,
              label: s.label,
              count: s.count,
            }))}
            active={statusFilter}
            onChange={(key) => setStatusFilter(key as StatusFilter)}
          />
          <div className="flex items-center gap-5 pb-3 shrink-0">
            {TYPE_TABS.map((t) => {
              const active = typeFilter === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTypeFilter(t.key)}
                  className={cn(
                    'text-[11px] font-medium tracking-tight transition-colors',
                    active ? 'text-cloud' : 'text-stone-dark hover:text-stone'
                  )}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-14rem)]">
        {/* List */}
        <section className={cn('flex-1 min-w-0', selectedOrder && 'border-r border-night-lighter')}>
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-stone tracking-tight">
              Nenhum pedido encontrado
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {filtered.map((order) => {
                const orderItems = itemsByOrder[order.id] ?? []
                const table = order.table_id
                  ? tables.find((t) => t.id === order.table_id)
                  : null
                const minutes = getMinutesAgo(order.created_at)
                const active = selectedOrderId === order.id
                const locationLabel = table
                  ? `Mesa ${table.number}`
                  : order.type === 'delivery'
                    ? 'Delivery'
                    : order.type === 'takeaway'
                      ? 'Retirada'
                      : 'Balcao'

                return (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={cn(
                      'w-full px-8 py-4 flex items-center gap-4 text-left transition-colors',
                      active
                        ? 'bg-night-light/60'
                        : 'hover:bg-night-light/30'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-0 bottom-0 w-px bg-cloud" />
                    )}
                    <span className="text-[11px] font-data text-stone-dark w-14 shrink-0">
                      #{order.id.slice(0, 6)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium text-cloud tracking-tight">
                          {locationLabel}
                        </span>
                        <span className="text-[11px] text-stone-dark tracking-tight">
                          ·
                        </span>
                        <span className="text-[11px] text-stone tracking-tight">
                          {STATUS_LABEL[order.status] ?? order.status}
                        </span>
                        <span className="text-[11px] text-stone-dark tracking-tight">
                          ·
                        </span>
                        <span className="text-[11px] text-stone-dark tracking-tight">
                          {SOURCE_LABEL[order.source] ?? order.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone tracking-tight mt-0.5 truncate">
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
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[13px] font-medium text-cloud font-data tracking-tight">
                        {formatCurrency(order.total)}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark">
                        {minutes}m
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Detail panel */}
        {selectedOrder && (
          <aside className="w-[360px] flex flex-col">
            <div className="px-6 py-5 border-b border-night-lighter flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-data text-stone-dark">
                    #{selectedOrder.id.slice(0, 6)}
                  </span>
                  <span className="text-[13px] font-medium text-cloud tracking-tight">
                    {selectedTable
                      ? `Mesa ${selectedTable.number}`
                      : selectedOrder.type === 'delivery'
                        ? 'Delivery'
                        : selectedOrder.type === 'takeaway'
                          ? 'Retirada'
                          : 'Balcao'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-[11px] text-stone tracking-tight">
                    {STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status}
                  </span>
                  <span className="text-[11px] text-stone-dark">·</span>
                  <span className="text-[11px] text-stone tracking-tight">
                    {SOURCE_LABEL[selectedOrder.source] ?? selectedOrder.source}
                  </span>
                  <span className="text-[11px] text-stone-dark">·</span>
                  <span className="text-[11px] font-data text-stone-dark">
                    {getMinutesAgo(selectedOrder.created_at)}m
                  </span>
                </div>
                {selectedCustomer && (
                  <p className="text-[11px] text-stone-light mt-1.5 tracking-tight">
                    {selectedCustomer.name}
                    {selectedCustomer.phone && (
                      <span className="text-stone-dark font-data">
                        {' '}
                        · {selectedCustomer.phone}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>

            {selectedOrder.delivery_address && (
              <div className="px-6 py-4 border-b border-night-lighter">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-1">
                  Entrega
                </p>
                <p className="text-[12px] text-cloud tracking-tight">
                  {(selectedOrder.delivery_address as Address).street},{' '}
                  {(selectedOrder.delivery_address as Address).number}
                </p>
                <p className="text-[11px] text-stone tracking-tight">
                  {(selectedOrder.delivery_address as Address).neighborhood} ·{' '}
                  {(selectedOrder.delivery_address as Address).city}
                </p>
                {selectedOrder.notes && (
                  <p className="text-[11px] text-warm mt-2 tracking-tight">
                    {selectedOrder.notes}
                  </p>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
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
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-cloud tracking-tight">
                            <span className="font-data text-stone-dark mr-1.5">
                              {item.quantity}×
                            </span>
                            {product?.name}
                          </p>
                          {item.notes && (
                            <p className="text-[10px] text-warm mt-0.5 ml-5 tracking-tight">
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] font-data text-stone-dark shrink-0">
                          {formatCurrency(item.total_price)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 border-t border-night-lighter space-y-1.5">
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
              <div className="pt-2 mt-1 border-t border-night-lighter flex items-baseline justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                  Total
                </span>
                <span className="text-[16px] font-medium text-cloud font-data tracking-tight">
                  {formatCurrency(selectedOrder.total)}
                </span>
              </div>
            </div>

            {/* Actions */}
            {selectedOrder.status !== 'closed' &&
              selectedOrder.status !== 'cancelled' && (
                <div className="px-6 py-5 border-t border-night-lighter">
                  {!showCheckout ? (
                    <div className="space-y-2">
                      {selectedOrder.status === 'open' && (
                        <button
                          onClick={() => doSetStatus(selectedOrder.id, 'preparing')}
                          className="w-full h-9 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
                        >
                          Aceitar pedido
                        </button>
                      )}
                      {selectedOrder.status === 'preparing' && (
                        <button
                          onClick={() => doSetStatus(selectedOrder.id, 'ready')}
                          className="w-full h-9 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
                        >
                          Marcar pronto
                        </button>
                      )}
                      {selectedOrder.status === 'ready' && (
                        <button
                          onClick={() => doSetStatus(selectedOrder.id, 'delivered')}
                          className="w-full h-9 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
                        >
                          Marcar entregue
                        </button>
                      )}
                      {(selectedOrder.status === 'delivered' ||
                        selectedOrder.status === 'ready') && (
                        <button
                          onClick={() => setShowCheckout(true)}
                          className="w-full h-9 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
                        >
                          Fechar conta
                        </button>
                      )}
                      <button
                        onClick={() => doSetStatus(selectedOrder.id, 'cancelled')}
                        className="w-full h-9 text-primary text-[12px] font-medium rounded-md hover:bg-primary/10 transition-colors tracking-tight"
                      >
                        Cancelar pedido
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
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
                                'h-9 text-[11px] font-medium rounded-md transition-colors tracking-tight',
                                active
                                  ? 'bg-cloud text-night'
                                  : 'text-stone-light hover:text-cloud hover:bg-night-light'
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
                          className="flex-1 h-9 text-[12px] text-stone-light hover:text-cloud hover:bg-night-light rounded-md transition-colors"
                        >
                          Voltar
                        </button>
                        <button
                          onClick={doCheckout}
                          disabled={pending}
                          className="flex-1 h-9 bg-cloud text-night text-[12px] font-medium rounded-md hover:bg-cloud-dark transition-colors disabled:opacity-40"
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
      <span className="text-stone tracking-tight">{label}</span>
      <span
        className={cn('font-data', accent ? 'text-primary' : 'text-stone-light')}
      >
        {value}
      </span>
    </div>
  )
}
