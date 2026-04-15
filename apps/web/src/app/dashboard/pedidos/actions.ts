'use server'

import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'

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
      .select('table_id')
      .eq('id', orderId)
      .maybeSingle()
    if (order?.table_id) {
      await supabase
        .from('tables')
        .update({ status: 'available', occupied_at: null, current_order_id: null })
        .eq('id', order.table_id)
    }
  }

  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/mesas')
  revalidatePath('/dashboard/kds')
  return { ok: true }
}
