import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { ComandaCard } from '@txoko/shared'
import { CardsView } from '@/components/estacao/cards-view'

export const dynamic = 'force-dynamic'

export default async function EstacaoCartoesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: cardsRaw } = await supabase
    .from('comanda_cards')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('card_number', { ascending: true })

  const cards = (cardsRaw ?? []) as unknown as ComandaCard[]

  // Tambem conta produtos self-service cadastrados
  const { data: productsRaw } = await supabase
    .from('products')
    .select('id, name, sold_by_weight, price, price_per_kg, is_active')
    .eq('restaurant_id', restaurantId)
    .or('sold_by_weight.eq.true,name.ilike.%self-service%')

  type P = {
    id: string
    name: string
    sold_by_weight: boolean
    price: number
    price_per_kg: number | null
    is_active: boolean
  }
  const selfServiceProducts = (productsRaw ?? []) as unknown as P[]

  return <CardsView cards={cards} selfServiceProducts={selfServiceProducts} />
}
