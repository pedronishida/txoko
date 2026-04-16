import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Order, OrderItem, Payment, Customer, Table } from '@txoko/shared'
import { PrintReceiptClient } from './print-receipt-client'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ImprimirPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [
    { data: order },
    { data: items },
    { data: payments },
    { data: restaurant },
    { data: products },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
    supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id),
    supabase
      .from('payments')
      .select('*')
      .eq('order_id', id),
    supabase
      .from('restaurants')
      .select('name, document, phone, address')
      .eq('id', restaurantId)
      .maybeSingle(),
    supabase
      .from('products')
      .select('id, name')
      .eq('restaurant_id', restaurantId),
  ])

  if (!order) notFound()

  // Fetch customer and table optionally
  const [{ data: customer }, { data: table }] = await Promise.all([
    order.customer_id
      ? supabase.from('customers').select('id, name, phone').eq('id', order.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.table_id
      ? supabase.from('tables').select('id, number').eq('id', order.table_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <PrintReceiptClient
      order={order as unknown as Order}
      items={(items ?? []) as unknown as OrderItem[]}
      payments={(payments ?? []) as unknown as Payment[]}
      restaurant={restaurant as { name: string; document: string | null; phone: string | null; address: Record<string, string> | null } | null}
      customer={customer as unknown as Pick<Customer, 'id' | 'name' | 'phone'> | null}
      table={table as unknown as Pick<Table, 'id' | 'number'> | null}
      products={(products ?? []) as { id: string; name: string }[]}
    />
  )
}
