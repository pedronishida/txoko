import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Ingredient, Product } from '@txoko/shared'
import { FichasView, type RecipeRow } from './fichas-view'

export const dynamic = 'force-dynamic'

export default async function FichasPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: products }, { data: ingredients }, { data: recipes }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, price, category_id')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('ingredients')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name'),
    // product_recipes nao tem restaurant_id; filtra via RLS (cobre por product.restaurant_id)
    supabase.from('product_recipes').select('product_id, ingredient_id, quantity'),
  ])

  return (
    <FichasView
      products={(products ?? []) as unknown as Pick<Product, 'id' | 'name' | 'price' | 'category_id'>[]}
      ingredients={(ingredients ?? []) as unknown as Ingredient[]}
      recipes={(recipes ?? []) as unknown as RecipeRow[]}
    />
  )
}
