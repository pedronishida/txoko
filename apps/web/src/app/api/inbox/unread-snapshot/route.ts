/**
 * GET /api/inbox/unread-snapshot
 *
 * Payload de notificacao pro service worker: conversa nao lida mais
 * recente do restaurante ativo. Sempre responde 200 com fallback generico.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UnreadConversationRow = {
  id: string
  last_message_preview: string | null
  last_message_at: string | null
  contact: { display_name: string | null } | null
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({
      title: 'Nova mensagem',
      body: 'Voce recebeu uma nova mensagem na inbox.',
      tag: 'inbox-message',
      url: '/inbox',
    })
  }

  const restaurantId = await getActiveRestaurantId().catch(() => null)
  if (!restaurantId) {
    return NextResponse.json({
      title: 'Nova mensagem',
      body: 'Abra a inbox para ver os detalhes.',
      tag: 'inbox-message',
      url: '/inbox',
    })
  }

  const { data } = await supabase
    .from('conversations')
    .select('id, last_message_preview, last_message_at, contact:contacts(display_name)')
    .eq('restaurant_id', restaurantId)
    .in('status', ['open', 'pending_agent', 'pending_customer'])
    .gt('unread_count', 0)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const conversation = data as UnreadConversationRow | null
  if (!conversation) {
    return NextResponse.json({
      title: 'Inbox',
      body: 'Sem novas mensagens.',
      tag: 'inbox-message',
      url: '/inbox',
    })
  }

  const title = conversation.contact?.display_name ?? 'Cliente'
  const preview = conversation.last_message_preview ?? ''
  return NextResponse.json({
    title,
    body: preview.slice(0, 140) || 'Nova mensagem',
    tag: `inbox-${conversation.id}`,
    url: '/inbox',
  })
}
