'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { runAutomationsForEvent } from '@/lib/server/automations/runner'

export type CustomerInput = {
  id?: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  birthday: string | null
  notes: string | null
}

export async function saveCustomer(input: CustomerInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const payload = {
    restaurant_id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    document: input.document,
    birthday: input.birthday,
    notes: input.notes,
  }

  const isNew = !input.id

  const query = isNew
    ? supabase.from('customers').insert(payload).select('id').single()
    : supabase.from('customers').update(payload).eq('id', input.id!).select('id').single()

  const { data: customer, error } = await query

  if (error) return { error: error.message }

  // Fire customer_created automation for new customers (best-effort)
  if (isNew && customer?.id) {
    void runAutomationsForEvent(supabase, {
      type: 'customer_created',
      restaurantId: restaurant_id,
      payload: { customerId: customer.id, name: input.name },
    })
  }

  revalidatePath('/clientes')
  revalidatePath('/pdv')
  return { ok: true }
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/clientes')
  return { ok: true }
}
