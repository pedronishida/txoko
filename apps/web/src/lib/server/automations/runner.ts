/**
 * Txoko Automation Runner
 *
 * Execution engine for user-defined automations.
 * Called by event hooks (PDV, reviews, customers) and by the cron endpoint.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type AutomationEvent =
  | { type: 'order_completed'; restaurantId: string; payload: { orderId: string; total?: number } }
  | { type: 'customer_created'; restaurantId: string; payload: { customerId: string; name?: string } }
  | { type: 'review_added'; restaurantId: string; payload: { reviewId: string; rating: number; sentiment?: string } }
  | { type: 'stock_low'; restaurantId: string; payload: { ingredientId: string; name?: string; current?: number; min?: number } }

// Map event type to matching trigger_type values
const EVENT_TRIGGER_MAP: Record<AutomationEvent['type'], string[]> = {
  order_completed: ['order_completed'],
  customer_created: ['new_customer'],
  review_added: ['review_negative'],
  stock_low: ['low_stock'],
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
  const result = await dispatchAction(automation, event)
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
  }
}

/**
 * Dispatch the configured action.
 * Currently logs intent — extend with real integrations (Z-API, email provider, etc.)
 */
async function dispatchAction(
  automation: AutomationRow,
  event: AutomationEvent
): Promise<{ ok: boolean; message: string; [key: string]: unknown }> {
  const config = automation.action_config ?? {}
  const actionType = automation.action_type

  switch (actionType) {
    case 'send_whatsapp':
      // TODO: integrate with Z-API / WhatsApp provider
      return {
        ok: true,
        message: 'WhatsApp queued',
        template_id: config.template_id,
        event_type: event.type,
      }

    case 'send_email':
      // TODO: integrate with email provider
      return {
        ok: true,
        message: 'Email queued',
        subject: config.subject,
        event_type: event.type,
      }

    case 'create_task':
      return {
        ok: true,
        message: 'Task created',
        task_title: config.task_title,
        event_type: event.type,
      }

    case 'notify_staff':
      // TODO: could push to Supabase notifications table
      return {
        ok: true,
        message: 'Staff notified',
        channel: config.channel ?? 'dashboard',
        event_type: event.type,
      }

    case 'apply_discount':
      // TODO: generate coupon code
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
  const today = new Date()
  const errors: string[] = []
  let triggered = 0

  const { data: automations } = await supabase
    .from('automations')
    .select('id, name, trigger_type, trigger_config, action_type, action_config, run_count')
    .eq('restaurant_id', restaurantId)
    .eq('enabled', true)
    .in('trigger_type', ['birthday', 'no_visit_30d', 'low_stock'])

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
    } catch (err) {
      errors.push(`${automation.id}: ${String(err)}`)
    }
  }

  void today // suppress unused warning

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
