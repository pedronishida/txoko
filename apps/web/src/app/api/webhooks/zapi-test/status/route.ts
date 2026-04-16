// =============================================================
// Z-API Test Webhook Status / Metrics
// URL: GET /api/webhooks/zapi-test/status?run_id=<uuid>
//
// Returns event counts per type for a given test run.
// Polled by the test runner to confirm webhook delivery.
//
// Uses service_role — internal test-suite endpoint.
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  run_id: z.string().uuid('run_id must be a valid UUID'),
})

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const query = QuerySchema.safeParse({ run_id: url.searchParams.get('run_id') })

  if (!query.success) {
    return NextResponse.json(
      { error: query.error.issues[0]?.message ?? 'run_id required' },
      { status: 400 }
    )
  }

  const { run_id: runId } = query.data

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Fetch all events for the run — group in JS to avoid relying on DB aggregate functions
  const { data, error } = await supabase
    .from('zapi_webhook_events')
    .select('event_type, message_id, from_me, phone, status, received_at')
    .eq('run_id', runId)
    .order('received_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate counts by event_type
  const byType: Record<string, number> = {}
  for (const row of data ?? []) {
    const et = row.event_type as string
    byType[et] = (byType[et] ?? 0) + 1
  }

  return NextResponse.json({
    runId,
    total: data?.length ?? 0,
    byType,
    events: data ?? [],
  })
}
