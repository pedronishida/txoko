'use client'

import { useEffect, useState, useTransition } from 'react'
import { Minus, Plus, X, Search, Printer } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Order, OrderItem, Product } from '@txoko/shared'
import { updateOrder } from '@/app/(app)/pedidos/actions'

type EditItem = {
  id?: string
  product_id: string
  name: string
  quantity: number
  unit_price: number
  notes: string | null
}

type Props = {
  order: Order
  items: OrderItem[]
  products: Pick<Product, 'id' | 'name' | 'price'>[]
  onClose: () => void
  onSaved?: () => void
}

const BLOCKED_STATUSES = ['closed', 'cancelled', 'delivered', 'paid']

export function EditOrderModal({ order, items, products, onClose, onSaved }: Props) {
  const [editItems, setEditItems] = useState<EditItem[]>(() =>
    items.map((i) => {
      const prod = products.find((p) => p.id === i.product_id)
      return {
        id: i.id,
        product_id: i.product_id,
        name: prod?.name ?? `Produto #${i.product_id.slice(0, 6)}`,
        quantity: i.quantity,
        unit_price: i.unit_price,
        notes: i.notes,
      }
    })
  )
  const [notes, setNotes] = useState(order.notes ?? '')
  const [search, setSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isBlocked = BLOCKED_STATUSES.includes(order.status)

  const filteredProducts = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase())
  )

  const subtotal = editItems.reduce(
    (sum, i) => sum + i.unit_price * i.quantity,
    0
  )
  const serviceFee = order.type === 'dine_in' ? subtotal * 0.1 : 0
  const deliveryFee = order.delivery_fee
  const discount = order.discount
  const total = subtotal + serviceFee + deliveryFee - discount

  function updateQty(index: number, qty: number) {
    if (qty <= 0) {
      setEditItems((prev) => prev.filter((_, i) => i !== index))
      return
    }
    setEditItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, quantity: qty } : it))
    )
  }

  function updateNotes(index: number, notes: string) {
    setEditItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, notes: notes || null } : it))
    )
  }

  function addProduct(product: Pick<Product, 'id' | 'name' | 'price'>) {
    setEditItems((prev) => {
      const existing = prev.findIndex((i) => i.product_id === product.id)
      if (existing >= 0) {
        return prev.map((it, i) =>
          i === existing ? { ...it, quantity: it.quantity + 1 } : it
        )
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          quantity: 1,
          unit_price: product.price,
          notes: null,
        },
      ]
    })
    setSearch('')
    setShowPicker(false)
  }

  function handleSave() {
    if (isBlocked) return
    setError(null)
    startTransition(async () => {
      const res = await updateOrder({
        orderId: order.id,
        items: editItems.map((i) => ({
          id: i.id,
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          notes: i.notes,
        })),
        notes: notes || null,
        service_fee: serviceFee,
        delivery_fee: deliveryFee,
        discount,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      onSaved?.()
      onClose()
    })
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-night border border-border rounded-xl flex flex-col max-h-[90vh] shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[14px] font-medium text-foreground tracking-tight">
              Editar pedido
            </h2>
            <p className="text-[11px] text-muted mt-0.5 font-data">
              #{order.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/pedidos/${order.id}/imprimir`}
              target="_blank"
              rel="noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors"
              title="Imprimir recibo"
            >
              <Printer size={15} />
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {isBlocked && (
          <div className="mx-6 mt-4 px-3 py-2 bg-accent/10 border border-accent/30 rounded-md text-[11px] text-accent-foreground tracking-tight shrink-0">
            Pedido com status &ldquo;{order.status}&rdquo; nao pode ser editado.
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {editItems.length === 0 && (
            <p className="text-[12px] text-muted tracking-tight py-4 text-center">
              Nenhum item
            </p>
          )}
          {editItems.map((item, index) => (
            <div key={`${item.product_id}-${index}`} className="py-3 border-b border-border/60 last:border-0">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-foreground tracking-tight">{item.name}</p>
                  <input
                    type="text"
                    value={item.notes ?? ''}
                    onChange={(e) => updateNotes(index, e.target.value)}
                    placeholder="Observacao"
                    disabled={isBlocked}
                    className="mt-1 w-full h-6 bg-transparent text-[10px] text-accent-foreground placeholder:text-muted focus:outline-none tracking-tight disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateQty(index, item.quantity - 1)}
                    disabled={isBlocked}
                    className="w-6 h-6 flex items-center justify-center rounded text-foreground/75 hover:text-foreground hover:bg-surface transition-colors disabled:opacity-30"
                  >
                    <Minus size={11} strokeWidth={2} />
                  </button>
                  <span className="text-[12px] font-data text-foreground w-5 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(index, item.quantity + 1)}
                    disabled={isBlocked}
                    className="w-6 h-6 flex items-center justify-center rounded text-foreground/75 hover:text-foreground hover:bg-surface transition-colors disabled:opacity-30"
                  >
                    <Plus size={11} strokeWidth={2} />
                  </button>
                </div>
                <span className="text-[11px] font-data text-muted shrink-0 w-16 text-right">
                  {formatCurrency(item.unit_price * item.quantity)}
                </span>
                {!isBlocked && (
                  <button
                    onClick={() => updateQty(index, 0)}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add item */}
          {!isBlocked && (
            <div className="pt-2 relative">
              {showPicker ? (
                <div>
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-surface">
                    <Search size={12} className="text-muted shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar produto"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoFocus
                      className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted focus:outline-none tracking-tight"
                    />
                    <button
                      onClick={() => {
                        setShowPicker(false)
                        setSearch('')
                      }}
                      className="text-muted hover:text-foreground"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="mt-1 border border-border rounded-md max-h-52 overflow-y-auto bg-surface">
                    {filteredProducts.slice(0, 30).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-muted-subtle border-b border-border/50 last:border-0 transition-colors"
                      >
                        <span className="text-[12px] text-foreground tracking-tight">{p.name}</span>
                        <span className="text-[11px] font-data text-muted ml-4 shrink-0">
                          {formatCurrency(p.price)}
                        </span>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="px-3 py-3 text-[12px] text-muted tracking-tight">
                        Nenhum produto encontrado
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowPicker(true)}
                  className="w-full h-9 border border-dashed border-border rounded-md text-[12px] text-muted hover:text-foreground hover:border-stone transition-colors tracking-tight flex items-center justify-center gap-2"
                >
                  <Plus size={13} />
                  Adicionar item
                </button>
              )}
            </div>
          )}
        </div>

        {/* Order notes */}
        <div className="px-6 py-3 border-t border-border shrink-0">
          <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-1.5">
            Observacoes do pedido
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isBlocked}
            placeholder="Ex: sem cebola, alergia a lactose..."
            className="w-full h-8 bg-transparent text-[12px] text-foreground placeholder:text-muted focus:outline-none tracking-tight disabled:opacity-50"
          />
        </div>

        {/* Totals */}
        <div className="px-6 py-4 border-t border-border space-y-1.5 shrink-0">
          <TotalRow label="Subtotal" value={formatCurrency(subtotal)} />
          {serviceFee > 0 && <TotalRow label="Taxa de servico (10%)" value={formatCurrency(serviceFee)} />}
          {deliveryFee > 0 && <TotalRow label="Taxa de entrega" value={formatCurrency(deliveryFee)} />}
          {discount > 0 && <TotalRow label="Desconto" value={`-${formatCurrency(discount)}`} accent />}
          <div className="pt-2 border-t border-border flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Total</span>
            <span className="text-[16px] font-medium text-foreground font-data tracking-tight">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* Footer actions */}
        {error && (
          <div className="mx-6 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[11px] text-primary tracking-tight shrink-0">
            {error}
          </div>
        )}
        <div className="px-6 pb-5 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-9 text-[12px] text-foreground/75 hover:text-foreground hover:bg-surface rounded-md transition-colors"
          >
            Cancelar
          </button>
          {!isBlocked && (
            <button
              onClick={handleSave}
              disabled={pending}
              className="flex-1 h-9 bg-primary text-primary-foreground text-[12px] font-medium rounded-md hover:bg-primary-hover transition-colors disabled:opacity-40"
            >
              {pending ? 'Salvando...' : 'Salvar alteracoes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TotalRow({
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
      <span className="text-muted tracking-tight">{label}</span>
      <span className={cn('font-data', accent ? 'text-primary' : 'text-foreground/75')}>
        {value}
      </span>
    </div>
  )
}
