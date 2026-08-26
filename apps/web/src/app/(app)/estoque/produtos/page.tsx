import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ProdutosEstoqueView, type StockProduct } from './produtos-view'

export const dynamic = 'force-dynamic'

export default async function EstoqueProdutosPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  // Produtos vendidos por peso ficam de fora: ali o que se controla e
  // producao, nao contagem por unidade.
  const { data } = await supabase
    .from('products')
    .select('id, name, barcode, price, stock_tracked, stock_quantity, stock_min, category_id')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .eq('sold_by_weight', false)
    .order('name', { ascending: true })

  return <ProdutosEstoqueView products={(data ?? []) as StockProduct[]} />
}
