import { listKnowledgeEntries } from '../actions'
import { CustomerAgentTestView } from './test-view'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export const dynamic = 'force-dynamic'

export default async function ConhecimentoTestPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [entriesRes, restaurantRes] = await Promise.all([
    listKnowledgeEntries(),
    supabase
      .from('restaurants')
      .select('ai_agent_enabled, ai_agent_config')
      .eq('id', restaurantId)
      .maybeSingle(),
  ])

  const entriesEnabledCount = (entriesRes.ok ? entriesRes.entries : []).filter(
    (entry) => entry.enabled
  ).length
  const agentConfig = (restaurantRes.data?.ai_agent_config ?? {}) as Record<string, unknown>
  const currentMode = agentConfig.mode === 'order_taking' ? 'order_taking' : 'chat'

  return (
    <CustomerAgentTestView
      entriesEnabledCount={entriesEnabledCount}
      agentEnabled={!!restaurantRes.data?.ai_agent_enabled}
      currentMode={currentMode}
    />
  )
}
