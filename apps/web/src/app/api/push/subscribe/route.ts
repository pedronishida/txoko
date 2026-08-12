/**
 * POST /api/push/subscribe — registra a push subscription do usuario logado
 * (upsert por endpoint) vinculada ao restaurante ativo.
 * DELETE /api/push/subscribe — remove a subscription pelo endpoint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z
    .object({
      p256dh: z.string().optional(),
      auth: z.string().optional(),
    })
    .optional(),
  expirationTime: z.number().nullable().optional(),
})

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const restaurantId = await getActiveRestaurantId()
  if (!restaurantId) {
    return NextResponse.json({ error: 'no active restaurant' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent') ?? null
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      restaurant_id: restaurantId,
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys ?? {},
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = UnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
