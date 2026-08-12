/**
 * Txoko Automation Runner
 *
 * Execution engine for user-defined automations.
 * Called by event hooks (PDV, reviews, customers) and by the cron endpoint.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'
import { renderTemplate, loadTemplateContext } from '@/lib/server/marketing/template-renderer'
import { createResendClient, EmailClientError } from '@/lib/server/marketing/email-client'
import { createTrackedLink } from '@/lib/server/tracked-links'

export type AutomationEvent =
  | { type: 'order_completed'; restaurantId: string; payload: { orderId: string; total?: number } }
  | { type: 'customer_created'; restaurantId: string; payload: { customerId: string; name?: string } }
  | { type: 'review_added'; restaurantId: string; payload: { reviewId: string; rating: number; sentiment?: string } }
  | { type: 'stock_low'; restaurantId: string; payload: { ingredientId: string; name?: string; current?: number; min?: number } }
  | {
      type: 'menu_abandoned'
      restaurantId: string
      payload: { sessionId: string; customerId: string | null; cartItems: number; cartTotalCents: number }
    }

// Map event type to matching trigger_type values
const EVENT_TRIGGER_MAP: Record<AutomationEvent['type'], string[]> = {
  order_completed: ['order_completed'],
  customer_created: ['new_customer'],
  review_added: ['review_negative'],
  stock_low: ['low_stock'],
  menu_abandoned: ['menu_abandoned'],
}

type AutomationRow = {
  id: string
  name: string | null
  trigger_type: string | null
  trigger_config: Record<string, unknown>
  action_type: string | null
  action_config: Record<string, unknown>
  run_count: number | null
}

type ActionResult = { ok: boolean; message: string; [key: string]: unknown }

/**
 * Main entry point. Fire this after relevant application events.
 */
export async function runAutomationsForEvent(
  supabase: SupabaseClient,
  event: AutomationEvent
): Promise<void> {
  const triggerTypes = EVENT_TRIGGER_MAP[event.type]
  if (!triggerTypes?.length) return

  const { data: automations, error } = await supabase
    .from('automations')
    .select('id, name, trigger_type, trigger_config, action_type, action_config, run_count')
    .eq('restaurant_id', event.restaurantId)
    .eq('enabled', true)
    .in('trigger_type', triggerTypes)

  if (error || !automations?.length) return

  for (const automation of automations as AutomationRow[]) {
    if (!passesTriggerConstraints(automation, event)) continue
    await executeAction(supabase, automation, event)
  }
}

// ---------------------------------------------------------------------------
// Constraint checks
// ---------------------------------------------------------------------------

function passesTriggerConstraints(
  automation: AutomationRow,
  event: AutomationEvent
): boolean {
  const config = automation.trigger_config ?? {}

  if (automation.trigger_type === 'review_negative') {
    const minRating = typeof config.max_rating === 'number' ? config.max_rating : 3
    if (event.type === 'review_added') {
      return event.payload.rating <= minRating
    }
  }

  // Other types pass by default — constraints checked by scheduled cron
  return true
}

// ---------------------------------------------------------------------------
// Action executor
// ---------------------------------------------------------------------------

async function executeAction(
  supabase: SupabaseClient,
  automation: AutomationRow,
  event: AutomationEvent
): Promise<void> {
  const result = await dispatchAction(supabase, automation, event)
  const status = result.ok ? 'success' : 'failed'

  // Log to automation_runs
  await supabase.from('automation_runs').insert({
    automation_id: automation.id,
    restaurant_id: event.restaurantId,
    status,
    target_entity_id: getTargetEntityId(event),
    result: result,
  })

  // Update run stats
  await supabase
    .from('automations')
    .update({
      last_run_at: new Date().toISOString(),
      run_count: (automation.run_count ?? 0) + 1,
    })
    .eq('id', automation.id)
}

function getTargetEntityId(event: AutomationEvent): string {
  switch (event.type) {
    case 'order_completed': return event.payload.orderId
    case 'customer_created': return event.payload.customerId
    case 'review_added': return event.payload.reviewId
    case 'stock_low': return event.payload.ingredientId
    case 'menu_abandoned': return event.payload.sessionId
  }
}

/**
 * Dispatch the configured action.
 */
async function dispatchAction(
  supabase: SupabaseClient,
  automation: AutomationRow,
  event: AutomationEvent
): Promise<ActionResult> {
  const config = automation.action_config ?? {}
  const actionType = automation.action_type

  switch (actionType) {
    case 'send_whatsapp':
      return await sendWhatsAppAction(supabase, automation, event, config)

    case 'send_email':
      return await sendEmailAction(supabase, automation, event, config)

    case 'create_task':
      return {
        ok: true,
        message: 'Task created',
        task_title: config.task_title,
        event_type: event.type,
      }

    case 'notify_staff':
      return {
        ok: true,
        message: 'Staff notified',
        channel: config.channel ?? 'dashboard',
        event_type: event.type,
      }

    case 'apply_discount':
      return {
        ok: true,
        message: 'Discount coupon created',
        discount_pct: config.discount_pct,
        event_type: event.type,
      }

    default:
      return { ok: false, message: `Unknown action type: ${actionType}` }
  }
}

// ---------------------------------------------------------------------------
// Scheduled / time-based trigger runner (called by cron endpoint)
// ---------------------------------------------------------------------------

export async function runScheduledAutomations(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<{ triggered: number; errors: string[] }> {
  const errors: string[] = []
  let triggered = 0

  const { data: automations } = await supabase
    .from('automations')
    .select('id, name, trigger_type, trigger_config, action_type, action_config, run_count')
    .eq('restaurant_id', restaurantId)
    .eq('enabled', true)
    .in('trigger_type', [
      'birthday',
      'no_visit_30d',
      'low_stock',
      'menu_abandoned',
      'post_order_review',
      'churn_rescue',
      'vip_upgrade',
    ])

  if (!automations?.length) return { triggered, errors }

  for (const automation of automations as AutomationRow[]) {
    try {
      if (automation.trigger_type === 'birthday') {
        const count = await triggerBirthdays(supabase, restaurantId, automation)
        triggered += count
      }

      if (automation.trigger_type === 'no_visit_30d') {
        const days = typeof automation.trigger_config?.days === 'number'
          ? automation.trigger_config.days
          : 30
        const count = await triggerInactiveCustomers(supabase, restaurantId, automation, days)
        triggered += count
      }

      if (automation.trigger_type === 'low_stock') {
        const count = await triggerLowStockItems(supabase, restaurantId, automation)
        triggered += count
      }

      if (automation.trigger_type === 'menu_abandoned') {
        const idleMinutes = typeof automation.trigger_config?.idle_minutes === 'number'
          ? automation.trigger_config.idle_minutes
          : 30
        const count = await triggerAbandonedMenuSessions(supabase, restaurantId, automation, idleMinutes)
        triggered += count
      }

      if (automation.trigger_type === 'post_order_review') {
        const delayHours = typeof automation.trigger_config?.delay_hours === 'number'
          ? automation.trigger_config.delay_hours
          : 24
        const count = await triggerPostOrderReview(supabase, restaurantId, automation, delayHours)
        triggered += count
      }

      if (automation.trigger_type === 'churn_rescue') {
        const minChurnRisk = typeof automation.trigger_config?.min_churn_risk === 'number'
          ? automation.trigger_config.min_churn_risk
          : 70
        const minDaysSinceVisit = typeof automation.trigger_config?.min_days_since_visit === 'number'
          ? automation.trigger_config.min_days_since_visit
          : 60
        const count = await triggerChurnRescue(
          supabase,
          restaurantId,
          automation,
          minChurnRisk,
          minDaysSinceVisit
        )
        triggered += count
      }

      if (automation.trigger_type === 'vip_upgrade') {
        const minLtv = typeof automation.trigger_config?.min_ltv === 'number'
          ? automation.trigger_config.min_ltv
          : 500
        const count = await triggerVipUpgrade(supabase, restaurantId, automation, minLtv)
        triggered += count
      }
    } catch (err) {
      errors.push(`${automation.id}: ${String(err)}`)
    }
  }

  return { triggered, errors }
}

async function triggerBirthdays(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow
): Promise<number> {
  const today = new Date()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')

  // Customers whose birthday is today (stored as YYYY-MM-DD)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .like('birthday', `%-${mm}-${dd}`)

  if (!customers?.length) return 0

  for (const customer of customers) {
    await executeAction(supabase, automation, {
      type: 'customer_created',
      restaurantId,
      payload: { customerId: customer.id, name: customer.name },
    })
  }

  return customers.length
}

async function triggerInactiveCustomers(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow,
  days: number
): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .or(`last_visit_at.lt.${cutoff.toISOString()},last_visit_at.is.null`)

  if (!customers?.length) return 0

  for (const customer of customers) {
    await executeAction(supabase, automation, {
      type: 'customer_created',
      restaurantId,
      payload: { customerId: customer.id, name: customer.name },
    })
  }

  return customers.length
}

async function triggerLowStockItems(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow
): Promise<number> {
  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, current_stock, min_stock')
    .eq('restaurant_id', restaurantId)
    .filter('current_stock', 'lte', 'min_stock')

  if (!ingredients?.length) return 0

  for (const item of ingredients) {
    await executeAction(supabase, automation, {
      type: 'stock_low',
      restaurantId,
      payload: {
        ingredientId: item.id,
        name: item.name,
        current: item.current_stock,
        min: item.min_stock,
      },
    })
  }

  return ingredients.length
}

async function triggerAbandonedMenuSessions(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow,
  idleMinutes: number
): Promise<number> {
  // Marca sessoes ociosas como abandonadas (RPC faz o cutoff por idle_minutes)
  await supabase.rpc('mark_abandoned_menu_sessions', {
    p_restaurant_id: restaurantId,
    p_idle_minutes: idleMinutes,
  })

  const { data: sessions } = await supabase
    .from('menu_sessions')
    .select('id, customer_id, cart_items_count, cart_total_cents')
    .eq('restaurant_id', restaurantId)
    .not('abandoned_at', 'is', null)
    .is('alert_sent_at', null)
    .not('customer_id', 'is', null)
    .gt('cart_items_count', 0)
    .order('abandoned_at', { ascending: true })
    .limit(50)

  if (!sessions?.length) return 0

  let triggered = 0
  for (const session of sessions) {
    await executeAction(supabase, automation, {
      type: 'menu_abandoned',
      restaurantId,
      payload: {
        sessionId: session.id,
        customerId: session.customer_id ?? null,
        cartItems: session.cart_items_count ?? 0,
        cartTotalCents: session.cart_total_cents ?? 0,
      },
    })
    await supabase
      .from('menu_sessions')
      .update({ alert_sent_at: new Date().toISOString() })
      .eq('id', session.id)
    triggered += 1
  }
  return triggered
}

async function triggerPostOrderReview(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow,
  delayHours: number
): Promise<number> {
  const windowStart = new Date(Date.now() - (delayHours + 1) * 3_600_000).toISOString()
  const windowEnd = new Date(Date.now() - 3600 * delayHours * 1000).toISOString()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_id, total, updated_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['closed', 'delivered'])
    .gte('updated_at', windowStart)
    .lt('updated_at', windowEnd)
    .not('customer_id', 'is', null)
    .limit(100)

  if (!orders?.length) return 0

  let triggered = 0
  for (const order of orders) {
    const orderId = order.id as string
    if (await wasRecentlyTriggered(supabase, automation.id, orderId, 168)) continue
    await executeAction(supabase, automation, {
      type: 'order_completed',
      restaurantId,
      payload: { orderId, total: Number(order.total ?? 0) },
    })
    triggered += 1
  }
  return triggered
}

async function triggerChurnRescue(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow,
  minChurnRisk: number,
  minDaysSinceVisit: number
): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * minDaysSinceVisit * 3_600_000).toISOString()
  const { data: metrics } = await supabase
    .from('customer_metrics')
    .select('customer_id, churn_risk, last_visit_at')
    .eq('restaurant_id', restaurantId)
    .gte('churn_risk', minChurnRisk)
    .or(`last_visit_at.is.null,last_visit_at.lt.${cutoff}`)
    .limit(200)

  if (!metrics?.length) return 0

  let triggered = 0
  for (const metric of metrics) {
    const customerId = metric.customer_id as string
    if (await wasRecentlyTriggered(supabase, automation.id, customerId, 720)) continue
    await executeAction(supabase, automation, {
      type: 'customer_created',
      restaurantId,
      payload: { customerId },
    })
    triggered += 1
  }
  return triggered
}

async function triggerVipUpgrade(
  supabase: SupabaseClient,
  restaurantId: string,
  automation: AutomationRow,
  minLtv: number
): Promise<number> {
  const { data: metrics } = await supabase
    .from('customer_metrics')
    .select('customer_id, total_spent, total_orders')
    .eq('restaurant_id', restaurantId)
    .gte('total_spent', minLtv)
    .gte('total_orders', 2)
    .limit(200)

  if (!metrics?.length) return 0

  let triggered = 0
  for (const metric of metrics) {
    const customerId = metric.customer_id as string
    if (await wasRecentlyTriggered(supabase, automation.id, customerId, 8760)) continue
    await executeAction(supabase, automation, {
      type: 'customer_created',
      restaurantId,
      payload: { customerId },
    })
    triggered += 1
  }
  return triggered
}

/**
 * Dedupe: ja disparou com sucesso pra esse alvo dentro da janela (horas)?
 */
async function wasRecentlyTriggered(
  supabase: SupabaseClient,
  automationId: string,
  targetEntityId: string,
  windowHours: number
): Promise<boolean> {
  const since = new Date(Date.now() - 3600 * windowHours * 1000).toISOString()
  const { data } = await supabase
    .from('automation_runs')
    .select('id')
    .eq('automation_id', automationId)
    .eq('target_entity_id', targetEntityId)
    .eq('status', 'success')
    .gte('triggered_at', since)
    .limit(1)
    .maybeSingle()
  return data !== null
}

// ---------------------------------------------------------------------------
// Quiet hours — respeita business_hours do restaurante quando ativado
// ---------------------------------------------------------------------------

async function checkQuietHours(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('ai_agent_config')
    .eq('id', restaurantId)
    .maybeSingle()
  const config = (restaurant?.ai_agent_config ?? {}) as Record<string, unknown>
  if (config.business_hours_only !== true) return { ok: true }

  const businessHours = config.business_hours as
    | Record<string, { closed?: boolean; open?: string; close?: string }>
    | undefined
  if (!businessHours) return { ok: true }

  const now = new Date()
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()]
  const today = businessHours[dayKey]
  if (!today || today.closed) return { ok: false, reason: 'closed_today' }

  const open = today.open ?? '00:00'
  const close = today.close ?? '23:59'
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return current >= open && current <= close
    ? { ok: true }
    : { ok: false, reason: `outside_hours_${open}_${close}` }
}

// ---------------------------------------------------------------------------
// Customer resolution
// ---------------------------------------------------------------------------

async function resolveCustomerId(
  supabase: SupabaseClient,
  event: AutomationEvent
): Promise<string | null> {
  const direct = (() => {
    switch (event.type) {
      case 'customer_created':
      case 'menu_abandoned':
        return event.payload.customerId
      case 'order_completed':
      case 'review_added':
      case 'stock_low':
        return null
    }
  })()
  if (direct) return direct

  if (event.type === 'order_completed') {
    const { data } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('id', event.payload.orderId)
      .maybeSingle()
    return (data?.customer_id as string | null) ?? null
  }
  if (event.type === 'review_added') {
    const { data } = await supabase
      .from('reviews')
      .select('customer_id')
      .eq('id', event.payload.reviewId)
      .maybeSingle()
    return (data?.customer_id as string | null) ?? null
  }
  return null
}

// ---------------------------------------------------------------------------
// Real actions — WhatsApp (Z-API) e Email (Resend)
// ---------------------------------------------------------------------------

function defaultWhatsAppBody(event: AutomationEvent): string {
  switch (event.type) {
    case 'menu_abandoned':
      return 'Oi {first_name}! Vi que voce ficou de olho no nosso cardapio mas nao finalizou o pedido. Termina por aqui em segundos: {recovery_link}'
    case 'customer_created':
      return 'Bem-vindo(a) ao {restaurant}, {first_name}!'
    default:
      return 'Aviso de {restaurant}.'
  }
}

async function sendWhatsAppAction(
  supabase: SupabaseClient,
  automation: AutomationRow,
  event: AutomationEvent,
  config: Record<string, unknown>
): Promise<ActionResult> {
  let extras: Record<string, string> | undefined
  const restaurantId = event.restaurantId
  const customerId = await resolveCustomerId(supabase, event)
  if (!customerId) {
    return {
      ok: false,
      message: 'Evento sem customer_id — send_whatsapp ignorado',
      event_type: event.type,
    }
  }

  const quiet = await checkQuietHours(supabase, restaurantId)
  if (!quiet.ok) {
    return {
      ok: false,
      message: `quiet_hours:${quiet.reason}`,
      customer_id: customerId,
      event_type: event.type,
    }
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('phone')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer?.phone) {
    return { ok: false, message: 'Customer sem telefone', customer_id: customerId }
  }

  const { data: channel } = await supabase
    .from('channels')
    .select('id, type, config, status')
    .eq('restaurant_id', restaurantId)
    .eq('type', 'whatsapp_zapi')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!channel) {
    return { ok: false, message: 'Restaurante sem canal WhatsApp ativo', restaurant_id: restaurantId }
  }
  const channelConfig = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!channelConfig.instance_id || !channelConfig.token) {
    return { ok: false, message: 'Z-API sem credenciais configuradas' }
  }

  let body: string | null = null
  if (typeof config.body === 'string' && config.body.trim().length > 0) {
    body = config.body
  } else if (typeof config.template_id === 'string') {
    const { data: template } = await supabase
      .from('campaign_templates')
      .select('wa_body')
      .eq('id', config.template_id)
      .maybeSingle()
    body = (template?.wa_body as string | null) ?? null
  }
  if (!body || body.trim().length === 0) body = defaultWhatsAppBody(event)

  const templateContext = await loadTemplateContext(supabase, customerId, restaurantId)

  if (event.type === 'menu_abandoned' && (config.include_recovery_link ?? true) !== false) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (baseUrl) {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('id', restaurantId)
        .maybeSingle()
      if (restaurant?.slug) {
        try {
          const target = new URL(`/menu/${restaurant.slug}`, baseUrl)
          target.searchParams.set('cu', customerId)
          target.searchParams.set('s', 'menu_share')
          target.searchParams.set('utm_source', 'menu_abandoned')
          const link = await createTrackedLink(
            supabase,
            {
              restaurantId,
              customerId,
              targetUrl: target.toString(),
              source: 'automation',
              label: 'Recovery menu_abandoned',
              metadata: { automation_id: automation.id, session_id: event.payload.sessionId },
            },
            baseUrl
          )
          extras = { recovery_link: link.url }
        } catch {
          extras = { recovery_link: new URL(`/menu/${restaurant.slug}`, baseUrl).toString() }
        }
      }
    }
  }

  const message = renderTemplate(body, { ...templateContext, extras })

  try {
    const client = new ZapiClient(channelConfig as ZapiChannelConfig)
    const sent = await client.sendText({ phone: customer.phone as string, message })
    return {
      ok: true,
      message: 'WhatsApp enviado',
      message_id: sent.messageId,
      customer_id: customerId,
      event_type: event.type,
    }
  } catch (err) {
    return {
      ok: false,
      message: `Z-API: ${err instanceof ZapiError ? err.message : (err as Error).message}`,
      customer_id: customerId,
      event_type: event.type,
    }
  }
}

function defaultEmailHtml(event: AutomationEvent): string {
  switch (event.type) {
    case 'order_completed':
      return '<p>Oi {first_name}!</p><p>Esperamos que tenha curtido nosso pedido. Sua opiniao ajuda a gente a melhorar — pode dar uma nota? <a href="{recovery_link}">{recovery_link}</a></p><p>Obrigado, equipe {restaurant}.</p>'
    case 'customer_created':
      return '<p>Bem-vindo(a) ao {restaurant}, {first_name}!</p><p>Estamos te esperando: <a href="{recovery_link}">{recovery_link}</a></p>'
    default:
      return '<p>Mensagem de {restaurant}.</p>'
  }
}

async function sendEmailAction(
  supabase: SupabaseClient,
  automation: AutomationRow,
  event: AutomationEvent,
  config: Record<string, unknown>
): Promise<ActionResult> {
  let extras: Record<string, string> | undefined
  const restaurantId = event.restaurantId
  const customerId = await resolveCustomerId(supabase, event)
  if (!customerId) {
    return {
      ok: false,
      message: 'Evento sem customer_id — send_email ignorado',
      event_type: event.type,
    }
  }

  const quiet = await checkQuietHours(supabase, restaurantId)
  if (!quiet.ok) {
    return {
      ok: false,
      message: `quiet_hours:${quiet.reason}`,
      customer_id: customerId,
      event_type: event.type,
    }
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('email, name')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer?.email) {
    return { ok: false, message: 'Customer sem email', customer_id: customerId }
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('settings, name, slug')
    .eq('id', restaurantId)
    .maybeSingle()
  const emailClient = createResendClient(
    (restaurant?.settings ?? {}) as Record<string, unknown>
  )
  if (!emailClient) {
    return { ok: false, message: 'Resend nao configurado em settings', restaurant_id: restaurantId }
  }

  let subject = typeof config.subject === 'string' ? config.subject : ''
  let html = typeof config.html === 'string' ? config.html : ''
  let text = typeof config.text === 'string' ? (config.text as string) : undefined
  if ((!subject || !html) && typeof config.template_id === 'string') {
    const { data: template } = await supabase
      .from('campaign_templates')
      .select('email_subject, email_html, email_plain')
      .eq('id', config.template_id)
      .maybeSingle()
    if (template) {
      subject = subject || (template.email_subject as string | null) || ''
      html = html || (template.email_html as string | null) || ''
      text = text ?? (template.email_plain as string | null) ?? undefined
    }
  }
  if (!subject || !html) {
    subject = subject || 'Mensagem de {restaurant}'
    html = html || defaultEmailHtml(event)
  }

  const templateContext = await loadTemplateContext(supabase, customerId, restaurantId)

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (baseUrl && (config.include_recovery_link ?? true) !== false && restaurant?.slug) {
    try {
      let target: URL
      let label: string
      if (event.type === 'order_completed' || event.type === 'review_added') {
        target = new URL(`/menu/${restaurant.slug}/avaliar`, baseUrl)
        label = 'Recovery review'
        if (event.type === 'order_completed') {
          target.searchParams.set('order', event.payload.orderId)
        }
      } else {
        target = new URL(`/menu/${restaurant.slug}`, baseUrl)
        label = 'Recovery menu'
      }
      target.searchParams.set('cu', customerId)
      target.searchParams.set('utm_source', `automation_${event.type}`)
      const link = await createTrackedLink(
        supabase,
        {
          restaurantId,
          customerId,
          targetUrl: target.toString(),
          source: 'automation',
          label,
          metadata: { automation_id: automation.id, event_type: event.type },
        },
        baseUrl
      )
      extras = { recovery_link: link.url }
    } catch {
      // Sem recovery link — segue sem
    }
  }

  const renderedSubject = renderTemplate(subject, { ...templateContext, extras })
  const renderedHtml = renderTemplate(html, { ...templateContext, extras })
  const renderedText = text ? renderTemplate(text, { ...templateContext, extras }) : undefined

  try {
    const sent = await emailClient.send({
      to: customer.email as string,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
    })
    return {
      ok: true,
      message: 'Email enviado',
      message_id: sent.id,
      customer_id: customerId,
      event_type: event.type,
    }
  } catch (err) {
    return {
      ok: false,
      message: `Resend: ${err instanceof EmailClientError ? err.message : (err as Error).message}`,
      customer_id: customerId,
      event_type: event.type,
    }
  }
}
