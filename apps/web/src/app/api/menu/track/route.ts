/**
 * POST /api/menu/track
 *
 * Tracking anonimo do cardapio publico: cria/atualiza menu_sessions por
 * client_session_id e acumula eventos (pageview, carrinho, checkout, submit).
 * Usa service_role (cardapio publico nao tem user auth).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  detectDeviceType,
  hashIp,
  isBotUserAgent,
} from '@/lib/server/tracked-links'

type CartItem = {
  product_id: string
  name: string
  qty: number
  price_cents: number
}

type MenuTrackEvent =
  | { type: 'pageview' }
  | { type: 'checkout_started' }
  | { type: 'item_view'; productId: string }
  | { type: 'add_to_cart'; product: CartItem }
  | { type: 'remove_from_cart'; productId: string }
  | { type: 'cart_update'; items: CartItem[] }
  | { type: 'submit'; orderId: string }

type SessionUtm = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

type SessionParams = {
  restaurantId: string
  clientSessionId: string
  recipientId?: string | null
  customerId?: string | null
  tableId?: string | null
  source?: string | null
  ip?: string | null
  userAgent?: string | null
  referrer?: string | null
  country?: string | null
  city?: string | null
  utm?: SessionUtm
}

type MenuSessionRow = {
  id: string
  cart_items_count: number
  cart_total_cents: number
  cart_snapshot: CartItem[]
  pageview_count: number
  item_view_count: number
  add_to_cart_count: number
  event_count: number
}

async function getOrCreateSession(
  supabase: ReturnType<typeof createServiceClient>,
  params: SessionParams
): Promise<MenuSessionRow> {
  const { data: existing } = await supabase
    .from('menu_sessions')
    .select(
      'id, cart_items_count, cart_total_cents, cart_snapshot, pageview_count, item_view_count, add_to_cart_count, event_count'
    )
    .eq('restaurant_id', params.restaurantId)
    .eq('client_session_id', params.clientSessionId)
    .maybeSingle()
  if (existing) return existing as MenuSessionRow

  const userAgent = params.userAgent ?? null
  const { data: created, error } = await supabase
    .from('menu_sessions')
    .insert({
      restaurant_id: params.restaurantId,
      client_session_id: params.clientSessionId,
      recipient_id: params.recipientId ?? null,
      customer_id: params.customerId ?? null,
      table_id: params.tableId ?? null,
      source: params.source ?? 'direct',
      device_type: detectDeviceType(userAgent),
      country: params.country ?? null,
      city: params.city ?? null,
      ip_hash: params.ip ? hashIp(params.ip) : null,
      user_agent: userAgent,
      referrer: params.referrer ?? null,
      utm_source: params.utm?.source ?? null,
      utm_medium: params.utm?.medium ?? null,
      utm_campaign: params.utm?.campaign ?? null,
      utm_content: params.utm?.content ?? null,
      utm_term: params.utm?.term ?? null,
      metadata: { is_bot: isBotUserAgent(userAgent) },
    })
    .select(
      'id, cart_items_count, cart_total_cents, cart_snapshot, pageview_count, item_view_count, add_to_cart_count, event_count'
    )
    .single()
  if (error) throw error

  // Fire-and-forget: atribui campaign_id/customer_id via campaign_recipients
  if (params.recipientId) {
    supabase
      .from('campaign_recipients')
      .select('campaign_id, customer_id')
      .eq('id', params.recipientId)
      .maybeSingle()
      .then(({ data: recipient }) => {
        if (recipient) {
          return supabase
            .from('menu_sessions')
            .update({
              campaign_id: recipient.campaign_id,
              customer_id: params.customerId ?? recipient.customer_id,
            })
            .eq('id', (created as MenuSessionRow).id)
        }
      })
  }
  return created as MenuSessionRow
}

function mergeCartItem(cart: CartItem[], product: CartItem): CartItem[] {
  const index = cart.findIndex((item) => item.product_id === product.product_id)
  if (index === -1) return [...cart, product]
  const next = [...cart]
  next[index] = { ...next[index], qty: next[index].qty + product.qty }
  return next
}

async function applyEvent(
  supabase: ReturnType<typeof createServiceClient>,
  sessionId: string,
  event: MenuTrackEvent
): Promise<void> {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('menu_sessions')
    .select('cart_snapshot, pageview_count, item_view_count, add_to_cart_count, event_count')
    .eq('id', sessionId)
    .maybeSingle()
  const session = data as Omit<MenuSessionRow, 'id' | 'cart_items_count' | 'cart_total_cents'> | null
  if (!session) throw new Error('menu_session not found')

  const updates: {
    last_seen_at: string
    event_count: number
    pageview_count?: number
    item_view_count?: number
    add_to_cart_count?: number
    cart_snapshot?: CartItem[]
    cart_items_count?: number
    cart_total_cents?: number
    checkout_started_at?: string
    submitted_at?: string
    order_id?: string
  } = { last_seen_at: now, event_count: session.event_count + 1 }

  switch (event.type) {
    case 'pageview':
      updates.pageview_count = session.pageview_count + 1
      break
    case 'item_view':
      updates.item_view_count = session.item_view_count + 1
      break
    case 'add_to_cart': {
      updates.add_to_cart_count = session.add_to_cart_count + 1
      const cart = mergeCartItem(session.cart_snapshot, event.product)
      updates.cart_snapshot = cart
      updates.cart_items_count = cart.reduce((sum, item) => sum + item.qty, 0)
      updates.cart_total_cents = cart.reduce(
        (sum, item) => sum + item.price_cents * item.qty,
        0
      )
      break
    }
    case 'remove_from_cart': {
      const cart = session.cart_snapshot.filter((item) => item.product_id !== event.productId)
      updates.cart_snapshot = cart
      updates.cart_items_count = cart.reduce((sum, item) => sum + item.qty, 0)
      updates.cart_total_cents = cart.reduce(
        (sum, item) => sum + item.price_cents * item.qty,
        0
      )
      break
    }
    case 'cart_update':
      updates.cart_snapshot = event.items
      updates.cart_items_count = event.items.reduce((sum, item) => sum + item.qty, 0)
      updates.cart_total_cents = event.items.reduce(
        (sum, item) => sum + item.price_cents * item.qty,
        0
      )
      break
    case 'checkout_started':
      updates.checkout_started_at = now
      break
    case 'submit':
      updates.submitted_at = now
      updates.order_id = event.orderId
  }

  await supabase.from('menu_sessions').update(updates).eq('id', sessionId)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function parseEvent(raw: unknown): MenuTrackEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const event = raw as Record<string, unknown>
  switch (event.type) {
    case 'pageview':
    case 'checkout_started':
      return { type: event.type }
    case 'item_view':
      return typeof event.productId !== 'string'
        ? null
        : { type: 'item_view', productId: event.productId }
    case 'add_to_cart': {
      const product = event.product as Partial<CartItem> | undefined
      return !product ||
        typeof product.product_id !== 'string' ||
        typeof product.name !== 'string' ||
        typeof product.qty !== 'number' ||
        typeof product.price_cents !== 'number'
        ? null
        : {
            type: 'add_to_cart',
            product: {
              product_id: product.product_id,
              name: product.name,
              qty: Math.max(1, Math.floor(product.qty)),
              price_cents: Math.max(0, Math.floor(product.price_cents)),
            },
          }
    }
    case 'remove_from_cart':
      return typeof event.productId !== 'string'
        ? null
        : { type: 'remove_from_cart', productId: event.productId }
    case 'cart_update':
      return Array.isArray(event.items)
        ? {
            type: 'cart_update',
            items: (event.items as Array<Partial<CartItem> | null | undefined>)
              .map((item) =>
                typeof item?.product_id !== 'string' ||
                typeof item?.name !== 'string' ||
                typeof item?.qty !== 'number' ||
                typeof item?.price_cents !== 'number'
                  ? null
                  : {
                      product_id: item.product_id,
                      name: item.name,
                      qty: Math.max(1, Math.floor(item.qty)),
                      price_cents: Math.max(0, Math.floor(item.price_cents)),
                    }
              )
              .filter((item): item is CartItem => item !== null),
          }
        : null
    case 'submit':
      return typeof event.orderId !== 'string'
        ? null
        : { type: 'submit', orderId: event.orderId }
    default:
      return null
  }
}

function getClientIp(req: NextRequest): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded
    ? (forwarded.split(',')[0]?.trim() ?? null)
    : req.headers.get('x-real-ip')
}

type TrackRequestBody = {
  slug?: unknown
  client_session_id?: unknown
  event?: unknown
  recipient_id?: unknown
  customer_id?: unknown
  table_id?: unknown
  source?: unknown
  utm?: unknown
}

export async function POST(req: NextRequest) {
  let body: TrackRequestBody
  try {
    body = (await req.json()) as TrackRequestBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const slug = body.slug
  const clientSessionId = body.client_session_id
  const event = parseEvent(body.event)
  if (typeof slug !== 'string' || !isUuid(clientSessionId) || !event) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  let supabase: ReturnType<typeof createServiceClient>
  try {
    supabase = createServiceClient()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (!restaurant) {
    return NextResponse.json({ error: 'restaurant not found' }, { status: 404 })
  }

  const restaurantId = restaurant.id as string
  const recipientId = isUuid(body.recipient_id) ? body.recipient_id : null
  const customerId = isUuid(body.customer_id) ? body.customer_id : null
  const tableId = isUuid(body.table_id) ? body.table_id : null
  const rawSource = typeof body.source === 'string' ? body.source : null
  const source = ['direct', 'campaign', 'inbox', 'menu_share', 'qr_table', 'organic'].includes(
    rawSource ?? ''
  )
    ? rawSource
    : recipientId
      ? 'campaign'
      : tableId
        ? 'qr_table'
        : 'direct'

  try {
    const session = await getOrCreateSession(supabase, {
      restaurantId,
      clientSessionId,
      recipientId,
      customerId,
      tableId,
      source,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      referrer: req.headers.get('referer'),
      country: req.headers.get('cf-ipcountry'),
      city: req.headers.get('cf-ipcity'),
      utm: typeof body.utm === 'object' && body.utm !== null ? (body.utm as SessionUtm) : undefined,
    })
    await applyEvent(supabase, session.id, event)
    return NextResponse.json({ ok: true, session_id: session.id })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'track failed' },
      { status: 500 }
    )
  }
}
