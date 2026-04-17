// ---------------------------------------------------------------------------
// Suite 10 — Option List (40 cases)
// TODO: implement full 40-case runner — 3 samples below
// ---------------------------------------------------------------------------

import { describe, test, beforeAll, afterAll } from 'vitest'
import { generateTestMatrix } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'

const ALL_CASES = generateTestMatrix()
const CASES = ALL_CASES.filter((c) => c.category === 'option_list')

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
    config: { category: 'option_list', totalCases: CASES.length },
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

describe('option-list (sample — 3 of 40)', { timeout: 30000 }, () => {
  test('option_list.006 — single section 2 rows', async () => {
    const cfg = getConfig()
    const tc = CASES[5]!  // skip first 5 group-only cases
    const apiResult = await client.sendOptionList(cfg.TEST_TARGET_PHONE, {
      message: 'Escolha uma opção (2 rows)',
      buttonLabel: 'Abrir lista',
      sections: [{ title: 'Opções disponíveis', rows: [{ title: 'Opção 1', description: 'Desc 1', rowId: 'opt-0' }, { title: 'Opção 2', description: 'Desc 2', rowId: 'opt-1' }] }],
    }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('option_list.007 — two sections', async () => {
    const cfg = getConfig()
    const tc = CASES[6]!
    const apiResult = await client.sendOptionList(cfg.TEST_TARGET_PHONE, {
      message: 'Escolha um item do cardápio',
      buttonLabel: 'Ver cardápio',
      sections: [
        { title: 'Pratos', rows: [{ title: 'Pizza', rowId: 'pizza' }, { title: 'Hambúrguer', rowId: 'burger' }] },
        { title: 'Bebidas', rows: [{ title: 'Água', rowId: 'water' }, { title: 'Refrigerante', rowId: 'soda' }] },
      ],
    }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })

  test('option_list.008 — with title and footer', async () => {
    const cfg = getConfig()
    const tc = CASES[7]!
    const apiResult = await client.sendOptionList(cfg.TEST_TARGET_PHONE, {
      message: 'Selecione método de entrega',
      buttonLabel: 'Ver opções',
      title: 'Txoko Delivery',
      sections: [{ title: 'Métodos', rows: [{ title: 'Retirar no local', rowId: 'pickup' }, { title: 'Entrega rápida', rowId: 'fast' }, { title: 'Entrega padrão', rowId: 'standard' }] }],
    }, tc.testId)
    const messageId = apiResult.data?.messageId ?? ''
    const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 }) : []
    await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })
    if (apiResult.status >= 400) throw new Error(`API ${apiResult.status}: ${apiResult.error}`)
  })
})
