// ---------------------------------------------------------------------------
// Suite 08 — Status / Stories (15 cases)
// TODO: implement full 15-case runner — 3 samples below
// ---------------------------------------------------------------------------

import { describe, test, beforeAll, afterAll } from 'vitest'
import { generateTestMatrix, SAMPLE_IMAGE_URL, SAMPLE_VIDEO_URL } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'

const ALL_CASES = generateTestMatrix()
const CASES = ALL_CASES.filter((c) => c.category === 'status')

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
    config: { category: 'status', totalCases: CASES.length },
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

describe('status / stories (sample — 3 of 15)', { timeout: 30000 }, () => {
  test('status.001 — text status', async () => {
    const cfg = getConfig()
    const tc = CASES[0]!
    const apiResult = await client.sendStatus(cfg.TEST_TARGET_PHONE, { type: 'text', content: 'Status de texto 🍽️' }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('status.002 — image status', async () => {
    const cfg = getConfig()
    const tc = CASES[1]!
    const apiResult = await client.sendStatus(cfg.TEST_TARGET_PHONE, { type: 'image', content: SAMPLE_IMAGE_URL, caption: 'Prato do dia 🍕' }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('status.003 — video status', async () => {
    const cfg = getConfig()
    const tc = CASES[2]!
    const apiResult = await client.sendStatus(cfg.TEST_TARGET_PHONE, { type: 'video', content: SAMPLE_VIDEO_URL, caption: 'Vídeo de apresentação' }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })
})
