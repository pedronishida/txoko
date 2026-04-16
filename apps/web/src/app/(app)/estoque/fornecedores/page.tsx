import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Ingredient, Supplier } from '@txoko/shared'
import { FornecedoresView } from './fornecedores-view'

export const dynamic = 'force-dynamic'

export default async function FornecedoresPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: suppliers }, { data: ingredients }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true }),
    supabase
      .from('ingredients')
      .select('id, name, unit, current_stock, supplier_id')
      .eq('restaurant_id', restaurantId),
  ])

  return (
    <FornecedoresView
      suppliers={(suppliers ?? []) as unknown as Supplier[]}
      ingredients={(ingredients ?? []) as unknown as Pick<Ingredient, 'id' | 'name' | 'unit' | 'current_stock' | 'supplier_id'>[]}
    />
  )
}
