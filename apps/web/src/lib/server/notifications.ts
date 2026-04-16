'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export type NotificationRow = {
  id: string
  type: 'stock_low' | 'negative_review' | 'sale_finalized' | 'new_order' | 'system'
  title: string
  body: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

export async function listNotifications(limit = 15): Promise<NotificationRow[]> {
  const supabase = await createClient()
  try {
    const restaurantId = await getActiveRestaurantId()
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, href, read_at, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []) as unknown as NotificationRow[]
  } catch {
    return []
  }
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) return { error: error.message }
  revalidatePath('/home')
  return { ok: true }
}

export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .is('read_at', null)
  if (error) return { error: error.message }
  revalidatePath('/home')
  return { ok: true }
}
