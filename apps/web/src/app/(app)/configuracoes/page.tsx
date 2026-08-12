import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { GeralView, type RestaurantFormData } from './geral-view'

export const dynamic = 'force-dynamic'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, legal_name, cnpj, phone, email, address')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return (
      <div className="text-sm text-muted">
        Voce ainda nao esta vinculado a nenhum restaurante.
      </div>
    )
  }

  const addrFull =
    restaurant.address && typeof restaurant.address === 'object' && 'full' in restaurant.address
      ? ((restaurant.address as { full: string }).full ?? '')
      : ''

  const initial: RestaurantFormData = {
    id: restaurant.id as string,
    name: (restaurant.name as string) ?? '',
    legal_name: (restaurant.legal_name as string) ?? '',
    cnpj: (restaurant.cnpj as string) ?? '',
    phone: (restaurant.phone as string) ?? '',
    email: (restaurant.email as string) ?? '',
    address_full: addrFull,
  }

  return <GeralView initial={initial} />
}
