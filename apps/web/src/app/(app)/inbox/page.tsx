import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type {
  Channel,
  ConversationWithRelations,
  MessageTemplate,
} from '@txoko/shared'
import { InboxView } from './inbox-view'

export const dynamic = 'force-dynamic'

type TeamMember = {
  id: string
  email: string
  name?: string | null
  avatar_url?: string | null
}

export default async function InboxPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [
    { data: conversations },
    { data: channels },
    { data: templates },
    { data: membersRaw },
  ] = await Promise.all([
    supabase
      .from('conversations')
      .select(
        `*,
         contact:contacts(id, display_name, avatar_url, tags),
         channel:channels(id, type, name, status)`
      )
      .eq('restaurant_id', restaurantId)
      .order('last_message_at', { ascending: false })
      .limit(200),
    supabase
      .from('channels')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('type'),
    supabase
      .from('message_templates')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name'),
    supabase
      .from('restaurant_members')
      .select('user_id, role')
      .eq('restaurant_id', restaurantId),
  ])

  // Fetch profiles for each member (gracefully degrade if table doesn't exist)
  let users: TeamMember[] = []
  if (membersRaw && membersRaw.length > 0) {
    try {
      const userIds = membersRaw.map((m: { user_id: string }) => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', userIds)

      if (profiles) {
        users = profiles.map((p: { id: string; full_name?: string | null; avatar_url?: string | null; email?: string | null }) => ({
          id: p.id,
          email: p.email ?? '',
          name: p.full_name ?? null,
          avatar_url: p.avatar_url ?? null,
        }))
      } else {
        // Fall back to user_ids only
        users = membersRaw.map((m: { user_id: string }) => ({
          id: m.user_id,
          email: m.user_id,
          name: null,
          avatar_url: null,
        }))
      }
    } catch {
      // Gracefully degrade — team list is optional
      users = []
    }
  }

  return (
    <InboxView
      conversations={(conversations ?? []) as unknown as ConversationWithRelations[]}
      channels={(channels ?? []) as unknown as Channel[]}
      templates={(templates ?? []) as unknown as MessageTemplate[]}
      restaurantId={restaurantId}
      users={users}
    />
  )
}
