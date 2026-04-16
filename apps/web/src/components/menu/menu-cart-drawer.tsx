'use client'

import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { formatCurrency, optimizeImage, cn } from '@/lib/utils'
import type { CartItem } from '@/lib/menu-cart'

interface MenuCartDrawerProps {
  items: CartItem[]
  total: number
  onUpdateQuantity: (
    productId: string,
    notes: string | undefined,
    quantity: number
  ) => void
  onRemove: (productId: string, notes: string | undefined) => void
  onClose: () => void
  onCheckout: () => void
}

export function MenuCartDrawer({
  items,
  total,
  onUpdateQuantity,
  onRemove,
  onClose,
  onCheckout,
}: MenuCartDrawerProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-[15px] font-medium text-foreground tracking-tight">
            Seu pedido
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors"
            aria-label="Fechar carrinho"
          >
            <X size={14} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center">
              <ShoppingBag size={36} className="text-muted/40" />
              <p className="text-[13px] text-muted tracking-tight">
                Seu carrinho esta vazio
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const key = `${item.productId}-${item.notes ?? ''}`
                return (
                  <li key={key} className="py-4 flex gap-3">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          optimizeImage(item.imageUrl, 120) ?? item.imageUrl
                        }
                        alt={item.name}
                        className="h-14 w-14 rounded-md object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-foreground tracking-tight leading-snug">
                          {item.name}
                        </p>
                        <button
                          onClick={() => onRemove(item.productId, item.notes)}
                          className="shrink-0 text-muted hover:text-[var(--destructive)] transition-colors mt-0.5"
                          aria-label="Remover item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {item.notes && (
                        <p className="text-[11px] text-muted mt-0.5 tracking-tight line-clamp-1">
                          {item.notes}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              onUpdateQuantity(
                                item.productId,
                                item.notes,
                                item.quantity - 1
                              )
                            }
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                              'text-muted hover:text-foreground hover:bg-[var(--surface)]'
                            )}
                          >
                            <Minus size={11} strokeWidth={2.5} />
                          </button>
                          <span className="text-[13px] font-medium font-data text-foreground w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              onUpdateQuantity(
                                item.productId,
                                item.notes,
                                item.quantity + 1
                              )
                            }
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
                              'text-muted hover:text-foreground hover:bg-[var(--surface)]'
                            )}
                          >
                            <Plus size={11} strokeWidth={2.5} />
                          </button>
                        </div>

                        <span className="text-[13px] font-medium font-data text-foreground">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t px-5 py-4 space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-muted tracking-tight">
                Subtotal
              </span>
              <span className="text-[15px] font-medium font-data text-foreground">
                {formatCurrency(total)}
              </span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full h-12 bg-foreground text-bg text-[13px] font-medium rounded-md hover:opacity-90 transition-opacity"
            >
              Finalizar pedido
            </button>
          </div>
        )}
      </div>
    </>
  )
}
