'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function redeemPoints(customerId: string, points: number, reward: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('redeem_loyalty_points', {
    p_customer_id: customerId,
    p_points: points,
    p_reward: reward,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/clientes/fidelidade')
  revalidatePath('/dashboard/clientes')
  return { ok: true }
}
