import type {
  UserRole,
  OrderType,
  OrderStatus,
  OrderItemStatus,
  TableStatus,
  PaymentMethod,
  PaymentStatus,
  OrderSource,
  InvoiceType,
  Plan,
  FinancialTransactionType,
  ReviewSentiment,
} from '../constants'

export interface Restaurant {
  id: string
  name: string
  slug: string
  document: string
  phone: string | null
  email: string | null
  address: Address | null
  settings: Record<string, unknown>
  plan: Plan
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Address {
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
  zip: string
  lat?: number
  lng?: number
}

export interface User {
  id: string
  restaurant_id: string
  name: string
  role: UserRole
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface Product {
  id: string
  restaurant_id: string
  category_id: string
  name: string
  description: string | null
  price: number
  cost: number | null
  image_url: string | null
  is_active: boolean
  prep_time_minutes: number | null
  allergens: string[]
  tags: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductAddon {
  id: string
  restaurant_id: string
  product_id: string
  name: string
  price: number
  max_qty: number
  is_required: boolean
  group_name: string | null
  sort_order: number
}

export interface Table {
  id: string
  restaurant_id: string
  number: number
  capacity: number
  status: TableStatus
  position_x: number | null
  position_y: number | null
  area: string
  current_order_id: string | null
  occupied_at: string | null
}

export interface Order {
  id: string
  restaurant_id: string
  table_id: string | null
  customer_id: string | null
  waiter_id: string | null
  type: OrderType
  status: OrderStatus
  subtotal: number
  discount: number
  service_fee: number
  delivery_fee: number
  total: number
  notes: string | null
  source: OrderSource
  external_id: string | null
  delivery_address: Address | null
  estimated_time: number | null
  created_at: string
  closed_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
  status: OrderItemStatus
  addons: OrderItemAddon[]
  sent_to_kitchen_at: string | null
  ready_at: string | null
}

export interface OrderItemAddon {
  addon_id: string
  name: string
  price: number
  qty: number
}

export interface Payment {
  id: string
  restaurant_id: string
  order_id: string
  method: PaymentMethod
  amount: number
  status: PaymentStatus
  card_brand: string | null
  card_last_four: string | null
  nsu: string | null
  authorization_code: string | null
  created_at: string
}

export interface Customer {
  id: string
  restaurant_id: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  birthday: string | null
  address: Address | null
  notes: string | null
  loyalty_points: number
  total_orders: number
  total_spent: number
  last_visit_at: string | null
  created_at: string
}

export interface Ingredient {
  id: string
  restaurant_id: string
  name: string
  unit: string
  current_stock: number
  min_stock: number
  cost_per_unit: number | null
  supplier_id: string | null
  storage_location: string | null
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  restaurant_id: string
  name: string
  document: string | null
  phone: string | null
  email: string | null
  address: Address | null
  notes: string | null
  created_at: string
}

export interface FinancialTransaction {
  id: string
  restaurant_id: string
  type: FinancialTransactionType
  category: string
  description: string | null
  amount: number
  due_date: string | null
  paid_at: string | null
  status: string
  recurrence: string | null
  payment_method: string | null
  document_url: string | null
  created_at: string
}

export interface Invoice {
  id: string
  restaurant_id: string
  order_id: string
  type: InvoiceType
  number: string | null
  series: string | null
  access_key: string | null
  xml_url: string | null
  pdf_url: string | null
  status: string
  sefaz_response: Record<string, unknown> | null
  issued_at: string | null
  created_at: string
}

export interface Review {
  id: string
  restaurant_id: string
  order_id: string | null
  customer_id: string | null
  rating: number
  nps: number | null
  comment: string | null
  sentiment: ReviewSentiment | null
  is_anonymous: boolean
  source: string
  created_at: string
}
