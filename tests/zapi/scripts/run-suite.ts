#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// run-suite.ts — Main orchestrator
// ---------------------------------------------------------------------------

import 'dotenv/config'
import pLimit from 'p-limit'
import { generateTestMatrix, type TestCase } from '../helpers/test-matrix.js'
import { ZapiTestClient } from '../helpers/zapi-client.js'
import { getSupabaseAdmin } from '../helpers/supabase-admin.js'
import { waitForAnyWebhookEvent } from '../helpers/webhook-collector.js'
import { assertMessageRendered, loginToTxoko, navigateToConversation } from '../helpers/visual-asserter.js'
import { ReportWriter } from '../helpers/report-writer.js'
import { getConfig } from '../helpers/config.js'
import { chromium, type Browser, type Page } from '@playwright/test'
import { execSync } from 'child_process'

type CLIArgs = {
  category?: string
  sample?: number
  skipVisual: boolean
  skipWebhook: boolean
  runId?: string
  dryRun: boolean
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const result: CLIArgs = { skipVisual: false, skipWebhook: false, dryRun: false }
  for (const arg of args) {
    if (arg.startsWith('--category=')) result.category = arg.replace('--category=', '')
    if (arg.startsWith('--sample=')) result.sample = parseInt(arg.replace('--sample=', ''), 10)
    if (arg === '--skip-visual') result.skipVisual = true
    if (arg === '--skip-webhook') result.skipWebhook = true
    if (arg.startsWith('--run-id=')) result.runId = arg.replace('--run-id=', '')
    if (arg === '--dry-run') result.dryRun = true
  }
  return result
}

function getGitInfo(): { branch: string; sha: string } {
  try {
    return {
      branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(),
      sha: execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(),
    }
  } catch {
    return { branch: 'unknown', sha: 'unknown' }
  }
}

type RunStatus = 'pass' | 'fail' | 'skipped_by_platform' | 'error'

async function runCase(
  tc: TestCase,
  opts: {
    runId: string
    client: ZapiTestClient
    writer: ReportWriter
    admin: ReturnType<typeof getSupabaseAdmin>
    page: Page | null
    skipVisual: boolean
    skipWebhook: boolean
  },
): Promise<RunStatus> {
  const { runId, client, writer, admin, page, skipVisual, skipWebhook } = opts
  const cfg = getConfig()

  if (tc.expectedSkipReason) {
    await writer.writeResult({ runId, testCase: tc, apiResult: null, webhookEvents: [], webhookLatencyMs: null, renderResult: null })
    return 'skipped_by_platform'
  }

  const payload = JSON.parse(JSON.stringify(tc.payload)) as Record<string, unknown>
  if (payload['phone'] === '{{TEST_TARGET_PHONE}}') payload['phone'] = cfg.TEST_TARGET_PHONE

  const apiResult = await client.send(tc.endpoint, payload, tc.testId)
  const messageId = apiResult.data?.messageId ?? ''
  tc.renderAssertion.messageId = messageId

  let webhookLatencyMs: number | null = null
  let webhookEvents: Awaited<ReturnType<typeof waitForAnyWebhookEvent>> = []
  if (!skipWebhook && messageId) {
    const started = Date.now()
    webhookEvents = await waitForAnyWebhookEvent(admin, { messageId, timeoutMs: 15000 })
    webhookLatencyMs = Date.now() - started
  }

  let renderResult = null
  if (!skipVisual && page && messageId) {
    try {
      renderResult = await assertMessageRendered(page, tc.renderAssertion)
    } catch (err) {
      console.warn(`[run-suite] Visual error for ${tc.testId}:`, (err as Error).message)
    }
  }

  await writer.writeResult({ runId, testCase: tc, apiResult, webhookEvents, webhookLatencyMs, renderResult })

  if (!apiResult || apiResult.status >= 400) return 'fail'
  if (!skipWebhook && webhookEvents.length === 0) return 'fail'
  if (renderResult && renderResult.errors.length > 0) return 'fail'
  return 'pass'
}

async function main() {
  const cliArgs = parseArgs()
  const cfg = getConfig()
  const admin = getSupabaseAdmin()
  const git = getGitInfo()

  let matrix = generateTestMatrix(cfg.TEST_TARGET_PHONE)
  if (cliArgs.category) {
    matrix = matrix.filter((tc) => tc.category === cliArgs.category)
    console.log(`[run-suite] Filtered to category="${cliArgs.category}": ${matrix.length} cases`)
  }
  if (cliArgs.sample) {
    matrix = matrix.slice(0, cliArgs.sample)
    console.log(`[run-suite] Sampling first ${matrix.length} cases`)
  }
  if (cliArgs.dryRun) {
    console.log(`[run-suite] --dry-run: would run ${matrix.length} cases. Exiting.`)
    return
  }

  let runId: string
  if (cliArgs.runId) {
    runId = cliArgs.runId
    console.log(`[run-suite] Reusing run_id: ${runId}`)
  } else {
    const { data, error } = await admin.testRuns.insert({
      branch: git.branch,
      commit_sha: git.sha,
      env: 'staging',
      total_cases: matrix.length,
      config: {
        category: cliArgs.category ?? 'all',
        skipVisual: cliArgs.skipVisual || cfg.SKIP_VISUAL,
        skipWebhook: cliArgs.skipWebhook,
        maxConcurrency: cfg.MAX_CONCURRENCY,
      },
    })
    if (error || !data) {
      console.error('[run-suite] Failed to create test_run:', (error as { message?: string })?.message)
      process.exit(1)
    }
    runId = data.id
    console.log(`[run-suite] Created test_run: ${runId}`)
  }

  const client = ZapiTestClient.fromConfig()
  const writer = new ReportWriter(admin)

  let browser: Browser | null = null
  let page: Page | null = null
  const useVisual = !cliArgs.skipVisual && !cfg.SKIP_VISUAL && !!cfg.TXOKO_TEST_USER_EMAIL
  if (useVisual) {
    try {
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext()
      page = await context.newPage()
      await loginToTxoko(page, cfg.TXOKO_TEST_USER_EMAIL!, cfg.TXOKO_TEST_USER_PASSWORD!, cfg.TXOKO_BASE_URL)
      await navigateToConversation(page, cfg.TEST_TARGET_PHONE, cfg.TXOKO_BASE_URL)
      console.log('[run-suite] Playwright browser ready')
    } catch (err) {
      console.warn('[run-suite] Playwright setup failed, continuing without visual:', (err as Error).message)
      page = null
    }
  }

  const limit = pLimit(cfg.MAX_CONCURRENCY)
  const counts: Record<RunStatus, number> = { pass: 0, fail: 0, skipped_by_platform: 0, error: 0 }
  const startedAt = Date.now()

  const tasks = matrix.map((tc, i) =>
    limit(async () => {
      const status = await runCase(tc, { runId, client, writer, admin, page, skipVisual: cliArgs.skipVisual || cfg.SKIP_VISUAL, skipWebhook: cliArgs.skipWebhook }).catch((err) => {
        console.error(`[run-suite] Unhandled error in ${tc.testId}:`, (err as Error).message)
        return 'error' as const
      })
      counts[status]++
      const total = i + 1
      const pct = Math.round((total / matrix.length) * 100)
      if (total % 50 === 0 || total === matrix.length) {
        const elapsed = Math.round((Date.now() - startedAt) / 1000)
        console.log(`[run-suite] ${pct}% (${total}/${matrix.length}) — pass:${counts.pass} fail:${counts.fail} skip:${counts.skipped_by_platform} — ${elapsed}s`)
      }
      return status
    }),
  )

  await Promise.all(tasks)
  const elapsed = Math.round((Date.now() - startedAt) / 1000)

  await writer.finalizeRun(runId, {
    total: matrix.length,
    passed: counts.pass,
    failed: counts.fail,
    skipped: counts.skipped_by_platform,
  })
  if (browser) await browser.close()

  console.log(`\n[run-suite] COMPLETE — run_id: ${runId}\n  Total: ${matrix.length}\n  Passed: ${counts.pass}\n  Failed: ${counts.fail}\n  Skipped: ${counts.skipped_by_platform}\n  Errors: ${counts.error}\n  Duration: ${elapsed}s\n`)

  try {
    const { default: generateReport } = await import('./report-html.js')
    await generateReport(runId)
  } catch (err) {
    console.warn('[run-suite] HTML report generation failed:', (err as Error).message)
  }

  process.exit(counts.fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[run-suite] Fatal:', err)
  process.exit(1)
})
