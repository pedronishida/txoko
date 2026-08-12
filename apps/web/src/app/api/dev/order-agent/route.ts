/**
 * POST /api/dev/order-agent — testa o agente de pedidos sem WhatsApp real.
 *
 * Habilitado somente quando ENABLE_DEV_ROUTES=true.
 * Cria contact/conversation dummy quando conversationId nao e informado
 * e retorna o resultado do agente + ultimo order_draft da conversa.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { runOrderAgent } from '@/lib/server/ai/order-agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BodySchema = z.object({
  restaurantId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  customerPhone: z.string().optional(),
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
  persona: z.string().optional(),
  restaurantName: z.string().optional(),
})

export async function POST(req: NextRequest) {
  if (process.env.ENABLE_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'dev routes desabilitadas' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 422 }
    )
  }

  const supabase = createServiceClient()
  const input = parsed.data

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name, ai_agent_config')
    .eq('id', input.restaurantId)
    .maybeSingle()
  if (!restaurant) {
    return NextResponse.json({ error: 'restaurant not found' }, { status: 404 })
  }

  const agentConfig = (restaurant.ai_agent_config ?? {}) as { persona?: unknown }
  const persona =
    input.persona ??
    (typeof agentConfig.persona === 'string' ? agentConfig.persona : null) ??
    'um atendente amigavel'
  const restaurantName = input.restaurantName ?? (restaurant.name as string)

  let conversationId = input.conversationId ?? null
  if (!conversationId) {
    const { data: contact } = await supabase
      .from('contacts')
      .insert({ restaurant_id: input.restaurantId, display_name: 'Dev tester' })
      .select('id')
      .single()
    if (!contact) {
      return NextResponse.json({ error: 'falha ao criar contact dummy' }, { status: 500 })
    }

    const { data: channel } = await supabase
      .from('channels')
      .select('id')
      .eq('restaurant_id', input.restaurantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!channel) {
      return NextResponse.json(
        { error: 'restaurant sem channel — crie um channel antes de testar' },
        { status: 422 }
      )
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        restaurant_id: input.restaurantId,
        channel_id: channel.id,
        contact_id: contact.id,
        status: 'open',
      })
      .select('id')
      .single()
    if (convError || !conversation) {
      return NextResponse.json(
        { error: `falha ao criar conversation: ${convError?.message}` },
        { status: 500 }
      )
    }
    conversationId = conversation.id as string
  }

  const messages = (input.history ?? []).concat([{ role: 'user', content: input.message }])

  const result = await runOrderAgent({
    messages,
    restaurantName,
    persona,
    supabase,
    restaurantId: input.restaurantId,
    conversationId,
    customerId: input.customerId ?? null,
    customerPhone: input.customerPhone ?? null,
  })

  const { data: draft } = await supabase
    .from('order_drafts')
    .select('id, items, delivery_type, payment_method, status, confirmed_order_id, customer_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    action: result.action,
    ...('text' in result ? { text: result.text } : {}),
    ...('reason' in result ? { reason: result.reason } : {}),
    ...('toolCalls' in result ? { tool_calls: result.toolCalls } : {}),
    ...('iterations' in result ? { iterations: result.iterations } : {}),
    draft: draft ?? null,
  })
}
