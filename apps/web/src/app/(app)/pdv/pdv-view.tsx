'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency, optimizeImage } from '@/lib/utils'
import type {
  Category,
  Customer,
  OrderType,
  PaymentMethod,
  Product,
  Table,
} from '@txoko/shared'
import { Minus, Plus, X } from 'lucide-react'
import { createOrder } from './actions'
import { TabBar } from '@/components/tab-bar'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: 'Mesa',
  takeaway: 'Retirada',
  delivery: 'Delivery',
  counter: 'Balcao',
}

type CartItem = { product: Product; quantity: number; notes: string | null }
type MinimalCustomer = Pick<Customer, 'id' | 'name' | 'phone' | 'email'>

type Props = {
  products: Product[]
  categories: Category[]
  tables: Table[]
  customers: MinimalCustomer[]
}

export function PdvView({ products, categories, tables, customers }: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [showPayment, setShowPayment] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<MinimalCustomer | null>(
    null
  )
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)

  const customerMatches = useMemo(() => {
    if (!customerQuery.trim()) return customers.slice(0, 8)
    const q = customerQuery.toLowerCase()
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.includes(customerQuery) ||
          c.email?.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [customers, customerQuery])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory =
        !selectedCategory || p.category_id === selectedCategory
      return matchSearch && matchCategory
    })
  }, [products, search, selectedCategory])

  const availableTables = tables.filter((t) => t.status === 'available')

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const serviceFee = orderType === 'dine_in' ? subtotal * 0.1 : 0
  const deliveryFee = orderType === 'delivery' ? 12.0 : 0
  const total = subtotal + serviceFee + deliveryFee

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { product, quantity: 1, notes: null }]
    })
  }

  function updateQty(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId))
      return
    }
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
    )
  }

  function clearCart() {
    setCart([])
    setSelectedTable(null)
    setSelectedCustomer(null)
    setCustomerQuery('')
    setShowPayment(false)
    setError(null)
  }

  function handleFinalize() {
    setError(null)
    if (cart.length === 0) {
      setError('Adicione produtos ao pedido')
      return
    }
    if (orderType === 'dine_in' && !selectedTable) {
      setError('Selecione uma mesa')
      return
    }

    startTransition(async () => {
      const res = await createOrder({
        type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        customer_id: selectedCustomer?.id ?? null,
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.product.price,
          total_price: i.product.price * i.quantity,
          notes: i.notes,
        })),
        payment_method: paymentMethod,
        subtotal,
        discount: 0,
        service_fee: serviceFee,
        delivery_fee: deliveryFee,
        total,
        notes: null,
        estimated_time: null,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      clearCart()
    })
  }

  const orderTypeTabs = (Object.keys(ORDER_TYPE_LABELS) as OrderType[]).map((type) => ({
    key: type,
    label: ORDER_TYPE_LABELS[type],
  }))

  const categoryTabs = [
    { key: '', label: 'Todos', count: products.length },
    ...categories.map((cat) => ({
      key: cat.id,
      label: cat.name,
      count: products.filter((p) => p.category_id === cat.id).length,
    })),
  ]

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-8 -mt-6 border-t border-night-lighter">
      {/* Catalog */}
      <section className="flex-1 flex flex-col min-w-0 border-r border-night-lighter">
        {/* Header row */}
        <div className="px-8 pt-5 pb-3 flex items-center justify-between gap-6">
          <h1 className="text-[20px] font-medium tracking-[-0.02em] text-cloud leading-none shrink-0">
            PDV
          </h1>
          <TabBar
            tabs={orderTypeTabs}
            active={orderType}
            onChange={(k) => setOrderType(k as OrderType)}
            className="flex-1 border-0 pb-0"
          />
        </div>

        {/* Search */}
        <div className="px-8 pb-2">
          <input
            type="text"
            placeholder="Buscar produto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none tracking-tight"
          />
        </div>

        {/* Categories */}
        <div className="px-8">
          <TabBar
            tabs={categoryTabs}
            active={selectedCategory ?? ''}
            onChange={(k) => setSelectedCategory(k === '' ? null : k)}
          />
        </div>

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="group text-left transition-all hover:bg-night-light/40 rounded-lg overflow-hidden"
              >
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={optimizeImage(product.image_url, 300) ?? product.image_url}
                    alt={product.name}
                    loading="lazy"
                    className="w-full aspect-[4/3] object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] rounded-lg bg-night-lighter" />
                )}
                <div className="pt-2.5 pb-2 px-0.5">
                  <p className="text-[12px] font-medium text-cloud tracking-tight line-clamp-1">
                    {product.name}
                  </p>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[12px] font-medium text-cloud font-data">
                      {formatCurrency(product.price)}
                    </span>
                    {product.description && (
                      <span className="text-[10px] text-stone-dark tracking-tight truncate ml-2">
                        {product.description}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <p className="py-12 text-center text-[13px] text-stone tracking-tight">
              Nenhum produto encontrado
            </p>
          )}
        </div>
      </section>

      {/* Cart */}
      <aside className="w-[340px] flex flex-col">
        <div className="px-6 py-5 border-b border-night-lighter flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Pedido
            {cart.length > 0 && (
              <span className="ml-2 text-stone-light">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </h2>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-[11px] text-stone hover:text-cloud transition-colors tracking-tight"
            >
              Limpar
            </button>
          )}
        </div>

        {orderType === 'dine_in' && (
          <div className="px-6 py-3 border-b border-night-lighter">
            <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-1.5">
              Mesa
            </label>
            <select
              value={selectedTable || ''}
              onChange={(e) => setSelectedTable(e.target.value || null)}
              className="w-full h-8 bg-transparent text-[12px] text-cloud focus:outline-none tracking-tight"
            >
              <option value="">Selecionar</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.number} · {t.capacity} lug.
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="px-6 py-3 border-b border-night-lighter relative">
          <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-1.5">
            Cliente
          </label>
          {selectedCustomer ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[12px] text-cloud tracking-tight truncate">
                  {selectedCustomer.name}
                </p>
                {selectedCustomer.phone && (
                  <p className="text-[10px] text-stone-dark font-data truncate">
                    {selectedCustomer.phone}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedCustomer(null)
                  setCustomerQuery('')
                }}
                className="w-5 h-5 flex items-center justify-center text-stone hover:text-cloud shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Opcional"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value)
                  setShowCustomerPicker(true)
                }}
                onFocus={() => setShowCustomerPicker(true)}
                onBlur={() => setTimeout(() => setShowCustomerPicker(false), 150)}
                className="w-full h-6 bg-transparent text-[12px] text-cloud placeholder:text-stone focus:outline-none tracking-tight"
              />
              {showCustomerPicker && customerMatches.length > 0 && (
                <div className="absolute left-6 right-6 top-full mt-1 bg-night-light border border-night-lighter rounded-md max-h-48 overflow-y-auto z-10">
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setSelectedCustomer(c)
                        setCustomerQuery('')
                        setShowCustomerPicker(false)
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-night-lighter border-b border-night-lighter/50 last:border-0 transition-colors"
                    >
                      <p className="text-[12px] text-cloud truncate tracking-tight">
                        {c.name}
                      </p>
                      {c.phone && (
                        <p className="text-[10px] text-stone-dark font-data truncate">
                          {c.phone}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <p className="text-[13px] text-stone tracking-tight">
                Carrinho vazio
              </p>
              <p className="text-[11px] text-stone-dark tracking-tight mt-1">
                Selecione produtos
              </p>
            </div>
          ) : (
            <div className="divide-y divide-night-lighter">
              {cart.map((item) => (
                <div key={item.product.id} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[12px] text-cloud tracking-tight flex-1 line-clamp-1">
                      {item.product.name}
                    </p>
                    <button
                      onClick={() => updateQty(item.product.id, 0)}
                      className="text-[10px] text-stone-dark hover:text-primary transition-colors tracking-tight shrink-0"
                    >
                      remover
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1)}
                        className="w-5 h-5 flex items-center justify-center rounded text-stone-light hover:text-cloud hover:bg-night-light transition-colors"
                      >
                        <Minus size={11} strokeWidth={2} />
                      </button>
                      <span className="text-[12px] font-data text-cloud w-5 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1)}
                        className="w-5 h-5 flex items-center justify-center rounded text-stone-light hover:text-cloud hover:bg-night-light transition-colors"
                      >
                        <Plus size={11} strokeWidth={2} />
                      </button>
                    </div>
                    <span className="text-[12px] font-medium text-cloud font-data">
                      {formatCurrency(item.product.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-night-lighter">
            <div className="px-6 py-4 space-y-1.5">
              <Row label="Subtotal" value={formatCurrency(subtotal)} />
              {serviceFee > 0 && (
                <Row
                  label="Taxa de servico (10%)"
                  value={formatCurrency(serviceFee)}
                />
              )}
              {deliveryFee > 0 && (
                <Row label="Taxa de entrega" value={formatCurrency(deliveryFee)} />
              )}
              <div className="pt-2 mt-2 border-t border-night-lighter">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                    Total
                  </span>
                  <span className="text-[18px] font-medium text-cloud font-data tracking-tight">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-6 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[11px] text-primary tracking-tight">
                {error}
              </div>
            )}

            {!showPayment ? (
              <div className="px-6 pb-5">
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full h-10 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
                >
                  Finalizar pedido
                </button>
              </div>
            ) : (
              <div className="px-6 pb-5 space-y-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                    Pagamento
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['pix', 'credit', 'debit', 'cash'] as const).map((method) => {
                      const active = paymentMethod === method
                      return (
                        <button
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          className={cn(
                            'h-9 text-[11px] font-medium rounded-md transition-colors tracking-tight',
                            active
                              ? 'bg-cloud text-night'
                              : 'text-stone-light hover:text-cloud hover:bg-night-light'
                          )}
                        >
                          {PAYMENT_LABELS[method]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPayment(false)}
                    className="flex-1 h-10 text-[13px] font-medium text-stone-light hover:text-cloud rounded-md hover:bg-night-light transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={pending}
                    className="flex-1 h-10 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors disabled:opacity-40"
                  >
                    {pending ? 'Enviando' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-stone tracking-tight">{label}</span>
      <span className="text-stone-light font-data">{value}</span>
    </div>
  )
}
