// ---------------------------------------------------------------------------
// Suite 06 — Reactions (30 cases)
// TODO: implement full 30-case runner — 3 samples below
// ---------------------------------------------------------------------------

import { describe, test, beforeAll, afterAll } from 'vitest'
import { generateTestMatrix } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'

const ALL_CASES = generateTestMatrix()
const CASES = ALL_CASES.filter((c) => c.category === 'reaction')

const admin = getSupabaseAdmin()
let runId: string
let writer: ReportWriter
let client: ZapiTestClient
let seedMessageId: string | null = null

beforeAll(async () => {
  const cfg = getConfig()
  client = ZapiTestClient.fromConfig()
  writer = new ReportWriter(admin)

  const { data, error } = await admin.testRuns.insert({
    branch: process.env['GIT_BRANCH'] ?? 'feature/zapi-test-suite-1000',
    env: 'staging',
    config: { category: 'reactions', totalCases: CASES.length },
  })
  if (error || !data) throw new Error(`Failed to create test_run: ${(error as { message?: string })?.message}`)
  runId = data.id

  const res = await client.sendText(cfg.TEST_TARGET_PHONE, 'Seed: mensagem para receber reações', 'reaction-seed')
  seedMessageId = res.data?.messageId ?? null
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

describe('reactions (sample — 3 of 30)', { timeout: 30000 }, () => {
  test('reaction.001 — add 👍', async () => {
    const cfg = getConfig()
    const tc = CASES[0]!
    const apiResult = await client.sendReaction(cfg.TEST_TARGET_PHONE, seedMessageId ?? 'missing', '👍', tc.testId)
    const webhookEvents = seedMessageId ? await waitForAnyWebhookEvent(admin, { messageId: seedMessageId, timeoutMs: 10000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('reaction.002 — add ❤️', async () => {
    const cfg = getConfig()
    const tc = CASES[1]!
    const apiResult = await client.sendReaction(cfg.TEST_TARGET_PHONE, seedMessageId ?? 'missing', '❤️', tc.testId)
    const webhookEvents = seedMessageId ? await waitForAnyWebhookEvent(admin, { messageId: seedMessageId, timeoutMs: 10000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('reaction.003 — remove reaction', async () => {
    const cfg = getConfig()
    const tc = CASES[2]!
    const apiResult = await client.removeReaction(cfg.TEST_TARGET_PHONE, seedMessageId ?? 'missing', tc.testId)
    const webhookEvents = seedMessageId ? await waitForAnyWebhookEvent(admin, { messageId: seedMessageId, timeoutMs: 10000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })
})
