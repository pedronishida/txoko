'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { ServiceMode } from '@txoko/shared'

export type CardBatchResult =
  | { ok: true; created: number; first_number: number; last_number: number }
  | { error: string }

export async function createCardBatch(
  quantity: number,
  service_mode: ServiceMode
): Promise<CardBatchResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    return { error: 'Quantidade deve ser entre 1 e 500' }
  }
  if (service_mode !== 'avontade' && service_mode !== 'por_kg') {
    return { error: 'Modo invalido' }
  }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  // Proximo card_number = maior existente + 1
  const { data: maxRow } = await supabase
    .from('comanda_cards')
    .select('card_number')
    .eq('restaurant_id', restaurant_id)
    .order('card_number', { ascending: false })
    .limit(1)

  const startNumber = (maxRow?.[0]?.card_number ?? 0) + 1

  const rows = Array.from({ length: quantity }, (_, i) => ({
    restaurant_id,
    card_number: startNumber + i,
    qr_token: randomBytes(16).toString('hex'),
    service_mode,
    card_kind: 'customer' as const,
    is_active: true,
  }))

  const { error } = await supabase.from('comanda_cards').insert(rows)
  if (error) return { error: error.message }

  revalidatePath('/estacao/cartoes')
  return {
    ok: true,
    created: quantity,
    first_number: startNumber,
    last_number: startNumber + quantity - 1,
  }
}

const MAX_CANCEL_CARDS = 2

export async function createCancelCards(quantity: number): Promise<CardBatchResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CANCEL_CARDS) {
    return { error: `Quantidade deve ser entre 1 e ${MAX_CANCEL_CARDS}` }
  }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  // Conta quantos cartoes de cancelamento ativos ja existem
  const { count } = await supabase
    .from('comanda_cards')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant_id)
    .eq('card_kind', 'cancel')
    .eq('is_active', true)

  const currentActive = count ?? 0
  if (currentActive + quantity > MAX_CANCEL_CARDS) {
    const remaining = MAX_CANCEL_CARDS - currentActive
    return {
      error:
        remaining <= 0
          ? `Ja existem ${currentActive} cartoes de cancelamento ativos (maximo ${MAX_CANCEL_CARDS}). Desative um antes.`
          : `Restam ${remaining} cartao${remaining === 1 ? '' : 's'} de cancelamento possivel. Reduza a quantidade.`,
    }
  }

  const { data: maxRow } = await supabase
    .from('comanda_cards')
    .select('card_number')
    .eq('restaurant_id', restaurant_id)
    .order('card_number', { ascending: false })
    .limit(1)

  const startNumber = (maxRow?.[0]?.card_number ?? 0) + 1

  const rows = Array.from({ length: quantity }, (_, i) => ({
    restaurant_id,
    card_number: startNumber + i,
    qr_token: randomBytes(16).toString('hex'),
    service_mode: null,
    card_kind: 'cancel' as const,
    is_active: true,
  }))

  const { error } = await supabase.from('comanda_cards').insert(rows)
  if (error) return { error: error.message }

  revalidatePath('/estacao/cartoes')
  return {
    ok: true,
    created: quantity,
    first_number: startNumber,
    last_number: startNumber + quantity - 1,
  }
}

export async function deactivateCard(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('comanda_cards')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/estacao/cartoes')
  return { ok: true }
}

export async function reactivateCard(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('comanda_cards')
    .update({ is_active: true, deactivated_at: null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/estacao/cartoes')
  return { ok: true }
}
