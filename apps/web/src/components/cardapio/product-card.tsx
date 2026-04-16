'use client'

import type { Product } from '@txoko/shared'
import { cn, formatCurrency, optimizeImage } from '@/lib/utils'

interface ProductCardProps {
  product: Product
  categoryName: string
  onEdit: (product: Product) => void
  onToggle: (id: string) => void
}

export function ProductCard({
  product,
  categoryName,
  onEdit,
  onToggle,
}: ProductCardProps) {
  return (
    <div
      className={cn(
        'group relative transition-opacity',
        !product.is_active && 'opacity-50'
      )}
    >
      <button
        onClick={() => onEdit(product)}
        className="block w-full text-left"
      >
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={optimizeImage(product.image_url, 400) ?? product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full aspect-[4/3] rounded-lg object-cover bg-night-lighter"
          />
        ) : (
          <div className="w-full aspect-[4/3] rounded-lg bg-night-lighter" />
        )}
        <div className="pt-3 pb-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium text-cloud tracking-tight truncate">
              {product.name}
            </h3>
            <span className="text-[13px] font-medium text-cloud font-data shrink-0">
              {formatCurrency(product.price)}
            </span>
          </div>
          <p className="text-[11px] text-stone tracking-tight mt-0.5 truncate">
            {categoryName}
            {product.description && (
              <>
                <span className="text-stone-dark mx-1.5">·</span>
                {product.description}
              </>
            )}
          </p>
          {(product.cost ||
            product.prep_time_minutes ||
            product.tags.length > 0 ||
            product.allergens.length > 0) && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
              {product.cost && (
                <span className="text-[10px] text-stone-dark font-data tracking-tight">
                  custo {formatCurrency(product.cost)}
                </span>
              )}
              {product.prep_time_minutes && (
                <span className="text-[10px] text-stone-dark font-data tracking-tight">
                  {product.prep_time_minutes}min
                </span>
              )}
              {product.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] text-stone-light tracking-tight"
                >
                  {tag}
                </span>
              ))}
              {product.allergens.map((a) => (
                <span
                  key={a}
                  className="text-[10px] text-warm tracking-tight"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle(product.id)
        }}
        className={cn(
          'absolute top-3 right-3 h-6 px-2 text-[10px] font-medium rounded-md tracking-tight transition-all opacity-0 group-hover:opacity-100',
          product.is_active
            ? 'bg-night/80 backdrop-blur-sm text-cloud border border-night-lighter hover:bg-night'
            : 'bg-cloud text-night hover:bg-cloud-dark'
        )}
      >
        {product.is_active ? 'Desativar' : 'Ativar'}
      </button>
    </div>
  )
}
