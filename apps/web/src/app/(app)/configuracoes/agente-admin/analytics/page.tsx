import {
  getAdminAgentAnalytics,
  getAgentHealth,
  getCustomerAgentAnalytics,
  getAgentSuggestions,
} from '../actions'
import { AnalyticsView } from './analytics-view'

export const dynamic = 'force-dynamic'

export default async function AgenteAdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const days = Math.min(Math.max(parseInt((await searchParams).days ?? '30', 10) || 30, 7), 90)
  const [analytics, health, customer, suggestions] = await Promise.all([
    getAdminAgentAnalytics(days),
    getAgentHealth(),
    getCustomerAgentAnalytics(days),
    getAgentSuggestions(),
  ])
  return (
    <AnalyticsView
      analytics={analytics}
      health={health}
      customer={customer}
      suggestions={suggestions}
      days={days}
    />
  )
}
