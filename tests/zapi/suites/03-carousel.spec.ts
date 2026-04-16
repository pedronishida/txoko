// ---------------------------------------------------------------------------
// Suite 03 — Carousel
// 60 cases: 2/5/10 cards, URL + REPLY button types
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
const CASES = ALL_CASES.filter((c) => c.category === 'carousel')

if (CASES.length !== 60) {
  throw new Error(`[03-carousel] Expected 60 carousel cases, got ${CASES.length}`)
}

const cases2  = CASES.filter((_, i) => i % 3 === 0)
const cases5  = CASES.filter((_, i) => i % 3 === 1)
const cases10 = CASES.filter((_, i) => i % 3 === 2)

let runId: string
let writer: ReportWriter
let client: ZapiTestClient
let browser: Browser | null = null
let page: Page | null = null
const admin = getSupabaseAdmin()

beforeAll(async () => {
  const cfg = getConfig()
  client = ZapiTestClient.fromConfig()
  writer = new ReportWriter(admin)

  const { data, error } = await admin.testRuns.insert({
    branch: process.env['GIT_BRANCH'] ?? 'feature/zapi-test-suite-1000',
    env: 'staging',
    config: { category: 'carousel', totalCases: CASES.length },
  })

  if (error || !data) throw new Error(`Failed to create test_run: ${(error as { message?: string })?.message}`)
  runId = data.id

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

async function runCase(tc: ReturnType<typeof generateTestMatrix>[number]) {
  const cfg = getConfig()
  const apiResult = await client.send('/send-carousel', {
    ...tc.payload,
    phone: cfg.TEST_TARGET_PHONE,
  }, tc.testId)

  const messageId = apiResult.data?.messageId ?? ''
  tc.renderAssertion.messageId = messageId

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
    throw new Error(`API returned ${apiResult.status}: ${apiResult.error}`)
  }
}

describe('carousel — 2 cards', { timeout: 30000 }, () => {
  for (const tc of cases2) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})

describe('carousel — 5 cards', { timeout: 30000 }, () => {
  for (const tc of cases5) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})

describe('carousel — 10 cards', { timeout: 30000 }, () => {
  for (const tc of cases10) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})
