import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Order, OrderItem, Product, Table } from '@txoko/shared'
import { MesasView } from './mesas-view'

export const dynamic = 'force-dynamic'

export default async function MesasPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: tables }, { data: activeOrders }, { data: products }, { data: restaurant }] =
    await Promise.all([
      supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('number', { ascending: true }),
      supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('restaurant_id', restaurantId)
        .in('status', ['open', 'preparing', 'ready']),
      supabase
        .from('products')
        .select('id, name')
        .eq('restaurant_id', restaurantId),
      supabase
        .from('restaurants')
        .select('slug')
        .eq('id', restaurantId)
        .maybeSingle(),
    ])

  type OrderWithItems = Order & { items: OrderItem[] }
  const orders = (activeOrders ?? []) as unknown as OrderWithItems[]

  const ordersByTable: Record<string, OrderWithItems> = {}
  for (const o of orders) {
    if (o.table_id) ordersByTable[o.table_id] = o
  }

  return (
    <MesasView
      tables={(tables ?? []) as unknown as Table[]}
      ordersByTable={ordersByTable}
      products={(products ?? []) as unknown as Pick<Product, 'id' | 'name'>[]}
      restaurantSlug={(restaurant?.slug as string) ?? ''}
      restaurantId={restaurantId}
    />
  )
}
