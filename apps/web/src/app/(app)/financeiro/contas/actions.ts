'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

function revalidateFinance() {
  revalidatePath('/financeiro/contas')
  revalidatePath('/financeiro')
}

export type TransactionInput = {
  id?: string
  type: 'income' | 'expense'
  category: string
  description: string | null
  amount: number
  due_date: string | null
}

export async function saveTransaction(input: TransactionInput) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const payload = {
    restaurant_id,
    type: input.type,
    category: input.category,
    description: input.description,
    amount: input.amount,
    due_date: input.due_date,
  }

  const { error } = input.id
    ? await supabase.from('financial_transactions').update(payload).eq('id', input.id)
    : await supabase.from('financial_transactions').insert(payload)

  if (error) return { error: error.message }
  revalidateFinance()
  return { ok: true }
}

export async function markPaid(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('financial_transactions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateFinance()
  return { ok: true }
}

export async function cancelTransaction(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('financial_transactions')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidateFinance()
  return { ok: true }
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('financial_transactions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidateFinance()
  return { ok: true }
}
