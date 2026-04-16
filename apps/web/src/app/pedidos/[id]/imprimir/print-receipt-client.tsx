'use client'

import { useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { Order, OrderItem, Payment, Customer, Table } from '@txoko/shared'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Cartao de Credito',
  debit: 'Cartao de Debito',
  pix: 'PIX',
  voucher: 'Voucher',
  online: 'Online',
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
}

type RestaurantInfo = {
  name: string
  document: string | null
  phone: string | null
  address: Record<string, string> | null
} | null

type Props = {
  order: Order
  items: OrderItem[]
  payments: Payment[]
  restaurant: RestaurantInfo
  customer: Pick<Customer, 'id' | 'name' | 'phone'> | null
  table: Pick<Table, 'id' | 'number'> | null
  products: { id: string; name: string }[]
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function PrintReceiptClient({
  order,
  items,
  payments,
  restaurant,
  customer,
  table,
  products,
}: Props) {
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

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Print action bar — hidden when printing */}
      <div className="print:hidden fixed top-0 left-0 right-0 bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <span className="text-sm font-medium text-gray-700">
          Recibo — Pedido #{order.id.slice(0, 8)}
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

      {/* Receipt content */}
      <div className="pt-14 print:pt-0">
        <div className="max-w-[320px] mx-auto py-8 font-mono text-[13px] leading-relaxed">
          {/* Restaurant header */}
          <div className="text-center mb-4">
            <p className="font-bold text-[15px] uppercase tracking-wider">
              {restaurant?.name ?? 'Restaurante'}
            </p>
            {restaurant?.address && (
              <p className="text-[11px] mt-0.5">
                {restaurant.address.street}, {restaurant.address.number}
              </p>
            )}
            {restaurant?.phone && (
              <p className="text-[11px]">{restaurant.phone}</p>
            )}
            {restaurant?.document && (
              <p className="text-[11px]">CNPJ {restaurant.document}</p>
            )}
          </div>

          <div className="border-t border-dashed border-black my-3" />

          {/* Order info */}
          <div className="mb-3">
            <p>
              <strong>Pedido #{order.id.slice(0, 8)}</strong> — {locationLabel}
            </p>
            <p className="text-[11px]">Data: {formatDate(order.created_at)}</p>
            {customer && (
              <p className="text-[11px]">
                Cliente: {customer.name}
                {customer.phone && ` · ${customer.phone}`}
              </p>
            )}
          </div>

          <div className="border-t border-dashed border-black my-3" />

          {/* Items */}
          <div className="space-y-1.5 mb-3">
            {items.map((item) => {
              const product = products.find((p) => p.id === item.product_id)
              const productName = product?.name ?? `Item #${item.product_id.slice(0, 6)}`
              return (
                <div key={item.id}>
                  <div className="flex justify-between gap-2">
                    <span className="flex-1">
                      {item.quantity}x {productName}
                    </span>
                    <span className="shrink-0">{formatCurrency(item.total_price)}</span>
                  </div>
                  {item.notes && (
                    <p className="text-[10px] pl-4 italic">OBS: {item.notes}</p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-dashed border-black my-3" />

          {/* Totals */}
          <div className="space-y-0.5 mb-3">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.service_fee > 0 && (
              <div className="flex justify-between">
                <span>Taxa servico (10%)</span>
                <span>{formatCurrency(order.service_fee)}</span>
              </div>
            )}
            {order.delivery_fee > 0 && (
              <div className="flex justify-between">
                <span>Taxa entrega</span>
                <span>{formatCurrency(order.delivery_fee)}</span>
              </div>
            )}
            {order.discount > 0 && (
              <div className="flex justify-between">
                <span>Desconto</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[15px] pt-1 border-t border-black mt-1">
              <span>TOTAL</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Payments */}
          {payments.length > 0 && (
            <>
              <div className="border-t border-dashed border-black my-3" />
              <div className="space-y-0.5 mb-3">
                {payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-[11px]">
                    <span>
                      {PAYMENT_LABELS[p.method] ?? p.method} —{' '}
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                    <span>{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {order.notes && (
            <>
              <div className="border-t border-dashed border-black my-3" />
              <p className="text-[11px] italic">Obs: {order.notes}</p>
            </>
          )}

          <div className="border-t border-dashed border-black my-3" />

          <p className="text-center text-[11px]">Obrigado pela preferencia!</p>
          <p className="text-center text-[10px] mt-1 text-gray-400">txoko.com.br</p>
        </div>
      </div>
    </div>
  )
}
