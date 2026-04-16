import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Customer } from '@txoko/shared'
import { FidelidadeView, type Redemption } from './fidelidade-view'

export const dynamic = 'force-dynamic'

export default async function FidelidadePage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: customers }, { data: redemptions }, { data: restaurant }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, loyalty_points, total_spent, total_orders')
      .eq('restaurant_id', restaurantId)
      .order('loyalty_points', { ascending: false }),
    supabase
      .from('loyalty_redemptions')
      .select('id, customer_id, points, reward, created_at')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('restaurants').select('settings').eq('id', restaurantId).maybeSingle(),
  ])

  const settings = (restaurant?.settings ?? {}) as Record<string, unknown>
  const loyaltyPer = Number(settings.loyalty_points_per ?? 10)

  type CustomerLite = Pick<Customer, 'id' | 'name' | 'loyalty_points'> & {
    total_spent?: number
    total_orders?: number
  }

  return (
    <FidelidadeView
      customers={(customers ?? []) as unknown as CustomerLite[]}
      redemptions={(redemptions ?? []) as unknown as Redemption[]}
      pointsPer={loyaltyPer}
    />
  )
}
