'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const COOKIE_NAME = 'txoko_restaurant'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 ano

export type Membership = {
  restaurant_id: string
  role: string
  name: string
  slug: string
}

/**
 * Retorna todos os restaurantes dos quais o usuario atual e membro,
 * enriquecidos com nome e slug.
 */
export async function listMemberships(): Promise<Membership[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('restaurant_members')
    .select('restaurant_id, role, restaurant:restaurants(name, slug)')
  if (error) return []
  type Row = {
    restaurant_id: string
    role: string
    restaurant: { name: string; slug: string } | { name: string; slug: string }[] | null
  }
  return ((data ?? []) as Row[]).map((row) => {
    const r = Array.isArray(row.restaurant) ? row.restaurant[0] : row.restaurant
    return {
      restaurant_id: row.restaurant_id,
      role: row.role,
      name: r?.name ?? 'Sem nome',
      slug: r?.slug ?? '',
    }
  })
}

/**
 * Retorna o restaurant_id ativo do usuario atual:
 * 1. Le cookie `txoko_restaurant`
 * 2. Valida que o usuario ainda e membro
 * 3. Se invalido/ausente, retorna o primeiro membership
 * 4. Se nao ha membership, lanca
 */
export async function getActiveRestaurantId(): Promise<string> {
  const memberships = await listMemberships()
  if (memberships.length === 0) {
    throw new Error('Usuario nao vinculado a nenhum restaurante')
  }

  const store = await cookies()
  const cookieValue = store.get(COOKIE_NAME)?.value

  if (cookieValue && memberships.some((m) => m.restaurant_id === cookieValue)) {
    return cookieValue
  }

  return memberships[0].restaurant_id
}

/**
 * Troca o restaurante ativo via cookie. Revalida todo o dashboard.
 */
export async function switchRestaurant(restaurantId: string) {
  const memberships = await listMemberships()
  if (!memberships.some((m) => m.restaurant_id === restaurantId)) {
    return { error: 'Voce nao e membro desse restaurante' }
  }

  const store = await cookies()
  store.set(COOKIE_NAME, restaurantId, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
