'use client'

import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import type { CartItem } from '@/lib/menu-cart'

type OrderType = 'local' | 'pickup' | 'delivery'
type PaymentMethod = 'pix' | 'card_on_delivery' | 'cash'

interface MenuCheckoutProps {
  items: CartItem[]
  total: number
  slug: string
  tableId?: string | null
  tableNumber?: string | null
  onClose: () => void
  onSuccess: (orderId: string) => void
}

const PICKUP_TIMES = [
  '15 min',
  '20 min',
  '25 min',
  '30 min',
  '40 min',
  '50 min',
  '1 hora',
]

const DELIVERY_FEE = 0

export function MenuCheckout({
  items,
  total,
  slug,
  tableId,
  tableNumber,
  onClose,
  onSuccess,
}: MenuCheckoutProps) {
  const isTableOrder = Boolean(tableId)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [orderType, setOrderType] = useState<OrderType>(isTableOrder ? 'local' : 'pickup')
  const [street, setStreet] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [reference, setReference] = useState('')
  const [scheduledTime, setScheduledTime] = useState(PICKUP_TIMES[0])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [changeFor, setChangeFor] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finalTotal = total + (orderType === 'delivery' ? DELIVERY_FEE : 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim() || name.trim().length < 2) {
      setError('Informe seu nome completo')
      return
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 8) {
      setError('Informe um telefone valido')
      return
    }
    if (orderType === 'delivery' && !street.trim()) {
      setError('Informe o endereco de entrega')
      return
    }

    setSubmitting(true)

    const payload = {
      restaurantSlug: slug,
      customer: {
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        address:
          orderType === 'delivery'
            ? {
                street: street.trim(),
                number: addressNumber.trim() || undefined,
                complement: complement.trim() || undefined,
                reference: reference.trim() || undefined,
              }
            : undefined,
      },
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes || undefined,
      })),
      orderType: orderType === 'local' ? 'pickup' : orderType,
      tableId: tableId ?? undefined,
      paymentMethod,
      changeFor:
        paymentMethod === 'cash' && changeFor
          ? Number(changeFor.replace(',', '.'))
          : undefined,
      scheduledTime:
        orderType === 'pickup' ? scheduledTime : undefined,
      notes: notes.trim() || undefined,
    }

    try {
      const res = await fetch('/api/menu/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { ok: boolean; orderId?: string; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Erro ao criar pedido')
      }
      onSuccess(data.orderId!)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div
        className="w-full max-w-lg bg-bg sm:rounded-xl rounded-t-xl max-h-[95dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
          <h2 className="text-[15px] font-medium text-foreground tracking-tight">
            Finalizar pedido
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          <form id="checkout-form" onSubmit={handleSubmit}>
            <div className="px-5 py-5 space-y-6">

              {/* Personal info */}
              <section className="space-y-3">
                <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                  Seus dados
                </label>
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={inputCls}
                />
                <input
                  type="tel"
                  placeholder="WhatsApp (com DDD)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className={inputCls}
                />
              </section>

              {/* Table banner */}
              {isTableOrder && tableNumber && (
                <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[12px] text-foreground tracking-tight">
                  Voce esta na <strong>Mesa {tableNumber}</strong>. Seu pedido sera entregue na mesa.
                </div>
              )}

              {/* Order type */}
              <section className="space-y-3">
                <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                  Tipo de pedido
                </label>
                <div className={cn('grid gap-2', isTableOrder ? 'grid-cols-3' : 'grid-cols-2')}>
                  {(
                    [
                      ...(isTableOrder ? [{ value: 'local' as const, label: 'Consumo local' }] : []),
                      { value: 'pickup' as const, label: 'Retirada' },
                      { value: 'delivery' as const, label: 'Entrega' },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOrderType(opt.value)}
                      className={cn(
                        'h-10 rounded-md text-[13px] font-medium border transition-colors',
                        orderType === opt.value
                          ? 'bg-foreground text-bg border-foreground'
                          : 'bg-transparent text-muted border-[var(--border)] hover:border-foreground hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Delivery address */}
              {orderType === 'delivery' && (
                <section className="space-y-3">
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    Endereco de entrega
                  </label>
                  <input
                    type="text"
                    placeholder="Rua / Avenida"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    required
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Numero"
                      value={addressNumber}
                      onChange={(e) => setAddressNumber(e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="text"
                      placeholder="Complemento"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Ponto de referencia"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className={inputCls}
                  />
                </section>
              )}

              {/* Pickup time */}
              {orderType === 'pickup' && !isTableOrder && (
                <section className="space-y-3">
                  <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                    Horario preferido
                  </label>
                  <div className="relative">
                    <select
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className={cn(inputCls, 'appearance-none pr-8')}
                    >
                      {PICKUP_TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                  </div>
                </section>
              )}

              {/* Payment */}
              <section className="space-y-3">
                <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                  Pagamento
                </label>
                <div className="space-y-2">
                  {(
                    [
                      { value: 'pix', label: 'PIX' },
                      { value: 'card_on_delivery', label: 'Cartao na entrega' },
                      { value: 'cash', label: 'Dinheiro' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className={cn(
                        'w-full h-10 rounded-md text-[13px] font-medium border text-left px-3.5 transition-colors',
                        paymentMethod === opt.value
                          ? 'bg-foreground text-bg border-foreground'
                          : 'bg-transparent text-muted border-[var(--border)] hover:border-foreground hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'cash' && (
                  <input
                    type="text"
                    placeholder="Troco para R$ (opcional)"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    className={inputCls}
                  />
                )}
              </section>

              {/* General notes */}
              <section className="space-y-3">
                <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
                  Observacoes gerais
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Alguma observacao para o pedido? (opcional)"
                  rows={2}
                  className={cn(
                    inputCls,
                    'h-auto resize-none py-2.5'
                  )}
                />
              </section>

              {/* Summary */}
              <section className="rounded-md border px-4 py-4 space-y-2 bg-[var(--surface)]">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted mb-3">
                  Resumo
                </p>
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.notes ?? ''}`}
                    className="flex justify-between text-[12px] text-muted"
                  >
                    <span className="tracking-tight">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-data shrink-0 ml-2">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
                {orderType === 'delivery' && DELIVERY_FEE > 0 && (
                  <div className="flex justify-between text-[12px] text-muted border-t pt-2 mt-2">
                    <span className="tracking-tight">Taxa de entrega</span>
                    <span className="font-data">{formatCurrency(DELIVERY_FEE)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[14px] font-medium text-foreground border-t pt-3 mt-1">
                  <span className="tracking-tight">Total</span>
                  <span className="font-data">{formatCurrency(finalTotal)}</span>
                </div>
              </section>

              {error && (
                <div className="rounded-md border border-[var(--destructive)]/20 bg-[var(--destructive-soft,#fee2e2)] px-3.5 py-2.5 text-[12px] text-[var(--destructive,#ef4444)] tracking-tight">
                  {error}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4 shrink-0">
          <button
            type="submit"
            form="checkout-form"
            disabled={submitting}
            className="w-full h-12 bg-foreground text-bg text-[13px] font-medium rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? 'Confirmando...' : `Confirmar pedido · ${formatCurrency(finalTotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full h-10 px-3.5 bg-[var(--surface)] border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-[var(--border-strong)] transition-colors tracking-tight'
