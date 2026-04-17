// ---------------------------------------------------------------------------
// Suite 07 — Polls (25 cases)
// TODO: implement full 25-case runner — 3 samples below
// ---------------------------------------------------------------------------

import { describe, test, beforeAll, afterAll } from 'vitest'
import { generateTestMatrix } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'

const ALL_CASES = generateTestMatrix()
const CASES = ALL_CASES.filter((c) => c.category === 'poll')

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
    config: { category: 'polls', totalCases: CASES.length },
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

describe('polls (sample — 3 of 25)', { timeout: 30000 }, () => {
  test('poll.001 — single choice 3 options', async () => {
    const cfg = getConfig()
    const tc = CASES[0]!
    const apiResult = await client.sendPoll(cfg.TEST_TARGET_PHONE, { name: 'Seu prato favorito?', options: ['Pizza', 'Hambúrguer', 'Sushi'], selectableCount: 1 }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('poll.002 — single choice 4 options', async () => {
    const cfg = getConfig()
    const tc = CASES[1]!
    const apiResult = await client.sendPoll(cfg.TEST_TARGET_PHONE, { name: 'Qual horário prefere?', options: ['12h', '13h', '14h', '15h'], selectableCount: 1 }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('poll.003 — multi choice 5 options', async () => {
    const cfg = getConfig()
    const tc = CASES[2]!
    const apiResult = await client.sendPoll(cfg.TEST_TARGET_PHONE, { name: 'O que gostaria no cardápio?', options: ['Vegetariano', 'Vegano', 'Sem glúten', 'Low carb', 'Keto'], selectableCount: 3 }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })
})
