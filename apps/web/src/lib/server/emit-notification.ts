import type { SupabaseClient } from '@supabase/supabase-js'

// Insere uma notificacao in-app (tabela notifications) com dedupe opcional:
// o dedup_key eh gravado no body JSON e comparado com as ultimas 24h.

export type EmitNotificationInput = {
  restaurantId: string
  type: string
  title: string
  body?: string | null
  href?: string | null
  severity?: 'info' | 'warning' | 'critical'
  dedupKey?: string
  metadata?: Record<string, unknown>
}

export type EmitNotificationResult =
  | { ok: true; id: string }
  | { ok: false; reason: string }

export async function emitNotification(
  supabase: SupabaseClient,
  input: EmitNotificationInput
): Promise<EmitNotificationResult> {
  if (input.dedupKey) {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { data: recent } = await supabase
      .from('notifications')
      .select('id, body')
      .eq('restaurant_id', input.restaurantId)
      .eq('type', input.type)
      .gte('created_at', since)
      .limit(50)
    if (
      (recent ?? []).find((row) => {
        try {
          return JSON.parse(row.body ?? '{}').dedup_key === input.dedupKey
        } catch {
          return false
        }
      })
    ) {
      return { ok: false, reason: 'duplicate' }
    }
  }

  const body =
    input.body ??
    (input.dedupKey || input.metadata
      ? JSON.stringify({ dedup_key: input.dedupKey ?? null, ...input.metadata })
      : null)

  const { data: inserted, error } = await supabase
    .from('notifications')
    .insert({
      restaurant_id: input.restaurantId,
      type: input.type,
      title: input.title,
      body,
      href: input.href ?? null,
      severity: input.severity ?? 'info',
    })
    .select('id')
    .single()

  return error || !inserted
    ? { ok: false, reason: error?.message ?? 'insert_failed' }
    : { ok: true, id: inserted.id }
}
