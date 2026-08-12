import { getMarketingSettings } from './actions'
import { MarketingProvidersView } from './marketing-providers-view'

export const dynamic = 'force-dynamic'

export default async function MarketingConfigPage() {
  const settings = await getMarketingSettings()
  return <MarketingProvidersView initialSettings={settings} />
}
