'use client'

import { useEffect, useState, useTransition, useCallback, useRef } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Order, OrderItem, Product, Table, TableStatus } from '@txoko/shared'
import { X, QrCode, Download, Printer, Grid2X2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateTableStatus } from './actions'
import { PageHeader } from '@/components/page-header'
import QRCode from 'qrcode'

const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Disponivel',
  occupied: 'Ocupada',
  reserved: 'Reservada',
  cleaning: 'Limpeza',
}

const STATUS_DOT_TONE: Record<TableStatus, 'leaf' | 'warm' | 'stone' | 'primary'> = {
  available: 'leaf',
  occupied: 'warm',
  reserved: 'stone',
  cleaning: 'primary',
}

const AREA_LABEL: Record<string, string> = {
  main: 'Salao',
  terrace: 'Terraco',
}

function getOccupiedMinutes(occupiedAt: string | null): number {
  if (!occupiedAt) return 0
  return Math.floor((Date.now() - new Date(occupiedAt).getTime()) / 60000)
}

type OrderWithItems = Order & { items: OrderItem[] }

type QRModal = {
  table: Table
  dataUrl: string | null
}

type Props = {
  tables: Table[]
  ordersByTable: Record<string, OrderWithItems>
  products: Pick<Product, 'id' | 'name'>[]
  restaurantSlug: string
  restaurantId: string
  restaurantName: string
}

async function generateQr(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: '#1A1A1A', light: '#FFFFFF' },
  })
}

function buildMenuUrl(slug: string, tableNumber: number): string {
  return `https://app.txoko.com.br/menu/${slug}?mesa=${tableNumber}`
}

export function MesasView({
  tables: initialTables,
  ordersByTable: initialOrdersByTable,
  products,
  restaurantSlug,
  restaurantId,
  restaurantName,
}: Props) {
  const [tables, setTables] = useState(initialTables)
  const [ordersByTable, setOrdersByTable] = useState(initialOrdersByTable)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [filterArea, setFilterArea] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<QRModal | null>(null)
  const [, startTransition] = useTransition()
  const qrLoadingRef = useRef(false)

  const openQrModal = useCallback(async (table: Table) => {
    if (qrLoadingRef.current) return
    qrLoadingRef.current = true
    setQrModal({ table, dataUrl: null })
    try {
      const url = buildMenuUrl(restaurantSlug, table.number)
      const dataUrl = await generateQr(url)
      setQrModal({ table, dataUrl })
    } catch {
      setQrModal(null)
    } finally {
      qrLoadingRef.current = false
    }
  }, [restaurantSlug])

  function handleDownloadQr(dataUrl: string, tableNumber: number) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `qr-mesa-${tableNumber}.png`
    a.click()
  }

  function handlePrintQr(dataUrl: string, tableNumber: number) {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code - Mesa ${tableNumber}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: 'DM Sans', sans-serif; background: #fff; }
            img { width: 300px; height: 300px; }
            h2 { margin: 12px 0 4px; font-size: 22px; color: #1A1A1A; }
            p { margin: 0; font-size: 13px; color: #78716C; }
            .cta { margin-top: 8px; font-size: 12px; color: #78716C; }
          </style>
        </head>
        <body>
          <p style="font-size:11px;color:#78716C;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;">${restaurantName}</p>
          <img src="${dataUrl}" alt="QR Mesa ${tableNumber}" />
          <h2>Mesa ${tableNumber}</h2>
          <p>Escaneie para ver o cardapio</p>
          <p class="cta">Peca sem esperar o garcom</p>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `)
    win.document.close()
  }

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
  const filteredTables = filterArea
    ? tables.filter((t) => t.area === filterArea)
    : tables

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
          ? {
              ...prev,
              status,
              occupied_at:
                status === 'occupied' ? new Date().toISOString() : null,
            }
          : prev
      )
    })
  }

  return (
    <div className="-mx-8 -mt-6">
      {/* Header */}
      <div className="px-8 pt-6 pb-5 border-b border-night-lighter">
        <PageHeader
          title="Mesas"
          subtitle={`${counts.occupied} ocupadas · ${counts.available} disponiveis · ${counts.reserved} reservadas`}
          border={false}
          action={
            <div className="flex items-center gap-5">
              {restaurantSlug && (
                <a
                  href="/mesas/qrs"
                  className="flex items-center gap-1.5 text-[12px] font-medium text-stone hover:text-cloud transition-colors tracking-tight"
                  title="Gerar QR codes de todas as mesas"
                >
                  <Grid2X2 size={13} />
                  QRs de todas as mesas
                </a>
              )}
              {areas.length > 1 && (
                <>
                  <button
                    onClick={() => setFilterArea(null)}
                    className={cn(
                      'text-[12px] font-medium tracking-tight transition-colors',
                      !filterArea ? 'text-cloud' : 'text-stone hover:text-stone-light'
                    )}
                  >
                    Todas
                  </button>
                  {areas.map((area) => (
                    <button
                      key={area}
                      onClick={() => setFilterArea(area === filterArea ? null : area)}
                      className={cn(
                        'text-[12px] font-medium tracking-tight transition-colors capitalize',
                        filterArea === area
                          ? 'text-cloud'
                          : 'text-stone hover:text-stone-light'
                      )}
                    >
                      {AREA_LABEL[area] ?? area}
                    </button>
                  ))}
                </>
              )}
            </div>
          }
        />
        <div className="flex items-center gap-6 mt-3">
          {(Object.keys(STATUS_LABEL) as TableStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <StatusDot tone={STATUS_DOT_TONE[status]} />
              <span className="text-[11px] text-stone tracking-tight">
                {STATUS_LABEL[status]}
              </span>
              <span className="text-[11px] font-data text-stone-dark">
                {counts[status]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-14rem)]">
        {/* Grid */}
        <section className={cn('flex-1 p-8', selectedTable && 'border-r border-night-lighter')}>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredTables.map((table) => {
              const minutes = getOccupiedMinutes(table.occupied_at)
              const tableOrder = ordersByTable[table.id]
              const active = selectedTable?.id === table.id
              const tone = STATUS_DOT_TONE[table.status]
              return (
                <div
                  key={table.id}
                  className={cn(
                    'group relative aspect-square flex flex-col items-start justify-between p-4 rounded-lg border transition-all',
                    active
                      ? 'border-cloud bg-night-light/70'
                      : 'border-night-lighter hover:border-stone-dark hover:bg-night-light/40'
                  )}
                >
                  {/* QR button — top-right corner */}
                  {restaurantSlug && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openQrModal(table) }}
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-stone hover:text-cloud transition-all"
                      title="Ver QR code"
                      aria-label="QR code da mesa"
                    >
                      <QrCode size={13} />
                    </button>
                  )}

                  <button
                    className="absolute inset-0 w-full h-full"
                    onClick={() =>
                      setSelectedTable(
                        table.id === selectedTable?.id ? null : table
                      )
                    }
                    aria-label={`Mesa ${table.number}`}
                  />

                  <div className="relative pointer-events-none flex items-center gap-2">
                    <StatusDot tone={tone} />
                    <span className="text-[10px] text-stone tracking-tight">
                      {table.capacity} lug.
                    </span>
                  </div>

                  <div className="relative pointer-events-none">
                    <p className="text-[28px] font-medium text-cloud font-data tracking-[-0.03em] leading-none">
                      {table.number}
                    </p>
                    <p className="text-[10px] text-stone-dark tracking-tight mt-1">
                      {STATUS_LABEL[table.status]}
                    </p>
                  </div>

                  {table.status === 'occupied' && minutes > 0 && (
                    <div className="relative pointer-events-none flex items-baseline justify-between w-full">
                      <span
                        className={cn(
                          'text-[10px] font-data tracking-tight',
                          minutes > 60
                            ? 'text-primary'
                            : minutes > 30
                              ? 'text-warm'
                              : 'text-stone-dark'
                        )}
                      >
                        {minutes}m
                      </span>
                      {tableOrder && (
                        <span className="text-[10px] font-data text-stone-light">
                          {formatCurrency(tableOrder.total)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Panel */}
        {selectedTable && (
          <aside className="w-[340px] flex flex-col">
            <div className="px-6 py-5 border-b border-night-lighter flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                  {AREA_LABEL[selectedTable.area] ?? selectedTable.area} ·{' '}
                  {selectedTable.capacity} lugares
                </p>
                <h2 className="text-[28px] font-medium font-data tracking-[-0.03em] text-cloud leading-none mt-2">
                  Mesa {selectedTable.number}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-6 py-5 border-b border-night-lighter">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                Status
              </p>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(STATUS_LABEL) as TableStatus[]).map((status) => {
                  const active = selectedTable.status === status
                  return (
                    <button
                      key={status}
                      onClick={() =>
                        handleStatusChange(selectedTable.id, status)
                      }
                      className={cn(
                        'h-9 text-[12px] font-medium rounded-md transition-colors tracking-tight',
                        active
                          ? 'bg-cloud text-night'
                          : 'text-stone-light hover:text-cloud hover:bg-night-light'
                      )}
                    >
                      {STATUS_LABEL[status]}
                    </button>
                  )
                })}
              </div>
            </div>

            {restaurantSlug && (
              <div className="px-6 py-5 border-b border-night-lighter">
                <button
                  onClick={() => openQrModal(selectedTable)}
                  className="flex items-center gap-2 text-[11px] text-stone-light hover:text-cloud transition-colors tracking-tight"
                >
                  <QrCode size={13} />
                  Ver QR code do cardapio
                </button>
              </div>
            )}

            {activeOrder ? (
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-5">
                  <div className="flex items-baseline justify-between mb-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                      Pedido em andamento
                    </p>
                    <span className="text-[11px] font-data text-stone-dark">
                      #{activeOrder.id.slice(0, 6)}
                    </span>
                  </div>
                  <div className="space-y-2 mb-5">
                    <Row
                      label="Tempo"
                      value={`${getOccupiedMinutes(activeOrder.created_at)}m`}
                    />
                    <Row label="Status" value={activeOrder.status} />
                  </div>
                  <div className="space-y-2.5 pb-5 border-b border-night-lighter">
                    {activeOrder.items.map((item) => {
                      const product = products.find(
                        (p) => p.id === item.product_id
                      )
                      return (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
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
                  <div className="flex items-baseline justify-between mt-4">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                      Total
                    </span>
                    <span className="text-[16px] font-medium text-cloud font-data tracking-tight">
                      {formatCurrency(activeOrder.total)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleStatusChange(selectedTable.id, 'available')}
                    className="mt-5 w-full h-9 rounded-md border border-night-lighter text-[12px] font-medium text-stone-light hover:text-cloud hover:border-stone-dark transition-colors tracking-tight"
                  >
                    Liberar mesa
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-[12px] text-stone tracking-tight">
                  Sem pedido ativo
                </p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-night rounded-xl border border-night-lighter p-6 w-[340px] flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <h3 className="text-[13px] font-medium text-cloud tracking-tight">
                QR Code — Mesa {qrModal.table.number}
              </h3>
              <button
                onClick={() => setQrModal(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>

            {qrModal.dataUrl ? (
              <>
                <div className="bg-white rounded-lg p-4 flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrModal.dataUrl}
                    alt={`QR Mesa ${qrModal.table.number}`}
                    width={220}
                    height={220}
                  />
                  <p className="text-[12px] text-black font-medium tracking-tight">
                    Mesa {qrModal.table.number}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-data">
                    {buildMenuUrl(restaurantSlug, qrModal.table.number)}
                  </p>
                </div>

                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => handleDownloadQr(qrModal.dataUrl!, qrModal.table.number)}
                    className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-md border border-night-lighter text-[12px] font-medium text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                  >
                    <Download size={13} />
                    Baixar PNG
                  </button>
                  <button
                    onClick={() => handlePrintQr(qrModal.dataUrl!, qrModal.table.number)}
                    className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-md border border-night-lighter text-[12px] font-medium text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                  >
                    <Printer size={13} />
                    Imprimir
                  </button>
                </div>
              </>
            ) : (
              <div className="h-[260px] flex items-center justify-center">
                <span className="text-[12px] text-stone tracking-tight">Gerando QR code...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusDot({
  tone,
}: {
  tone: 'leaf' | 'warm' | 'stone' | 'primary'
}) {
  return (
    <span className="relative flex shrink-0">
      {tone === 'leaf' && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-leaf opacity-60 animate-ping" />
      )}
      <span
        className={cn(
          'relative inline-flex rounded-full h-1.5 w-1.5',
          tone === 'leaf' && 'bg-leaf',
          tone === 'warm' && 'bg-warm',
          tone === 'stone' && 'bg-stone',
          tone === 'primary' && 'bg-primary'
        )}
      />
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-stone tracking-tight">{label}</span>
      <span className="text-[11px] text-stone-light capitalize tracking-tight">
        {value}
      </span>
    </div>
  )
}
