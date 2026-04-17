// ---------------------------------------------------------------------------
// Suite 04 — Replies (60 cases)
// ---------------------------------------------------------------------------

import { describe, test, beforeAll, afterAll } from 'vitest'
import { generateTestMatrix } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { assertMessageRendered, loginToTxoko, navigateToConversation } from '../helpers/visual-asserter.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'
import { chromium, type Browser, type Page } from '@playwright/test'

const ALL_CASES = generateTestMatrix()
const CASES = ALL_CASES.filter((c) => c.category === 'reply')

let runId: string
let writer: ReportWriter
let client: ZapiTestClient
let browser: Browser | null = null
let page: Page | null = null
const sentMessageIds: string[] = []
const admin = getSupabaseAdmin()

beforeAll(async () => {
  const cfg = getConfig()
  client = ZapiTestClient.fromConfig()
  writer = new ReportWriter(admin)

  const { data, error } = await admin.testRuns.insert({
    branch: process.env['GIT_BRANCH'] ?? 'feature/zapi-test-suite-1000',
    env: 'staging',
    config: { category: 'replies', totalCases: CASES.length },
  })

  if (error || !data) throw new Error(`Failed to create test_run: ${(error as { message?: string })?.message}`)
  runId = data.id

  // Pre-send seed messages to reply to
  const seeds = [
    { endpoint: '/send-text', payload: { message: 'Seed: texto para responder' } },
    { endpoint: '/send-image', payload: { image: 'https://picsum.photos/300/200', caption: 'Seed: imagem para responder' } },
    { endpoint: '/send-audio', payload: { audio: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/ogg/gsm.ogg' } },
    { endpoint: '/send-button-actions', payload: { message: 'Seed: botão para responder', buttons: [{ label: 'OK' }] } },
  ]

  for (const seed of seeds) {
    const res = await client.send(seed.endpoint, { ...seed.payload, phone: cfg.TEST_TARGET_PHONE })
    if (res.data?.messageId) sentMessageIds.push(res.data.messageId)
  }

  if (!cfg.SKIP_VISUAL && cfg.TXOKO_TEST_USER_EMAIL && cfg.TXOKO_TEST_USER_PASSWORD) {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    page = await context.newPage()
    await loginToTxoko(page, cfg.TXOKO_TEST_USER_EMAIL, cfg.TXOKO_TEST_USER_PASSWORD, cfg.TXOKO_BASE_URL)
    await navigateToConversation(page, cfg.TEST_TARGET_PHONE, cfg.TXOKO_BASE_URL)
  }
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
  if (browser) await browser.close()
})

describe.sequential('replies', { timeout: 30000 }, () => {
  CASES.forEach((tc, i) => {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const replyToId = sentMessageIds[i % sentMessageIds.length]

      const payload = {
        ...tc.payload,
        phone: cfg.TEST_TARGET_PHONE,
        ...(replyToId ? { messageId: replyToId } : {}),
      }

      const apiResult = await client.send('/send-text', payload, tc.testId)
      const messageId = apiResult.data?.messageId ?? ''
      tc.renderAssertion.messageId = messageId

      if (messageId) sentMessageIds.push(messageId)

      const webhookStarted = Date.now()
      const webhookEvents = messageId
        ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 15000 })
        : []
      const webhookLatencyMs = Date.now() - webhookStarted

      let renderResult = null
      if (page && messageId && !cfg.SKIP_VISUAL) {
        renderResult = await assertMessageRendered(page, tc.renderAssertion)
      }

      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs, renderResult })

      if (apiResult.status >= 400) {
        throw new Error(`[${tc.testId}] API ${apiResult.status}: ${apiResult.error}`)
      }
    })
  })
})
