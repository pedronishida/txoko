// =============================================================
// iFood Order Ingestor
// Transforma um IfoodOrder em pedido interno do Txoko.
// Usa service_role (chamado somente de routes server-side).
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IfoodOrder, IngestIfoodOrderResult } from './types'

// -----------------------------------------------------------
// resolveOrCreateCustomer
// Busca cliente por telefone; cria se nao existe.
// -----------------------------------------------------------
async function resolveOrCreateCustomer(
  supabase: SupabaseClient,
  restaurantId: string,
  customer: IfoodOrder['customer']
): Promise<string | null> {
  const phone = customer.phone?.replace(/\D/g, '')
  if (!phone) return null

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('phone', phone)
    .maybeSingle()

  if (existing) return existing.id as string

  const { data: created } = await supabase
    .from('customers')
    .insert({
      restaurant_id: restaurantId,
      name: customer.name ?? 'Cliente iFood',
      phone,
    })
    .select('id')
    .single()

  return (created?.id as string) ?? null
}

// -----------------------------------------------------------
// resolveOrCreateProduct
// Busca ou cria produto a partir do mapeamento iFood SKU.
// Se nao houver mapeamento e auto_create=true (default), cria.
// -----------------------------------------------------------
async function resolveOrCreateProduct(
  supabase: SupabaseClient,
  restaurantId: string,
  ifoodSku: string,
  ifoodName: string,
  unitPrice: number
): Promise<string | null> {
  // 1. Verifica mapeamento existente
  const { data: mapping } = await supabase
    .from('ifood_product_mappings')
    .select('product_id, auto_create')
    .eq('restaurant_id', restaurantId)
    .eq('ifood_sku', ifoodSku)
    .maybeSingle()

  if (mapping?.product_id) return mapping.product_id as string

  // 2. Se nao ha mapeamento ou auto_create=false, nao cria
  if (mapping && !mapping.auto_create) return null

  // 3. Auto-cria produto + registra mapeamento
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: product } = await supabase
    .from('products')
    .insert({
      restaurant_id: restaurantId,
      category_id: category?.id ?? null,
      name: ifoodName,
      price: unitPrice,
      available: true,
      description: `Produto importado do iFood (SKU: ${ifoodSku})`,
    })
    .select('id')
    .single()

  if (!product) return null

  const productId = product.id as string

  // Registra mapeamento para proximas ingestoes
  await supabase
    .from('ifood_product_mappings')
    .upsert({
      restaurant_id: restaurantId,
      ifood_sku: ifoodSku,
      ifood_name: ifoodName,
      product_id: productId,
      auto_create: true,
    })
    .eq('restaurant_id', restaurantId)
    .eq('ifood_sku', ifoodSku)

  return productId
}

// -----------------------------------------------------------
// ingestIfoodOrder
// Ponto de entrada principal — idempotente via external_id.
// -----------------------------------------------------------
export async function ingestIfoodOrder(
  supabase: SupabaseClient,
  restaurantId: string,
  ifoodOrder: IfoodOrder
): Promise<IngestIfoodOrderResult> {
  try {
    // Idempotencia: verifica se ja foi ingerido
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('external_source', 'ifood')
      .eq('external_id', ifoodOrder.id)
      .maybeSingle()

    if (existing) {
      return { ok: true, orderId: existing.id as string, created: false }
    }

    // 1. Resolver ou criar cliente
    const customerId = await resolveOrCreateCustomer(
      supabase,
      restaurantId,
      ifoodOrder.customer
    )

    // 2. Criar pedido principal
    const orderType = ifoodOrder.type === 'DELIVERY'
      ? 'delivery'
      : ifoodOrder.type === 'TAKEOUT'
      ? 'takeaway'
      : 'dine_in'

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        customer_id: customerId,
        type: orderType,
        status: 'open',
        source: 'ifood',
        external_source: 'ifood',
        external_id: ifoodOrder.id,
        subtotal: ifoodOrder.subTotal ?? 0,
        delivery_fee: ifoodOrder.deliveryFee ?? 0,
        total: ifoodOrder.totalPrice ?? 0,
        notes: ifoodOrder.extraInfo ?? null,
        delivery_address: ifoodOrder.delivery?.deliveryAddress
          ? {
              street: ifoodOrder.delivery.deliveryAddress.streetName,
              number: ifoodOrder.delivery.deliveryAddress.streetNumber,
              complement: ifoodOrder.delivery.deliveryAddress.complement,
              neighborhood: ifoodOrder.delivery.deliveryAddress.neighborhood,
              city: ifoodOrder.delivery.deliveryAddress.city,
              state: ifoodOrder.delivery.deliveryAddress.state,
              postal_code: ifoodOrder.delivery.deliveryAddress.postalCode,
              formatted: ifoodOrder.delivery.deliveryAddress.formattedAddress,
            }
          : null,
        estimated_time: ifoodOrder.delivery?.estimatedTimeMinutes ?? null,
      })
      .select('id')
      .single()

    if (orderErr || !order) {
      return { ok: false, error: orderErr?.message ?? 'Falha ao criar pedido' }
    }

    const orderId = order.id as string

    // 3. Criar itens do pedido
    for (const item of ifoodOrder.items) {
      const sku = item.externalCode ?? item.code
      const productId = await resolveOrCreateProduct(
        supabase,
        restaurantId,
        sku,
        item.name,
        item.unitPrice
      )

      if (!productId) {
        // Produto sem mapeamento e auto_create=false: pula o item
        continue
      }

      await supabase.from('order_items').insert({
        order_id: orderId,
        product_id: productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        notes: item.observations ?? null,
        status: 'pending',
        addons: item.options
          ? item.options.map((opt) => ({
              name: opt.name,
              quantity: opt.quantity,
              unit_price: opt.unitPrice,
              total_price: opt.totalPrice,
            }))
          : [],
      })
    }

    // 4. Criar pagamento (iFood gerencia o pagamento — marca como aprovado/pendente)
    const prepaidAmount = ifoodOrder.payments?.prepaid ?? 0
    const pendingAmount = ifoodOrder.payments?.pending ?? 0

    if (prepaidAmount > 0) {
      await supabase.from('payments').insert({
        restaurant_id: restaurantId,
        order_id: orderId,
        method: 'online',
        amount: prepaidAmount,
        status: 'approved',
      })
    }

    if (pendingAmount > 0) {
      const pendingMethod = ifoodOrder.payments?.methods?.find((m) => !m.prepaid)
      const method = pendingMethod?.code?.toLowerCase().includes('cash') ? 'cash' : 'online'
      await supabase.from('payments').insert({
        restaurant_id: restaurantId,
        order_id: orderId,
        method,
        amount: pendingAmount,
        status: 'pending',
      })
    }

    return { ok: true, orderId, created: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido ao ingerir pedido iFood'
    return { ok: false, error: msg }
  }
}
