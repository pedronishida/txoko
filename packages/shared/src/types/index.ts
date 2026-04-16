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
  ChannelType,
  ChannelStatus,
  ConversationStatus,
  ConversationPriority,
  ConversationIntent,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  CampaignType,
  CampaignStatus,
  CampaignChannel,
  CampaignStepType,
  RecipientStatus,
  ReservationStatus,
  ReservationSource,
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

export interface Channel {
  id: string
  restaurant_id: string
  type: ChannelType
  name: string
  status: ChannelStatus
  config: Record<string, unknown>
  external_id: string | null
  last_synced_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  restaurant_id: string
  customer_id: string | null
  display_name: string
  avatar_url: string | null
  locale: string | null
  notes: string | null
  tags: string[]
  first_contact_at: string
  last_contact_at: string
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  restaurant_id: string
  contact_id: string
  channel_id: string
  external_thread_id: string | null
  subject: string | null
  status: ConversationStatus
  priority: ConversationPriority
  assignee_id: string | null
  unread_count: number
  last_message_at: string
  last_message_preview: string | null
  ai_summary: string | null
  ai_intent: ConversationIntent | null
  ai_sentiment: ReviewSentiment | null
  ai_paused: boolean
  ai_summary_generated_at: string | null
  sla_due_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ConversationNote {
  id: string
  conversation_id: string
  author_id: string | null
  body: string
  created_at: string
  updated_at: string
}

export interface AiSuggestedReply {
  text: string
  tone?: 'friendly' | 'formal' | 'apologetic' | 'promotional' | 'informative'
}

export interface AiSuggestionsBatch {
  id: string
  conversation_id: string
  context_hash: string
  suggestions: AiSuggestedReply[]
  model: string | null
  generated_at: string
  expires_at: string
}

export interface ConversationWithRelations extends Conversation {
  contact: Pick<Contact, 'id' | 'display_name' | 'avatar_url' | 'tags'> | null
  channel: Pick<Channel, 'id' | 'type' | 'name' | 'status'> | null
}

export interface Message {
  id: string
  conversation_id: string
  direction: MessageDirection
  sender_type: MessageSenderType
  sender_user_id: string | null
  body: string | null
  attachments: unknown[]
  external_message_id: string | null
  status: MessageStatus
  reply_to_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface MessageTemplate {
  id: string
  restaurant_id: string
  name: string
  body: string
  shortcut: string | null
  category: string | null
  channels: string[]
  usage_count: number
  created_by: string | null
  created_at: string
}

export interface Campaign {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  type: CampaignType
  status: CampaignStatus
  channel: CampaignChannel
  audience_id: string | null
  audience_count: number
  scheduled_at: string | null
  timezone: string
  recurring_cron: string | null
  next_run_at: string | null
  trigger_event: string | null
  trigger_config: Record<string, unknown>
  stats_total: number
  stats_sent: number
  stats_delivered: number
  stats_read: number
  stats_failed: number
  stats_opted_out: number
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignTemplate {
  id: string
  restaurant_id: string
  name: string
  category: string | null
  wa_body: string | null
  wa_image_url: string | null
  wa_document_url: string | null
  wa_document_ext: string | null
  wa_link_url: string | null
  wa_link_title: string | null
  wa_link_description: string | null
  wa_buttons: unknown[] | null
  email_subject: string | null
  email_html: string | null
  email_plain: string | null
  email_from_name: string | null
  sms_body: string | null
  variables: string[]
  ai_variation_enabled: boolean
  ai_variation_count: number
  ai_variation_temp: number
  usage_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignAudience {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  filters: unknown[]
  cached_count: number
  cached_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  customer_id: string
  contact_id: string | null
  current_step_id: string | null
  step_entered_at: string | null
  status: RecipientStatus
  channel: CampaignChannel
  external_message_id: string | null
  variant_index: number | null
  ab_variant: string | null
  queued_at: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  failed_at: string | null
  failure_reason: string | null
  retry_count: number
  next_retry_at: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Reservation {
  id: string
  restaurant_id: string
  customer_id: string | null
  table_id: string | null
  guest_name: string
  guest_phone: string
  guest_email: string | null
  guest_count: number
  scheduled_for: string
  duration_minutes: number
  status: ReservationStatus
  source: ReservationSource
  notes: string | null
  special_requests: string | null
  confirmed_at: string | null
  confirmation_sent_at: string | null
  reminder_sent_at: string | null
  seated_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignStep {
  id: string
  campaign_id: string
  step_order: number
  step_type: CampaignStepType
  template_id: string | null
  channel_override: CampaignChannel | null
  wait_duration: string | null
  wait_until_time: string | null
  condition_field: string | null
  condition_op: string | null
  condition_value: string | null
  condition_true_step: string | null
  condition_false_step: string | null
  ab_variant_a_step: string | null
  ab_variant_b_step: string | null
  ab_split_pct: number
  update_field: string | null
  update_value: string | null
  metadata: Record<string, unknown>
  created_at: string
}
