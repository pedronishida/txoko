// =============================================================
// iFood Poller — Cron endpoint
//
// Chame este endpoint periodicamente (ex: a cada 30s) via
// um scheduler externo (Cloudflare Cron Triggers, GitHub Actions,
// Upstash, etc).
//
// Protecao via Authorization: Bearer <CRON_SECRET>
// Em dev (sem CRON_SECRET configurado), aceita qualquer chamada.
//
// Para cada integracao iFood habilitada:
//   1. Autentica / renova token
//   2. Faz polling de eventos
//   3. Para eventos PLACED: busca pedido e ingere no Txoko
//   4. Acknowledge todos os eventos processados
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { IfoodClient } from '@/lib/server/ifood/client'
import { getValidToken } from '@/lib/server/ifood/token'
import { ingestIfoodOrder } from '@/lib/server/ifood/ingest'
import type { IfoodIntegration } from '@/lib/server/ifood/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cloudflare cron triggers requerem wrangler.jsonc triggers.crons
// Por ora, acionar manualmente via GET /api/cron/ifood-poll
// (ou agendar via serviço externo).

export async function GET(req: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Busca todas as integracoes habilitadas
  const { data: integrations, error: listErr } = await supabase
    .from('ifood_integrations')
    .select('*')
    .eq('enabled', true)

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const rows = (integrations ?? []) as IfoodIntegration[]

  type PollSummary = {
    restaurantId: string
    merchantId: string
    events: number
    ingested: number
    errors: string[]
  }

  const summary: PollSummary[] = []

  for (const integration of rows) {
    const entry: PollSummary = {
      restaurantId: integration.restaurant_id,
      merchantId: integration.merchant_id,
      events: 0,
      ingested: 0,
      errors: [],
    }

    // 1. Token valido
    const tokenResult = await getValidToken(supabase, integration)
    if ('error' in tokenResult) {
      entry.errors.push(`token: ${tokenResult.error}`)
      summary.push(entry)
      continue
    }

    const token = tokenResult.token

    if (!integration.client_id || !integration.client_secret) {
      entry.errors.push('client_id / client_secret nao configurados')
      summary.push(entry)
      continue
    }

    const client = new IfoodClient(integration.client_id, integration.client_secret)

    // 2. Polling
    let events
    try {
      events = await client.pollEvents(token)
    } catch (e) {
      entry.errors.push(`poll: ${(e as Error).message}`)
      summary.push(entry)
      continue
    }

    entry.events = events.length
    if (events.length === 0) {
      await supabase
        .from('ifood_integrations')
        .update({ last_polled_at: new Date().toISOString() })
        .eq('id', integration.id)
      summary.push(entry)
      continue
    }

    const eventIdsToAck: string[] = []

    // 3. Processar cada evento
    for (const event of events) {
      // Idempotencia: skip se evento ja processado
      const { data: existingEvent } = await supabase
        .from('ifood_events')
        .select('id, processed')
        .eq('event_id', event.id)
        .maybeSingle()

      if (existingEvent?.processed) {
        eventIdsToAck.push(event.id)
        continue
      }

      // Loga evento
      await supabase.from('ifood_events').upsert({
        restaurant_id: integration.restaurant_id,
        event_id: event.id,
        event_type: event.code,
        order_external_id: event.orderId,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
      }, { onConflict: 'event_id' })

      if (event.code === 'PLACED' || event.code === 'ORDER_CREATED') {
        try {
          const ifoodOrder = await client.getOrder(token, event.orderId)
          const result = await ingestIfoodOrder(supabase, integration.restaurant_id, ifoodOrder)

          if (result.ok) {
            entry.ingested++
            await supabase
              .from('ifood_events')
              .update({
                processed: true,
                processed_at: new Date().toISOString(),
                order_id: result.orderId,
              })
              .eq('event_id', event.id)

            // Atualiza last_order_id
            await supabase
              .from('ifood_integrations')
              .update({ last_order_id: event.orderId })
              .eq('id', integration.id)
          } else {
            entry.errors.push(`ingest(${event.orderId}): ${result.error}`)
            await supabase
              .from('ifood_events')
              .update({ processing_error: result.error })
              .eq('event_id', event.id)
          }
        } catch (e) {
          const msg = (e as Error).message
          entry.errors.push(`order(${event.orderId}): ${msg}`)
          await supabase
            .from('ifood_events')
            .update({ processing_error: msg })
            .eq('event_id', event.id)
        }
      } else {
        // Eventos de status (CONFIRMED, DISPATCHED, CANCELLED, etc.): marca processado
        await supabase
          .from('ifood_events')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('event_id', event.id)
      }

      eventIdsToAck.push(event.id)
    }

    // 4. Acknowledge
    try {
      await client.acknowledgeEvents(token, eventIdsToAck)
    } catch (e) {
      entry.errors.push(`ack: ${(e as Error).message}`)
    }

    // Atualiza last_polled_at
    await supabase
      .from('ifood_integrations')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('id', integration.id)

    summary.push(entry)
  }

  return NextResponse.json({
    ok: true,
    polledAt: new Date().toISOString(),
    integrations: summary.length,
    summary,
  })
}
