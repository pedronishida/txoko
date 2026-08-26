import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ContagemView } from './contagem-view'

export const dynamic = 'force-dynamic'

export default async function ContagemPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const base = supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .eq('sold_by_weight', false)

  const [comCodigo, semControle, semCodigo] = await Promise.all([
    base.not('barcode', 'is', null),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .eq('sold_by_weight', false)
      .eq('stock_tracked', false)
      .not('barcode', 'is', null),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .eq('sold_by_weight', false)
      .is('barcode', null),
  ])

  return (
    <ContagemView
      comCodigo={comCodigo.count ?? 0}
      semControle={semControle.count ?? 0}
      semCodigo={semCodigo.count ?? 0}
    />
  )
}
