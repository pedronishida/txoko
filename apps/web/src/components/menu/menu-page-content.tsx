'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MenuHeader } from '@/components/menu/menu-header'
import { MenuProductCard } from '@/components/menu/menu-product-card'
import { MenuProductDetail } from '@/components/menu/menu-product-detail'
import { MenuCartDrawer } from '@/components/menu/menu-cart-drawer'
import { MenuCheckout } from '@/components/menu/menu-checkout'
import { useCart } from '@/lib/menu-cart'
import Link from 'next/link'
import { cn, formatCurrency } from '@/lib/utils'
import { ShoppingBag } from 'lucide-react'
import type { Category, Product, Review } from '@txoko/shared'

type MenuReview = Pick<
  Review,
  'id' | 'rating' | 'comment' | 'sentiment' | 'created_at'
>

type MenuUtm = {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
}

type CartEventItem = {
  product_id: string
  name: string
  qty: number
  price_cents: number
}

type TrackEvent =
  | { type: 'pageview' }
  | { type: 'cart_update'; items: CartEventItem[] }
  | { type: 'checkout_started' }

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })
}

function getOrCreateSessionId(slug: string): string {
  const key = `txoko:menu_session:${slug}`
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const id = generateSessionId()
    window.sessionStorage.setItem(key, id)
    return id
  } catch {
    return generateSessionId()
  }
}

type TrackingProps = {
  slug: string
  recipientId: string | null
  customerId: string | null
  tableId: string | null
  source: string | null
  utm: MenuUtm | null
}

function useMenuTracking(props: TrackingProps) {
  const [sessionId] = useState(() => getOrCreateSessionId(props.slug))
  const propsRef = useRef(props)
  propsRef.current = props
  const sentPageview = useRef(false)
  const cartTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCartJson = useRef('')

  const send = useCallback(
    async (event: TrackEvent) => {
      if (!sessionId) return
      const current = propsRef.current
      try {
        await fetch('/api/menu/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: current.slug,
            client_session_id: sessionId,
            event,
            recipient_id: current.recipientId ?? null,
            customer_id: current.customerId ?? null,
            table_id: current.tableId ?? null,
            source: current.source ?? null,
            utm: current.utm ?? null,
          }),
          keepalive: true,
        })
      } catch {
        // tracking nunca quebra o cardapio
      }
    },
    [sessionId]
  )

  useEffect(() => {
    if (sentPageview.current) return
    sentPageview.current = true
    send({ type: 'pageview' })
  }, [send])

  return {
    clientSessionId: sessionId,
    track: useCallback(
      (event: TrackEvent) => {
        send(event)
      },
      [send]
    ),
    trackCart: useCallback(
      (items: CartEventItem[]) => {
        const json = JSON.stringify(items.map((i) => `${i.product_id}:${i.qty}`))
        if (json === lastCartJson.current) return
        lastCartJson.current = json
        if (cartTimer.current) clearTimeout(cartTimer.current)
        cartTimer.current = setTimeout(() => {
          send({ type: 'cart_update', items })
        }, 400)
      },
      [send]
    ),
  }
}

type Props = {
  restaurantName: string
  slug: string
  categories: Category[]
  products: Product[]
  reviews?: MenuReview[]
  tableId?: string | null
  recipientId?: string | null
  customerId?: string | null
  source?: string | null
  utm?: MenuUtm | null
}

export function MenuPageContent({
  restaurantName,
  slug,
  categories,
  products,
  reviews = [],
  tableId = null,
  recipientId = null,
  customerId = null,
  source = null,
  utm = null,
}: Props) {
  const tracking = useMenuTracking({
    slug,
    recipientId,
    customerId,
    tableId,
    source,
    utm,
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  const tableNumber = searchParams.get('mesa')

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const cart = useCart(slug)

  useEffect(() => {
    if (!cart.hydrated) return
    tracking.trackCart(
      cart.items.map((item) => ({
        product_id: item.productId,
        name: item.name,
        qty: item.quantity,
        price_cents: Math.round((item.price ?? 0) * 100),
      }))
    )
  }, [cart.items, cart.hydrated, tracking])

  const activeCategories = categories.filter((c) => c.is_active)
  const activeProducts = products.filter((p) => p.is_active)

  const filtered = useMemo(() => {
    if (search) {
      return activeProducts.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    }
    return activeProducts
  }, [activeProducts, search])

  const productsByCategory = useMemo(() => {
    const map: Record<string, Product[]> = {}
    activeCategories.forEach((cat) => {
      const prods = filtered.filter((p) => p.category_id === cat.id)
      if (prods.length > 0) {
        map[cat.id] = prods
      }
    })
    return map
  }, [filtered, activeCategories])

  function scrollToCategory(catId: string) {
    setSelectedCategory(catId)
    categoryRefs.current[catId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setSelectedCategory(entry.target.id.replace('cat-section-', ''))
          }
        })
      },
      { rootMargin: '-100px 0px -60% 0px' }
    )
    Object.keys(productsByCategory).forEach((catId) => {
      const el = categoryRefs.current[catId]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [productsByCategory])

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length
      : 0

  function handleOrderSuccess(orderId: string) {
    cart.clear()
    setCheckoutOpen(false)
    setCartOpen(false)
    router.push(`/menu/${slug}/obrigado?order=${orderId}`)
  }

  return (
    <div className="max-w-lg mx-auto pb-28">
      <MenuHeader restaurantName={restaurantName} tableNumber={tableNumber} />

      {/* Search */}
      <div className="px-5 pt-4 pb-2 sticky top-[57px] z-20 bg-bg/95 backdrop-blur-md">
        <input
          type="text"
          placeholder="Buscar no cardapio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 bg-transparent border-0 text-[13px] text-foreground placeholder:text-muted focus:outline-none tracking-tight"
        />
      </div>

      {/* Category nav */}
      {!search && (
        <div className="px-5 py-3 sticky top-[97px] z-20 bg-bg/95 backdrop-blur-md border-b">
          <div className="flex items-center gap-5 overflow-x-auto no-scrollbar">
            {activeCategories
              .filter((c) => productsByCategory[c.id])
              .map((cat) => {
                const active = selectedCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={cn(
                      'text-[12px] font-medium tracking-tight whitespace-nowrap transition-colors shrink-0',
                      active
                        ? 'text-foreground'
                        : 'text-muted hover:text-foreground'
                    )}
                  >
                    {cat.name}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="px-5 mt-2">
        {search ? (
          <div>
            <p className="text-[11px] text-muted tracking-tight pt-4 pb-2">
              {filtered.length}{' '}
              {filtered.length === 1 ? 'resultado' : 'resultados'} para
              &ldquo;{search}&rdquo;
            </p>
            {filtered.map((product) => (
              <MenuProductCard
                key={product.id}
                product={product}
                onClick={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        ) : (
          Object.entries(productsByCategory).map(([catId, prods]) => {
            const cat = activeCategories.find((c) => c.id === catId)
            if (!cat) return null
            return (
              <div
                key={catId}
                id={`cat-section-${catId}`}
                ref={(el) => {
                  categoryRefs.current[catId] = el
                }}
              >
                <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted pt-8 pb-4 sticky top-[145px] bg-bg/95 backdrop-blur-md">
                  {cat.name}
                </h2>
                {prods.map((product) => (
                  <MenuProductCard
                    key={product.id}
                    product={product}
                    onClick={() => setSelectedProduct(product)}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Review link */}
      <div className="px-5 mt-12">
        <Link
          href={`/menu/${slug}/avaliar${tableNumber ? `?mesa=${tableNumber}` : ''}`}
          className="block text-center py-4 border-y text-[13px] font-medium text-foreground hover:bg-[var(--surface)] transition-colors tracking-tight"
        >
          Deixar sua avaliacao →
        </Link>
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div className="px-5 mt-10">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Avaliacoes
            </h2>
            <div className="flex items-baseline gap-1.5 text-[11px] text-muted">
              <span className="font-data text-foreground">
                {avgRating.toFixed(1)}
              </span>
              <span>({reviews.length})</span>
            </div>
          </div>
          <div className="divide-y">
            {reviews.slice(0, 5).map((review) => (
              <div key={review.id} className="py-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[13px] font-data text-foreground">
                    {Number(review.rating).toFixed(1)}
                  </span>
                  <span className="text-[10px] text-muted">
                    {Array.from({ length: 5 }, (_, i) =>
                      i < Number(review.rating) ? '★' : '·'
                    ).join('')}
                  </span>
                  <span className="ml-auto text-[10px] font-data text-muted">
                    {new Date(review.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-[12px] text-muted leading-relaxed tracking-tight">
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="text-center py-10 mt-8">
        <p className="text-[10px] text-muted tracking-tight">
          Powered by txoko
        </p>
      </footer>

      {/* Product detail modal */}
      {selectedProduct && (
        <MenuProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(item) => {
            cart.add(item)
            setSelectedProduct(null)
          }}
        />
      )}

      {/* Floating cart button */}
      {cart.hydrated && cart.count > 0 && !cartOpen && !checkoutOpen && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-5">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full h-14 bg-foreground text-bg rounded-xl flex items-center justify-between px-5 shadow-lg hover:opacity-95 transition-opacity"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={16} />
              <span className="text-[13px] font-medium">
                {cart.count} {cart.count === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <span className="text-[14px] font-medium font-data">
              {formatCurrency(cart.total)}
            </span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <MenuCartDrawer
          items={cart.items}
          total={cart.total}
          onUpdateQuantity={cart.updateQuantity}
          onRemove={cart.remove}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false)
            setCheckoutOpen(true)
            tracking.track({ type: 'checkout_started' })
          }}
        />
      )}

      {/* Checkout modal */}
      {checkoutOpen && (
        <MenuCheckout
          items={cart.items}
          total={cart.total}
          slug={slug}
          tableId={tableId}
          tableNumber={tableNumber}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleOrderSuccess}
        />
      )}
    </div>
  )
}
