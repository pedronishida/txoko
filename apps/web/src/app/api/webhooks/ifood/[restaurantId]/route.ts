// =============================================================
// iFood Webhook Receiver
// URL: /api/webhooks/ifood/<restaurantId>?s=<webhook_secret>
//
// iFood pode enviar eventos via push webhook (quando configurado
// no painel Merchant). Recebe o corpo, valida o secret e processa
// cada evento do batch.
//
// Por padrao o iFood usa polling — este endpoint serve como
// receptor alternativo para quem configurar webhook push.
// =============================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { IfoodClient } from '@/lib/server/ifood/client'
import { getValidToken } from '@/lib/server/ifood/token'
import { ingestIfoodOrder } from '@/lib/server/ifood/ingest'
import type { IfoodEvent, IfoodIntegration } from '@/lib/server/ifood/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WebhookBodySchema = z.array(
  z.object({
    id: z.string(),
    code: z.string(),
    correlationId: z.string(),
    createdAt: z.string(),
    orderId: z.string(),
    merchantId: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ restaurantId: string }> }
) {
  const { restaurantId } = await params
  const url = new URL(request.url)
  const secret = url.searchParams.get('s') ?? request.headers.get('x-txoko-secret')

  if (!secret) {
    return NextResponse.json({ error: 'missing secret' }, { status: 401 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Valida integracao + secret
  const { data: integration, error: intErr } = await supabase
    .from('ifood_integrations')
    .select('id, restaurant_id, merchant_id, client_id, client_secret, access_token, token_expires_at, refresh_token, webhook_secret, enabled, last_polled_at, last_order_id')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (intErr || !integration) {
    return NextResponse.json({ error: 'integration not found' }, { status: 404 })
  }

  const typedIntegration = integration as IfoodIntegration

  if (typedIntegration.webhook_secret !== secret) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 })
  }
  if (!typedIntegration.enabled) {
    return NextResponse.json({ error: 'integration disabled' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = WebhookBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const events: IfoodEvent[] = parsed.data as IfoodEvent[]
  const results: Array<{ eventId: string; result: unknown }> = []

  // Token valido (lazy — so busca se houver eventos PLACED)
  let cachedToken: string | null = null

  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    if (cachedToken) return { token: cachedToken }
    const tokenResult = await getValidToken(supabase!, typedIntegration)
    if ('token' in tokenResult) cachedToken = tokenResult.token
    return tokenResult
  }

  for (const event of events) {
    // Loga evento (upsert para idempotencia)
    await supabase
      .from('ifood_events')
      .upsert({
        restaurant_id: restaurantId,
        event_id: event.id,
        event_type: event.code,
        order_external_id: event.orderId,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
      }, { onConflict: 'event_id' })

    let result: unknown = { ok: true, ignored: 'non-placed' }

    if (event.code === 'PLACED' || event.code === 'ORDER_CREATED') {
      const tokenResult = await ensureToken()
      if ('error' in tokenResult) {
        result = { error: tokenResult.error }
      } else if (!typedIntegration.client_id || !typedIntegration.client_secret) {
        result = { error: 'client_id / client_secret nao configurados' }
      } else {
        const ifoodClient = new IfoodClient(
          typedIntegration.client_id,
          typedIntegration.client_secret
        )
        try {
          const order = await ifoodClient.getOrder(tokenResult.token, event.orderId)
          const ingestResult = await ingestIfoodOrder(supabase, restaurantId, order)
          if (ingestResult.ok) {
            await supabase
              .from('ifood_events')
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                order_id: ingestResult.orderId,
              })
              .eq('event_id', event.id)
          } else {
            await supabase
              .from('ifood_events')
              .update({ processing_error: ingestResult.error })
              .eq('event_id', event.id)
          }
          result = ingestResult
        } catch (e) {
          const msg = (e as Error).message
          await supabase
            .from('ifood_events')
            .update({ processing_error: msg })
            .eq('event_id', event.id)
          result = { error: msg }
        }
      }
    } else {
      await supabase
        .from('ifood_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('event_id', event.id)
    }

    results.push({ eventId: event.id, result })
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  })
}

export async function GET() {
  return NextResponse.json({ service: 'txoko-ifood-webhook', status: 'ok' })
}
