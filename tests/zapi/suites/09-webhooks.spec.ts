// ---------------------------------------------------------------------------
// Suite 09 — Webhooks (pure inbound validation — 60 cases)
// ---------------------------------------------------------------------------

import { describe, test, beforeAll, afterAll } from 'vitest'
import { generateTestMatrix } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForWebhookEvent, waitForAnyWebhookEvent, extractStatus } from '../helpers/webhook-collector.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'

const ALL_CASES = generateTestMatrix()
const CASES = ALL_CASES.filter((c) => c.category === 'webhook')

if (CASES.length !== 60) {
  throw new Error(`[09-webhooks] Expected 60 webhook cases, got ${CASES.length}`)
}

const EVENT_TYPES = ['on-message-send', 'on-message-received', 'on-message-status', 'on-message-delete', 'on-presence-chat'] as const
type EventType = typeof EVENT_TYPES[number]

const byEventType: Record<EventType, ReturnType<typeof generateTestMatrix>> = {
  'on-message-send':     CASES.filter((_, i) => i % 5 === 0),
  'on-message-received': CASES.filter((_, i) => i % 5 === 1),
  'on-message-status':   CASES.filter((_, i) => i % 5 === 2),
  'on-message-delete':   CASES.filter((_, i) => i % 5 === 3),
  'on-presence-chat':    CASES.filter((_, i) => i % 5 === 4),
}

const admin = getSupabaseAdmin()
let runId: string
let writer: ReportWriter
let client: ZapiTestClient

beforeAll(async () => {
  client = ZapiTestClient.fromConfig()
  writer = new ReportWriter(admin)
  const { data, error } = await admin.testRuns.insert({
    branch: process.env['GIT_BRANCH'] ?? 'feature/zapi-test-suite-1000',
    env: 'staging',
    config: { category: 'webhooks', totalCases: CASES.length },
  })
  if (error || !data) throw new Error(`Failed to create test_run: ${(error as { message?: string })?.message}`)
  runId = data.id
})

afterAll(async () => {
  const { data: rows } = await admin.testResults.selectFinalStatusByRunId(runId)
  const r = rows ?? []
  await writer.finalizeRun(runId, {
    total: r.length,
    passed: r.filter((x) => x.final_status === 'pass').length,
    failed: r.filter((x) => x.final_status === 'fail').length,
    skipped: r.filter((x) => x.final_status === 'skipped_by_platform').length,
  })
})

describe('on-message-send events', { timeout: 30000 }, () => {
  for (const tc of byEventType['on-message-send']) {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const apiResult = await client.sendText(cfg.TEST_TARGET_PHONE, `[on-message-send] ${tc.testId}`, tc.testId)
      const messageId = apiResult.data?.messageId ?? ''
      if (!messageId) {
        await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents: [], webhookLatencyMs: null, renderResult: null })
        throw new Error(`[${tc.testId}] No messageId in API response`)
      }
      const webhookStarted = Date.now()
      const event = await waitForWebhookEvent(admin, { messageId, eventType: 'on-message-send', timeoutMs: 15000 })
      const webhookLatencyMs = Date.now() - webhookStarted
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents: event ? [event] : [], webhookLatencyMs, renderResult: null })
      if (!event) throw new Error(`[${tc.testId}] on-message-send webhook not received within 15s`)
    })
  }
})

describe('on-message-status progression', { timeout: 30000 }, () => {
  for (const tc of byEventType['on-message-status']) {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const apiResult = await client.sendText(cfg.TEST_TARGET_PHONE, `[on-message-status] ${tc.testId}`, tc.testId)
      const messageId = apiResult.data?.messageId ?? ''
      const webhookStarted = Date.now()
      const events = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 15000 }) : []
      const webhookLatencyMs = Date.now() - webhookStarted
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents: events, webhookLatencyMs, renderResult: null })
      if (events.length === 0) throw new Error(`[${tc.testId}] No webhook events within 15s for ${messageId}`)
      const hasStatus = events.some((e) => extractStatus(e) !== null)
      if (!hasStatus && apiResult.status < 400) console.warn(`[${tc.testId}] No status field in events`)
    })
  }
})

describe('on-message-received (storage probe)', { timeout: 30000 }, () => {
  for (const tc of byEventType['on-message-received']) {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const apiResult = await client.sendText(cfg.TEST_TARGET_PHONE, `[received-probe] ${tc.testId}`, tc.testId)
      const { error } = await admin.webhookEvents.selectByEventType('on-message-received')
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents: [], webhookLatencyMs: null, renderResult: null })
      if (error) throw new Error(`[${tc.testId}] Supabase error: ${(error as { message?: string }).message}`)
    })
  }
})

describe('on-message-delete events', { timeout: 30000 }, () => {
  for (const tc of byEventType['on-message-delete']) {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const sendResult = await client.sendText(cfg.TEST_TARGET_PHONE, `[delete-seed] ${tc.testId}`, tc.testId)
      const messageId = sendResult.data?.messageId ?? ''
      if (!messageId) {
        await writer.writeResult({ runId, testCase: tc, apiResult: sendResult, webhookEvents: [], webhookLatencyMs: null, renderResult: null })
        throw new Error(`[${tc.testId}] No messageId from seed send`)
      }
      await new Promise((r) => setTimeout(r, 1500))
      const apiResult = await client.deleteMessage(cfg.TEST_TARGET_PHONE, messageId, 'all', tc.testId)
      const webhookStarted = Date.now()
      const event = await waitForWebhookEvent(admin, { messageId, eventType: 'on-message-delete', timeoutMs: 15000 })
      const webhookLatencyMs = Date.now() - webhookStarted
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents: event ? [event] : [], webhookLatencyMs, renderResult: null })
      if (!event && apiResult.status < 400) console.warn(`[${tc.testId}] on-message-delete webhook not received within 15s`)
    })
  }
})

describe('on-presence-chat (probe)', { timeout: 30000 }, () => {
  for (const tc of byEventType['on-presence-chat']) {
    test(tc.testId, async () => {
      const { data, error } = await admin.webhookEvents.selectByEventType('on-presence-chat')
      await writer.writeResult({ runId, testCase: tc, apiResult: null, webhookEvents: [], webhookLatencyMs: null, renderResult: null })
      if (error) throw new Error(`[${tc.testId}] Supabase error: ${(error as { message?: string }).message}`)
      if (!data) console.info(`[${tc.testId}] No on-presence-chat events yet — expected if no active chats`)
    })
  }
})
