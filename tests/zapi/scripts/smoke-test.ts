#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// smoke-test.ts — 10 critical cases, one per major category
// ---------------------------------------------------------------------------

import 'dotenv/config'
import { generateTestMatrix } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'

type SmokeResult = {
  testId: string
  category: string
  status: 'pass' | 'fail' | 'error'
  apiStatus: number
  latencyMs: number
  webhookReceived: boolean
  error: string | undefined
}

async function main() {
  const cfg = getConfig()
  const admin = getSupabaseAdmin()
  const matrix = generateTestMatrix(cfg.TEST_TARGET_PHONE)

  const smokeCats = ['text', 'image', 'audio', 'document', 'button_actions', 'button_list', 'button_image', 'carousel', 'reply', 'webhook']
  const smokeCases = smokeCats
    .map((cat) => matrix.find((tc) => tc.category === cat && !tc.expectedSkipReason))
    .filter((tc): tc is NonNullable<typeof tc> => tc !== undefined)

  console.log(`[smoke-test] Running ${smokeCases.length} critical cases...\n`)

  const { data: runData, error: runError } = await admin.testRuns.insert({
    branch: process.env['GIT_BRANCH'] ?? 'smoke',
    env: 'staging',
    config: { type: 'smoke', totalCases: smokeCases.length },
  })

  if (runError || !runData) {
    console.error('[smoke-test] Failed to create test_run:', (runError as { message?: string })?.message)
    process.exit(1)
  }

  const runId = runData.id
  const client = ZapiTestClient.fromConfig()
  const writer = new ReportWriter(admin)
  const results: SmokeResult[] = []
  const startedAt = Date.now()

  for (const tc of smokeCases) {
    const payload = JSON.parse(JSON.stringify(tc.payload)) as Record<string, unknown>
    if (payload['phone'] === '{{TEST_TARGET_PHONE}}') payload['phone'] = cfg.TEST_TARGET_PHONE

    process.stdout.write(`  ${tc.testId.padEnd(25)} `)

    let status: SmokeResult['status'] = 'error'
    let apiStatus = 0
    let latencyMs = 0
    let webhookReceived = false
    let errorMsg: string | undefined

    try {
      const apiResult = await client.send(tc.endpoint, payload, tc.testId)
      apiStatus = apiResult.status
      latencyMs = apiResult.latencyMs

      const messageId = apiResult.data?.messageId ?? ''
      tc.renderAssertion.messageId = messageId

      const webhookEvents = messageId
        ? await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 12000 })
        : []
      webhookReceived = webhookEvents.length > 0

      await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs: null, renderResult: null })

      if (apiStatus >= 400) {
        status = 'fail'
        errorMsg = apiResult.error ?? `HTTP ${apiStatus}`
      } else if (!webhookReceived) {
        status = 'fail'
        errorMsg = 'webhook timeout (12s)'
      } else {
        status = 'pass'
      }
    } catch (err) {
      status = 'error'
      errorMsg = (err as Error).message
      await writer.writeResult({ runId, testCase: tc, apiResult: null, webhookEvents: [], webhookLatencyMs: null, renderResult: null })
    }

    const icon = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'ERR '
    const webhookIcon = webhookReceived ? 'webhook:yes' : 'webhook:no '
    console.log(`${icon}  api:${apiStatus}  ${webhookIcon}  ${latencyMs}ms${errorMsg ? `  — ${errorMsg}` : ''}`)
    results.push({ testId: tc.testId, category: tc.category, status, apiStatus, latencyMs, webhookReceived, error: errorMsg })
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000)
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status !== 'pass').length

  await writer.finalizeRun(runId, { total: results.length, passed, failed, skipped: 0 })

  console.log(`\n[smoke-test] ${passed}/${results.length} passed in ${elapsed}s  (run_id: ${runId})\n`)

  if (failed > 0) {
    console.log('FAILURES:')
    for (const r of results.filter((x) => x.status !== 'pass')) {
      console.log(`  ${r.testId}: ${r.error}`)
    }
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('[smoke-test] Fatal:', err)
  process.exit(1)
})
