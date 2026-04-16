import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Customer, Review } from '@txoko/shared'
import { AvaliacoesView } from './avaliacoes-view'

export const dynamic = 'force-dynamic'

export default async function AvaliacoesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: reviews }, { data: customers }] = await Promise.all([
    supabase
      .from('reviews')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('customers')
      .select('id, name')
      .eq('restaurant_id', restaurantId)
      .order('name'),
  ])

  return (
    <AvaliacoesView
      reviews={(reviews ?? []) as unknown as Review[]}
      customers={(customers ?? []) as unknown as Pick<Customer, 'id' | 'name'>[]}
      restaurantId={restaurantId}
    />
  )
}
