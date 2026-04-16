import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { CampaignAudience } from '@txoko/shared'
import { AudiencesView } from './audiences-view'

export const dynamic = 'force-dynamic'

export default async function AudiencesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: audiences } = await supabase
    .from('campaign_audiences')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })

  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)

  return (
    <AudiencesView
      audiences={(audiences ?? []) as unknown as CampaignAudience[]}
      totalCustomers={totalCustomers ?? 0}
    />
  )
}
