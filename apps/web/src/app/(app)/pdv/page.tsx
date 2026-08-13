import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Category, Product } from '@txoko/shared'
import { VendaView } from './venda-view'

export const dynamic = 'force-dynamic'

// PDV e caixa na mesma tela: bipa o QR da comanda, edita os itens e fecha
// ali mesmo. O PDV antigo (venda sem comanda: delivery, retirada, mesa)
// segue em /pdv/classico ate ser aposentado de vez.
export default async function PdvPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      // Self-service e lancado na balanca, nao aqui
      .is('service_mode', null)
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  return (
    <VendaView
      products={(products ?? []) as unknown as Product[]}
      categories={(categories ?? []) as unknown as Category[]}
    />
  )
}
