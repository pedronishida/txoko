'use server'

import { revalidatePath } from 'next/cache'
import type { PaymentMethod } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export type CaixaItem = {
  id: string
  product_id: string
  product_name: string
  quantity: number
  weight_grams: number | null
  unit_price: number
  total_price: number
}

export type CaixaOrder = {
  order_id: string
  card_number: number
  service_mode: 'avontade' | 'por_kg' | null
  subtotal: number
  discount: number
  service_fee: number
  total: number
  items: CaixaItem[]
}

export type FindOrderResult = { ok: true; order: CaixaOrder } | { error: string }

export async function findOrderByCardToken(qr_token: string): Promise<FindOrderResult> {
  const token = qr_token.trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return { error: 'Token invalido (esperado 32 hex)' }
  }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: cardRow, error: cardErr } = await supabase
    .from('comanda_cards')
    .select('id, card_number, service_mode, card_kind, restaurant_id')
    .eq('qr_token', token)
    .maybeSingle()

  if (cardErr) return { error: cardErr.message }
  const card = cardRow as
    | {
        id: string
        card_number: number
        service_mode: 'avontade' | 'por_kg' | null
        card_kind: 'customer' | 'cancel'
        restaurant_id: string
      }
    | null

  if (!card) return { error: 'Cartao nao encontrado' }
  if (card.restaurant_id !== restaurant_id) return { error: 'Cartao de outro restaurante' }
  if (card.card_kind !== 'customer') return { error: 'Esse cartao nao abre comanda' }

  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .select('id, subtotal, discount, service_fee, total, status')
    .eq('comanda_card_id', card.id)
    .in('status', ['open', 'preparing', 'ready', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (orderErr) return { error: orderErr.message }
  const order = orderRow as
    | {
        id: string
        subtotal: number
        discount: number
        service_fee: number
        total: number
        status: string
      }
    | null

  if (!order) return { error: `Nenhuma comanda aberta no cartao #${card.card_number}` }

  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_id, quantity, weight_grams, unit_price, total_price, status, products(name)')
    .eq('order_id', order.id)
    .neq('status', 'cancelled')
    .order('created_at')

  type RawItem = {
    id: string
    product_id: string
    quantity: number
    weight_grams: number | null
    unit_price: number
    total_price: number
    products: { name: string } | null
  }
  const raw = (items ?? []) as unknown as RawItem[]

  return {
    ok: true,
    order: {
      order_id: order.id,
      card_number: card.card_number,
      service_mode: card.service_mode,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      service_fee: Number(order.service_fee),
      total: Number(order.total),
      items: raw.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product_name: it.products?.name ?? '—',
        quantity: Number(it.quantity),
        weight_grams: it.weight_grams,
        unit_price: Number(it.unit_price),
        total_price: Number(it.total_price),
      })),
    },
  }
}

export async function closeOrder(
  orderId: string,
  paymentMethod: PaymentMethod,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .select('id, restaurant_id, status, total')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) return { error: orderErr.message }
  const order = orderRow as
    | { id: string; restaurant_id: string; status: string; total: number }
    | null
  if (!order) return { error: 'Comanda nao encontrada' }
  if (order.restaurant_id !== restaurant_id) return { error: 'Comanda de outro restaurante' }
  if (order.status === 'closed') return { error: 'Comanda ja fechada' }

  // Grava payment
  const { error: payErr } = await supabase.from('payments').insert({
    restaurant_id,
    order_id: orderId,
    method: paymentMethod,
    amount: order.total,
    status: 'approved',
  })
  if (payErr) return { error: payErr.message }

  // Fecha comanda
  const { error: closeErr } = await supabase
    .from('orders')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', orderId)
  if (closeErr) return { error: closeErr.message }

  revalidatePath('/caixa')
  revalidatePath('/pedidos')
  revalidatePath('/financeiro')
  return { ok: true }
}
