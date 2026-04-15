import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ConfiguracoesView, type RestaurantFormData } from './configuracoes-view'

export const dynamic = 'force-dynamic'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, legal_name, cnpj, phone, email, address, settings')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return (
      <div className="text-sm text-stone">
        Voce ainda nao esta vinculado a nenhum restaurante.
      </div>
    )
  }

  const addrFull =
    restaurant.address && typeof restaurant.address === 'object' && 'full' in restaurant.address
      ? ((restaurant.address as { full: string }).full ?? '')
      : ''

  const settings = (restaurant.settings ?? {}) as Record<string, unknown>

  const initial: RestaurantFormData = {
    id: restaurant.id as string,
    name: (restaurant.name as string) ?? '',
    legal_name: (restaurant.legal_name as string) ?? '',
    cnpj: (restaurant.cnpj as string) ?? '',
    phone: (restaurant.phone as string) ?? '',
    email: (restaurant.email as string) ?? '',
    address_full: addrFull,
    service_rate: Number(settings.service_rate ?? 10),
    open_time: (settings.open_time as string) ?? '11:30',
    close_time: (settings.close_time as string) ?? '23:00',
    loyalty_points_per: Number(settings.loyalty_points_per ?? 10),
    timezone: (settings.timezone as string) ?? 'America/Sao_Paulo',
    currency: (settings.currency as string) ?? 'BRL',
  }

  return <ConfiguracoesView initial={initial} />
}
