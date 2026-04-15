import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Channel } from '@txoko/shared'
import { CanaisView } from './canais-view'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function CanaisPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: channels } = await supabase
    .from('channels')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const baseUrl = `${proto}://${host}`

  return (
    <CanaisView
      channels={(channels ?? []) as unknown as Channel[]}
      baseUrl={baseUrl}
    />
  )
}
