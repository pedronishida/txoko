import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AddressSchema = z.object({
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  reference: z.string().optional(),
})

const OrderInputSchema = z.object({
  restaurantSlug: z.string().min(1),
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().min(8),
    address: AddressSchema.optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        notes: z.string().optional(),
      })
    )
    .min(1),
  orderType: z.enum(['pickup', 'delivery']),
  paymentMethod: z.enum(['pix', 'card_on_delivery', 'cash']),
  changeFor: z.number().positive().optional(),
  scheduledTime: z.string().optional(),
  notes: z.string().optional(),
})

// Maps our checkout payment methods to DB payment_method enum values
function mapPaymentMethod(m: 'pix' | 'card_on_delivery' | 'cash') {
  if (m === 'pix') return 'pix'
  if (m === 'cash') return 'cash'
  return 'credit' // card_on_delivery -> credit (closest match in enum)
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalido' }, { status: 400 })
  }

  const parsed = OrderInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Dados invalidos: ' + parsed.error.issues[0]?.message },
      { status: 422 }
    )
  }

  const data = parsed.data
  const supabase = createServiceClient()

  // 1. Find restaurant by slug
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('id, name, phone')
    .eq('slug', data.restaurantSlug)
    .eq('is_active', true)
    .maybeSingle()

  if (restError || !restaurant) {
    return NextResponse.json(
      { ok: false, error: 'Restaurante nao encontrado' },
      { status: 404 }
    )
  }

  // 2. Find or create customer by phone
  let customerId: string | null = null
  const cleanPhone = data.customer.phone.replace(/\D/g, '')

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurant.id)
    .eq('phone', cleanPhone)
    .maybeSingle()

  if (existing) {
    customerId = existing.id
    // Update name/address in case it changed
    await supabase
      .from('customers')
      .update({
        name: data.customer.name,
        ...(data.customer.address ? { address: data.customer.address } : {}),
      })
      .eq('id', customerId)
  } else {
    const { data: created, error: createErr } = await supabase
      .from('customers')
      .insert({
        restaurant_id: restaurant.id,
        name: data.customer.name,
        phone: cleanPhone,
        address: data.customer.address ?? null,
      })
      .select('id')
      .single()

    if (createErr || !created) {
      return NextResponse.json(
        { ok: false, error: 'Erro ao registrar cliente' },
        { status: 500 }
      )
    }
    customerId = created.id
  }

  // 3. Load and validate product prices
  const productIds = data.items.map((i) => i.productId)
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, price, is_active')
    .in('id', productIds)
    .eq('restaurant_id', restaurant.id)

  if (prodError || !products) {
    return NextResponse.json(
      { ok: false, error: 'Erro ao validar produtos' },
      { status: 500 }
    )
  }

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { ok: false, error: 'Um ou mais produtos nao foram encontrados' },
      { status: 422 }
    )
  }

  const productMap = new Map(products.map((p) => [p.id, p]))
  let subtotal = 0

  for (const item of data.items) {
    const p = productMap.get(item.productId)
    if (!p || !p.is_active) {
      return NextResponse.json(
        { ok: false, error: `Produto indisponivel` },
        { status: 422 }
      )
    }
    subtotal += Number(p.price) * item.quantity
  }

  const orderDbType = data.orderType === 'pickup' ? 'takeaway' : 'delivery'

  // 4. Create the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      restaurant_id: restaurant.id,
      customer_id: customerId,
      type: orderDbType,
      status: 'open',
      subtotal,
      discount: 0,
      service_fee: 0,
      delivery_fee: 0,
      total: subtotal,
      notes: data.notes ?? null,
      source: 'qrcode',
      delivery_address:
        data.orderType === 'delivery' && data.customer.address
          ? data.customer.address
          : null,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    return NextResponse.json(
      { ok: false, error: 'Erro ao criar pedido' },
      { status: 500 }
    )
  }

  // 5. Create order items
  const itemsPayload = data.items.map((item) => {
    const p = productMap.get(item.productId)!
    return {
      order_id: order.id,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: Number(p.price),
      total_price: Number(p.price) * item.quantity,
      notes: item.notes ?? null,
    }
  })

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(itemsPayload)

  if (itemsError) {
    // Rollback order on item insertion failure
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json(
      { ok: false, error: 'Erro ao registrar itens do pedido' },
      { status: 500 }
    )
  }

  // 6. Create payment record
  const dbPaymentMethod = mapPaymentMethod(data.paymentMethod)
  await supabase.from('payments').insert({
    restaurant_id: restaurant.id,
    order_id: order.id,
    method: dbPaymentMethod,
    amount: subtotal,
    status: 'pending',
  })

  return NextResponse.json({ ok: true, orderId: order.id })
}
