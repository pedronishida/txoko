import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { AiAgentConfig } from '../actions'
import {
  AssistenteView,
  type AgentDraftRow,
  type AgentMessageRow,
} from './assistente-view'

export const dynamic = 'force-dynamic'

type DraftQueryRow = {
  id: string
  status: string
  created_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  confirmed_order_id: string | null
  items: unknown
  customer_id: string | null
  delivery_type: string | null
  payment_method: string | null
}

type MessageQueryRow = {
  id: string
  conversation_id: string
  body: string | null
  status: string
  created_at: string
  sender_user_id: string | null
  conversations:
    | { restaurant_id: string; contact: { display_name: string | null } | { display_name: string | null }[] | null }
    | { restaurant_id: string; contact: { display_name: string | null } | { display_name: string | null }[] | null }[]
    | null
}

export default async function AssistentePage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, ai_agent_enabled, ai_agent_config')
    .eq('id', restaurantId)
    .maybeSingle()

  const enabled = (restaurant?.ai_agent_enabled as boolean | undefined) ?? false
  const config = (restaurant?.ai_agent_config ?? {}) as Partial<AiAgentConfig>

  const { data: drafts } = await supabase
    .from('order_drafts')
    .select(
      'id, status, created_at, confirmed_at, cancelled_at, confirmed_order_id, items, customer_id, delivery_type, payment_method'
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20)

  const draftRows = (drafts ?? []) as unknown as DraftQueryRow[]

  const customerIds = Array.from(
    new Set(draftRows.map((d) => d.customer_id).filter((id): id is string => id !== null))
  )
  const { data: customers } =
    customerIds.length > 0
      ? await supabase.from('customers').select('id, name').in('id', customerIds)
      : { data: [] }

  const customerNameById: Record<string, string | null> = {}
  for (const customer of (customers ?? []) as { id: string; name: string | null }[]) {
    customerNameById[customer.id] = customer.name
  }

  const recentDrafts: AgentDraftRow[] = draftRows.map((d) => ({
    id: d.id,
    status: d.status,
    created_at: d.created_at,
    confirmed_at: d.confirmed_at,
    cancelled_at: d.cancelled_at,
    confirmed_order_id: d.confirmed_order_id,
    items_count: Array.isArray(d.items) ? d.items.length : 0,
    customer_name: d.customer_id ? (customerNameById[d.customer_id] ?? null) : null,
    delivery_type: d.delivery_type,
    payment_method: d.payment_method,
  }))

  const { data: messages } = await supabase
    .from('messages')
    .select(
      'id, conversation_id, body, status, created_at, sender_user_id, conversations!inner(restaurant_id, contact:contacts(display_name))'
    )
    .eq('conversations.restaurant_id', restaurantId)
    .eq('direction', 'outbound')
    .eq('sender_type', 'agent')
    .is('sender_user_id', null)
    .order('created_at', { ascending: false })
    .limit(30)

  const recentMessages: AgentMessageRow[] = (
    (messages ?? []) as unknown as MessageQueryRow[]
  ).map((m) => {
    const conversation = Array.isArray(m.conversations)
      ? m.conversations[0]
      : m.conversations
    const contact = conversation?.contact
      ? Array.isArray(conversation.contact)
        ? conversation.contact[0]
        : conversation.contact
      : null
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      body: (m.body ?? '').slice(0, 240),
      status: m.status,
      created_at: m.created_at,
      contact_name: contact?.display_name ?? null,
    }
  })

  return (
    <AssistenteView
      restaurantId={restaurantId}
      restaurantName={(restaurant?.name as string | undefined) ?? 'Restaurante'}
      enabled={enabled}
      config={config}
      recentDrafts={recentDrafts}
      recentMessages={recentMessages}
    />
  )
}
