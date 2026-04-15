'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function toggleAutomation(id: string, enabled: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('automations')
    .update({ enabled })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/automacoes')
  return { ok: true }
}
