import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Order, OrderItem, Table } from '@txoko/shared'
import { PrintCommandClient } from './print-command-client'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ComandaPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: order }, { data: items }, { data: products }] = await Promise.all([
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
      .from('products')
      .select('id, name')
      .eq('restaurant_id', restaurantId),
  ])

  if (!order) notFound()

  const [{ data: table }, { data: waiter }] = await Promise.all([
    order.table_id
      ? supabase.from('tables').select('id, number').eq('id', order.table_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.waiter_id
      ? supabase.from('profiles').select('id, name').eq('id', order.waiter_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <PrintCommandClient
      order={order as unknown as Order}
      items={(items ?? []) as unknown as OrderItem[]}
      table={table as unknown as Pick<Table, 'id' | 'number'> | null}
      waiterName={(waiter as { id: string; name: string } | null)?.name ?? null}
      products={(products ?? []) as { id: string; name: string }[]}
    />
  )
}
