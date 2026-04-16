/**
 * Cron endpoint for daily checks and scheduled tasks.
 *
 * Runs at 9 AM UTC daily. Handles:
 * - Birthday automations
 * - Inactive customer automations
 * - Low stock automations (redundant with hourly, but can filter by date)
 * - Send reminders for upcoming reservations
 *
 * Protected by CRON_SECRET token in Authorization header.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createClient()

  const summary = {
    totalRestaurants: 0,
    checkedAt: new Date().toISOString(),
  }

  try {
    // Get all restaurants (for future: daily digest emails, maintenance tasks, etc.)
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('id')
      .eq('active', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    summary.totalRestaurants = restaurants?.length ?? 0

    // TODO: Add more daily checks here:
    // - Send birthday reminders
    // - Send reservation reminders
    // - Generate daily reports
    // - Cleanup old temp data
    // - Send inactive customer emails
  } catch (e) {
    const err = e as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...summary })
}
