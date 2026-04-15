'use client'

import { useEffect, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Order, OrderItem, Product, Table, TableStatus } from '@txoko/shared'
import { X, Users, UtensilsCrossed, QrCode, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateTableStatus } from './actions'

const STATUS_CONFIG: Record<TableStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Disponivel', color: 'text-leaf', bg: 'bg-leaf/10 border-primary/30' },
  occupied: { label: 'Ocupada', color: 'text-warm', bg: 'bg-warm/10 border-warm/30' },
  reserved: { label: 'Reservada', color: 'text-stone-light', bg: 'bg-stone/10 border-stone/30' },
  cleaning: { label: 'Limpando', color: 'text-coral', bg: 'bg-coral/10 border-coral/30' },
}

function getOccupiedMinutes(occupiedAt: string | null): number {
  if (!occupiedAt) return 0
  return Math.floor((Date.now() - new Date(occupiedAt).getTime()) / 60000)
}

type OrderWithItems = Order & { items: OrderItem[] }

type Props = {
  tables: Table[]
  ordersByTable: Record<string, OrderWithItems>
  products: Pick<Product, 'id' | 'name'>[]
  restaurantSlug: string
  restaurantId: string
}

export function MesasView({
  tables: initialTables,
  ordersByTable: initialOrdersByTable,
  products,
  restaurantSlug,
  restaurantId,
}: Props) {
  const [tables, setTables] = useState(initialTables)
  const [ordersByTable, setOrdersByTable] = useState(initialOrdersByTable)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [filterArea, setFilterArea] = useState<string | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()

    const tablesChannel = supabase
      .channel(`mesas-tables-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tables',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as Table
            setTables((prev) => prev.map((t) => (t.id === row.id ? row : t)))
          } else if (payload.eventType === 'INSERT') {
            const row = payload.new as Table
            setTables((prev) =>
              prev.some((t) => t.id === row.id) ? prev : [...prev, row]
            )
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as Table
            setTables((prev) => prev.filter((t) => t.id !== row.id))
          }
        }
      )
      .subscribe()

    const ordersChannel = supabase
      .channel(`mesas-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Order
          if (!row?.table_id) return
          const active = ['open', 'preparing', 'ready'].includes(
            (payload.new as Order)?.status ?? ''
          )
          setOrdersByTable((prev) => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE' || !active) {
              const key = row.table_id as string
              if (next[key]?.id === row.id) delete next[key]
              return next
            }
            const newRow = payload.new as Order
            next[newRow.table_id as string] = {
              ...newRow,
              items: next[newRow.table_id as string]?.items ?? [],
            } as OrderWithItems
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tablesChannel)
      supabase.removeChannel(ordersChannel)
    }
  }, [restaurantId])

  const areas = [...new Set(tables.map((t) => t.area))]
  const filteredTables = filterArea ? tables.filter((t) => t.area === filterArea) : tables

  const counts: Record<TableStatus, number> = {
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
    cleaning: tables.filter((t) => t.status === 'cleaning').length,
  }

  const activeOrder = selectedTable ? ordersByTable[selectedTable.id] : null

  function handleStatusChange(id: string, status: TableStatus) {
    startTransition(async () => {
      await updateTableStatus(id, status)
      setSelectedTable((prev) =>
        prev && prev.id === id
          ? { ...prev, status, occupied_at: status === 'occupied' ? new Date().toISOString() : null }
          : prev
      )
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cloud">Mesas</h1>
          <p className="text-sm text-stone mt-1">
            {counts.occupied} ocupadas, {counts.available} disponiveis, {counts.reserved} reservadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setFilterArea(area === filterArea ? null : area)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filterArea === area
                  ? 'bg-primary/10 text-primary'
                  : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
              }`}
            >
              {area === 'main' ? 'Salao' : area === 'terrace' ? 'Terraco' : area}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${config.bg} border`} />
            <span className="text-xs text-stone">
              {config.label} ({counts[status as TableStatus]})
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <div className="grid grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredTables.map((table) => {
              const config = STATUS_CONFIG[table.status]
              const minutes = getOccupiedMinutes(table.occupied_at)
              const tableOrder = ordersByTable[table.id]
              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTable(table.id === selectedTable?.id ? null : table)}
                  className={cn(
                    'relative p-4 rounded-xl border-2 transition-all text-center',
                    config.bg,
                    selectedTable?.id === table.id && 'ring-2 ring-primary ring-offset-2 ring-offset-night',
                    'hover:scale-[1.02]'
                  )}
                >
                  <p className="text-lg font-bold text-cloud font-data">{table.number}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <Users size={12} className="text-stone" />
                    <span className="text-xs text-stone font-data">{table.capacity}</span>
                  </div>
                  <p className={`text-[10px] font-medium mt-1.5 ${config.color}`}>{config.label}</p>
                  {table.status === 'occupied' && minutes > 0 && (
                    <div
                      className={cn(
                        'absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold font-data',
                        minutes > 60
                          ? 'bg-coral text-white'
                          : minutes > 30
                          ? 'bg-accent text-black'
                          : 'bg-night-lighter text-cloud'
                      )}
                    >
                      {minutes}m
                    </div>
                  )}
                  {tableOrder && (
                    <p className="text-[10px] text-stone font-data mt-1">
                      {formatCurrency(tableOrder.total)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {selectedTable && (
          <div className="w-80 bg-night-light border border-night-lighter rounded-xl flex flex-col">
            <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-cloud">Mesa {selectedTable.number}</h3>
                <p className="text-xs text-stone">
                  {selectedTable.capacity} lugares — {selectedTable.area === 'main' ? 'Salao' : 'Terraco'}
                </p>
              </div>
              <button onClick={() => setSelectedTable(null)} className="p-1 text-stone hover:text-cloud">
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-night-lighter">
              <p className="text-xs text-stone mb-2">Alterar status:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(['available', 'occupied', 'reserved', 'cleaning'] as const).map((status) => {
                  const cfg = STATUS_CONFIG[status]
                  return (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(selectedTable.id, status)}
                      className={cn(
                        'py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        selectedTable.status === status
                          ? `${cfg.bg} ${cfg.color}`
                          : 'bg-night border-night-lighter text-stone hover:text-cloud'
                      )}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="px-4 py-2 border-b border-night-lighter">
              <button
                onClick={() => setShowQR(!showQR)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium bg-night border border-night-lighter text-stone-light hover:text-cloud transition-colors"
              >
                <QrCode size={14} />
                {showQR ? 'Ocultar QR Code' : 'QR Code do Cardapio'}
              </button>
              {showQR && restaurantSlug && (
                <div className="mt-2 p-3 bg-white rounded-lg flex flex-col items-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                      `${typeof window !== 'undefined' ? window.location.origin : ''}/menu/${restaurantSlug}?mesa=${selectedTable.number}`
                    )}`}
                    alt={`QR Code Mesa ${selectedTable.number}`}
                    width={150}
                    height={150}
                    className="rounded"
                  />
                  <p className="text-xs text-black font-medium mt-2">Mesa {selectedTable.number}</p>
                  <p className="text-[10px] text-stone-dark mt-0.5">
                    /menu/{restaurantSlug}?mesa={selectedTable.number}
                  </p>
                </div>
              )}
            </div>

            {activeOrder ? (
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-3 border-b border-night-lighter">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone">Pedido</span>
                    <span className="text-sm font-data text-leaf font-medium">
                      #{activeOrder.id.slice(0, 6)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-stone">Tempo</span>
                    <span className="text-xs font-data text-cloud flex items-center gap-1">
                      <Clock size={12} />
                      {getOccupiedMinutes(activeOrder.created_at)}min
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-stone">Status</span>
                    <span className="text-xs font-medium text-warm capitalize">
                      {activeOrder.status}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-night-lighter">
                  {activeOrder.items.map((item) => {
                    const product = products.find((p) => p.id === item.product_id)
                    return (
                      <div key={item.id} className="px-4 py-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-cloud">
                            {item.quantity}x {product?.name}
                          </p>
                          {item.notes && <p className="text-[10px] text-warm">{item.notes}</p>}
                        </div>
                        <span className="text-xs font-data text-stone">
                          {formatCurrency(item.total_price)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="px-4 py-3 border-t border-night-lighter">
                  <div className="flex justify-between font-bold text-sm">
                    <span className="text-cloud">Total</span>
                    <span className="font-data text-leaf">{formatCurrency(activeOrder.total)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-stone p-4">
                <UtensilsCrossed size={24} className="mb-2 opacity-30" />
                <p className="text-sm">Sem pedido ativo</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
