'use server'

import { revalidatePath } from 'next/cache'
import type { PaymentMethod } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'

export type ClosePaymentInput = {
  orderId: string
  method: PaymentMethod
  amount: number
  freeTable?: boolean
}

export async function closeOrderWithPayment(input: ClosePaymentInput) {
  const supabase = await createClient()

  const { data: order, error: getError } = await supabase
    .from('orders')
    .select('id, restaurant_id, table_id, total')
    .eq('id', input.orderId)
    .maybeSingle()

  if (getError) return { error: getError.message }
  if (!order) return { error: 'Pedido nao encontrado' }

  const { error: payError } = await supabase.from('payments').insert({
    restaurant_id: order.restaurant_id,
    order_id: order.id,
    method: input.method,
    amount: input.amount,
    status: 'approved',
  })
  if (payError) return { error: payError.message }

  const { error: updError } = await supabase
    .from('orders')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', order.id)
  if (updError) return { error: updError.message }

  if (input.freeTable !== false && order.table_id) {
    await supabase
      .from('tables')
      .update({ status: 'available', occupied_at: null, current_order_id: null })
      .eq('id', order.table_id)
  }

  revalidatePath('/dashboard/pdv')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/mesas')
  revalidatePath('/dashboard/kds')
  revalidatePath('/dashboard/financeiro')
  return { ok: true }
}
