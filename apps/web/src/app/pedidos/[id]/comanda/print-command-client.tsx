'use client'

import { useEffect, useState } from 'react'
import type { Order, OrderItem, Table } from '@txoko/shared'

type Props = {
  order: Order
  items: OrderItem[]
  table: Pick<Table, 'id' | 'number'> | null
  waiterName: string | null
  products: { id: string; name: string }[]
}

function formatTime(dateStr: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function PrintCommandClient({ order, items, table, waiterName, products }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.print()
  }, [])

  const locationLabel = table
    ? `Mesa ${table.number}`
    : order.type === 'delivery'
      ? 'Delivery'
      : order.type === 'takeaway'
        ? 'Retirada'
        : 'Balcao'

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Action bar — hidden when printing */}
      <div className="print:hidden fixed top-0 left-0 right-0 bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <span className="text-sm font-medium text-gray-700">
          Comanda — {locationLabel}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-1.5 bg-black text-white text-sm rounded hover:bg-gray-800 transition-colors"
          >
            Imprimir
          </button>
          <button
            onClick={() => window.close()}
            className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="pt-14 print:pt-0">
        <div className="max-w-[320px] mx-auto py-8 font-mono">
          {/* Header */}
          <div className="text-center mb-4 border-b-2 border-black pb-4">
            <p className="font-bold text-[18px] uppercase tracking-widest">
              COMANDA COZINHA
            </p>
          </div>

          {/* Order info */}
          <div className="mb-5">
            <p className="font-bold text-[20px]">
              Pedido #{order.id.slice(0, 8)}
            </p>
            <p className="text-[16px] font-bold mt-1">{locationLabel}</p>
            <p className="text-[14px] mt-1">
              {formatTime(order.created_at)} — Hoje
            </p>
          </div>

          <div className="border-t-2 border-dashed border-black my-4" />

          {/* Items with checkboxes */}
          <div className="space-y-4 mb-6">
            {items.map((item) => {
              const product = products.find((p) => p.id === item.product_id)
              const productName = product?.name ?? `Item #${item.product_id.slice(0, 6)}`
              return (
                <div key={item.id} className="flex items-start gap-3">
                  <button
                    onClick={() => toggleChecked(item.id)}
                    className={`
                      print:hidden mt-0.5 w-5 h-5 border-2 border-black rounded shrink-0 flex items-center justify-center transition-colors
                      ${checked.has(item.id) ? 'bg-black' : 'bg-white'}
                    `}
                    aria-label="Marcar como pronto"
                  >
                    {checked.has(item.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  {/* Print checkbox (static) */}
                  <span className="hidden print:inline-block mt-0.5 w-4 h-4 border-2 border-black rounded shrink-0" />
                  <div className={`flex-1 ${checked.has(item.id) ? 'opacity-40 line-through' : ''}`}>
                    <p className="font-bold text-[16px] leading-snug">
                      {item.quantity}x {productName}
                    </p>
                    {item.notes && (
                      <p className="text-[13px] pl-4 mt-0.5">
                        OBS: {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="border-t-2 border-dashed border-black my-4" />

          {/* Footer */}
          {waiterName && (
            <p className="text-[13px]">Garcom: {waiterName}</p>
          )}
          {order.notes && (
            <p className="text-[13px] mt-1 italic">Obs geral: {order.notes}</p>
          )}
        </div>
      </div>
    </div>
  )
}
