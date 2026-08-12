import {
  getAdminAgentConfig,
  listAdminAgentUsers,
  listAdminAgentActions,
} from './actions'
import { AgenteAdminView } from './agente-admin-view'

export const dynamic = 'force-dynamic'

export default async function AgenteAdminPage() {
  const [config, users, actions] = await Promise.all([
    getAdminAgentConfig(),
    listAdminAgentUsers(),
    listAdminAgentActions(100),
  ])
  return (
    <AgenteAdminView initialConfig={config} initialUsers={users} initialActions={actions} />
  )
}
