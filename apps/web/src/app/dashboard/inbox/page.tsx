import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type {
  Channel,
  ConversationWithRelations,
  MessageTemplate,
} from '@txoko/shared'
import { InboxView } from './inbox-view'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const [{ data: conversations }, { data: channels }, { data: templates }] =
    await Promise.all([
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
    ])

  return (
    <InboxView
      conversations={(conversations ?? []) as unknown as ConversationWithRelations[]}
      channels={(channels ?? []) as unknown as Channel[]}
      templates={(templates ?? []) as unknown as MessageTemplate[]}
      restaurantId={restaurantId}
    />
  )
}
