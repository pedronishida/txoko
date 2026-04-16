import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Table } from '@txoko/shared'
import { MesasQrsView } from './qrs-view'

export const dynamic = 'force-dynamic'

export default async function MesasQrsPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: tables }, { data: restaurant }] = await Promise.all([
    supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('number', { ascending: true }),
    supabase
      .from('restaurants')
      .select('slug, name')
      .eq('id', restaurantId)
      .maybeSingle(),
  ])

  return (
    <MesasQrsView
      tables={(tables ?? []) as unknown as Table[]}
      restaurantSlug={(restaurant?.slug as string) ?? ''}
      restaurantName={(restaurant?.name as string) ?? ''}
    />
  )
}
