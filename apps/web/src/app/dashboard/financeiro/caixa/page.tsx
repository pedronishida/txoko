import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { CaixaView, type PaymentRow } from './caixa-view'

export const dynamic = 'force-dynamic'

function startOfDay() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default async function CaixaPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const todayStart = startOfDay().toISOString()

  const { data: payments } = await supabase
    .from('payments')
    .select('id, method, amount, status, created_at, order_id')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false })

  return (
    <CaixaView
      initialPayments={(payments ?? []) as unknown as PaymentRow[]}
      todayStart={todayStart}
      restaurantId={restaurantId}
    />
  )
}
