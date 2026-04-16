import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { TableQrPrint } from './table-qr-print'

export const dynamic = 'force-dynamic'

export default async function TableQrPage({
  params,
}: {
  params: Promise<{ tableId: string }>
}) {
  const { tableId } = await params
  const supabase = createPublicClient()

  const { data: table } = await supabase
    .from('tables')
    .select('id, number, restaurant_id')
    .eq('id', tableId)
    .maybeSingle()

  if (!table) notFound()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, slug')
    .eq('id', table.restaurant_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!restaurant) notFound()

  const menuUrl = `https://app.txoko.com.br/menu/${restaurant.slug as string}?mesa=${table.number}`

  return (
    <TableQrPrint
      tableNumber={table.number as number}
      restaurantName={restaurant.name as string}
      menuUrl={menuUrl}
    />
  )
}
