'use client'

import type { Product } from '@txoko/shared'
import { formatCurrency, optimizeImage } from '@/lib/utils'
import { X, Clock, UtensilsCrossed, Plus, Minus } from 'lucide-react'
import { useState } from 'react'

interface MenuProductDetailProps {
  product: Product
  onClose: () => void
}

export function MenuProductDetail({ product, onClose }: MenuProductDetailProps) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div className="bg-night-light border border-night-lighter rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="relative h-56 bg-night-lighter flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={optimizeImage(product.image_url, 800, 85) ?? product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <UtensilsCrossed size={48} className="text-stone/20" />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-night/80 text-cloud hover:bg-night transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-cloud">{product.name}</h2>
            {product.description && (
              <p className="text-sm text-stone-light mt-1">{product.description}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-leaf font-data">{formatCurrency(product.price)}</span>
            {product.prep_time_minutes && (
              <span className="flex items-center gap-1 text-xs text-stone px-2 py-1 rounded-lg bg-night">
                <Clock size={12} />
                {product.prep_time_minutes} min
              </span>
            )}
          </div>

          {(product.tags.length > 0 || product.allergens.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {product.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-leaf/10 text-leaf">{tag}</span>
              ))}
              {product.allergens.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warm/10 text-warm">
                  Alergenos: {product.allergens.join(', ')}
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm text-stone-light mb-1">Observacoes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: sem cebola, ponto mal passado..."
              rows={2}
              className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Quantity + Add */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 bg-night rounded-lg p-1">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-md flex items-center justify-center text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="text-lg font-bold font-data text-cloud w-6 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            <button className="flex-1 py-3 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors">
              Adicionar {formatCurrency(product.price * quantity)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
