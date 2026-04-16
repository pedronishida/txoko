import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { CardapioView } from './cardapio-view'
import type { Category, Product } from '@txoko/shared'

export const dynamic = 'force-dynamic'

export default async function CardapioPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
  ])

  return (
    <CardapioView
      products={(products ?? []) as unknown as Product[]}
      categories={(categories ?? []) as unknown as Category[]}
    />
  )
}
