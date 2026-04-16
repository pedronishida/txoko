'use server'

import { revalidatePath } from 'next/cache'
import type { OrderItemStatus, OrderStatus } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = { status }
  if (status === 'closed' || status === 'delivered') {
    patch.closed_at = new Date().toISOString()
  }
  const { error } = await supabase.from('orders').update(patch).eq('id', orderId)
  if (error) return { error: error.message }
  revalidatePath('/kds')
  revalidatePath('/mesas')
  return { ok: true }
}

export async function setItemsStatus(
  orderId: string,
  fromStatus: OrderItemStatus,
  toStatus: OrderItemStatus
) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = { status: toStatus }
  if (toStatus === 'preparing') patch.sent_to_kitchen_at = new Date().toISOString()
  if (toStatus === 'ready') patch.ready_at = new Date().toISOString()

  const { error } = await supabase
    .from('order_items')
    .update(patch)
    .eq('order_id', orderId)
    .eq('status', fromStatus)
  if (error) return { error: error.message }
  revalidatePath('/kds')
  return { ok: true }
}

export async function acceptOrder(orderId: string) {
  const r1 = await setItemsStatus(orderId, 'pending', 'preparing')
  if ('error' in r1 && r1.error) return r1
  return setOrderStatus(orderId, 'preparing')
}

export async function markOrderReady(orderId: string) {
  const r1 = await setItemsStatus(orderId, 'preparing', 'ready')
  if ('error' in r1 && r1.error) return r1
  return setOrderStatus(orderId, 'ready')
}

export async function markOrderDelivered(orderId: string) {
  const r1 = await setItemsStatus(orderId, 'ready', 'delivered')
  if ('error' in r1 && r1.error) return r1
  return setOrderStatus(orderId, 'delivered')
}
