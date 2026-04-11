'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatCurrency } from '@/lib/utils'
import { Search, Plus, Minus, Trash2, X, ShoppingBag, CreditCard, Banknote, Smartphone, QrCode } from 'lucide-react'
import type { OrderType, PaymentMethod } from '@txoko/shared'

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

export default function PDVPage() {
  const {
    products, categories, tables, cart,
    addToCart, removeFromCart, updateCartItem, clearCart,
    addOrder,
  } = useStore()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [showPayment, setShowPayment] = useState(false)

  const activeProducts = useMemo(() => {
    return products.filter(p => {
      if (!p.is_active) return false
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory = !selectedCategory || p.category_id === selectedCategory
      return matchSearch && matchCategory
    })
  }, [products, search, selectedCategory])

  const availableTables = tables.filter(t => t.status === 'available')

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const serviceFee = orderType === 'dine_in' ? subtotal * 0.10 : 0
  const deliveryFee = orderType === 'delivery' ? 12.00 : 0
  const total = subtotal + serviceFee + deliveryFee

  function handleFinalize() {
    if (cart.length === 0) return

    addOrder(
      {
        table_id: selectedTable,
        customer_id: null,
        waiter_id: null,
        type: orderType,
        status: 'open',
        subtotal,
        discount: 0,
        service_fee: serviceFee,
        delivery_fee: deliveryFee,
        total,
        notes: null,
        source: 'pos',
        external_id: null,
        delivery_address: null,
        estimated_time: Math.max(...cart.map(i => i.product.prep_time_minutes || 10)),
      },
      cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_price: item.product.price * item.quantity,
        notes: item.notes || null,
        status: 'pending' as const,
        addons: [],
      }))
    )

    clearCart()
    setSelectedTable(null)
    setShowPayment(false)
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Left: Catalog */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-cloud">PDV</h1>
          <div className="flex items-center gap-2">
            {(['dine_in', 'takeaway', 'delivery', 'counter'] as const).map(type => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  orderType === type ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
                }`}
              >
                {{ dine_in: 'Mesa', takeaway: 'Retirada', delivery: 'Delivery', counter: 'Balcao' }[type]}
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
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50 focus:border-leaf/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedCategory ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
            }`}
          >
            Todos
          </button>
          {categories.filter(c => c.is_active).map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-2 content-start">
          {activeProducts.map(product => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="bg-night-light border border-night-lighter rounded-xl p-3 text-left hover:border-leaf/30 hover:bg-night-light/80 transition-colors group"
            >
              <p className="text-sm font-medium text-cloud group-hover:text-leaf transition-colors truncate">{product.name}</p>
              <p className="text-xs text-stone mt-0.5 truncate">{product.description}</p>
              <p className="text-sm font-bold text-cloud font-data mt-2">{formatCurrency(product.price)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 bg-night-light border border-night-lighter rounded-xl flex flex-col">
        <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-leaf" />
            <span className="font-semibold text-sm text-cloud">Pedido</span>
            {cart.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-leaf/10 text-leaf">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-stone hover:text-coral transition-colors">
              Limpar
            </button>
          )}
        </div>

        {/* Table Selection */}
        {orderType === 'dine_in' && (
          <div className="px-4 py-2 border-b border-night-lighter">
            <select
              value={selectedTable || ''}
              onChange={e => setSelectedTable(e.target.value || null)}
              className="w-full px-2 py-1.5 bg-night border border-night-lighter rounded-lg text-xs text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50"
            >
              <option value="">Selecionar mesa...</option>
              {availableTables.map(t => (
                <option key={t.id} value={t.id}>Mesa {t.number} ({t.capacity} lug.)</option>
              ))}
            </select>
          </div>
        )}

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone">
              <ShoppingBag size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs mt-1">Selecione produtos ao lado</p>
            </div>
          ) : (
            <div className="divide-y divide-night-lighter">
              {cart.map(item => (
                <div key={item.product.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cloud truncate">{item.product.name}</p>
                      <p className="text-xs text-stone font-data">{formatCurrency(item.product.price)}</p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="p-1 text-stone hover:text-coral transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartItem(item.product.id, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-night border border-night-lighter flex items-center justify-center text-stone hover:text-cloud"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-data text-cloud w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateCartItem(item.product.id, item.quantity + 1)}
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

        {/* Totals + Payment */}
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

            {!showPayment ? (
              <div className="px-4 pb-3">
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full py-2.5 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors"
                >
                  Finalizar Pedido
                </button>
              </div>
            ) : (
              <div className="px-4 pb-3 space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {(['pix', 'credit', 'debit', 'cash'] as const).map(method => {
                    const Icon = PAYMENT_ICONS[method] || CreditCard
                    return (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                          paymentMethod === method ? 'bg-leaf/10 text-leaf border border-leaf/30' : 'bg-night border border-night-lighter text-stone hover:text-cloud'
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
                    className="flex-1 py-2.5 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors"
                  >
                    Confirmar
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
