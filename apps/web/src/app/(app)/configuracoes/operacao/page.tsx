import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { OperacaoView, type OperacaoFormData } from './operacao-view'

export const dynamic = 'force-dynamic'

export default async function OperacaoPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, settings')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) {
    return (
      <div className="text-sm text-muted">
        Voce ainda nao esta vinculado a nenhum restaurante.
      </div>
    )
  }

  const settings = (restaurant.settings ?? {}) as Record<string, unknown>

  const initial: OperacaoFormData = {
    id: restaurant.id as string,
    service_rate: Number(settings.service_rate ?? 10),
    open_time: (settings.open_time as string) ?? '11:30',
    close_time: (settings.close_time as string) ?? '23:00',
    loyalty_points_per: Number(settings.loyalty_points_per ?? 10),
    timezone: (settings.timezone as string) ?? 'America/Sao_Paulo',
    currency: (settings.currency as string) ?? 'BRL',
  }

  return <OperacaoView initial={initial} />
}
