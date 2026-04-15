import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Customer, Order, OrderItem, Product, Table } from '@txoko/shared'
import { PedidosView } from './pedidos-view'

export const dynamic = 'force-dynamic'

export default async function PedidosPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: orders }, { data: items }, { data: products }, { data: tables }, { data: customers }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(200),
      // order_items nao tem restaurant_id; filtra via join implicito (RLS cobre)
      supabase
        .from('order_items')
        .select('*, order:orders!inner(restaurant_id)')
        .eq('order.restaurant_id', restaurantId),
      supabase.from('products').select('id, name').eq('restaurant_id', restaurantId),
      supabase.from('tables').select('id, number').eq('restaurant_id', restaurantId),
      supabase.from('customers').select('id, name, phone').eq('restaurant_id', restaurantId),
    ])

  return (
    <PedidosView
      orders={(orders ?? []) as unknown as Order[]}
      items={(items ?? []) as unknown as OrderItem[]}
      products={(products ?? []) as unknown as Pick<Product, 'id' | 'name'>[]}
      tables={(tables ?? []) as unknown as Pick<Table, 'id' | 'number'>[]}
      customers={(customers ?? []) as unknown as Pick<Customer, 'id' | 'name' | 'phone'>[]}
      restaurantId={restaurantId}
    />
  )
}
