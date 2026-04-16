'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateReservationSchema = z.object({
  guest_name: z.string().min(2, 'Nome obrigatorio'),
  guest_phone: z.string().min(8, 'Telefone obrigatorio'),
  guest_email: z.string().email().optional().or(z.literal('')),
  guest_count: z.number().int().min(1).max(50),
  scheduled_for: z.string().min(1, 'Data/hora obrigatoria'),
  duration_minutes: z.number().int().min(15).max(480).default(90),
  table_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  special_requests: z.string().optional().nullable(),
  source: z.enum(['manual', 'public_menu', 'whatsapp', 'ifood']).default('manual'),
})

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>

const UpdateReservationSchema = z.object({
  id: z.string().uuid(),
  guest_name: z.string().min(2).optional(),
  guest_phone: z.string().min(8).optional(),
  guest_email: z.string().email().optional().or(z.literal('')).nullable(),
  guest_count: z.number().int().min(1).max(50).optional(),
  scheduled_for: z.string().optional(),
  duration_minutes: z.number().int().min(15).max(480).optional(),
  table_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  special_requests: z.string().optional().nullable(),
})

export type UpdateReservationInput = z.infer<typeof UpdateReservationSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restaurantId: string,
  phone: string,
  name: string,
  email?: string | null
): Promise<string | null> {
  const cleanPhone = phone.replace(/\D/g, '')
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('phone', cleanPhone)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created } = await supabase
    .from('customers')
    .insert({
      restaurant_id: restaurantId,
      name,
      phone: cleanPhone,
      email: email || null,
    })
    .select('id')
    .single()

  return created?.id ?? null
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createReservation(input: CreateReservationInput) {
  const parsed = CreateReservationSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados invalidos' }
  }

  const data = parsed.data
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const customerId = await findOrCreateCustomer(
    supabase,
    restaurantId,
    data.guest_phone,
    data.guest_name,
    data.guest_email || null
  )

  const { error } = await supabase.from('reservations').insert({
    restaurant_id: restaurantId,
    customer_id: customerId,
    table_id: data.table_id ?? null,
    guest_name: data.guest_name,
    guest_phone: data.guest_phone.replace(/\D/g, ''),
    guest_email: data.guest_email || null,
    guest_count: data.guest_count,
    scheduled_for: data.scheduled_for,
    duration_minutes: data.duration_minutes,
    status: 'pending',
    source: data.source,
    notes: data.notes ?? null,
    special_requests: data.special_requests ?? null,
  })

  if (error) return { error: error.message }

  revalidatePath('/reservas')
  return { ok: true }
}

export async function updateReservation(input: UpdateReservationInput) {
  const parsed = UpdateReservationSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados invalidos' }
  }

  const { id, ...fields } = parsed.data
  const supabase = await createClient()

  const patch: Record<string, unknown> = {}
  if (fields.guest_name !== undefined) patch.guest_name = fields.guest_name
  if (fields.guest_phone !== undefined) patch.guest_phone = fields.guest_phone.replace(/\D/g, '')
  if (fields.guest_email !== undefined) patch.guest_email = fields.guest_email || null
  if (fields.guest_count !== undefined) patch.guest_count = fields.guest_count
  if (fields.scheduled_for !== undefined) patch.scheduled_for = fields.scheduled_for
  if (fields.duration_minutes !== undefined) patch.duration_minutes = fields.duration_minutes
  if ('table_id' in fields) patch.table_id = fields.table_id ?? null
  if ('notes' in fields) patch.notes = fields.notes ?? null
  if ('special_requests' in fields) patch.special_requests = fields.special_requests ?? null

  const { error } = await supabase.from('reservations').update(patch).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/reservas')
  return { ok: true }
}

export async function confirmReservation(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending'])

  if (error) return { error: error.message }
  revalidatePath('/reservas')
  return { ok: true }
}

export async function seatReservation({ id, tableId }: { id: string; tableId?: string | null }) {
  const supabase = await createClient()

  const patch: Record<string, unknown> = {
    status: 'seated',
    seated_at: new Date().toISOString(),
  }
  if (tableId) patch.table_id = tableId

  const { error } = await supabase
    .from('reservations')
    .update(patch)
    .eq('id', id)
    .in('status', ['pending', 'confirmed'])

  if (error) return { error: error.message }

  // Mark table as occupied if tableId provided
  if (tableId) {
    await supabase
      .from('tables')
      .update({ status: 'occupied', occupied_at: new Date().toISOString() })
      .eq('id', tableId)
  }

  revalidatePath('/reservas')
  revalidatePath('/mesas')
  return { ok: true }
}

export async function completeReservation(id: string) {
  const supabase = await createClient()

  // Get reservation to free the table
  const { data: reservation } = await supabase
    .from('reservations')
    .select('table_id')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('reservations')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'seated')

  if (error) return { error: error.message }

  // Free table
  if (reservation?.table_id) {
    await supabase
      .from('tables')
      .update({ status: 'available', occupied_at: null })
      .eq('id', reservation.table_id)
  }

  revalidatePath('/reservas')
  revalidatePath('/mesas')
  return { ok: true }
}

export async function cancelReservation({ id, reason }: { id: string; reason?: string }) {
  const supabase = await createClient()

  const { data: reservation } = await supabase
    .from('reservations')
    .select('table_id, status')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('reservations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason ?? null,
    })
    .eq('id', id)
    .not('status', 'in', '("completed","cancelled","no_show")')

  if (error) return { error: error.message }

  // Free table if was seated
  if (reservation?.table_id && reservation.status === 'seated') {
    await supabase
      .from('tables')
      .update({ status: 'available', occupied_at: null })
      .eq('id', reservation.table_id)
  }

  revalidatePath('/reservas')
  revalidatePath('/mesas')
  return { ok: true }
}

export async function markNoShow(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('reservations')
    .update({ status: 'no_show' })
    .eq('id', id)
    .in('status', ['pending', 'confirmed'])

  if (error) return { error: error.message }
  revalidatePath('/reservas')
  return { ok: true }
}

export async function listReservations({
  startDate,
  endDate,
  status,
}: {
  startDate: string
  endDate: string
  status?: string
}) {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  let query = supabase
    .from('reservations')
    .select('*, customer:customers(name), table:tables(number, capacity)')
    .eq('restaurant_id', restaurantId)
    .gte('scheduled_for', startDate)
    .lte('scheduled_for', endDate)
    .order('scheduled_for', { ascending: true })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function checkTableAvailability({
  tableId,
  scheduledFor,
  durationMinutes,
  excludeReservationId,
}: {
  tableId: string
  scheduledFor: string
  durationMinutes: number
  excludeReservationId?: string
}) {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const startTime = new Date(scheduledFor)
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

  let query = supabase
    .from('reservations')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('table_id', tableId)
    .not('status', 'in', '("cancelled","completed","no_show")')
    .lt('scheduled_for', endTime.toISOString())
    .gt('scheduled_for', new Date(startTime.getTime() - durationMinutes * 60 * 1000).toISOString())

  if (excludeReservationId) {
    query = query.neq('id', excludeReservationId)
  }

  const { data } = await query
  return { available: !data || data.length === 0 }
}
