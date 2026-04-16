'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export type AudienceFilter = {
  field: string
  op: string
  value: string | number
}

export async function saveAudience(input: {
  id?: string
  name: string
  description?: string
  filters: AudienceFilter[]
}) {
  if (!input.name.trim()) return { error: 'Nome obrigatorio' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const { data: { user } } = await supabase.auth.getUser()

  // Count matching customers
  const count = await countAudienceCustomers(supabase, restaurant_id, input.filters)

  const payload = {
    restaurant_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    filters: input.filters,
    cached_count: count,
    cached_at: new Date().toISOString(),
    created_by: user?.id ?? null,
  }

  if (input.id) {
    const { error } = await supabase
      .from('campaign_audiences')
      .update(payload)
      .eq('id', input.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('campaign_audiences')
      .insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/marketing/audiences')
  return { ok: true, count }
}

export async function deleteAudience(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaign_audiences')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/marketing/audiences')
  return { ok: true }
}

export async function refreshAudienceCount(id: string) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: audience } = await supabase
    .from('campaign_audiences')
    .select('filters')
    .eq('id', id)
    .maybeSingle()

  if (!audience) return { error: 'Audiencia nao encontrada' }

  const filters = (audience.filters ?? []) as AudienceFilter[]
  const count = await countAudienceCustomers(supabase, restaurant_id, filters)

  await supabase
    .from('campaign_audiences')
    .update({ cached_count: count, cached_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/marketing/audiences')
  return { ok: true, count }
}

export async function previewAudienceCount(filters: AudienceFilter[]) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const count = await countAudienceCustomers(supabase, restaurant_id, filters)
  return { ok: true, count }
}

/**
 * Conta customers matching os filtros. Fase 1: filtros basicos via JS.
 * Fase 2: converter para query Supabase dinamica.
 */
async function countAudienceCustomers(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  restaurantId: string,
  filters: AudienceFilter[]
): Promise<number> {
  // Carrega todos customers com aggregated stats + scoring
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, email, birthday, loyalty_points, notes, created_at, engagement_score, churn_risk, optimal_send_hour')
    .eq('restaurant_id', restaurantId)

  if (!customers) return 0

  // Load orders for each customer (for total_spent, total_orders, last_visit)
  const { data: orders } = await supabase
    .from('orders')
    .select('customer_id, total, created_at, status')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'cancelled')

  const ordersByCustomer: Record<string, Array<{ total: number; created_at: string }>> = {}
  for (const o of orders ?? []) {
    const cid = o.customer_id as string
    if (!cid) continue
    ;(ordersByCustomer[cid] ??= []).push({
      total: Number(o.total),
      created_at: o.created_at as string,
    })
  }

  return customers.filter((c) => {
    const cid = c.id as string
    const custOrders = ordersByCustomer[cid] ?? []
    const totalSpent = custOrders.reduce((s, o) => s + o.total, 0)
    const totalOrders = custOrders.length
    const lastVisit = custOrders.length > 0
      ? custOrders.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!.created_at
      : null
    const daysSinceVisit = lastVisit
      ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000)
      : 999

    return filters.every((f) => {
      const val = (() => {
        switch (f.field) {
          case 'total_spent': return totalSpent
          case 'total_orders': return totalOrders
          case 'loyalty_points': return Number(c.loyalty_points ?? 0)
          case 'days_since_visit': return daysSinceVisit
          case 'has_phone': return c.phone ? 1 : 0
          case 'has_email': return c.email ? 1 : 0
          case 'birthday_month':
            return c.birthday
              ? new Date((c.birthday as string) + 'T00:00:00').getMonth() + 1
              : null
          case 'engagement_score': return Number(c.engagement_score ?? 0)
          case 'churn_risk': return Number(c.churn_risk ?? 0)
          case 'optimal_send_hour': return c.optimal_send_hour != null ? Number(c.optimal_send_hour) : null
          default: return null
        }
      })()

      if (val === null) return f.op === 'is_null'

      const target = Number(f.value)
      switch (f.op) {
        case 'eq': return val === target
        case 'gt': return val > target
        case 'gte': return val >= target
        case 'lt': return val < target
        case 'lte': return val <= target
        case 'is_null': return val === null
        case 'is_not_null': return val !== null
        default: return true
      }
    })
  }).length
}
