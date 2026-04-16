// =============================================================
// iFood API types — baseados na API Merchant v1.0
// Referencia: https://developer.ifood.com.br/reference/
// =============================================================

// -------------------------------------------------------------
// Auth
// -------------------------------------------------------------
export type IfoodTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

// -------------------------------------------------------------
// Eventos de polling
// -------------------------------------------------------------
export type IfoodEventType =
  | 'PLACED'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'READY_TO_PICKUP'
  | 'PICKUP_AREA_ASSIGNED'
  | 'CONCLUDED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'ORDER_CREATED'
  | 'CONSUMER_SCHEDULED'

export type IfoodEvent = {
  id: string
  code: IfoodEventType
  correlationId: string
  createdAt: string
  orderId: string
  merchantId: string
  metadata?: Record<string, unknown>
}

// -------------------------------------------------------------
// Endereco de entrega
// -------------------------------------------------------------
export type IfoodAddress = {
  streetName: string
  streetNumber: string
  formattedAddress: string
  neighborhood: string
  complement?: string
  postalCode: string
  city: string
  state: string
  country: string
  latitude?: number
  longitude?: number
  reference?: string
}

// -------------------------------------------------------------
// Cliente
// -------------------------------------------------------------
export type IfoodCustomer = {
  id: string
  name: string
  phone: string
  taxPayerIdentificationNumber?: string // CPF mascarado
  documentNumber?: string
  segmentation?: string
  ordersCountOnRestaurant?: number
}

// -------------------------------------------------------------
// Itens do pedido
// -------------------------------------------------------------
export type IfoodItemOption = {
  index: number
  code: string
  name: string
  addition: number
  discount: number
  quantity: number
  unitPrice: number
  totalPrice: number
  externalCode?: string
}

export type IfoodOrderItem = {
  index: number
  code: string
  name: string
  quantity: number
  externalCode?: string
  unit: string
  ean?: string
  details?: string
  unitPrice: number
  totalPrice: number
  discount: number
  addition: number
  observations?: string
  options?: IfoodItemOption[]
}

// -------------------------------------------------------------
// Pagamento
// -------------------------------------------------------------
export type IfoodPayment = {
  name: string
  code: string
  value: number
  prepaid: boolean
  issuer?: string
  collector?: string | null
}

// -------------------------------------------------------------
// Pedido completo
// -------------------------------------------------------------
export type IfoodDeliveryMode = 'DEFAULT' | 'ECONOMIC' | 'EXPRESS'
export type IfoodOrderType = 'DELIVERY' | 'TAKEOUT' | 'INDOOR'

export type IfoodOrder = {
  id: string
  reference?: string
  shortReference?: string
  createdAt: string
  type: IfoodOrderType
  merchant: {
    id: string
    name: string
    phones: string[]
    address: IfoodAddress
  }
  payments: {
    prepaid: number
    pending: number
    methods: IfoodPayment[]
  }
  customer: IfoodCustomer
  items: IfoodOrderItem[]
  subTotal: number
  deliveryFee: number
  totalPrice: number
  benefits?: Array<{
    value: number
    target: 'CART' | 'DELIVERY'
    sponsorshipValues?: Array<{ name: string; value: number }>
  }>
  delivery?: {
    mode: IfoodDeliveryMode
    deliveryDateTime?: string
    estimatedTimeMinutes?: number
    deliveryAddress: IfoodAddress
    pickupCode?: string
  }
  pickup?: {
    mode?: string
    pickupCode?: string
  }
  schedule?: {
    scheduledDateTimeStart: string
    scheduledDateTimeEnd: string
    deliveryDateTimeStart?: string
    deliveryDateTimeEnd?: string
  }
  bag?: {
    weight?: number
    width?: number
    height?: number
    length?: number
  }
  extraInfo?: string
  isTest?: boolean
}

// -------------------------------------------------------------
// Credencial de integracao (row da tabela ifood_integrations)
// -------------------------------------------------------------
export type IfoodIntegration = {
  id: string
  restaurant_id: string
  merchant_id: string
  client_id: string | null
  client_secret: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  enabled: boolean
  webhook_secret: string
  last_polled_at: string | null
  last_order_id: string | null
}

// -------------------------------------------------------------
// Input para ingestao de pedido iFood
// -------------------------------------------------------------
export type IngestIfoodOrderResult =
  | { ok: true; orderId: string; created: boolean }
  | { ok: false; error: string }
