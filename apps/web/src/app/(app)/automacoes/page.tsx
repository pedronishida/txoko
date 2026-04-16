import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { AutomacoesView, type AutomationRow, type AutomationLogRow } from './automacoes-view'

export const dynamic = 'force-dynamic'

export default async function AutomacoesPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: automations }, { data: logs }] = await Promise.all([
    supabase
      .from('automations')
      .select(
        'id, code, name, description, trigger, action, area, enabled, executions_today, run_count, last_run_at, trigger_type, trigger_config, action_type, action_config'
      )
      .eq('restaurant_id', restaurantId)
      .order('area')
      .order('code'),
    supabase
      .from('automation_logs')
      .select('id, automation_id, trigger_desc, action_desc, status, error_message, executed_at')
      .eq('restaurant_id', restaurantId)
      .order('executed_at', { ascending: false })
      .limit(50),
  ])

  return (
    <AutomacoesView
      automations={(automations ?? []) as unknown as AutomationRow[]}
      logs={(logs ?? []) as unknown as AutomationLogRow[]}
      restaurantId={restaurantId}
    />
  )
}
