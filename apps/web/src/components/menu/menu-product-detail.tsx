'use client'

import type { Product } from '@txoko/shared'
import { formatCurrency, optimizeImage } from '@/lib/utils'
import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { CartItem } from '@/lib/menu-cart'

interface MenuProductDetailProps {
  product: Product
  onClose: () => void
  onAddToCart?: (item: Omit<CartItem, 'quantity'> & { quantity: number }) => void
}

export function MenuProductDetail({ product, onClose, onAddToCart }: MenuProductDetailProps) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-bg border-t sm:border rounded-t-xl sm:rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {product.image_url ? (
          <div className="relative aspect-[16/9] bg-[var(--surface)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizeImage(product.image_url, 800, 85) ?? product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-foreground/10 backdrop-blur-sm text-foreground hover:bg-foreground/20 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex justify-end p-4">
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="px-6 py-6 space-y-6">
          <div>
            <h2 className="text-[20px] font-medium text-foreground tracking-[-0.02em] leading-tight">
              {product.name}
            </h2>
            {product.description && (
              <p className="text-[13px] text-muted mt-2 tracking-tight leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-[22px] font-medium text-foreground font-data tracking-[-0.02em]">
              {formatCurrency(product.price)}
            </span>
            {product.prep_time_minutes && (
              <span className="text-[11px] text-muted font-data tracking-tight">
                {product.prep_time_minutes}min
              </span>
            )}
          </div>

          {(product.tags.length > 0 || product.allergens.length > 0) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-tight">
              {product.tags.map((tag) => (
                <span key={tag} className="text-muted">
                  {tag}
                </span>
              ))}
              {product.allergens.length > 0 && (
                <span className="text-[var(--warning)]">
                  Alergenos: {product.allergens.join(', ')}
                </span>
              )}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted mb-2">
              Observacoes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, ponto mal passado"
              rows={2}
              className="w-full px-3.5 py-2.5 bg-[var(--surface)] border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-[var(--border-strong)] resize-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-[var(--surface)] transition-colors"
              >
                <Minus size={14} strokeWidth={2} />
              </button>
              <span className="text-[16px] font-medium font-data text-foreground w-6 text-center">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-[var(--surface)] transition-colors"
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            </div>
            <button
              onClick={() => {
                if (onAddToCart) {
                  onAddToCart({
                    productId: product.id,
                    name: product.name,
                    price: Number(product.price),
                    quantity,
                    notes: notes.trim() || undefined,
                    imageUrl: product.image_url,
                  })
                }
                onClose()
              }}
              className="flex-1 h-11 bg-foreground text-bg text-[13px] font-medium rounded-md hover:opacity-90 transition-opacity"
            >
              Adicionar · {formatCurrency(Number(product.price) * quantity)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
