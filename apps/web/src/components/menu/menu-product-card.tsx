'use client'

import type { Product } from '@txoko/shared'
import { formatCurrency, optimizeImage } from '@/lib/utils'

interface MenuProductCardProps {
  product: Product
  onClick: () => void
}

export function MenuProductCard({ product, onClick }: MenuProductCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left py-5 border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--bg-elevated)]/50 -mx-1 px-1"
    >
      <div className="flex gap-4">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={optimizeImage(product.image_url, 200) ?? product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-20 h-20 rounded-md object-cover shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[14px] font-medium text-foreground tracking-tight">
              {product.name}
            </h3>
            <span className="text-[14px] font-medium text-foreground font-data shrink-0">
              {formatCurrency(product.price)}
            </span>
          </div>
          {product.description && (
            <p className="text-[12px] text-muted line-clamp-2 mt-1 tracking-tight leading-relaxed">
              {product.description}
            </p>
          )}
          {(product.prep_time_minutes ||
            product.tags.length > 0 ||
            product.allergens.length > 0) && (
            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted tracking-tight">
              {product.prep_time_minutes && (
                <span className="font-data">{product.prep_time_minutes}min</span>
              )}
              {product.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              {product.allergens.length > 0 && (
                <span className="text-[var(--warning)]">
                  {product.allergens.join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
