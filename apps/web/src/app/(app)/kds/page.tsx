import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Order, OrderItem, Table } from '@txoko/shared'
import { KdsView, type ProductWithStation } from './kds-view'

export const dynamic = 'force-dynamic'

export default async function KdsPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: orders }, { data: items }, { data: products }, { data: tables }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .in('status', ['open', 'preparing', 'ready'])
        .order('created_at', { ascending: true }),
      supabase
        .from('order_items')
        .select('*, order:orders!inner(restaurant_id)')
        .eq('order.restaurant_id', restaurantId),
      supabase
        .from('products')
        .select('id, name, category_id, category:categories(station)')
        .eq('restaurant_id', restaurantId),
      supabase
        .from('tables')
        .select('id, number')
        .eq('restaurant_id', restaurantId),
    ])

  // Flatten joined station
  type RawProductRow = {
    id: string
    name: string
    category_id: string | null
    category: { station: string } | { station: string }[] | null
  }
  const flattened: ProductWithStation[] = ((products ?? []) as RawProductRow[]).map(
    (p) => {
      const cat = Array.isArray(p.category) ? p.category[0] : p.category
      return {
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        station: (cat?.station as ProductWithStation['station']) ?? 'kitchen',
      }
    }
  )

  return (
    <KdsView
      initialOrders={(orders ?? []) as unknown as Order[]}
      initialItems={(items ?? []) as unknown as OrderItem[]}
      products={flattened}
      tables={(tables ?? []) as unknown as Pick<Table, 'id' | 'number'>[]}
      restaurantId={restaurantId}
    />
  )
}
