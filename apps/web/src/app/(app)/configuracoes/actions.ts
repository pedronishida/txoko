'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type RestaurantSettings = {
  service_rate?: number
  open_time?: string
  close_time?: string
  timezone?: string
  currency?: string
  locale?: string
  loyalty_points_per?: number
}

export type RestaurantUpdate = {
  id: string
  name: string
  legal_name: string | null
  cnpj: string | null
  phone: string | null
  email: string | null
  address_full: string | null
  settings: RestaurantSettings
}

export async function updateRestaurant(input: RestaurantUpdate) {
  const supabase = await createClient()

  const payload = {
    name: input.name,
    legal_name: input.legal_name,
    cnpj: input.cnpj,
    phone: input.phone,
    email: input.email,
    address: input.address_full ? { full: input.address_full } : null,
    settings: input.settings,
  }

  const { error } = await supabase
    .from('restaurants')
    .update(payload)
    .eq('id', input.id)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes')
  revalidatePath('/financeiro')
  revalidatePath('/pdv')
  return { ok: true }
}
