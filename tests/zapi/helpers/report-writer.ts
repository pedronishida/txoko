// ---------------------------------------------------------------------------
// Report writer — persists individual test results to test_results table
// ---------------------------------------------------------------------------

import type { AdminClient, TestResultInsert, ZapiWebhookEvent } from './supabase-admin.js'
import type { ZapiResult } from './zapi-client.js'
import type { RenderResult } from './visual-asserter.js'
import type { TestCase } from './test-matrix.js'

export type WriteResultParams = {
  runId: string
  testCase: TestCase
  apiResult: ZapiResult | null
  webhookEvents: ZapiWebhookEvent[]
  webhookLatencyMs: number | null
  renderResult: RenderResult | null
}

type FinalStatus = 'pass' | 'fail' | 'skipped_by_platform' | 'error'
type ErrorCategory =
  | 'API_ERROR'
  | 'WEBHOOK_TIMEOUT'
  | 'RENDER_ERROR'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'ASSERTION_FAIL'
  | 'SKIP'

function deriveErrorCategory(
  apiResult: ZapiResult | null,
  webhookEvents: ZapiWebhookEvent[],
  renderResult: RenderResult | null,
): ErrorCategory | null {
  if (!apiResult) return 'NETWORK_ERROR'
  if (apiResult.status === 429) return 'RATE_LIMITED'
  if (apiResult.status !== 200 && apiResult.status !== 201) return 'API_ERROR'
  if (webhookEvents.length === 0) return 'WEBHOOK_TIMEOUT'
  if (renderResult && renderResult.errors.length > 0) return 'RENDER_ERROR'
  return null
}

function deriveFinalStatus(
  testCase: TestCase,
  apiResult: ZapiResult | null,
  webhookEvents: ZapiWebhookEvent[],
  renderResult: RenderResult | null,
): FinalStatus {
  if (testCase.expectedSkipReason) return 'skipped_by_platform'
  if (!apiResult || apiResult.status === 0) return 'error'
  if (apiResult.status >= 400) return 'fail'
  if (webhookEvents.length === 0) return 'fail'
  if (renderResult && renderResult.errors.length > 0) return 'fail'
  return 'pass'
}

export class ReportWriter {
  constructor(private readonly admin: AdminClient) {}

  async writeResult(params: WriteResultParams): Promise<void> {
    const { runId, testCase, apiResult, webhookEvents, webhookLatencyMs, renderResult } = params

    const finalStatus = deriveFinalStatus(testCase, apiResult, webhookEvents, renderResult)
    const errorCategory = deriveErrorCategory(apiResult, webhookEvents, renderResult)

    const apiStatus =
      testCase.expectedSkipReason
        ? 'skip'
        : !apiResult || apiResult.status === 0
        ? 'fail'
        : apiResult.status < 400
        ? 'pass'
        : 'fail'

    const webhookStatus =
      testCase.expectedSkipReason
        ? 'skip'
        : webhookEvents.length > 0
        ? 'pass'
        : 'fail'

    const renderStatus =
      testCase.expectedSkipReason
        ? 'skip'
        : !renderResult
        ? 'skip'
        : renderResult.errors.length === 0
        ? 'pass'
        : 'fail'

    const row: TestResultInsert = {
      run_id: runId,
      test_id: testCase.testId,
      category: testCase.category,
      endpoint: testCase.endpoint,
      variation_seed: testCase.testId,
      // API layer
      api_status: apiStatus,
      api_message_id: apiResult?.data?.messageId ?? null,
      api_zaap_id: apiResult?.data?.zaapId ?? null,
      api_latency_ms: apiResult?.latencyMs ?? null,
      api_error: apiResult?.error ?? null,
      // Webhook layer
      webhook_status: webhookStatus,
      webhook_event_types: webhookEvents.map((e) => e.event_type),
      webhook_latency_ms: webhookLatencyMs,
      webhook_error:
        webhookEvents.length === 0 && !testCase.expectedSkipReason
          ? 'no webhook event received within timeout'
          : null,
      // Render layer
      render_status: renderStatus,
      render_assertions_passed: renderResult?.passed ?? 0,
      render_assertions_total: renderResult?.total ?? 0,
      render_error: renderResult?.errors.join('; ') ?? null,
      // Aggregate
      final_status: finalStatus,
      error_category: errorCategory,
      screenshot_path: renderResult?.screenshotPath ?? null,
      payload: testCase.payload as Record<string, unknown>,
      response: (apiResult?.data as Record<string, unknown> | null) ?? null,
    }

    const { error } = await this.admin.testResults.insert(row)
    if (error) {
      console.error(
        `[report-writer] Failed to persist result for ${testCase.testId}:`,
        (error as { message?: string }).message,
      )
    }
  }

  /**
   * Updates the test_runs row with final aggregate counts.
   */
  async finalizeRun(
    runId: string,
    counts: { total: number; passed: number; failed: number; skipped: number },
  ): Promise<void> {
    const { error } = await this.admin.testRuns.update(runId, {
      completed_at: new Date().toISOString(),
      total_cases: counts.total,
      passed: counts.passed,
      failed: counts.failed,
      skipped: counts.skipped,
    })

    if (error) {
      console.error('[report-writer] Failed to finalize run:', (error as { message?: string }).message)
    }
  }
}
