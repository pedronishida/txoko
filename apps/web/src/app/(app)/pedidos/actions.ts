'use server'

import { revalidatePath } from 'next/cache'
import type { OrderStatus, PaymentMethod } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'
import { runAutomationsForEvent } from '@/lib/server/automations/runner'

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = { status }
  if (status === 'closed' || status === 'delivered' || status === 'cancelled') {
    patch.closed_at = new Date().toISOString()
  }
  const { error } = await supabase.from('orders').update(patch).eq('id', orderId)
  if (error) return { error: error.message }

  // Libera a mesa se o pedido foi finalizado
  if (status === 'closed' || status === 'cancelled' || status === 'delivered') {
    const { data: order } = await supabase
      .from('orders')
      .select('table_id, restaurant_id, total')
      .eq('id', orderId)
      .maybeSingle()
    if (order?.table_id) {
      await supabase
        .from('tables')
        .update({ status: 'available', occupied_at: null, current_order_id: null })
        .eq('id', order.table_id)
    }
    // Fire order_completed automations (best-effort — non-blocking)
    if (order?.restaurant_id && (status === 'closed' || status === 'delivered')) {
      void runAutomationsForEvent(supabase, {
        type: 'order_completed',
        restaurantId: order.restaurant_id as string,
        payload: { orderId, total: order.total as number },
      })
    }
  }

  revalidatePath('/pedidos')
  revalidatePath('/mesas')
  revalidatePath('/kds')
  return { ok: true }
}

// ─── Edit Order ──────────────────────────────────────────────────────────────

export type EditOrderItemInput = {
  id?: string // existing item id — if absent, insert
  product_id: string
  quantity: number
  unit_price: number
  notes: string | null
}

export type EditOrderInput = {
  orderId: string
  items: EditOrderItemInput[]
  notes?: string | null
  service_fee?: number
  delivery_fee?: number
  discount?: number
}

const BLOCKED_STATUSES: OrderStatus[] = ['closed', 'cancelled', 'delivered', 'paid' as OrderStatus]

export async function updateOrder(input: EditOrderInput) {
  const supabase = await createClient()

  // Fetch current order to validate status
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, restaurant_id, status, service_fee, delivery_fee, discount, type')
    .eq('id', input.orderId)
    .maybeSingle()

  if (fetchErr) return { error: fetchErr.message }
  if (!order) return { error: 'Pedido nao encontrado' }
  if (BLOCKED_STATUSES.includes(order.status as OrderStatus)) {
    return { error: `Pedido com status "${order.status}" nao pode ser editado` }
  }

  // Recalculate totals
  const subtotal = input.items.reduce(
    (sum, it) => sum + it.unit_price * it.quantity,
    0
  )
  const serviceFee = input.service_fee ?? (order.type === 'dine_in' ? subtotal * 0.1 : 0)
  const deliveryFee = input.delivery_fee ?? (order.delivery_fee as number)
  const discount = input.discount ?? (order.discount as number)
  const total = subtotal + serviceFee + deliveryFee - discount

  // Fetch existing items to figure out deletions
  const { data: existingItems } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', input.orderId)

  const existingIds = new Set((existingItems ?? []).map((i) => i.id as string))
  const incomingIds = new Set(input.items.filter((i) => i.id).map((i) => i.id!))
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))

  // Delete removed items
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('order_items')
      .delete()
      .in('id', toDelete)
    if (delErr) return { error: delErr.message }
  }

  // Upsert each item
  for (const item of input.items) {
    const payload = {
      order_id: input.orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.unit_price * item.quantity,
      notes: item.notes,
      status: 'pending' as const,
    }
    if (item.id) {
      const { error: upErr } = await supabase
        .from('order_items')
        .update(payload)
        .eq('id', item.id)
      if (upErr) return { error: upErr.message }
    } else {
      const { error: insErr } = await supabase
        .from('order_items')
        .insert(payload)
      if (insErr) return { error: insErr.message }
    }
  }

  // Update order totals + notes
  const orderPatch: Record<string, unknown> = {
    subtotal,
    service_fee: serviceFee,
    delivery_fee: deliveryFee,
    discount,
    total,
  }
  if (input.notes !== undefined) orderPatch.notes = input.notes

  const { error: updErr } = await supabase
    .from('orders')
    .update(orderPatch)
    .eq('id', input.orderId)
  if (updErr) return { error: updErr.message }

  revalidatePath('/pedidos')
  revalidatePath('/kds')
  return { ok: true, subtotal, total }
}

// ─── Split Bill ───────────────────────────────────────────────────────────────

export type SplitEntry = {
  label: string
  amount: number
  method: PaymentMethod
}

export async function splitOrderPayments(orderId: string, splits: SplitEntry[]) {
  const supabase = await createClient()

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, restaurant_id, total, status')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr) return { error: fetchErr.message }
  if (!order) return { error: 'Pedido nao encontrado' }
  if (order.status === 'closed' || order.status === 'cancelled') {
    return { error: 'Pedido ja encerrado' }
  }

  const totalSplits = splits.reduce((s, e) => s + e.amount, 0)
  // Allow small floating-point tolerance (1 cent)
  if (Math.abs(totalSplits - (order.total as number)) > 0.02) {
    return { error: `Soma das divisoes (${totalSplits.toFixed(2)}) nao bate com total do pedido (${(order.total as number).toFixed(2)})` }
  }

  const payments = splits.map((s) => ({
    restaurant_id: order.restaurant_id as string,
    order_id: order.id as string,
    method: s.method,
    amount: s.amount,
    status: 'approved' as const,
  }))

  const { error: payErr } = await supabase.from('payments').insert(payments)
  if (payErr) return { error: payErr.message }

  // Close order + free table
  const { error: closeErr } = await supabase
    .from('orders')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', orderId)
  if (closeErr) return { error: closeErr.message }

  // Free table
  const { data: orderFull } = await supabase
    .from('orders')
    .select('table_id')
    .eq('id', orderId)
    .maybeSingle()
  if (orderFull?.table_id) {
    await supabase
      .from('tables')
      .update({ status: 'available', occupied_at: null, current_order_id: null })
      .eq('id', orderFull.table_id as string)
  }

  revalidatePath('/pedidos')
  revalidatePath('/mesas')
  revalidatePath('/kds')
  revalidatePath('/financeiro')
  return { ok: true }
}
