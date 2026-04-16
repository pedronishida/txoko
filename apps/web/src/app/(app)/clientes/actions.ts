'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { runAutomationsForEvent } from '@/lib/server/automations/runner'

export type CustomerInput = {
  id?: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  birthday: string | null
  notes: string | null
}

export type SegmentRule = {
  field: string
  op: string
  value: string | number
}

export async function saveCustomer(input: CustomerInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const payload = {
    restaurant_id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    document: input.document,
    birthday: input.birthday,
    notes: input.notes,
  }

  const isNew = !input.id

  const query = isNew
    ? supabase.from('customers').insert(payload).select('id').single()
    : supabase.from('customers').update(payload).eq('id', input.id!).select('id').single()

  const { data: customer, error } = await query

  if (error) return { error: error.message }

  // Fire customer_created automation for new customers (best-effort)
  if (isNew && customer?.id) {
    void runAutomationsForEvent(supabase, {
      type: 'customer_created',
      restaurantId: restaurant_id,
      payload: { customerId: customer.id, name: input.name },
    })
  }

  revalidatePath('/clientes')
  revalidatePath('/pdv')
  return { ok: true }
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/clientes')
  return { ok: true }
}

// ---------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------

export async function bulkAddTag(input: { customerIds: string[]; tag: string }) {
  if (!input.customerIds.length) return { error: 'Nenhum cliente selecionado' }
  if (!input.tag.trim()) return { error: 'Tag invalida' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  // Fetch current tags for each customer
  const { data: customers, error: fetchErr } = await supabase
    .from('customers')
    .select('id, notes')
    .in('id', input.customerIds)
    .eq('restaurant_id', restaurant_id)

  if (fetchErr) return { error: fetchErr.message }
  if (!customers) return { error: 'Clientes nao encontrados' }

  // We store tags as comma-separated string in notes (appended) since there's no tags column
  // For a proper implementation they'd be in a jsonb or separate table
  // Using a metadata approach: append tag via notes prefix "[tags:a,b]"
  const tag = input.tag.trim().toLowerCase().replace(/\s+/g, '-')

  for (const c of customers) {
    const notes = (c.notes as string) ?? ''
    const tagMatch = notes.match(/^\[tags:(.*?)\]/)
    let existingTags: string[] = []
    let restNotes = notes

    if (tagMatch) {
      existingTags = tagMatch[1]!.split(',').filter(Boolean)
      restNotes = notes.slice(tagMatch[0].length).trimStart()
    }

    if (!existingTags.includes(tag)) {
      existingTags.push(tag)
    }

    const newNotes = `[tags:${existingTags.join(',')}]${restNotes ? ' ' + restNotes : ''}`

    await supabase
      .from('customers')
      .update({ notes: newNotes })
      .eq('id', c.id as string)
      .eq('restaurant_id', restaurant_id)
  }

  revalidatePath('/clientes')
  return { ok: true, count: customers.length }
}

export async function exportCustomersCsv(customerIds: string[]) {
  if (!customerIds.length) return { error: 'Nenhum cliente selecionado' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: customers, error } = await supabase
    .from('customers')
    .select('name, phone, email, birthday, loyalty_points, notes, created_at')
    .in('id', customerIds)
    .eq('restaurant_id', restaurant_id)
    .order('name', { ascending: true })

  if (error) return { error: error.message }
  if (!customers) return { error: 'Nenhum dado encontrado' }

  const headers = ['Nome', 'Telefone', 'Email', 'Aniversario', 'Pontos', 'Cadastrado em']
  const rows = customers.map((c) => [
    escapeCsv(c.name as string),
    escapeCsv(c.phone as string ?? ''),
    escapeCsv(c.email as string ?? ''),
    escapeCsv(c.birthday as string ?? ''),
    String(c.loyalty_points ?? 0),
    new Date(c.created_at as string).toLocaleDateString('pt-BR'),
  ])

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  return { ok: true, csv, filename: `clientes-${new Date().toISOString().slice(0, 10)}.csv` }
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

// ---------------------------------------------------------------
// Segment builder
// ---------------------------------------------------------------

export async function createSegmentFromRules(input: {
  name: string
  rules: SegmentRule[]
  operator: 'AND' | 'OR'
}) {
  if (!input.name.trim()) return { error: 'Nome obrigatorio' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const { data: { user } } = await supabase.auth.getUser()

  const count = await countCustomersByRulesInternal(supabase, restaurant_id, input.rules, input.operator)

  const { error } = await supabase.from('campaign_audiences').insert({
    restaurant_id,
    name: input.name.trim(),
    description: `Segmento criado a partir de regras (${input.operator})`,
    filters: input.rules,
    cached_count: count,
    cached_at: new Date().toISOString(),
    created_by: user?.id ?? null,
  })

  if (error) return { error: error.message }

  revalidatePath('/clientes')
  revalidatePath('/marketing/audiences')
  return { ok: true, count }
}

export async function countCustomersByRules(rules: SegmentRule[], operator: 'AND' | 'OR') {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const count = await countCustomersByRulesInternal(supabase, restaurant_id, rules, operator)
  return { ok: true, count }
}

async function countCustomersByRulesInternal(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  restaurantId: string,
  rules: SegmentRule[],
  operator: 'AND' | 'OR'
): Promise<number> {
  const { data: customers } = await supabase
    .from('customers')
    .select('id, birthday, loyalty_points, created_at, notes')
    .eq('restaurant_id', restaurantId)

  if (!customers || customers.length === 0) return 0

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
    const sorted = [...custOrders].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const lastVisit = sorted[0]?.created_at ?? null
    const daysSinceVisit = lastVisit
      ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000)
      : 999

    if (rules.length === 0) return true

    const results = rules.map((r) => matchRule(r, {
      totalSpent,
      totalOrders,
      daysSinceVisit,
      loyaltyPoints: Number(c.loyalty_points ?? 0),
      birthday: c.birthday as string | null,
      createdAt: c.created_at as string,
    }))

    return operator === 'AND' ? results.every(Boolean) : results.some(Boolean)
  }).length
}

function matchRule(
  rule: SegmentRule,
  data: {
    totalSpent: number
    totalOrders: number
    daysSinceVisit: number
    loyaltyPoints: number
    birthday: string | null
    createdAt: string
  }
): boolean {
  const val = (() => {
    switch (rule.field) {
      case 'total_spent': return data.totalSpent
      case 'total_orders': return data.totalOrders
      case 'last_visit_at': return data.daysSinceVisit
      case 'loyalty_points': return data.loyaltyPoints
      case 'birthday_month':
        return data.birthday
          ? new Date(data.birthday + 'T00:00:00').getMonth() + 1
          : null
      case 'created_at':
        return Math.floor((Date.now() - new Date(data.createdAt).getTime()) / 86400000)
      default: return null
    }
  })()

  if (val === null) return false

  const target = Number(rule.value)
  switch (rule.op) {
    case 'eq': return val === target
    case 'gt': return val > target
    case 'gte': return val >= target
    case 'lt': return val < target
    case 'lte': return val <= target
    default: return true
  }
}
