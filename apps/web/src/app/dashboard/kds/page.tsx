'use client'

import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Order, OrderItem } from '@txoko/shared'
import type { OrderStatus, OrderItemStatus } from '@txoko/shared'
import { Clock, ChefHat, CheckCircle2, AlertTriangle, ArrowRight, Bell } from 'lucide-react'

type KDSStation = 'all' | 'kitchen' | 'bar' | 'dessert'

const KITCHEN_CATEGORIES = ['cat-1', 'cat-2', 'cat-3', 'cat-4']
const BAR_CATEGORIES = ['cat-6', 'cat-7', 'cat-8']
const DESSERT_CATEGORIES = ['cat-5']

function getStationForProduct(categoryId: string): KDSStation {
  if (BAR_CATEGORIES.includes(categoryId)) return 'bar'
  if (DESSERT_CATEGORIES.includes(categoryId)) return 'dessert'
  return 'kitchen'
}

function getElapsedMinutes(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

interface KDSOrderCard {
  order: Order
  items: OrderItem[]
  tableNumber: number | null
}

export default function KDSPage() {
  const { orders, orderItems, products, tables, updateOrderStatus, updateOrderItemStatus } = useStore()
  const [station, setStation] = useState<KDSStation>('all')
  const [, setTick] = useState(0)

  // Update timer every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(interval)
  }, [])

  const activeOrders = useMemo(() => {
    return orders
      .filter(o => o.status !== 'closed' && o.status !== 'cancelled' && o.status !== 'delivered')
      .map(order => {
        const items = (orderItems[order.id] || []).filter(item => {
          if (station === 'all') return true
          const product = products.find(p => p.id === item.product_id)
          if (!product) return false
          return getStationForProduct(product.category_id) === station
        })
        const table = order.table_id ? tables.find(t => t.id === order.table_id) : null
        return { order, items, tableNumber: table?.number ?? null } as KDSOrderCard
      })
      .filter(card => card.items.length > 0)
  }, [orders, orderItems, products, tables, station])

  const columns: { status: OrderItemStatus; label: string; icon: typeof Clock; color: string }[] = [
    { status: 'pending', label: 'Pendente', icon: Bell, color: 'text-coral' },
    { status: 'preparing', label: 'Preparando', icon: ChefHat, color: 'text-warm' },
    { status: 'ready', label: 'Pronto', icon: CheckCircle2, color: 'text-leaf' },
  ]

  function getOrdersForColumn(status: OrderItemStatus): KDSOrderCard[] {
    return activeOrders
      .map(card => ({
        ...card,
        items: card.items.filter(item => item.status === status),
      }))
      .filter(card => card.items.length > 0)
  }

  function moveAllItems(orderId: string, fromStatus: OrderItemStatus, toStatus: OrderItemStatus) {
    const items = orderItems[orderId] || []
    items.forEach(item => {
      if (item.status === fromStatus) {
        updateOrderItemStatus(orderId, item.id, toStatus)
      }
    })

    // If moving to "ready", check if all items in order are ready
    if (toStatus === 'ready') {
      const allItems = orderItems[orderId] || []
      const allReady = allItems.every(item =>
        item.status === 'ready' || item.status === 'delivered' || item.id === items[0]?.id
      )
      if (allReady) {
        updateOrderStatus(orderId, 'ready')
      }
    }
  }

  function acceptOrder(orderId: string) {
    const items = orderItems[orderId] || []
    items.forEach(item => {
      if (item.status === 'pending') {
        updateOrderItemStatus(orderId, item.id, 'preparing')
      }
    })
    updateOrderStatus(orderId, 'preparing')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cloud">KDS</h1>
          <p className="text-sm text-stone mt-1">Kitchen Display System</p>
        </div>
        <div className="flex items-center gap-2">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'kitchen', label: 'Cozinha' },
            { key: 'bar', label: 'Bar' },
            { key: 'dessert', label: 'Confeitaria' },
          ] as const).map(s => (
            <button
              key={s.key}
              onClick={() => setStation(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                station === s.key ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
        {columns.map(col => {
          const colOrders = getOrdersForColumn(col.status)
          return (
            <div key={col.status} className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <col.icon size={16} className={col.color} />
                <h2 className={`text-sm font-semibold ${col.color}`}>{col.label}</h2>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-night-lighter text-cloud">
                  {colOrders.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {colOrders.map(card => {
                  const elapsed = getElapsedMinutes(card.order.created_at)
                  const estimatedTime = card.order.estimated_time || 20
                  const isLate = elapsed > estimatedTime
                  const isWarning = elapsed > estimatedTime * 0.8

                  return (
                    <div
                      key={`${card.order.id}-${col.status}`}
                      className={cn(
                        'bg-night-light border rounded-xl overflow-hidden',
                        isLate ? 'border-coral/50 bg-coral/5' : isWarning ? 'border-warm/30' : 'border-night-lighter'
                      )}
                    >
                      {/* Card Header */}
                      <div className="px-3 py-2 border-b border-night-lighter flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold font-data text-leaf">
                            #{card.order.id.split('-')[1]}
                          </span>
                          {card.tableNumber ? (
                            <span className="text-xs text-cloud">Mesa {card.tableNumber}</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-leaf/10 text-leaf">
                              {card.order.type === 'delivery' ? 'Delivery' : card.order.type === 'takeaway' ? 'Retirada' : 'Balcao'}
                            </span>
                          )}
                          {card.order.source !== 'pos' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warm/10 text-warm uppercase">
                              {card.order.source}
                            </span>
                          )}
                        </div>
                        <div className={cn(
                          'flex items-center gap-1 text-xs font-data',
                          isLate ? 'text-coral' : isWarning ? 'text-warm' : 'text-stone'
                        )}>
                          {isLate && <AlertTriangle size={12} />}
                          <Clock size={12} />
                          {elapsed}m
                        </div>
                      </div>

                      {/* Items */}
                      <div className="px-3 py-2 space-y-1">
                        {card.items.map(item => {
                          const product = products.find(p => p.id === item.product_id)
                          return (
                            <div key={item.id} className="flex items-start justify-between">
                              <div>
                                <p className="text-sm text-cloud">
                                  <span className="font-bold font-data text-leaf mr-1">{item.quantity}x</span>
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

                      {/* Actions */}
                      <div className="px-3 py-2 border-t border-night-lighter">
                        {col.status === 'pending' && (
                          <button
                            onClick={() => acceptOrder(card.order.id)}
                            className="w-full py-1.5 bg-warm/10 text-warm rounded-lg text-xs font-semibold hover:bg-warm/20 transition-colors flex items-center justify-center gap-1"
                          >
                            <ChefHat size={14} />
                            Aceitar
                          </button>
                        )}
                        {col.status === 'preparing' && (
                          <button
                            onClick={() => moveAllItems(card.order.id, 'preparing', 'ready')}
                            className="w-full py-1.5 bg-leaf/10 text-leaf rounded-lg text-xs font-semibold hover:bg-leaf/20 transition-colors flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 size={14} />
                            Marcar Pronto
                          </button>
                        )}
                        {col.status === 'ready' && (
                          <button
                            onClick={() => {
                              moveAllItems(card.order.id, 'ready', 'delivered')
                              updateOrderStatus(card.order.id, 'delivered')
                            }}
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

                {colOrders.length === 0 && (
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
