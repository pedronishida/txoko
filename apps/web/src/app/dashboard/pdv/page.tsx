import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Category, Customer, Product, Table } from '@txoko/shared'
import { PdvView } from './pdv-view'

export const dynamic = 'force-dynamic'

export default async function PdvPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: products }, { data: categories }, { data: tables }, { data: customers }] =
    await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('number'),
      supabase
        .from('customers')
        .select('id, name, phone, email')
        .eq('restaurant_id', restaurantId)
        .order('name', { ascending: true }),
    ])

  return (
    <PdvView
      products={(products ?? []) as unknown as Product[]}
      categories={(categories ?? []) as unknown as Category[]}
      tables={(tables ?? []) as unknown as Table[]}
      customers={(customers ?? []) as unknown as Pick<Customer, 'id' | 'name' | 'phone' | 'email'>[]}
    />
  )
}
