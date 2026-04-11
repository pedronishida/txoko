'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Category, Product, Table, Order, OrderItem, Ingredient, Supplier, Customer } from '@txoko/shared'
import type { OrderStatus, OrderItemStatus, TableStatus } from '@txoko/shared'
import { MOCK_CATEGORIES, MOCK_PRODUCTS, MOCK_TABLES, MOCK_ORDERS, MOCK_ORDER_ITEMS, MOCK_INGREDIENTS, MOCK_SUPPLIERS, MOCK_CUSTOMERS } from './mock-data'

interface CartItem {
  product: Product
  quantity: number
  notes: string
}

interface StoreState {
  categories: Category[]
  products: Product[]
  tables: Table[]
  orders: Order[]
  orderItems: Record<string, OrderItem[]>
  cart: CartItem[]
  ingredients: Ingredient[]
  suppliers: Supplier[]
  customers: Customer[]
}

interface StoreActions {
  // Products
  addProduct: (product: Omit<Product, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => void
  updateProduct: (id: string, updates: Partial<Product>) => void
  toggleProduct: (id: string) => void

  // Categories
  addCategory: (name: string) => void
  updateCategory: (id: string, name: string) => void

  // Tables
  updateTableStatus: (id: string, status: TableStatus) => void

  // Orders
  addOrder: (order: Omit<Order, 'id' | 'restaurant_id' | 'created_at' | 'closed_at'>, items: Omit<OrderItem, 'id' | 'order_id' | 'sent_to_kitchen_at' | 'ready_at'>[]) => void
  updateOrderStatus: (id: string, status: OrderStatus) => void
  updateOrderItemStatus: (orderId: string, itemId: string, status: OrderItemStatus) => void

  // Cart
  addToCart: (product: Product, quantity?: number, notes?: string) => void
  removeFromCart: (productId: string) => void
  updateCartItem: (productId: string, quantity: number, notes?: string) => void
  clearCart: () => void

  // Ingredients
  addIngredient: (data: Omit<Ingredient, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => void
  updateIngredient: (id: string, updates: Partial<Ingredient>) => void

  // Suppliers
  addSupplier: (data: Omit<Supplier, 'id' | 'restaurant_id' | 'created_at'>) => void
  updateSupplier: (id: string, updates: Partial<Supplier>) => void

  // Customers
  addCustomer: (data: Omit<Customer, 'id' | 'restaurant_id' | 'created_at'>) => void
  updateCustomer: (id: string, updates: Partial<Customer>) => void

  // Helpers
  getProduct: (id: string) => Product | undefined
  getCategory: (id: string) => Category | undefined
  getOrderItems: (orderId: string) => OrderItem[]
  getTableOrder: (tableId: string) => Order | undefined
  getSupplier: (id: string) => Supplier | undefined
}

type Store = StoreState & StoreActions

const StoreContext = createContext<Store | null>(null)

let orderCounter = 100
let itemCounter = 100

export function StoreProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES)
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS)
  const [tables, setTables] = useState<Table[]>(MOCK_TABLES)
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS)
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>(MOCK_ORDER_ITEMS)
  const [cart, setCart] = useState<CartItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>(MOCK_INGREDIENTS)
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS)
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS)

  const addProduct = useCallback((product: Omit<Product, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => {
    const newProduct: Product = {
      ...product,
      id: `prod-${Date.now()}`,
      restaurant_id: 'rest-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setProducts(prev => [...prev, newProduct])
  }, [])

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p))
  }, [])

  const toggleProduct = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p))
  }, [])

  const addCategory = useCallback((name: string) => {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      restaurant_id: 'rest-1',
      name,
      sort_order: categories.length,
      is_active: true,
    }
    setCategories(prev => [...prev, newCat])
  }, [categories.length])

  const updateCategory = useCallback((id: string, name: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c))
  }, [])

  const updateTableStatus = useCallback((id: string, status: TableStatus) => {
    setTables(prev => prev.map(t => {
      if (t.id !== id) return t
      return {
        ...t,
        status,
        occupied_at: status === 'occupied' ? new Date().toISOString() : (status === 'available' ? null : t.occupied_at),
        current_order_id: status === 'available' ? null : t.current_order_id,
      }
    }))
  }, [])

  const addOrder = useCallback((
    order: Omit<Order, 'id' | 'restaurant_id' | 'created_at' | 'closed_at'>,
    items: Omit<OrderItem, 'id' | 'order_id' | 'sent_to_kitchen_at' | 'ready_at'>[]
  ) => {
    const orderId = `order-${++orderCounter}`
    const newOrder: Order = {
      ...order,
      id: orderId,
      restaurant_id: 'rest-1',
      created_at: new Date().toISOString(),
      closed_at: null,
    }
    const newItems: OrderItem[] = items.map(item => ({
      ...item,
      id: `oi-${++itemCounter}`,
      order_id: orderId,
      sent_to_kitchen_at: new Date().toISOString(),
      ready_at: null,
    }))

    setOrders(prev => [newOrder, ...prev])
    setOrderItems(prev => ({ ...prev, [orderId]: newItems }))

    if (order.table_id) {
      setTables(prev => prev.map(t =>
        t.id === order.table_id
          ? { ...t, status: 'occupied' as const, current_order_id: orderId, occupied_at: new Date().toISOString() }
          : t
      ))
    }
  }, [])

  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o
      const updated = { ...o, status }
      if (status === 'closed') {
        updated.closed_at = new Date().toISOString()
        if (o.table_id) {
          setTables(prev => prev.map(t =>
            t.id === o.table_id ? { ...t, status: 'cleaning' as const, current_order_id: null } : t
          ))
        }
      }
      return updated
    }))
  }, [])

  const updateOrderItemStatus = useCallback((orderId: string, itemId: string, status: OrderItemStatus) => {
    setOrderItems(prev => ({
      ...prev,
      [orderId]: (prev[orderId] || []).map(item =>
        item.id === itemId
          ? { ...item, status, ready_at: status === 'ready' ? new Date().toISOString() : item.ready_at }
          : item
      ),
    }))
  }, [])

  const addToCart = useCallback((product: Product, quantity = 1, notes = '') => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { product, quantity, notes }]
    })
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }, [])

  const updateCartItem = useCallback((productId: string, quantity: number, notes?: string) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== productId))
      return
    }
    setCart(prev => prev.map(item =>
      item.product.id === productId
        ? { ...item, quantity, ...(notes !== undefined ? { notes } : {}) }
        : item
    ))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const getProduct = useCallback((id: string) => products.find(p => p.id === id), [products])
  const getCategory = useCallback((id: string) => categories.find(c => c.id === id), [categories])
  const getOrderItems = useCallback((orderId: string) => orderItems[orderId] || [], [orderItems])
  const getTableOrder = useCallback((tableId: string) => {
    return orders.find(o => o.table_id === tableId && o.status !== 'closed' && o.status !== 'cancelled')
  }, [orders])

  // Ingredients
  const addIngredient = useCallback((data: Omit<Ingredient, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => {
    setIngredients(prev => [...prev, { ...data, id: `ing-${Date.now()}`, restaurant_id: 'rest-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
  }, [])
  const updateIngredient = useCallback((id: string, updates: Partial<Ingredient>) => {
    setIngredients(prev => prev.map(i => i.id === id ? { ...i, ...updates, updated_at: new Date().toISOString() } : i))
  }, [])

  // Suppliers
  const addSupplier = useCallback((data: Omit<Supplier, 'id' | 'restaurant_id' | 'created_at'>) => {
    setSuppliers(prev => [...prev, { ...data, id: `sup-${Date.now()}`, restaurant_id: 'rest-1', created_at: new Date().toISOString() }])
  }, [])
  const updateSupplier = useCallback((id: string, updates: Partial<Supplier>) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  // Customers
  const addCustomer = useCallback((data: Omit<Customer, 'id' | 'restaurant_id' | 'created_at'>) => {
    setCustomers(prev => [...prev, { ...data, id: `cust-${Date.now()}`, restaurant_id: 'rest-1', created_at: new Date().toISOString() }])
  }, [])
  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }, [])

  const getSupplier = useCallback((id: string) => suppliers.find(s => s.id === id), [suppliers])

  const store: Store = {
    categories, products, tables, orders, orderItems, cart, ingredients, suppliers, customers,
    addProduct, updateProduct, toggleProduct,
    addCategory, updateCategory,
    updateTableStatus,
    addOrder, updateOrderStatus, updateOrderItemStatus,
    addToCart, removeFromCart, updateCartItem, clearCart,
    addIngredient, updateIngredient,
    addSupplier, updateSupplier,
    addCustomer, updateCustomer,
    getProduct, getCategory, getOrderItems, getTableOrder, getSupplier,
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used within StoreProvider')
  return store
}
