import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { CampaignTemplate } from '@txoko/shared'
import { TemplatesView } from './templates-view'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: templates } = await supabase
    .from('campaign_templates')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })

  return (
    <TemplatesView
      templates={(templates ?? []) as unknown as CampaignTemplate[]}
    />
  )
}
