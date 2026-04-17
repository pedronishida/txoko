// ---------------------------------------------------------------------------
// Suite 05 — Deletion + Edit
// delete_for_me(25) + delete_everyone(25) + edit(15) = 65
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
const byCategory = {
  delete_for_me:   ALL_CASES.filter((c) => c.category === 'delete_for_me'),
  delete_everyone: ALL_CASES.filter((c) => c.category === 'delete_everyone'),
  edit:            ALL_CASES.filter((c) => c.category === 'edit'),
}

let runId: string
let writer: ReportWriter
let client: ZapiTestClient
let browser: Browser | null = null
let page: Page | null = null
const messagesToDelete: string[] = []
const messagesToEdit: string[] = []
const admin = getSupabaseAdmin()

beforeAll(async () => {
  const cfg = getConfig()
  client = ZapiTestClient.fromConfig()
  writer = new ReportWriter(admin)

  const { data, error } = await admin.testRuns.insert({
    branch: process.env['GIT_BRANCH'] ?? 'feature/zapi-test-suite-1000',
    env: 'staging',
    config: { category: 'deletion', totalCases: byCategory.delete_for_me.length + byCategory.delete_everyone.length + byCategory.edit.length },
  })

  if (error || !data) throw new Error(`Failed to create test_run: ${(error as { message?: string })?.message}`)
  runId = data.id

  const totalDelete = byCategory.delete_for_me.length + byCategory.delete_everyone.length
  for (let i = 0; i < totalDelete; i++) {
    const res = await client.sendText(cfg.TEST_TARGET_PHONE, `Mensagem para deletar #${i + 1}`, `del-seed-${i}`)
    if (res.data?.messageId) messagesToDelete.push(res.data.messageId)
  }
  for (let i = 0; i < byCategory.edit.length; i++) {
    const res = await client.sendText(cfg.TEST_TARGET_PHONE, `Mensagem original para editar #${i + 1}`, `edit-seed-${i}`)
    if (res.data?.messageId) messagesToEdit.push(res.data.messageId)
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

describe.sequential('delete for me', { timeout: 30000 }, () => {
  byCategory.delete_for_me.forEach((tc, i) => {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const messageId = messagesToDelete[i] ?? ''
      const apiResult = await client.send('/delete-message', { phone: cfg.TEST_TARGET_PHONE, messageId, owner: 'me' }, tc.testId)
      tc.renderAssertion.messageId = messageId
      const webhookStarted = Date.now()
      const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 10000 }) : []
      const webhookLatencyMs = Date.now() - webhookStarted
      let renderResult = null
      if (page && messageId && !cfg.SKIP_VISUAL) renderResult = await assertMessageRendered(page, tc.renderAssertion)
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs, renderResult })
      if (apiResult.status >= 400) throw new Error(`[${tc.testId}] API ${apiResult.status}: ${apiResult.error}`)
    })
  })
})

describe.sequential('delete for everyone', { timeout: 30000 }, () => {
  byCategory.delete_everyone.forEach((tc, i) => {
    const runner = tc.expectedSkipReason ? test.skip : test
    const offset = byCategory.delete_for_me.length
    runner(tc.testId, async () => {
      const cfg = getConfig()
      const messageId = messagesToDelete[offset + i] ?? ''
      const apiResult = await client.send('/delete-message', { phone: cfg.TEST_TARGET_PHONE, messageId, owner: 'all' }, tc.testId)
      tc.renderAssertion.messageId = messageId
      const webhookStarted = Date.now()
      const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 10000 }) : []
      const webhookLatencyMs = Date.now() - webhookStarted
      let renderResult = null
      if (page && messageId && !cfg.SKIP_VISUAL) renderResult = await assertMessageRendered(page, tc.renderAssertion)
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs, renderResult })
      if (apiResult.status >= 400) throw new Error(`[${tc.testId}] API ${apiResult.status}: ${apiResult.error}`)
    })
  })
})

describe.sequential('edit message', { timeout: 30000 }, () => {
  byCategory.edit.forEach((tc, i) => {
    test(tc.testId, async () => {
      const cfg = getConfig()
      const messageId = messagesToEdit[i] ?? ''
      const apiResult = await client.send('/update-message', {
        phone: cfg.TEST_TARGET_PHONE, messageId, message: `Mensagem editada #${i + 1} — versão corrigida`,
      }, tc.testId)
      tc.renderAssertion.messageId = messageId
      const webhookStarted = Date.now()
      const webhookEvents = messageId ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 10000 }) : []
      const webhookLatencyMs = Date.now() - webhookStarted
      let renderResult = null
      if (page && messageId && !cfg.SKIP_VISUAL) renderResult = await assertMessageRendered(page, tc.renderAssertion)
      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs, renderResult })
      if (apiResult.status >= 400) throw new Error(`[${tc.testId}] API ${apiResult.status}: ${apiResult.error}`)
    })
  })
})
