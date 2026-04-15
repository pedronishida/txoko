'use client'

import type { Product } from '@txoko/shared'
import { cn, formatCurrency, optimizeImage } from '@/lib/utils'
import { Clock, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'

interface ProductCardProps {
  product: Product
  categoryName: string
  onEdit: (product: Product) => void
  onToggle: (id: string) => void
}

export function ProductCard({ product, categoryName, onEdit, onToggle }: ProductCardProps) {
  return (
    <div
      className={cn(
        'bg-night-light border border-night-lighter rounded-xl p-4 transition-opacity',
        !product.is_active && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-3 mb-2">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={optimizeImage(product.image_url, 140) ?? product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-14 h-14 rounded-lg object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-cloud truncate">{product.name}</h3>
          <p className="text-xs text-stone mt-0.5">{categoryName}</p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onEdit(product)}
            className="p-1.5 rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onToggle(product.id)}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              product.is_active ? 'text-leaf hover:bg-leaf/10' : 'text-stone hover:bg-night-lighter'
            )}
          >
            {product.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
        </div>
      </div>

      {product.description && (
        <p className="text-xs text-stone-light line-clamp-2 mb-3">{product.description}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-cloud font-data">{formatCurrency(product.price)}</span>
        <div className="flex items-center gap-3 text-xs text-stone">
          {product.cost && (
            <span>Custo: <span className="font-data">{formatCurrency(product.cost)}</span></span>
          )}
          {product.prep_time_minutes && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              <span className="font-data">{product.prep_time_minutes}min</span>
            </span>
          )}
        </div>
      </div>

      {(product.allergens.length > 0 || product.tags.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {product.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-leaf/10 text-leaf">
              {tag}
            </span>
          ))}
          {product.allergens.map(a => (
            <span key={a} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warm/10 text-warm">
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
