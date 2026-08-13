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

  // Precos do self-service moram em produtos com service_mode preenchido —
  // a estacao resolve por ali na hora de lancar.
  const { data: ssRows } = await supabase
    .from('products')
    .select('service_mode, price, price_per_kg, sold_by_weight')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .not('service_mode', 'is', null)

  // Volta como texto em pt-BR ("59,90") — o formulario guarda o que foi
  // digitado e so converte no save.
  const priceFor = (mode: string): string => {
    const row = (ssRows ?? []).find((r) => r.service_mode === mode)
    if (!row) return ''
    const value = row.sold_by_weight ? row.price_per_kg : row.price
    if (value == null) return ''
    // Sem separador de milhar de proposito: "1234,50" e nao "1.234,50", pra
    // nao dar ambiguidade na hora de converter de volta.
    return Number(value).toFixed(2).replace('.', ',')
  }

  const initial: OperacaoFormData = {
    id: restaurant.id as string,
    service_rate: Number(settings.service_rate ?? 10),
    open_time: (settings.open_time as string) ?? '11:30',
    close_time: (settings.close_time as string) ?? '23:00',
    loyalty_points_per: Number(settings.loyalty_points_per ?? 10),
    timezone: (settings.timezone as string) ?? 'America/Sao_Paulo',
    currency: (settings.currency as string) ?? 'BRL',
    self_service: {
      avontade: priceFor('avontade'),
      por_kg: priceFor('por_kg'),
      por_kg_2mix: priceFor('por_kg_2mix'),
    },
  }

  return <OperacaoView initial={initial} />
}
