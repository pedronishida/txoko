import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { Campaign, CampaignAudience, CampaignTemplate } from '@txoko/shared'
import { MarketingView } from './marketing-view'

export const dynamic = 'force-dynamic'

export default async function MarketingPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: campaigns }, { data: templates }, { data: audiences }] =
    await Promise.all([
      supabase
        .from('campaigns')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('campaign_templates')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name'),
      supabase
        .from('campaign_audiences')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('name'),
    ])

  return (
    <MarketingView
      campaigns={(campaigns ?? []) as unknown as Campaign[]}
      templates={(templates ?? []) as unknown as CampaignTemplate[]}
      audiences={(audiences ?? []) as unknown as CampaignAudience[]}
    />
  )
}
