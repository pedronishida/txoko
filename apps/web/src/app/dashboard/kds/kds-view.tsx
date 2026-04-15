'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Order, OrderItem, OrderItemStatus, Table } from '@txoko/shared'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  Clock,
  ChefHat,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Bell,
  Coffee,
  UtensilsCrossed,
  IceCream,
  Layers,
} from 'lucide-react'
import { acceptOrder, markOrderDelivered, markOrderReady } from './actions'

export type ProductWithStation = {
  id: string
  name: string
  category_id: string | null
  station: 'kitchen' | 'bar' | 'dessert'
}

type MinimalTable = Pick<Table, 'id' | 'number'>

type Station = 'all' | 'kitchen' | 'bar' | 'dessert'

const STATION_CONFIG: Record<Station, { label: string; icon: typeof Clock }> = {
  all: { label: 'Todos', icon: Layers },
  kitchen: { label: 'Cozinha', icon: UtensilsCrossed },
  bar: { label: 'Bar', icon: Coffee },
  dessert: { label: 'Confeitaria', icon: IceCream },
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

export function KdsView({ initialOrders, initialItems, products, tables, restaurantId }: Props) {
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

  // atualiza contadores de tempo a cada 15s
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(i)
  }, [])

  // realtime subscriptions
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
        // Filtra items pela station selecionada
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
            ? tables.find((t) => t.id === order.table_id)?.number ?? null
            : null,
        }
      })
      .filter((c) => c.items.length > 0)
  }, [orders, items, tables, station, productById])

  const columns: { status: OrderItemStatus; label: string; icon: typeof Clock; color: string }[] = [
    { status: 'pending', label: 'Pendente', icon: Bell, color: 'text-coral' },
    { status: 'preparing', label: 'Preparando', icon: ChefHat, color: 'text-warm' },
    { status: 'ready', label: 'Pronto', icon: CheckCircle2, color: 'text-leaf' },
  ]

  function cardsForColumn(status: OrderItemStatus): KDSCard[] {
    return cards
      .map((c) => ({ ...c, items: c.items.filter((i) => i.status === status) }))
      .filter((c) => c.items.length > 0)
  }

  function doAccept(id: string) {
    startTransition(() => { void acceptOrder(id) })
  }
  function doReady(id: string) {
    startTransition(() => { void markOrderReady(id) })
  }
  function doDeliver(id: string) {
    startTransition(() => { void markOrderDelivered(id) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cloud">KDS</h1>
          <p className="text-sm text-stone mt-1">
            Kitchen Display System — {cards.length} pedidos ativos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'kitchen', 'bar', 'dessert'] as const).map((s) => {
            const cfg = STATION_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => setStation(s)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  station === s
                    ? 'bg-primary/10 text-primary'
                    : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
                )}
              >
                <cfg.icon size={12} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
        {columns.map((col) => {
          const colCards = cardsForColumn(col.status)
          return (
            <div key={col.status} className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <col.icon size={16} className={col.color} />
                <h2 className={`text-sm font-semibold ${col.color}`}>{col.label}</h2>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-night-lighter text-cloud">
                  {colCards.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {colCards.map((card) => {
                  const elapsed = elapsedMin(card.order.created_at)
                  const eta = card.order.estimated_time || 20
                  const isLate = elapsed > eta
                  const isWarn = elapsed > eta * 0.8
                  return (
                    <div
                      key={`${card.order.id}-${col.status}`}
                      className={cn(
                        'bg-night-light border rounded-xl overflow-hidden',
                        isLate
                          ? 'border-coral/50 bg-coral/5'
                          : isWarn
                          ? 'border-warm/30'
                          : 'border-night-lighter'
                      )}
                    >
                      <div className="px-3 py-2 border-b border-night-lighter flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-data text-leaf">
                            #{card.order.id.slice(0, 6)}
                          </span>
                          {card.tableNumber ? (
                            <span className="text-xs text-cloud">Mesa {card.tableNumber}</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                              {card.order.type === 'delivery'
                                ? 'Delivery'
                                : card.order.type === 'takeaway'
                                ? 'Retirada'
                                : 'Balcao'}
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            'flex items-center gap-1 text-xs font-data',
                            isLate ? 'text-coral' : isWarn ? 'text-warm' : 'text-stone'
                          )}
                        >
                          {isLate && <AlertTriangle size={12} />}
                          <Clock size={12} />
                          {elapsed}m
                        </div>
                      </div>

                      <div className="px-3 py-2 space-y-1">
                        {card.items.map((item) => {
                          const product = productById.get(item.product_id)
                          return (
                            <div key={item.id} className="flex items-start justify-between">
                              <div>
                                <p className="text-sm text-cloud">
                                  <span className="font-bold font-data text-leaf mr-1">
                                    {item.quantity}x
                                  </span>
                                  {product?.name}
                                </p>
                                {item.notes && (
                                  <p className="text-[10px] text-warm mt-0.5">* {item.notes}</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="px-3 py-2 border-t border-night-lighter">
                        {col.status === 'pending' && (
                          <button
                            onClick={() => doAccept(card.order.id)}
                            className="w-full py-1.5 bg-warm/10 text-warm rounded-lg text-xs font-semibold hover:bg-warm/20 transition-colors flex items-center justify-center gap-1"
                          >
                            <ChefHat size={14} />
                            Aceitar
                          </button>
                        )}
                        {col.status === 'preparing' && (
                          <button
                            onClick={() => doReady(card.order.id)}
                            className="w-full py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-semibold hover:bg-leaf/20 transition-colors flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 size={14} />
                            Marcar Pronto
                          </button>
                        )}
                        {col.status === 'ready' && (
                          <button
                            onClick={() => doDeliver(card.order.id)}
                            className="w-full py-1.5 bg-stone/10 text-stone-light rounded-lg text-xs font-semibold hover:bg-stone/20 transition-colors flex items-center justify-center gap-1"
                          >
                            <ArrowRight size={14} />
                            Entregue
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {colCards.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-stone">
                    <col.icon size={24} className="mb-2 opacity-20" />
                    <p className="text-xs">Nenhum pedido</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
