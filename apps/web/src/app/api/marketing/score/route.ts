import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { scoreAllCustomers } from '@/lib/server/marketing/scoring'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// =============================================================
// POST /api/marketing/score
// =============================================================
// Recalcula engagement score, churn risk e optimal send hour
// de todos os customers de um restaurante.
// Chamado pelo scheduler diariamente ou sob demanda.
// =============================================================

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedKey =
    process.env.MARKETING_DISPATCH_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { restaurantId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.restaurantId) {
    return NextResponse.json(
      { error: 'restaurantId required' },
      { status: 400 }
    )
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  try {
    const result = await scoreAllCustomers(supabase, body.restaurantId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
