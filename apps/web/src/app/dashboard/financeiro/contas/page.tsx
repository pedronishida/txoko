import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ContasView, type TransactionRow } from './contas-view'

export const dynamic = 'force-dynamic'

export default async function ContasPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: transactionsRaw } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(500)

  // Marca como overdue no cliente: pending + due_date < hoje
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const transactions = (transactionsRaw ?? []).map((t) => {
    const row = t as unknown as TransactionRow
    if (row.status === 'pending' && row.due_date) {
      const due = new Date(row.due_date + 'T00:00:00')
      if (due < today) {
        return { ...row, status: 'overdue' as const }
      }
    }
    return row
  })

  return <ContasView transactions={transactions} />
}
