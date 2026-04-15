'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatCurrency, optimizeImage } from '@/lib/utils'
import type { Category, Customer, OrderType, PaymentMethod, Product, Table } from '@txoko/shared'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  CreditCard,
  Banknote,
  QrCode,
  User,
  X,
} from 'lucide-react'
import { createOrder } from './actions'

const PAYMENT_ICONS: Record<string, typeof CreditCard> = {
  cash: Banknote,
  credit: CreditCard,
  debit: CreditCard,
  pix: QrCode,
}
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
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
  const [selectedCustomer, setSelectedCustomer] = useState<MinimalCustomer | null>(null)
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
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory = !selectedCategory || p.category_id === selectedCategory
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
    setShowPayment(false)
  }

  function handleFinalize() {
    if (cart.length === 0) return
    setError(null)
    startTransition(async () => {
      const res = await createOrder({
        type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        customer_id: selectedCustomer?.id ?? null,
        subtotal,
        discount: 0,
        service_fee: serviceFee,
        delivery_fee: deliveryFee,
        total,
        notes: null,
        payment_method: orderType === 'dine_in' ? null : paymentMethod,
        estimated_time:
          cart.length > 0
            ? Math.max(...cart.map((i) => i.product.prep_time_minutes ?? 10))
            : null,
        items: cart.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_price: i.product.price,
          total_price: i.product.price * i.quantity,
          notes: i.notes,
        })),
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      clearCart()
      setSelectedTable(null)
      setSelectedCustomer(null)
      setCustomerQuery('')
    })
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-cloud">PDV</h1>
          <div className="flex items-center gap-2">
            {(['dine_in', 'takeaway', 'delivery', 'counter'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  orderType === type
                    ? 'bg-primary/10 text-primary'
                    : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
                }`}
              >
                {
                  { dine_in: 'Mesa', takeaway: 'Retirada', delivery: 'Delivery', counter: 'Balcao' }[
                    type
                  ]
                }
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>

        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedCategory
                ? 'bg-primary/10 text-primary'
                : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-primary/10 text-primary'
                  : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-2 content-start">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="bg-night-light border border-night-lighter rounded-xl overflow-hidden text-left hover:border-primary/30 hover:bg-night-light/80 transition-colors group"
            >
              {product.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={optimizeImage(product.image_url, 300) ?? product.image_url}
                  alt={product.name}
                  loading="lazy"
                  className="w-full h-24 object-cover"
                />
              )}
              <div className="p-3">
                <p className="text-sm font-medium text-cloud group-hover:text-leaf transition-colors truncate">
                  {product.name}
                </p>
                <p className="text-xs text-stone mt-0.5 truncate">{product.description}</p>
                <p className="text-sm font-bold text-cloud font-data mt-2">
                  {formatCurrency(product.price)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="w-80 bg-night-light border border-night-lighter rounded-xl flex flex-col">
        <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-leaf" />
            <span className="font-semibold text-sm text-cloud">Pedido</span>
            {cart.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-stone hover:text-coral transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        {orderType === 'dine_in' && (
          <div className="px-4 py-2 border-b border-night-lighter">
            <select
              value={selectedTable || ''}
              onChange={(e) => setSelectedTable(e.target.value || null)}
              className="w-full px-2 py-1.5 bg-night border border-night-lighter rounded-lg text-xs text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="">Selecionar mesa...</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  Mesa {t.number} ({t.capacity} lug.)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="px-4 py-2 border-b border-night-lighter relative">
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-night rounded-lg px-2 py-1.5 border border-primary/30">
              <div className="flex items-center gap-1.5 min-w-0">
                <User size={12} className="text-leaf shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-cloud truncate">{selectedCustomer.name}</p>
                  {selectedCustomer.phone && (
                    <p className="text-[10px] text-stone truncate">{selectedCustomer.phone}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedCustomer(null)
                  setCustomerQuery('')
                }}
                className="p-0.5 text-stone hover:text-coral shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <User size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone" />
                <input
                  type="text"
                  placeholder="Cliente (opcional)..."
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value)
                    setShowCustomerPicker(true)
                  }}
                  onFocus={() => setShowCustomerPicker(true)}
                  onBlur={() => setTimeout(() => setShowCustomerPicker(false), 150)}
                  className="w-full pl-6 pr-2 py-1.5 bg-night border border-night-lighter rounded-lg text-xs text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              {showCustomerPicker && customerMatches.length > 0 && (
                <div className="absolute left-4 right-4 mt-1 bg-night-light border border-night-lighter rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {customerMatches.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setSelectedCustomer(c)
                        setCustomerQuery('')
                        setShowCustomerPicker(false)
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-night/40 border-b border-night-lighter last:border-b-0"
                    >
                      <p className="text-xs text-cloud truncate">{c.name}</p>
                      {c.phone && <p className="text-[10px] text-stone truncate">{c.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone">
              <ShoppingBag size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs mt-1">Selecione produtos ao lado</p>
            </div>
          ) : (
            <div className="divide-y divide-night-lighter">
              {cart.map((item) => (
                <div key={item.product.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cloud truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-stone font-data">
                        {formatCurrency(item.product.price)}
                      </p>
                    </div>
                    <button
                      onClick={() => updateQty(item.product.id, 0)}
                      className="p-1 text-stone hover:text-coral transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-night border border-night-lighter flex items-center justify-center text-stone hover:text-cloud"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-data text-cloud w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1)}
                        className="w-6 h-6 rounded bg-night border border-night-lighter flex items-center justify-center text-stone hover:text-cloud"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="text-sm font-bold font-data text-cloud">
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
            <div className="px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-stone">
                <span>Subtotal</span>
                <span className="font-data">{formatCurrency(subtotal)}</span>
              </div>
              {serviceFee > 0 && (
                <div className="flex justify-between text-stone">
                  <span>Taxa servico (10%)</span>
                  <span className="font-data">{formatCurrency(serviceFee)}</span>
                </div>
              )}
              {deliveryFee > 0 && (
                <div className="flex justify-between text-stone">
                  <span>Taxa entrega</span>
                  <span className="font-data">{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-cloud font-bold pt-1 border-t border-night-lighter">
                <span>Total</span>
                <span className="font-data text-leaf">{formatCurrency(total)}</span>
              </div>
            </div>

            {error && (
              <div className="mx-4 mb-2 px-3 py-2 bg-coral/10 border border-coral/30 rounded-lg text-xs text-coral">
                {error}
              </div>
            )}

            {!showPayment ? (
              <div className="px-4 pb-3">
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
                >
                  Finalizar Pedido
                </button>
              </div>
            ) : (
              <div className="px-4 pb-3 space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {(['pix', 'credit', 'debit', 'cash'] as const).map((method) => {
                    const Icon = PAYMENT_ICONS[method] || CreditCard
                    return (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                          paymentMethod === method
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'bg-night border border-night-lighter text-stone hover:text-cloud'
                        }`}
                      >
                        <Icon size={16} />
                        {PAYMENT_LABELS[method]}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPayment(false)}
                    className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={pending}
                    className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    {pending ? 'Enviando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
