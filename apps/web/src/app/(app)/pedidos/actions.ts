'use server'

import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@txoko/shared'
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
