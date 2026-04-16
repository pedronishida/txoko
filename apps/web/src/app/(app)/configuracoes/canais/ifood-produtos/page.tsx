import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { IfoodProdutosView } from './ifood-produtos-view'

export const dynamic = 'force-dynamic'

export default async function IfoodProdutosPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [mappingsRes, productsRes] = await Promise.all([
    supabase
      .from('ifood_product_mappings')
      .select('id, ifood_sku, ifood_name, product_id, auto_create')
      .eq('restaurant_id', restaurantId)
      .order('ifood_name', { ascending: true }),
    supabase
      .from('products')
      .select('id, name')
      .eq('restaurant_id', restaurantId)
      .eq('available', true)
      .order('name', { ascending: true }),
  ])

  type MappingRow = {
    id: string
    ifood_sku: string
    ifood_name: string | null
    product_id: string | null
    auto_create: boolean
  }

  type ProductRow = {
    id: string
    name: string
  }

  return (
    <IfoodProdutosView
      mappings={(mappingsRes.data ?? []) as MappingRow[]}
      products={(productsRes.data ?? []) as ProductRow[]}
    />
  )
}
