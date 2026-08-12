import { listAdminAgentUsers } from '../actions'
import { TestView } from './test-view'

export const dynamic = 'force-dynamic'

export default async function AgenteAdminTestPage() {
  const users = await listAdminAgentUsers()
  return <TestView users={users} />
}
