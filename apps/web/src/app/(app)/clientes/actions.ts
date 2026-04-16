'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

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

  const { error } = input.id
    ? await supabase.from('customers').update(payload).eq('id', input.id)
    : await supabase.from('customers').insert(payload)

  if (error) return { error: error.message }
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
