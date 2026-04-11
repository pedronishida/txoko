'use client'

import { useState, useMemo, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency } from '@/lib/utils'
import type { Order, OrderItem } from '@txoko/shared'
import type { OrderStatus, OrderType } from '@txoko/shared'
import {
  Clock, X, MapPin, Truck, ShoppingBag, UtensilsCrossed,
  CheckCircle2, XCircle, ChefHat, Package as PackageIcon
} from 'lucide-react'

type TypeFilter = 'all' | OrderType
type StatusFilter = 'all' | OrderStatus

const TYPE_TABS: { key: TypeFilter; label: string; icon: typeof UtensilsCrossed }[] = [
  { key: 'all', label: 'Todos', icon: ShoppingBag },
  { key: 'dine_in', label: 'Salao', icon: UtensilsCrossed },
  { key: 'delivery', label: 'Delivery', icon: Truck },
  { key: 'takeaway', label: 'Retirada', icon: PackageIcon },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Aberto', color: 'text-warm', bg: 'bg-warm/10' },
  preparing: { label: 'Preparando', color: 'text-warm', bg: 'bg-warm/10' },
  ready: { label: 'Pronto', color: 'text-leaf', bg: 'bg-leaf/10' },
  delivered: { label: 'Entregue', color: 'text-stone-light', bg: 'bg-stone/10' },
  closed: { label: 'Fechado', color: 'text-stone', bg: 'bg-stone/10' },
  cancelled: { label: 'Cancelado', color: 'text-coral', bg: 'bg-coral/10' },
}

const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  pos: { label: 'PDV', color: 'bg-night-lighter text-stone-light' },
  qrcode: { label: 'QR Code', color: 'bg-leaf/10 text-leaf' },
  ifood: { label: 'iFood', color: 'bg-coral/10 text-coral' },
  rappi: { label: 'Rappi', color: 'bg-warm/10 text-warm' },
  whatsapp: { label: 'WhatsApp', color: 'bg-leaf/10 text-leaf' },
  website: { label: 'Site', color: 'bg-cloud/10 text-cloud' },
}

function getMinutesAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

export default function PedidosPage() {
  const { orders, orderItems, products, tables, updateOrderStatus } = useStore()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (typeFilter !== 'all' && o.type !== typeFilter) return false
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      return true
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [orders, typeFilter, statusFilter])

  const counts = useMemo(() => ({
    all: orders.length,
    open: orders.filter(o => o.status === 'open').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready: orders.filter(o => o.status === 'ready').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  }), [orders])

  const selectedOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null
  const selectedItems = selectedOrder ? (orderItems[selectedOrder.id] || []) : []
  const selectedTable = selectedOrder?.table_id ? tables.find(t => t.id === selectedOrder.table_id) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cloud">Pedidos</h1>
          <p className="text-sm text-stone mt-1">{orders.length} pedidos hoje</p>
        </div>
      </div>

      {/* Status Counters */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { key: 'all', label: 'Total', count: counts.all, color: 'text-cloud' },
          { key: 'open', label: 'Abertos', count: counts.open, color: 'text-warm' },
          { key: 'preparing', label: 'Preparando', count: counts.preparing, color: 'text-warm' },
          { key: 'ready', label: 'Prontos', count: counts.ready, color: 'text-leaf' },
          { key: 'delivered', label: 'Entregues', count: counts.delivered, color: 'text-stone-light' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key as StatusFilter)}
            className={cn(
              'bg-night-light border rounded-xl p-3 text-center transition-colors',
              statusFilter === s.key ? 'border-leaf/30' : 'border-night-lighter'
            )}
          >
            <p className={`text-xl font-bold font-data ${s.color}`}>{s.count}</p>
            <p className="text-[10px] text-stone">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Type Tabs */}
      <div className="flex items-center gap-2">
        {TYPE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              typeFilter === tab.key ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Order List */}
        <div className="flex-1 bg-night-light border border-night-lighter rounded-xl">
          <div className="divide-y divide-night-lighter max-h-[65vh] overflow-y-auto">
            {filtered.map(order => {
              const items = orderItems[order.id] || []
              const table = order.table_id ? tables.find(t => t.id === order.table_id) : null
              const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.open
              const sourceCfg = SOURCE_CONFIG[order.source] || SOURCE_CONFIG.pos
              const minutes = getMinutesAgo(order.created_at)

              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-night/30',
                    selectedOrderId === order.id && 'bg-night/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-data text-leaf">#{order.id.split('-')[1]}</span>
                      {table ? (
                        <span className="text-xs text-cloud">Mesa {table.number}</span>
                      ) : order.type === 'delivery' ? (
                        <span className="text-xs text-cloud flex items-center gap-1"><Truck size={12} /> Delivery</span>
                      ) : (
                        <span className="text-xs text-cloud flex items-center gap-1"><PackageIcon size={12} /> Retirada</span>
                      )}
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', sourceCfg.color)}>
                        {sourceCfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-stone mt-0.5 truncate">
                      {items.length} {items.length === 1 ? 'item' : 'itens'} — {items.map(i => {
                        const p = products.find(pr => pr.id === i.product_id)
                        return `${i.quantity}x ${p?.name || '?'}`
                      }).join(', ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-data font-semibold text-cloud">{formatCurrency(order.total)}</p>
                    <div className="flex items-center gap-1.5 justify-end mt-0.5">
                      <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', statusCfg.bg, statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                      <span className="text-[10px] text-stone font-data flex items-center gap-0.5">
                        <Clock size={10} />{minutes}m
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-stone text-sm">Nenhum pedido encontrado</div>
            )}
          </div>
        </div>

        {/* Order Detail Panel */}
        {selectedOrder && (
          <div className="w-80 bg-night-light border border-night-lighter rounded-xl flex flex-col max-h-[65vh]">
            <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-cloud font-data">#{selectedOrder.id.split('-')[1]}</h3>
                  {(() => {
                    const cfg = STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG.open
                    return <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>{cfg.label}</span>
                  })()}
                </div>
                <p className="text-xs text-stone mt-0.5">
                  {selectedTable ? `Mesa ${selectedTable.number}` : selectedOrder.type === 'delivery' ? 'Delivery' : 'Retirada'}
                  {' — '}{(() => { const src = SOURCE_CONFIG[selectedOrder.source]; return src?.label })()}
                </p>
              </div>
              <button onClick={() => setSelectedOrderId(null)} className="p-1 text-stone hover:text-cloud">
                <X size={16} />
              </button>
            </div>

            {/* Delivery Address */}
            {selectedOrder.delivery_address && (
              <div className="px-4 py-2 border-b border-night-lighter">
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-leaf mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-cloud">
                      {(selectedOrder.delivery_address as any).street}, {(selectedOrder.delivery_address as any).number}
                    </p>
                    <p className="text-[10px] text-stone">
                      {(selectedOrder.delivery_address as any).neighborhood} — {(selectedOrder.delivery_address as any).city}
                    </p>
                  </div>
                </div>
                {selectedOrder.notes && (
                  <p className="text-[10px] text-warm mt-1">* {selectedOrder.notes}</p>
                )}
              </div>
            )}

            {/* Timer */}
            <div className="px-4 py-2 border-b border-night-lighter flex items-center justify-between">
              <span className="text-xs text-stone">Tempo</span>
              <span className="text-xs font-data text-cloud flex items-center gap-1">
                <Clock size={12} />
                {getMinutesAgo(selectedOrder.created_at)}min
                {selectedOrder.estimated_time && (
                  <span className="text-stone">/ {selectedOrder.estimated_time}min est.</span>
                )}
              </span>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto divide-y divide-night-lighter">
              {selectedItems.map(item => {
                const product = products.find(p => p.id === item.product_id)
                const itemStatus = STATUS_CONFIG[item.status] || STATUS_CONFIG.open
                return (
                  <div key={item.id} className="px-4 py-2 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-cloud">
                        <span className="font-bold font-data text-leaf mr-1">{item.quantity}x</span>
                        {product?.name}
                      </p>
                      {item.notes && <p className="text-[10px] text-warm">* {item.notes}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs font-data text-stone">{formatCurrency(item.total_price)}</p>
                      <span className={cn('text-[10px]', itemStatus.color)}>{itemStatus.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Totals */}
            <div className="px-4 py-3 border-t border-night-lighter space-y-1 shrink-0">
              <div className="flex justify-between text-xs text-stone">
                <span>Subtotal</span><span className="font-data">{formatCurrency(selectedOrder.subtotal)}</span>
              </div>
              {selectedOrder.service_fee > 0 && (
                <div className="flex justify-between text-xs text-stone">
                  <span>Taxa servico</span><span className="font-data">{formatCurrency(selectedOrder.service_fee)}</span>
                </div>
              )}
              {selectedOrder.delivery_fee > 0 && (
                <div className="flex justify-between text-xs text-stone">
                  <span>Taxa entrega</span><span className="font-data">{formatCurrency(selectedOrder.delivery_fee)}</span>
                </div>
              )}
              {selectedOrder.discount > 0 && (
                <div className="flex justify-between text-xs text-coral">
                  <span>Desconto</span><span className="font-data">-{formatCurrency(selectedOrder.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-night-lighter">
                <span className="text-cloud">Total</span>
                <span className="font-data text-leaf">{formatCurrency(selectedOrder.total)}</span>
              </div>
            </div>

            {/* Actions */}
            {selectedOrder.status !== 'closed' && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
              <div className="px-4 py-3 border-t border-night-lighter flex gap-2 shrink-0">
                {selectedOrder.status === 'open' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'preparing')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-warm/10 text-warm rounded-lg text-xs font-semibold hover:bg-warm/20 transition-colors"
                  >
                    <ChefHat size={14} /> Aceitar
                  </button>
                )}
                {selectedOrder.status === 'preparing' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'ready')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-leaf/10 text-leaf rounded-lg text-xs font-semibold hover:bg-leaf/20 transition-colors"
                  >
                    <CheckCircle2 size={14} /> Pronto
                  </button>
                )}
                {selectedOrder.status === 'ready' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-leaf/10 text-leaf rounded-lg text-xs font-semibold hover:bg-leaf/20 transition-colors"
                  >
                    <CheckCircle2 size={14} /> Entregue
                  </button>
                )}
                <button
                  onClick={() => updateOrderStatus(selectedOrder.id, 'cancelled')}
                  className="px-3 py-2 text-coral rounded-lg text-xs font-medium hover:bg-coral/10 transition-colors"
                >
                  <XCircle size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
