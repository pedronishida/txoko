'use server'

import { revalidatePath } from 'next/cache'
import type { TableStatus } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'

export async function updateTableStatus(id: string, status: TableStatus) {
  const supabase = await createClient()
  const occupied_at = status === 'occupied' ? new Date().toISOString() : null
  const { error } = await supabase
    .from('tables')
    .update({ status, occupied_at })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/mesas')
  return { ok: true }
}
