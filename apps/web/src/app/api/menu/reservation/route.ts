import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ReservationInputSchema = z.object({
  restaurantSlug: z.string().min(1),
  guest_name: z.string().min(2, 'Nome obrigatorio'),
  guest_phone: z.string().min(8, 'Telefone obrigatorio'),
  guest_email: z.string().email().optional().or(z.literal('')),
  guest_count: z.number().int().min(1).max(20),
  scheduled_for: z.string().min(1),
  special_requests: z.string().optional(),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalido' }, { status: 400 })
  }

  const parsed = ReservationInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados invalidos' },
      { status: 422 }
    )
  }

  const data = parsed.data
  const supabase = createServiceClient()

  // 1. Find restaurant by slug
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('slug', data.restaurantSlug)
    .eq('is_active', true)
    .maybeSingle()

  if (restError || !restaurant) {
    return NextResponse.json({ ok: false, error: 'Restaurante nao encontrado' }, { status: 404 })
  }

  // 2. Find or create customer by phone
  const cleanPhone = data.guest_phone.replace(/\D/g, '')
  let customerId: string | null = null

  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurant.id)
    .eq('phone', cleanPhone)
    .maybeSingle()

  if (existingCustomer) {
    customerId = existingCustomer.id
  } else {
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({
        restaurant_id: restaurant.id,
        name: data.guest_name,
        phone: cleanPhone,
        email: data.guest_email || null,
      })
      .select('id')
      .single()

    customerId = newCustomer?.id ?? null
  }

  // 3. Create reservation
  const { data: reservation, error: rsvError } = await supabase
    .from('reservations')
    .insert({
      restaurant_id: restaurant.id,
      customer_id: customerId,
      guest_name: data.guest_name,
      guest_phone: cleanPhone,
      guest_email: data.guest_email || null,
      guest_count: data.guest_count,
      scheduled_for: data.scheduled_for,
      duration_minutes: 90,
      status: 'pending',
      source: 'public_menu',
      special_requests: data.special_requests || null,
    })
    .select('id')
    .single()

  if (rsvError || !reservation) {
    console.error('[reservation] error:', rsvError)
    return NextResponse.json(
      { ok: false, error: 'Erro ao criar reserva' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    reservationId: reservation.id,
    restaurantName: restaurant.name,
  })
}
