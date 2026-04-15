import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Ingredient, Supplier } from '@txoko/shared'
import { EstoqueView } from './estoque-view'

export const dynamic = 'force-dynamic'

export default async function EstoquePage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: ingredients }, { data: suppliers }] = await Promise.all([
    supabase
      .from('ingredients')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true }),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true }),
  ])

  return (
    <EstoqueView
      ingredients={(ingredients ?? []) as unknown as Ingredient[]}
      suppliers={(suppliers ?? []) as unknown as Pick<Supplier, 'id' | 'name'>[]}
    />
  )
}
