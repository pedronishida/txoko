'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Order, OrderItem, OrderItemStatus, Table } from '@txoko/shared'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { acceptOrder, markOrderDelivered, markOrderReady } from './actions'

export type ProductWithStation = {
  id: string
  name: string
  category_id: string | null
  station: 'kitchen' | 'bar' | 'dessert'
}

type MinimalTable = Pick<Table, 'id' | 'number'>
type Station = 'all' | 'kitchen' | 'bar' | 'dessert'

const STATION_LABEL: Record<Station, string> = {
  all: 'Todos',
  kitchen: 'Cozinha',
  bar: 'Bar',
  dessert: 'Confeitaria',
}

const COLUMN_LABEL: Record<OrderItemStatus, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

type Props = {
  initialOrders: Order[]
  initialItems: OrderItem[]
  products: ProductWithStation[]
  tables: MinimalTable[]
  restaurantId: string
}

type KDSCard = {
  order: Order
  items: OrderItem[]
  tableNumber: number | null
}

function elapsedMin(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

export function KdsView({
  initialOrders,
  initialItems,
  products,
  tables,
  restaurantId,
}: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [items, setItems] = useState<OrderItem[]>(initialItems)
  const [station, setStation] = useState<Station>('all')
  const [, setTick] = useState(0)
  const [, startTransition] = useTransition()

  const productById = useMemo(() => {
    const m = new Map<string, ProductWithStation>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const ordersChannel = supabase
      .channel(`kds-orders-${restaurantId}`)
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
              return prev.some((o) => o.id === row.id) ? prev : [...prev, row]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Order
              const active = ['open', 'preparing', 'ready'].includes(row.status)
              const exists = prev.some((o) => o.id === row.id)
              if (!active) return prev.filter((o) => o.id !== row.id)
              if (!exists) return [...prev, row]
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
      .channel(`kds-items-${restaurantId}`)
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

  const cards = useMemo<KDSCard[]>(() => {
    return orders
      .filter((o) => ['open', 'preparing', 'ready'].includes(o.status))
      .map((order) => {
        const orderItems = items.filter((i) => i.order_id === order.id)
        const filteredItems =
          station === 'all'
            ? orderItems
            : orderItems.filter((it) => {
                const prod = productById.get(it.product_id)
                return prod?.station === station
              })
        return {
          order,
          items: filteredItems,
          tableNumber: order.table_id
            ? (tables.find((t) => t.id === order.table_id)?.number ?? null)
            : null,
        }
      })
      .filter((c) => c.items.length > 0)
  }, [orders, items, tables, station, productById])

  const columns: OrderItemStatus[] = ['pending', 'preparing', 'ready']

  function cardsForColumn(status: OrderItemStatus): KDSCard[] {
    return cards
      .map((c) => ({ ...c, items: c.items.filter((i) => i.status === status) }))
      .filter((c) => c.items.length > 0)
  }

  function doAccept(id: string) {
    startTransition(() => {
      void acceptOrder(id)
    })
  }
  function doReady(id: string) {
    startTransition(() => {
      void markOrderReady(id)
    })
  }
  function doDeliver(id: string) {
    startTransition(() => {
      void markOrderDelivered(id)
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -mx-8 -mt-6">
      {/* Header */}
      <header className="px-8 pt-6 pb-5 border-b border-night-lighter flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
            KDS
          </h1>
          <p className="text-[13px] text-stone mt-2 tracking-tight">
            {cards.length === 0
              ? 'Nenhum pedido ativo'
              : `${cards.length} ${cards.length === 1 ? 'pedido ativo' : 'pedidos ativos'}`}
          </p>
        </div>
        <div className="flex items-center gap-5">
          {(['all', 'kitchen', 'bar', 'dessert'] as const).map((s) => {
            const active = station === s
            return (
              <button
                key={s}
                onClick={() => setStation(s)}
                className={cn(
                  'relative text-[12px] font-medium tracking-tight transition-colors pb-1',
                  active
                    ? 'text-cloud'
                    : 'text-stone hover:text-stone-light'
                )}
              >
                {STATION_LABEL[s]}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* Columns */}
      <div className="flex-1 grid grid-cols-3 min-h-0">
        {columns.map((status, idx) => {
          const colCards = cardsForColumn(status)
          return (
            <div
              key={status}
              className={cn(
                'flex flex-col min-h-0 px-6 py-5',
                idx > 0 && 'border-l border-night-lighter'
              )}
            >
              <div className="flex items-baseline justify-between mb-5">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                  {COLUMN_LABEL[status]}
                </h2>
                <span className="text-[11px] font-data text-stone-dark">
                  {colCards.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {colCards.map((card) => {
                  const elapsed = elapsedMin(card.order.created_at)
                  const eta = card.order.estimated_time || 20
                  const isLate = elapsed > eta
                  const isWarn = elapsed > eta * 0.8

                  return (
                    <div
                      key={`${card.order.id}-${status}`}
                      className={cn(
                        'border rounded-lg overflow-hidden transition-colors',
                        isLate
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-night-lighter bg-night-light/40'
                      )}
                    >
                      {/* Card header */}
                      <div className="px-4 py-3 flex items-baseline justify-between gap-3">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-[11px] font-data text-stone-dark">
                            #{card.order.id.slice(0, 6)}
                          </span>
                          <span className="text-[13px] font-medium text-cloud tracking-tight truncate">
                            {card.tableNumber
                              ? `Mesa ${card.tableNumber}`
                              : card.order.type === 'delivery'
                                ? 'Delivery'
                                : card.order.type === 'takeaway'
                                  ? 'Retirada'
                                  : 'Balcao'}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'text-[11px] font-data tracking-tight shrink-0',
                            isLate
                              ? 'text-primary font-medium'
                              : isWarn
                                ? 'text-warm'
                                : 'text-stone-dark'
                          )}
                        >
                          {elapsed}m
                          {isLate && ' · atrasado'}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="px-4 pb-3 space-y-1.5">
                        {card.items.map((item) => {
                          const product = productById.get(item.product_id)
                          return (
                            <div key={item.id}>
                              <p className="text-[12px] text-stone-light tracking-tight leading-snug">
                                <span className="text-cloud font-data mr-1.5">
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
                          )
                        })}
                      </div>

                      {/* Action */}
                      <div className="border-t border-night-lighter">
                        {status === 'pending' && (
                          <button
                            onClick={() => doAccept(card.order.id)}
                            className="w-full h-9 text-[12px] font-medium text-cloud hover:bg-night-lighter transition-colors tracking-tight"
                          >
                            Aceitar
                          </button>
                        )}
                        {status === 'preparing' && (
                          <button
                            onClick={() => doReady(card.order.id)}
                            className="w-full h-9 text-[12px] font-medium text-cloud hover:bg-night-lighter transition-colors tracking-tight"
                          >
                            Marcar pronto
                          </button>
                        )}
                        {status === 'ready' && (
                          <button
                            onClick={() => doDeliver(card.order.id)}
                            className="w-full h-9 text-[12px] font-medium text-cloud hover:bg-night-lighter transition-colors tracking-tight"
                          >
                            Entregar
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {colCards.length === 0 && (
                  <p className="py-6 text-center text-[12px] text-stone tracking-tight">
                    Vazio
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
