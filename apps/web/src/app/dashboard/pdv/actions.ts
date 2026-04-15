'use server'

import { revalidatePath } from 'next/cache'
import type { OrderType, PaymentMethod } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export type NewOrderInput = {
  type: OrderType
  table_id: string | null
  customer_id: string | null
  subtotal: number
  discount: number
  service_fee: number
  delivery_fee: number
  total: number
  notes: string | null
  estimated_time: number | null
  payment_method: PaymentMethod | null
  items: Array<{
    product_id: string
    quantity: number
    unit_price: number
    total_price: number
    notes: string | null
  }>
}

export async function createOrder(input: NewOrderInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: user } = await supabase.auth.getUser()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      restaurant_id,
      table_id: input.table_id,
      customer_id: input.customer_id,
      waiter_id: user.user?.id ?? null,
      type: input.type,
      status: 'open',
      subtotal: input.subtotal,
      discount: input.discount,
      service_fee: input.service_fee,
      delivery_fee: input.delivery_fee,
      total: input.total,
      notes: input.notes,
      source: 'pos',
      estimated_time: input.estimated_time,
    })
    .select('id')
    .single()

  if (orderError || !order) return { error: orderError?.message ?? 'Falha ao criar pedido' }

  const itemsPayload = input.items.map((it) => ({
    order_id: order.id,
    product_id: it.product_id,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: it.total_price,
    notes: it.notes,
    status: 'pending' as const,
  }))

  const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)
  if (itemsError) return { error: itemsError.message }

  if (input.table_id) {
    await supabase
      .from('tables')
      .update({
        status: 'occupied',
        occupied_at: new Date().toISOString(),
        current_order_id: order.id,
      })
      .eq('id', input.table_id)
  }

  // Pagamento upfront (nao dine_in): grava payment e mantem pedido em 'open'.
  // Cozinha ainda precisa produzir, mas o pagamento ja esta aprovado.
  if (input.payment_method && input.type !== 'dine_in') {
    await supabase.from('payments').insert({
      restaurant_id,
      order_id: order.id,
      method: input.payment_method,
      amount: input.total,
      status: 'approved',
    })
  }

  revalidatePath('/dashboard/pdv')
  revalidatePath('/dashboard/kds')
  revalidatePath('/dashboard/mesas')
  revalidatePath('/dashboard/pedidos')
  revalidatePath('/dashboard/financeiro')
  return { ok: true, orderId: order.id }
}
