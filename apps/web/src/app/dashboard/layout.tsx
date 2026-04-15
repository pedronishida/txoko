import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/dashboard-shell'
import {
  getActiveRestaurantId,
  listMemberships,
} from '@/lib/server/restaurant'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const memberships = await listMemberships()
  const activeId =
    memberships.length > 0 ? await getActiveRestaurantId() : null

  return (
    <DashboardShell
      user={{ id: user.id, email: user.email ?? '' }}
      memberships={memberships}
      activeRestaurantId={activeId}
    >
      {children}
    </DashboardShell>
  )
}
