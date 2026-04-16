// ---------------------------------------------------------------------------
// Suite 02 — Buttons
// Priority: button-list-image and button-pix (as requested)
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
const BUTTON_CATEGORIES = ['button_actions', 'button_list', 'button_image', 'button_pix', 'button_otp'] as const
const CASES = ALL_CASES.filter((c) => BUTTON_CATEGORIES.includes(c.category as typeof BUTTON_CATEGORIES[number]))

const byCategory = {
  button_actions: CASES.filter((c) => c.category === 'button_actions'),
  button_list:    CASES.filter((c) => c.category === 'button_list'),
  button_image:   CASES.filter((c) => c.category === 'button_image'),
  button_pix:     CASES.filter((c) => c.category === 'button_pix'),
  button_otp:     CASES.filter((c) => c.category === 'button_otp'),
}

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
    config: { category: 'buttons', totalCases: CASES.length },
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
  const apiResult = await client.send(tc.endpoint, {
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
    throw new Error(`[${tc.testId}] API ${apiResult.status}: ${apiResult.error}`)
  }
}

// PRIORITY: button-list-image
describe('button-list-image (priority)', { timeout: 30000 }, () => {
  for (const tc of byCategory.button_image) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})

// PRIORITY: button-pix
describe('button-pix (priority)', { timeout: 30000 }, () => {
  for (const tc of byCategory.button_pix) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})

describe('button-actions', { timeout: 30000 }, () => {
  for (const tc of byCategory.button_actions) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})

describe('button-list (sections)', { timeout: 30000 }, () => {
  for (const tc of byCategory.button_list) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})

describe('button-otp', { timeout: 30000 }, () => {
  for (const tc of byCategory.button_otp) {
    const runner = tc.expectedSkipReason ? test.skip : test
    runner(tc.testId, async () => runCase(tc))
  }
})
