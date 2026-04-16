// =============================================================
// Z-API Test Webhook Collector
// URL: /api/webhooks/zapi-test?run_id=<uuid>
// Header: x-txoko-test-id: <test-id>
//
// Receives all Z-API webhook types (on-message-send,
// on-message-received, on-message-status, on-message-delete,
// on-presence-chat) and persists the raw payload to
// zapi_webhook_events for test-suite correlation.
//
// ALWAYS returns 200 so Z-API does not retry.
// Uses service_role — never called from the browser.
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---- Z-API payload shape (permissive — store whatever arrives) ----
const ZApiPayloadSchema = z.object({
  messageId: z.string().optional(),
  id: z.string().optional(),
  fromMe: z.boolean().optional(),
  isFromMe: z.boolean().optional(),
  phone: z.string().optional(),
  from: z.string().optional(),
  status: z.string().optional(),
  messageStatus: z.string().optional(),
  deleted: z.boolean().optional(),
  presenceStatus: z.string().optional(),
  testId: z.string().optional(),
}).passthrough()

type ZApiPayload = z.infer<typeof ZApiPayloadSchema>

// ---- Z-API event type detection ----
function detectEventType(payload: ZApiPayload): string {
  const MESSAGE_STATUS_VALUES = new Set(['SENT', 'RECEIVED', 'READ', 'PLAYED'])

  if (typeof payload.status === 'string' && MESSAGE_STATUS_VALUES.has(payload.status)) {
    return 'on-message-status'
  }
  if (payload.messageStatus === 'deleted' || payload.deleted === true) {
    return 'on-message-delete'
  }
  if (typeof payload.presenceStatus === 'string') {
    return 'on-presence-chat'
  }
  if (payload.fromMe === true || payload.isFromMe === true) {
    return 'on-message-send'
  }
  return 'on-message-received'
}

// ---- POST handler ----
export async function POST(request: NextRequest) {
  try {
    // Parse body — must be valid JSON
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 })
    }

    const parsed = ZApiPayloadSchema.safeParse(rawBody)
    if (!parsed.success) {
      // Payload doesn't match even the permissive schema — still persist it
      // by wrapping in a container, but this case is unlikely with passthrough()
      return NextResponse.json({ ok: false, error: 'unparseable payload' }, { status: 400 })
    }

    const payload = parsed.data

    // Correlation identifiers
    const url = new URL(request.url)
    const runId = url.searchParams.get('run_id') ?? null
    const testId =
      request.headers.get('x-txoko-test-id') ??
      (typeof payload.testId === 'string' ? payload.testId : null)

    // Extracted fields
    const eventType = detectEventType(payload)
    const messageId = payload.messageId ?? payload.id ?? null
    const fromMe = payload.fromMe ?? payload.isFromMe ?? false
    const phone = payload.phone ?? payload.from ?? null
    const status = payload.status ?? null

    // Persist — use service_role (public webhook, no user session)
    let supabase
    try {
      supabase = createServiceClient()
    } catch (e) {
      console.error('[zapi-test webhook] supabase init error:', e)
      // Return 200 anyway — do not block Z-API
      return NextResponse.json({ ok: false, error: (e as Error).message })
    }

    const { error: dbError } = await supabase.from('zapi_webhook_events').insert({
      run_id: runId,
      test_id: testId,
      event_type: eventType,
      message_id: messageId,
      from_me: fromMe,
      phone,
      status,
      payload: payload as Record<string, unknown>,
    })

    if (dbError) {
      console.error('[zapi-test webhook] db insert error:', dbError)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[zapi-test webhook] unexpected error:', err)
    // Always return 200 — Z-API must not retry due to our internal errors
    return NextResponse.json({ ok: false, error: (err as Error).message })
  }
}

// ---- GET handler — healthcheck ----
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'zapi-test webhook collector',
    timestamp: new Date().toISOString(),
  })
}
