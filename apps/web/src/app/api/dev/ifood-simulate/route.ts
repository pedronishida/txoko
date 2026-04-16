// =============================================================
// iFood Order Simulator — DEV ONLY
//
// Habilitado somente quando ENABLE_DEV_ROUTES=true
// Simula a chegada de um pedido iFood sem precisar de conta real.
//
// POST /api/dev/ifood-simulate
// Body: { restaurantId: string, order?: Partial<IfoodOrder> }
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { ingestIfoodOrder } from '@/lib/server/ifood/ingest'
import type { IfoodOrder } from '@/lib/server/ifood/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SimulateBodySchema = z.object({
  restaurantId: z.string().uuid('restaurantId deve ser um UUID valido'),
  order: z.record(z.string(), z.unknown()).optional(),
})

function buildSampleOrder(overrides: Record<string, unknown> = {}): IfoodOrder {
  const orderId = `ifood-sim-${Date.now()}`
  return {
    id: orderId,
    reference: `SIM-${Math.floor(Math.random() * 100000)}`,
    shortReference: `SIM${Math.floor(Math.random() * 9999)}`,
    createdAt: new Date().toISOString(),
    type: 'DELIVERY',
    merchant: {
      id: 'merchant-sim-001',
      name: 'Restaurante Simulado',
      phones: ['(11) 99999-0000'],
      address: {
        streetName: 'Rua Simulada',
        streetNumber: '100',
        formattedAddress: 'Rua Simulada, 100 - Centro',
        neighborhood: 'Centro',
        postalCode: '01001-000',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
      },
    },
    customer: {
      id: 'customer-sim-001',
      name: 'Cliente Simulado',
      phone: '11987654321',
      taxPayerIdentificationNumber: '***.***.***-**',
    },
    items: [
      {
        index: 1,
        code: 'SIM-ITEM-001',
        name: 'X-Burguer Especial',
        quantity: 2,
        externalCode: 'SIM-SKU-001',
        unit: 'UN',
        unitPrice: 2490,
        totalPrice: 4980,
        discount: 0,
        addition: 0,
        observations: 'Sem cebola',
        options: [
          {
            index: 1,
            code: 'SIM-OPT-001',
            name: 'Adicionar Bacon',
            addition: 350,
            discount: 0,
            quantity: 1,
            unitPrice: 350,
            totalPrice: 350,
          },
        ],
      },
      {
        index: 2,
        code: 'SIM-ITEM-002',
        name: 'Refrigerante Lata',
        quantity: 2,
        externalCode: 'SIM-SKU-002',
        unit: 'UN',
        unitPrice: 650,
        totalPrice: 1300,
        discount: 0,
        addition: 0,
      },
    ],
    subTotal: 6280,
    deliveryFee: 499,
    totalPrice: 6779,
    payments: {
      prepaid: 6779,
      pending: 0,
      methods: [
        {
          name: 'Cartao de Credito',
          code: 'CREDIT',
          value: 6779,
          prepaid: true,
          issuer: 'VISA',
        },
      ],
    },
    delivery: {
      mode: 'DEFAULT',
      estimatedTimeMinutes: 45,
      deliveryAddress: {
        streetName: 'Rua do Cliente',
        streetNumber: '456',
        complement: 'Apto 12',
        formattedAddress: 'Rua do Cliente, 456 - Apto 12 - Vila Nova',
        neighborhood: 'Vila Nova',
        postalCode: '01002-000',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
        latitude: -23.5505,
        longitude: -46.6333,
      },
    },
    extraInfo: 'Pedido simulado para testes de integracao iFood',
    isTest: true,
    ...overrides,
  }
}

export async function POST(req: NextRequest) {
  // Guard: rotas dev desabilitadas em producao
  if (process.env.ENABLE_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Dev routes desabilitadas' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }

  const parsed = SimulateBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Payload invalido', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { restaurantId, order: orderOverrides = {} } = parsed.data

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Valida que o restaurante existe
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurante ${restaurantId} nao encontrado` },
      { status: 404 }
    )
  }

  const simulatedOrder = buildSampleOrder(orderOverrides)

  // Loga evento simulado
  await supabase.from('ifood_events').insert({
    restaurant_id: restaurantId,
    event_id: `sim-evt-${Date.now()}`,
    event_type: 'PLACED',
    order_external_id: simulatedOrder.id,
    payload: { simulated: true, order: simulatedOrder },
    processed: false,
  })

  const result = await ingestIfoodOrder(supabase, restaurantId, simulatedOrder)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Atualiza ifood_events com o order_id
  if (result.created) {
    await supabase
      .from('ifood_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        order_id: result.orderId,
      })
      .eq('order_external_id', simulatedOrder.id)
      .eq('restaurant_id', restaurantId)
  }

  return NextResponse.json({
    ok: true,
    orderId: result.orderId,
    created: result.created,
    restaurant: (restaurant as { id: string; name: string }).name,
    simulatedOrderId: simulatedOrder.id,
    simulatedItems: simulatedOrder.items.length,
    totalPrice: simulatedOrder.totalPrice,
  })
}

export async function GET() {
  if (process.env.ENABLE_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Dev routes desabilitadas' }, { status: 403 })
  }
  return NextResponse.json({
    service: 'txoko-ifood-simulate',
    status: 'ok',
    usage: 'POST com { restaurantId: uuid, order?: Partial<IfoodOrder> }',
  })
}
