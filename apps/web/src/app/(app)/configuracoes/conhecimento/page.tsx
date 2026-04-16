import { listKnowledgeEntries } from './actions'
import { KnowledgeView } from './knowledge-view'

export const dynamic = 'force-dynamic'

export default async function ConhecimentoPage() {
  const res = await listKnowledgeEntries()
  const entries = res.ok ? res.entries : []

  return <KnowledgeView initialEntries={entries} />
}
