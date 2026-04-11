'use client'

import type { Product } from '@txoko/shared'
import { formatCurrency } from '@/lib/utils'
import { Clock, UtensilsCrossed } from 'lucide-react'

interface MenuProductCardProps {
  product: Product
  onClick: () => void
}

export function MenuProductCard({ product, onClick }: MenuProductCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-night-light border border-night-lighter rounded-xl p-4 text-left hover:border-leaf/20 transition-colors"
    >
      <div className="flex gap-3">
        {/* Image placeholder */}
        <div className="w-20 h-20 rounded-lg bg-night-lighter flex items-center justify-center shrink-0">
          <UtensilsCrossed size={24} className="text-stone/30" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-cloud">{product.name}</h3>
          {product.description && (
            <p className="text-xs text-stone-light line-clamp-2 mt-0.5">{product.description}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-base font-bold text-leaf font-data">{formatCurrency(product.price)}</span>
            {product.prep_time_minutes && (
              <span className="flex items-center gap-1 text-[10px] text-stone">
                <Clock size={10} />
                {product.prep_time_minutes}min
              </span>
            )}
          </div>
          {(product.tags.length > 0 || product.allergens.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {product.tags.map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-leaf/10 text-leaf">{tag}</span>
              ))}
              {product.allergens.map(a => (
                <span key={a} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-warm/10 text-warm">{a}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
