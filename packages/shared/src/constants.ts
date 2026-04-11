export const USER_ROLES = ['owner', 'manager', 'waiter', 'cashier', 'kitchen'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const ORDER_TYPES = ['dine_in', 'delivery', 'takeaway', 'counter'] as const
export type OrderType = (typeof ORDER_TYPES)[number]

export const ORDER_STATUSES = ['open', 'preparing', 'ready', 'delivered', 'closed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_ITEM_STATUSES = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'] as const
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number]

export const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'] as const
export type TableStatus = (typeof TABLE_STATUSES)[number]

export const PAYMENT_METHODS = ['cash', 'credit', 'debit', 'pix', 'voucher', 'online'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_STATUSES = ['pending', 'approved', 'cancelled', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const ORDER_SOURCES = ['pos', 'qrcode', 'ifood', 'rappi', 'whatsapp', 'website'] as const
export type OrderSource = (typeof ORDER_SOURCES)[number]

export const INVOICE_TYPES = ['nfce', 'nfe', 'sat'] as const
export type InvoiceType = (typeof INVOICE_TYPES)[number]

export const PLANS = ['starter', 'essential', 'pro', 'enterprise'] as const
export type Plan = (typeof PLANS)[number]

export const FINANCIAL_TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const
export type FinancialTransactionType = (typeof FINANCIAL_TRANSACTION_TYPES)[number]

export const REVIEW_SENTIMENTS = ['positive', 'neutral', 'negative'] as const
export type ReviewSentiment = (typeof REVIEW_SENTIMENTS)[number]
