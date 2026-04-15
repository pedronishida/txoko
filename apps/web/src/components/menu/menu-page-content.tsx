'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { MenuHeader } from '@/components/menu/menu-header'
import { MenuProductCard } from '@/components/menu/menu-product-card'
import { MenuProductDetail } from '@/components/menu/menu-product-detail'
import Link from 'next/link'
import type { Category, Product, Review } from '@txoko/shared'
import { Search, Star } from 'lucide-react'

type MenuReview = Pick<Review, 'id' | 'rating' | 'comment' | 'sentiment' | 'created_at'>

type Props = {
  restaurantName: string
  slug: string
  categories: Category[]
  products: Product[]
  reviews?: MenuReview[]
}

export function MenuPageContent({
  restaurantName,
  slug,
  categories,
  products,
  reviews = [],
}: Props) {
  const searchParams = useSearchParams()
  const tableNumber = searchParams.get('mesa')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const activeCategories = categories.filter((c) => c.is_active)
  const activeProducts = products.filter((p) => p.is_active)

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
      <MenuHeader restaurantName={restaurantName} tableNumber={tableNumber} />
      <div className="px-4 pt-3 pb-2 sticky top-[57px] z-20 bg-night/95 backdrop-blur-md">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input type="text" placeholder="Buscar no cardapio..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-night-light border border-night-lighter rounded-xl text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-colors" />
        </div>
      </div>
      {!search && (
        <div className="px-4 py-2 sticky top-[113px] z-20 bg-night/95 backdrop-blur-md">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {activeCategories.filter(c => productsByCategory[c.id]).map(cat => (
              <button key={cat.id} onClick={() => scrollToCategory(cat.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.id ? 'bg-primary text-white' : 'bg-night-light text-stone-light border border-night-lighter'}`}>{cat.name}</button>
            ))}
          </div>
        </div>
      )}
      <div className="px-4 space-y-6 mt-2">
        {search ? (
          <div className="space-y-2">
            <p className="text-xs text-stone">{filtered.length} resultados para &quot;{search}&quot;</p>
            {filtered.map(product => (<MenuProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} />))}
          </div>
        ) : (
          Object.entries(productsByCategory).map(([catId, products]) => {
            const cat = activeCategories.find(c => c.id === catId)
            if (!cat) return null
            return (
              <div key={catId} id={`cat-section-${catId}`} ref={el => { categoryRefs.current[catId] = el }}>
                <h2 className="text-lg font-bold text-cloud mb-3 sticky top-[157px] bg-night/95 backdrop-blur-md py-2 -mx-4 px-4">{cat.name}</h2>
                <div className="space-y-2">
                  {products.map(product => (<MenuProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} />))}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="px-4 mt-8">
        <Link
          href={`/menu/${slug}/avaliar${tableNumber ? `?mesa=${tableNumber}` : ''}`}
          className="w-full flex items-center justify-center gap-2 py-3 bg-warm/10 border border-warm/30 rounded-xl text-sm font-semibold text-warm hover:bg-warm/20 transition-colors"
        >
          <Star size={16} className="fill-warm" />
          Deixar sua avaliacao
        </Link>
      </div>

      {reviews.length > 0 && (
        <div className="px-4 mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-cloud">O que nossos clientes dizem</h2>
            <div className="flex items-center gap-1 text-xs text-stone">
              <Star size={12} className="text-warm fill-warm" />
              <span className="font-data text-cloud">
                {(
                  reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length
                ).toFixed(1)}
              </span>
              <span>({reviews.length})</span>
            </div>
          </div>
          <div className="space-y-2">
            {reviews.slice(0, 5).map((review) => (
              <div
                key={review.id}
                className="bg-night-light border border-night-lighter rounded-xl p-3"
              >
                <div className="flex items-center gap-1 mb-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      size={12}
                      className={
                        i < Number(review.rating)
                          ? 'text-warm fill-warm'
                          : 'text-stone/30'
                      }
                    />
                  ))}
                  {review.sentiment === 'positive' && (
                    <span className="ml-1 text-[10px] text-leaf">• Positivo</span>
                  )}
                </div>
                {review.comment && (
                  <p className="text-xs text-stone-light leading-relaxed">
                    &ldquo;{review.comment}&rdquo;
                  </p>
                )}
                <p className="text-[10px] text-stone font-data mt-1">
                  {new Date(review.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center py-8 mt-8">
        <p className="text-xs text-stone">Powered by <span className="font-bold text-stone-light">txoko</span></p>
      </div>
      {selectedProduct && (<MenuProductDetail product={selectedProduct} onClose={() => setSelectedProduct(null)} />)}
    </div>
  )
}
