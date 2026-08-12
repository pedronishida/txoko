import type { SupabaseClient } from '@supabase/supabase-js'
import { ZapiClient } from './client'
import type { ZapiChannelConfig } from './types'

// =============================================================
// Saude e guardrails de envio dos canais Z-API
// =============================================================
// - Limite diario com warmup progressivo (override por canal)
// - Throttle por destinatario (5 msgs / 24h)
// - Health check da instancia + reparo dos webhooks
// =============================================================

export type ChannelSendAllowance =
  | { allow: true; remaining_today: number }
  | { allow: false; reason: string; retry_after_hours?: number }

export type ChannelHealthResult = {
  status: 'connected' | 'disconnected' | 'degraded' | 'unknown'
  detail?: string
  connected_phone?: string | null
}

export type WebhookRepairResult =
  | { ok: true; updated: number; skipped_reason?: string }
  | { ok: false; error: string }

function warmupDailyLimit(daysSinceStart: number): number {
  if (daysSinceStart < 3) return 50
  if (daysSinceStart < 7) return 100
  if (daysSinceStart < 14) return 250
  return 500
}

export async function checkChannelDailyLimit(
  supabase: SupabaseClient,
  channelId: string
): Promise<ChannelSendAllowance> {
  const { data: channel } = await supabase
    .from('channels')
    .select('health_status, warmup_started_at, daily_limit_override, daily_send_count, daily_send_date')
    .eq('id', channelId)
    .maybeSingle()

  if (!channel) return { allow: false, reason: 'channel_not_found' }
  if (channel.health_status === 'disconnected') {
    return { allow: false, reason: 'channel_disconnected' }
  }

  const today = new Date().toISOString().slice(0, 10)
  const sentToday = channel.daily_send_date === today ? Number(channel.daily_send_count ?? 0) : 0

  let limit: number
  if (channel.daily_limit_override) {
    limit = Number(channel.daily_limit_override)
  } else if (channel.warmup_started_at) {
    const warmupStartMs = new Date(channel.warmup_started_at).getTime()
    limit = warmupDailyLimit(Math.floor((Date.now() - warmupStartMs) / 86_400_000))
  } else {
    limit = warmupDailyLimit(0)
  }

  const remaining = limit - sentToday
  return remaining <= 0
    ? { allow: false, reason: `daily_limit_reached (${sentToday}/${limit})`, retry_after_hours: 24 }
    : { allow: true, remaining_today: remaining }
}

export async function checkRecipientThrottle(
  supabase: SupabaseClient,
  channelId: string,
  targetPhone: string
): Promise<ChannelSendAllowance> {
  const phoneDigits = targetPhone.replace(/\D/g, '')
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await supabase
    .from('channel_send_log')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('target_phone', phoneDigits)
    .gte('sent_at', since)
  const sent = count ?? 0
  return sent >= 5
    ? { allow: false, reason: `recipient_throttled (${sent} msgs em 24h)`, retry_after_hours: 24 }
    : { allow: true, remaining_today: 5 - sent }
}

export async function recordChannelSend(
  supabase: SupabaseClient,
  input: { channelId: string; restaurantId: string; targetPhone: string; kind: string }
): Promise<void> {
  const phoneDigits = input.targetPhone.replace(/\D/g, '')
  await Promise.all([
    supabase.from('channel_send_log').insert({
      channel_id: input.channelId,
      restaurant_id: input.restaurantId,
      target_phone: phoneDigits,
      kind: input.kind,
    }),
    supabase.rpc('increment_channel_send_count', { p_channel_id: input.channelId }),
  ])
}

export async function checkZapiHealth(
  supabase: SupabaseClient,
  channelId: string
): Promise<ChannelHealthResult> {
  const { data: channel } = await supabase
    .from('channels')
    .select('config, type')
    .eq('id', channelId)
    .maybeSingle()

  if (!channel || channel.type !== 'whatsapp_zapi') {
    return { status: 'unknown', detail: 'not_zapi_or_missing' }
  }

  const config = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!config.instance_id || !config.token) {
    const result: ChannelHealthResult = { status: 'unknown', detail: 'no_credentials' }
    await persistChannelHealth(supabase, channelId, result)
    return result
  }

  try {
    const client = new ZapiClient(config as ZapiChannelConfig)
    const status = await client.getStatus()
    let connectedPhone: string | null = null
    if (status.connected) {
      try {
        connectedPhone = (await client.getMe()).phone ?? null
      } catch {
        // getMe falhou — segue sem telefone
      }
    }
    const result: ChannelHealthResult = status.connected
      ? { status: 'connected', connected_phone: connectedPhone, detail: 'ok' }
      : {
          status: 'disconnected',
          detail:
            status.smartphoneConnected === false
              ? 'smartphone_offline'
              : status.error ?? 'session_dropped',
        }
    await persistChannelHealth(supabase, channelId, result)
    return result
  } catch (err) {
    const result: ChannelHealthResult = {
      status: 'degraded',
      detail: (err as Error).message?.slice(0, 200) ?? 'fetch_failed',
    }
    await persistChannelHealth(supabase, channelId, result)
    return result
  }
}

async function persistChannelHealth(
  supabase: SupabaseClient,
  channelId: string,
  result: ChannelHealthResult
): Promise<void> {
  await supabase
    .from('channels')
    .update({
      health_status: result.status,
      health_checked_at: new Date().toISOString(),
      health_detail: result.detail ?? null,
      connected_phone: result.connected_phone ?? null,
      ...(result.status === 'disconnected' ? { status: 'disconnected' } : {}),
      ...(result.status === 'connected' ? { status: 'active' } : {}),
    })
    .eq('id', channelId)
}

export async function repairZapiWebhooks(
  supabase: SupabaseClient,
  channelId: string
): Promise<WebhookRepairResult> {
  const { data: channel } = await supabase
    .from('channels')
    .select('id, config, status, type')
    .eq('id', channelId)
    .maybeSingle()

  if (!channel || channel.type !== 'whatsapp_zapi') {
    return { ok: true, updated: 0, skipped_reason: 'not_zapi' }
  }
  if (channel.status !== 'active') {
    return { ok: true, updated: 0, skipped_reason: `status_${channel.status}` }
  }

  const config = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!config.instance_id || !config.token) return { ok: false, error: 'no_credentials' }

  const webhookSecret = typeof config.webhook_secret === 'string' ? config.webhook_secret : null
  if (!webhookSecret) return { ok: false, error: 'no_webhook_secret' }

  const baseUrl = [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.APP_URL, 'https://app.txoko.com.br']
    .map((url) => url?.replace(/\/$/, ''))
    .find((url) => !!url && !url.includes('localhost') && !url.startsWith('http://127.') && url.startsWith('http'))
  if (!baseUrl) return { ok: true, updated: 0, skipped_reason: 'no_public_url' }

  const webhookUrl = `${baseUrl}/api/webhooks/zapi/${channelId}?s=${webhookSecret}`
  const notifySentByMe = typeof config.notify_sent_by_me !== 'boolean' || config.notify_sent_by_me

  try {
    const client = new ZapiClient(config as ZapiChannelConfig)
    const settled = await Promise.allSettled([
      client.updateEveryWebhooks(webhookUrl, notifySentByMe),
      client.updateWebhookReceived(webhookUrl),
      client.updateWebhookMessageStatus(webhookUrl),
      client.updateWebhookDelivery(webhookUrl),
      client.updateWebhookConnected(webhookUrl),
      client.updateWebhookDisconnected(webhookUrl),
    ])
    const updated = settled.filter((r) => r.status === 'fulfilled' && r.value?.value === true).length
    const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (updated === 0 && failures.length > 0) {
      const reason: unknown = failures[0].reason
      return { ok: false, error: reason instanceof Error ? reason.message.slice(0, 200) : 'all_failed' }
    }
    return { ok: true, updated }
  } catch (err) {
    return { ok: false, error: (err as Error).message?.slice(0, 200) ?? 'unknown' }
  }
}
