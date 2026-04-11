'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '@/lib/mock-data'
import { MenuHeader } from '@/components/menu/menu-header'
import { MenuProductCard } from '@/components/menu/menu-product-card'
import { MenuProductDetail } from '@/components/menu/menu-product-detail'
import type { Product } from '@txoko/shared'
import { Search } from 'lucide-react'

export default function MenuPage() {
  const searchParams = useSearchParams()
  const tableNumber = searchParams.get('mesa')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const activeCategories = MOCK_CATEGORIES.filter(c => c.is_active)
  const activeProducts = MOCK_PRODUCTS.filter(p => p.is_active)

  const filtered = useMemo(() => {
    if (search) {
      return activeProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    }
    return activeProducts
  }, [activeProducts, search])

  const productsByCategory = useMemo(() => {
    const map: Record<string, Product[]> = {}
    activeCategories.forEach(cat => {
      const prods = filtered.filter(p => p.category_id === cat.id)
      if (prods.length > 0) {
        map[cat.id] = prods
      }
    })
    return map
  }, [filtered, activeCategories])

  function scrollToCategory(catId: string) {
    setSelectedCategory(catId)
    categoryRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Intersection observer for active category highlighting
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setSelectedCategory(entry.target.id.replace('cat-section-', ''))
          }
        })
      },
      { rootMargin: '-100px 0px -60% 0px' }
    )

    Object.keys(productsByCategory).forEach(catId => {
      const el = categoryRefs.current[catId]
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [productsByCategory])

  return (
    <div className="max-w-lg mx-auto pb-20">
      <MenuHeader restaurantName="Txoko Restaurante" tableNumber={tableNumber} />

      {/* Search */}
      <div className="px-4 pt-3 pb-2 sticky top-[57px] z-20 bg-night/95 backdrop-blur-md">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar no cardapio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-night-light border border-night-lighter rounded-xl text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50 focus:border-leaf/50 transition-colors"
          />
        </div>
      </div>

      {/* Category Tabs */}
      {!search && (
        <div className="px-4 py-2 sticky top-[113px] z-20 bg-night/95 backdrop-blur-md">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {activeCategories.filter(c => productsByCategory[c.id]).map(cat => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-leaf text-night'
                    : 'bg-night-light text-stone-light border border-night-lighter'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products by Category */}
      <div className="px-4 space-y-6 mt-2">
        {search ? (
          // Search results flat
          <div className="space-y-2">
            <p className="text-xs text-stone">{filtered.length} resultados para &quot;{search}&quot;</p>
            {filtered.map(product => (
              <MenuProductCard
                key={product.id}
                product={product}
                onClick={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        ) : (
          // Grouped by category
          Object.entries(productsByCategory).map(([catId, products]) => {
            const cat = activeCategories.find(c => c.id === catId)
            if (!cat) return null
            return (
              <div
                key={catId}
                id={`cat-section-${catId}`}
                ref={el => { categoryRefs.current[catId] = el }}
              >
                <h2 className="text-lg font-bold text-cloud mb-3 sticky top-[157px] bg-night/95 backdrop-blur-md py-2 -mx-4 px-4">
                  {cat.name}
                </h2>
                <div className="space-y-2">
                  {products.map(product => (
                    <MenuProductCard
                      key={product.id}
                      product={product}
                      onClick={() => setSelectedProduct(product)}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-8 mt-8">
        <p className="text-xs text-stone">
          Powered by <span className="font-bold text-stone-light">txoko</span>
        </p>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <MenuProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  )
}
