/**
 * Txoko Cron Worker
 *
 * Scheduled tasks for:
 * - iFood polling (every 5 minutes)
 * - Automation triggers (every hour)
 * - Daily checks at 9 AM UTC (birthdays, inactive customers, etc.)
 */

import type { ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types'

interface Env {
  APP_URL: string
  CRON_SECRET: string
}

export default {
  async fetch(): Promise<Response> {
    return new Response('Txoko Cron Worker — no HTTP interface', { status: 404 })
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date()
    const minute = now.getUTCMinutes()
    const hour = now.getUTCHours()

    const tasks: Promise<Response>[] = []

    // Every 5 minutes: iFood polling
    if (minute % 5 === 0) {
      tasks.push(callEndpoint(env, '/api/cron/ifood-poll'))
    }

    // Top of every hour (minute 0): automations scheduler
    if (minute === 0) {
      tasks.push(callEndpoint(env, '/api/cron/automations'))
    }

    // 9 AM UTC daily: daily checks (birthdays, inactive customers, etc.)
    if (minute === 0 && hour === 9) {
      tasks.push(callEndpoint(env, '/api/cron/daily-checks'))
    }

    // Wait for all tasks to complete
    ctx.waitUntil(Promise.allSettled(tasks))
  },
}

async function callEndpoint(env: Env, path: string): Promise<Response> {
  const url = `${env.APP_URL}${path}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        'User-Agent': 'Txoko-Cron-Worker',
      },
    })

    console.log(`[cron] ${path} -> ${res.status}`)

    // Log response body for debugging
    if (!res.ok) {
      const body = await res.text()
      console.error(`[cron] ${path} error response:`, body)
    }

    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[cron] ${path} fetch failed:`, message)
    throw error
  }
}
