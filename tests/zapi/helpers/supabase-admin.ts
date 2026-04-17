// ---------------------------------------------------------------------------
// Supabase admin client — service role, for test infrastructure only
// NEVER use in production frontend code
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getConfig } from './config.js'

// ---------------------------------------------------------------------------
// Row types — mirrors migration 20260417000000_zapi_test_suite.sql
// ---------------------------------------------------------------------------

export type TestRunRow = {
  id: string
  started_at: string
  completed_at: string | null
  branch: string | null
  commit_sha: string | null
  env: string
  total_cases: number
  passed: number
  failed: number
  skipped: number
  config: Record<string, unknown>
  notes: string | null
}

export type TestResultRow = {
  id: string
  run_id: string
  test_id: string
  category: string
  endpoint: string
  variation_seed: string | null
  api_status: string | null
  api_message_id: string | null
  api_zaap_id: string | null
  api_latency_ms: number | null
  api_error: string | null
  webhook_status: string | null
  webhook_event_types: string[]
  webhook_latency_ms: number | null
  webhook_error: string | null
  render_status: string | null
  render_assertions_passed: number
  render_assertions_total: number
  render_error: string | null
  final_status: string
  error_category: string | null
  screenshot_path: string | null
  payload: Record<string, unknown> | null
  response: Record<string, unknown> | null
  created_at: string
}

export type TestResultInsert = Partial<TestResultRow> & {
  run_id: string
  test_id: string
  category: string
  endpoint: string
  final_status: string
}

export type ZapiWebhookEvent = {
  id: string
  run_id: string | null
  test_id: string | null
  event_type: string
  message_id: string | null
  from_me: boolean | null
  phone: string | null
  status: string | null
  payload: Record<string, unknown>
  received_at: string
}

// ---------------------------------------------------------------------------
// Typed query helpers — wrap an untyped Supabase client with known shapes
// ---------------------------------------------------------------------------

export type AdminClient = ReturnType<typeof createSupabaseAdmin>

type AnyClient = SupabaseClient  // eslint-disable-line @typescript-eslint/no-explicit-any

function createSupabaseAdmin() {
  const cfg = getConfig()
  const raw = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as AnyClient

  return {
    from<T = Record<string, unknown>>(table: string) {
      return raw.from(table) as ReturnType<AnyClient['from']>
    },

    // Typed shortcuts for the three test tables
    testRuns: {
      insert(row: Partial<TestRunRow>) {
        return raw
          .from('test_runs')
          .insert(row as Record<string, unknown>)
          .select('id')
          .single<{ id: string }>()
      },
      update(id: string, patch: Partial<TestRunRow>) {
        return raw
          .from('test_runs')
          .update(patch as Record<string, unknown>)
          .eq('id', id)
      },
      selectLatest() {
        return raw
          .from('test_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(1)
          .single<TestRunRow>()
      },
      selectById(id: string) {
        return raw.from('test_runs').select('*').eq('id', id).single<TestRunRow>()
      },
    },

    testResults: {
      insert(row: TestResultInsert) {
        return raw
          .from('test_results')
          .insert(row as Record<string, unknown>)
      },
      selectByRunId(runId: string) {
        return raw
          .from('test_results')
          .select('*')
          .eq('run_id', runId)
          .returns<TestResultRow[]>()
      },
      selectFinalStatusByRunId(runId: string) {
        return raw
          .from('test_results')
          .select('final_status')
          .eq('run_id', runId)
          .returns<Array<Pick<TestResultRow, 'final_status'>>>()
      },
    },

    webhookEvents: {
      selectByMessageId(messageId: string) {
        return raw
          .from('zapi_webhook_events')
          .select('*')
          .eq('message_id', messageId)
          .order('received_at', { ascending: true })
          .returns<ZapiWebhookEvent[]>()
      },
      selectByMessageIdAndType(messageId: string, eventType: string) {
        return raw
          .from('zapi_webhook_events')
          .select('*')
          .eq('message_id', messageId)
          .eq('event_type', eventType)
          .limit(1)
          .maybeSingle<ZapiWebhookEvent>()
      },
      selectByEventType(eventType: string) {
        return raw
          .from('zapi_webhook_events')
          .select('id, event_type, received_at')
          .eq('event_type', eventType)
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle<Pick<ZapiWebhookEvent, 'id' | 'event_type' | 'received_at'>>()
      },
    },
  }
}

let _admin: AdminClient | null = null

export function getSupabaseAdmin(): AdminClient {
  if (!_admin) _admin = createSupabaseAdmin()
  return _admin
}

// Also export raw SupabaseClient for webhook-collector (which uses .from directly)
let _rawClient: AnyClient | null = null

export function getRawSupabase(): AnyClient {
  if (!_rawClient) {
    const cfg = getConfig()
    _rawClient = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _rawClient
}
