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
  // Vai junto pra tela nao precisar guardar o token separado — ela pode ter
  // carregado a comanda pelo numero do cartao, sem passar pelo QR.
  qr_token: string
  // O modal de cancelamento gradua o aviso pelo status do pedido.
  status: string
  service_mode: 'avontade' | 'por_kg' | 'por_kg_2mix' | null
  subtotal: number
  discount: number
  service_fee: number
  total: number
  items: CaixaItem[]
}

export type FindOrderResult = { ok: true; order: CaixaOrder } | { error: string }

/**
 * Cartao valido, mas ainda sem comanda aberta — o cliente veio direto pro
 * caixa sem passar pela balanca (comprou so uma bebida, um doce). Nao e erro:
 * o caixa pode abrir a comanda dali mesmo.
 */
export type FindOrCreateResult =
  | FindOrderResult
  | { needsOpen: true; qr_token: string; card_number: number }

export async function findOrderByCardToken(qr_token: string): Promise<FindOrCreateResult> {
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
        service_mode: 'avontade' | 'por_kg' | 'por_kg_2mix' | null
        card_kind: 'customer' | 'cancel'
        restaurant_id: string
      }
    | null

  if (!card) return { error: 'Cartao nao encontrado' }
  if (card.restaurant_id !== restaurant_id) return { error: 'Cartao de outro restaurante' }
  if (card.card_kind !== 'customer') return { error: 'Esse cartao nao abre comanda' }

  const { data: orderRow, error: orderErr } = await supabase
    .from('orders')
    .select('id, subtotal, discount, service_fee, total, status, service_mode')
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
        service_mode: string | null
      }
    | null

  if (!order) {
    return { needsOpen: true, qr_token: token, card_number: card.card_number }
  }

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
      qr_token: token,
      status: order.status,
      // A modalidade mora na COMANDA (escolhida na balanca). O cartao so
      // tem modo nos cartoes antigos, de modalidade fixa.
      service_mode: (order.service_mode ?? card.service_mode) as CaixaOrder['service_mode'],
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

  return semNeedsOpen(await findOrderByCardToken(qrToken))
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
  return semNeedsOpen(await findOrderByCardToken(qrToken))
}

/**
 * Depois de uma mutacao a comanda existe por construcao. Estreita o tipo em vez
 * de vazar 'needsOpen' pra quem so quis adicionar ou cancelar um item.
 */
function semNeedsOpen(r: FindOrCreateResult): FindOrderResult {
  return 'needsOpen' in r ? { error: 'Comanda nao encontrada' } : r
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

// ---------------------------------------------------------------
// Tela unificada PDV + Caixa
// ---------------------------------------------------------------
// A venda de balcao e a comanda da estacao viraram a mesma coisa: um
// pedido aberto que da pra editar e fechar na mesma tela. As actions
// abaixo cobrem o que faltava pra isso.

export type OpenOrderSummary = {
  order_id: string
  card_number: number | null
  // Token do cartao DESTE pedido: carregar pela lista usa ele, nao o numero.
  // Numero pode se repetir entre cartao ativo e regerado; o token nao.
  qr_token: string | null
  service_mode: string | null
  type: string
  status: string
  total: number
  items_count: number
  opened_at: string
}

/** Comandas e vendas abertas — alimenta a lista de carrinhos do topo. */
export async function listOpenOrders(): Promise<OpenOrderSummary[]> {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, type, status, total, service_mode, opened_at, created_at, comanda_cards(card_number, qr_token), order_items(id, status)'
    )
    .eq('restaurant_id', restaurant_id)
    .in('status', ['open', 'preparing', 'ready', 'delivered'])
    .order('created_at', { ascending: false })

  if (error || !data) return []

  type Row = {
    id: string
    type: string
    status: string
    total: number | string
    service_mode: string | null
    opened_at: string | null
    created_at: string
    comanda_cards:
      | { card_number: number; qr_token: string }
      | { card_number: number; qr_token: string }[]
      | null
    order_items: { id: string; status: string }[] | null
  }

  return (data as Row[]).map((o) => {
    const card = Array.isArray(o.comanda_cards) ? o.comanda_cards[0] : o.comanda_cards
    return {
      order_id: o.id,
      card_number: card?.card_number ?? null,
      qr_token: card?.qr_token ?? null,
      service_mode: o.service_mode,
      type: o.type,
      status: o.status,
      total: Number(o.total ?? 0),
      items_count: (o.order_items ?? []).filter((i) => i.status !== 'cancelled').length,
      opened_at: o.opened_at ?? o.created_at,
    }
  })
}

/** Adiciona produto tocando no card da grade (agrupa se ja existe). */
export async function addProductToOrder(
  orderId: string,
  productId: string,
  quantity = 1
): Promise<{ ok: true } | { error: string }> {
  if (quantity < 1) return { error: 'Quantidade invalida' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: product } = await supabase
    .from('products')
    .select('id, price, is_active, restaurant_id, service_mode')
    .eq('id', productId)
    .maybeSingle()

  if (!product) return { error: 'Produto nao encontrado' }
  if (product.restaurant_id !== restaurant_id) return { error: 'Produto de outro restaurante' }
  if (!product.is_active) return { error: 'Produto inativo' }
  if (product.service_mode) {
    return { error: 'Item de self-service e lancado na estacao, pela balanca' }
  }

  // Mesmo produto ja na comanda (e sem peso) -> soma quantidade
  const { data: existing } = await supabase
    .from('order_items')
    .select('id, quantity, unit_price')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .is('weight_grams', null)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle()

  const price = Number(product.price)

  if (existing) {
    const qty = Number(existing.quantity) + quantity
    const { error } = await supabase
      .from('order_items')
      .update({ quantity: qty, total_price: Number((price * qty).toFixed(2)) })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('order_items').insert({
      order_id: orderId,
      product_id: productId,
      quantity,
      unit_price: price,
      total_price: Number((price * quantity).toFixed(2)),
      status: 'pending',
    })
    if (error) return { error: error.message }
  }

  const { error: recalcErr } = await supabase.rpc('recalc_order_totals', {
    p_order_id: orderId,
  })
  if (recalcErr) return { error: recalcErr.message }

  revalidatePath('/pdv')
  return { ok: true }
}

/** Stepper de quantidade. quantity = 0 cancela o item. */
export async function setOrderItemQuantity(
  orderId: string,
  itemId: string,
  quantity: number
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('order_items')
    .select('id, order_id, unit_price, weight_grams')
    .eq('id', itemId)
    .maybeSingle()

  if (!item) return { error: 'Item nao encontrado' }
  if (item.order_id !== orderId) return { error: 'Item de outra comanda' }
  if (item.weight_grams != null) {
    return { error: 'Item pesado — use cancelar em vez de mudar a quantidade' }
  }

  if (quantity <= 0) {
    const { error } = await supabase
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_by: 'pdv',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', itemId)
    if (error) return { error: error.message }
  } else {
    const price = Number(item.unit_price)
    const { error } = await supabase
      .from('order_items')
      .update({ quantity, total_price: Number((price * quantity).toFixed(2)) })
      .eq('id', itemId)
    if (error) return { error: error.message }
  }

  const { error: recalcErr } = await supabase.rpc('recalc_order_totals', {
    p_order_id: orderId,
  })
  if (recalcErr) return { error: recalcErr.message }

  revalidatePath('/pdv')
  return { ok: true }
}

/**
 * Acha a comanda pelo NUMERO impresso no cartao (ex: "3"), em vez do token
 * do QR. Serve de plano B quando o leitor falha, o QR rasgou ou a camera do
 * aparelho e ruim demais pra ler.
 *
 * So existe aqui no painel, que exige login. Na estacao continua sendo o
 * token: as RPCs de la sao abertas ao anon e aceitar numero permitiria
 * abrir a comanda de qualquer um de fora.
 */
export async function findOrderByCardNumber(
  cardNumber: number
): Promise<FindOrCreateResult> {
  if (!Number.isInteger(cardNumber) || cardNumber < 1) {
    return { error: 'Numero de cartao invalido' }
  }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: card } = await supabase
    .from('comanda_cards')
    .select('qr_token')
    .eq('restaurant_id', restaurant_id)
    .eq('card_number', cardNumber)
    .eq('card_kind', 'customer')
    .eq('is_active', true)
    .maybeSingle()

  if (!card) return { error: `Cartao #${cardNumber} nao encontrado` }

  return findOrderByCardToken(card.qr_token as string)
}

/**
 * Acha a comanda pelo codigo de barras do cartao — o caminho normal do caixa
 * agora que a identificacao por QR saiu de circulacao.
 */
export async function findOrderByCardBarcode(
  barcode: string
): Promise<FindOrCreateResult> {
  const code = barcode.trim().toUpperCase()
  if (!/^C[0-9A-F]{12}$/.test(code)) {
    return { error: 'Codigo de cartao invalido' }
  }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const { data: card } = await supabase
    .from('comanda_cards')
    .select('qr_token, card_kind')
    .eq('restaurant_id', restaurant_id)
    .eq('barcode', code)
    .eq('is_active', true)
    .maybeSingle()

  if (!card) return { error: 'Cartao nao encontrado' }
  if (card.card_kind !== 'customer') return { error: 'Esse cartao nao abre comanda' }

  return findOrderByCardToken(card.qr_token as string)
}

/**
 * Abre a comanda do cartao a partir do caixa. Mesma RPC que a estacao usa —
 * e idempotente, entao se alguem ja abriu no meio tempo apenas devolve o que
 * existe, sem duplicar comanda.
 *
 * Com cartao generico (service_mode nulo) a comanda nasce vazia, sem lancar
 * modalidade nenhuma: quem so comprou uma bebida nao pode sair pagando bufe.
 */
export async function openOrderFromCard(qrToken: string): Promise<FindOrderResult> {
  const token = qrToken.trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(token)) return { error: 'Token invalido' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('station_open_session', { p_qr_token: token })
  if (error) return { error: error.message }

  return semNeedsOpen(await findOrderByCardToken(token))
}
