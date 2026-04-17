// ---------------------------------------------------------------------------
// Suite 01 — Media
// image(100) + video(35) + ptv(20) + audio(35) + ptt(15) +
// document(20) + gif(15) + sticker(15) + location(10) + contact(10) = 275
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
const MEDIA_CATEGORIES = ['image', 'video', 'ptv', 'audio', 'ptt', 'document', 'gif', 'sticker', 'location', 'contact'] as const
const CASES = ALL_CASES.filter((c) => MEDIA_CATEGORIES.includes(c.category as typeof MEDIA_CATEGORIES[number]))

const byCategory = Object.fromEntries(
  MEDIA_CATEGORIES.map((cat) => [cat, CASES.filter((c) => c.category === cat)]),
) as Record<typeof MEDIA_CATEGORIES[number], ReturnType<typeof generateTestMatrix>>

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
    config: { category: 'media', totalCases: CASES.length },
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

describe('image — URL + variants', { timeout: 30000 }, () => {
  for (const tc of byCategory.image ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('video', { timeout: 30000 }, () => {
  for (const tc of byCategory.video ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('ptv (circle video)', { timeout: 30000 }, () => {
  for (const tc of byCategory.ptv ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('audio (file)', { timeout: 30000 }, () => {
  for (const tc of byCategory.audio ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('ptt (voice note)', { timeout: 30000 }, () => {
  for (const tc of byCategory.ptt ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('document (pdf / docx)', { timeout: 30000 }, () => {
  for (const tc of byCategory.document ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('gif', { timeout: 30000 }, () => {
  for (const tc of byCategory.gif ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('sticker', { timeout: 30000 }, () => {
  for (const tc of byCategory.sticker ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('location', { timeout: 30000 }, () => {
  for (const tc of byCategory.location ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})

describe('contact vCard', { timeout: 30000 }, () => {
  for (const tc of byCategory.contact ?? []) {
    test(tc.testId, async () => runCase(tc))
  }
})
