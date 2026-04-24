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

export async function cancelItemFromOrder(
  qrToken: string,
  itemId: string,
): Promise<FindOrderResult> {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  // Valida que o item pertence a comanda do restaurante logado
  const { data: itemRow, error: itemErr } = await supabase
    .from('order_items')
    .select('id, order_id, quantity, unit_price, weight_grams, status, orders!inner(restaurant_id)')
    .eq('id', itemId)
    .maybeSingle()

  if (itemErr) return { error: itemErr.message }
  const item = itemRow as unknown as
    | {
        id: string
        order_id: string
        quantity: number
        unit_price: number
        weight_grams: number | null
        status: string
        orders: { restaurant_id: string }
      }
    | null
  if (!item) return { error: 'Item nao encontrado' }
  if ((item.orders as unknown as { restaurant_id: string }).restaurant_id !== restaurant_id) {
    return { error: 'Item de outro restaurante' }
  }
  if (item.status === 'cancelled') return { error: 'Item ja cancelado' }

  // Decrementa se unitario com qty > 1, senao cancela linha inteira
  if (item.weight_grams == null && item.quantity > 1) {
    const newQty = item.quantity - 1
    const newTotal = Math.round(Number(item.unit_price) * newQty * 100) / 100
    const { error: updErr } = await supabase
      .from('order_items')
      .update({ quantity: newQty, total_price: newTotal })
      .eq('id', itemId)
    if (updErr) return { error: updErr.message }
  } else {
    const { error: updErr } = await supabase
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_by: 'cashier',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', itemId)
    if (updErr) return { error: updErr.message }
  }

  // Recalcula totais (chama RPC helper que ja existe)
  await supabase.rpc('recalc_order_totals', { p_order_id: item.order_id })

  return findOrderByCardToken(qrToken)
}

export async function addBarcodeToOrder(
  qrToken: string,
  barcode: string,
): Promise<FindOrderResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('station_add_barcode_item', {
    p_qr_token: qrToken,
    p_barcode: barcode,
  })
  if (error) return { error: error.message }
  // Recarrega a comanda (snapshot atualizado)
  return findOrderByCardToken(qrToken)
}

export type PaymentLine = {
  method: PaymentMethod
  amount: number
}

export async function closeOrder(
  orderId: string,
  payments: PaymentLine[],
): Promise<{ ok: true } | { error: string }> {
  if (!payments || payments.length === 0) return { error: 'Informe pelo menos uma forma de pagamento' }

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

  // Valida soma
  const sum = payments.reduce((acc, p) => acc + (p.amount || 0), 0)
  const total = Number(order.total)
  const diff = Math.abs(sum - total)
  if (diff > 0.01) {
    return {
      error: `Soma dos pagamentos (R$ ${sum.toFixed(2)}) nao bate com total (R$ ${total.toFixed(2)})`,
    }
  }

  // Grava todos os payments
  const rows = payments
    .filter((p) => p.amount > 0)
    .map((p) => ({
      restaurant_id,
      order_id: orderId,
      method: p.method,
      amount: p.amount,
      status: 'approved' as const,
    }))

  const { error: payErr } = await supabase.from('payments').insert(rows)
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
