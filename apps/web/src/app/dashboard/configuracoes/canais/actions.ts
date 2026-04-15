'use server'

import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { ChannelStatus, ChannelType } from '@txoko/shared'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'

function generateSecret() {
  return randomBytes(24).toString('base64url')
}

async function resolveBaseUrl() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

type LoadedChannel = {
  channel: {
    id: string
    type: string
    status: string
    config: Record<string, unknown>
  }
  config: ZapiChannelConfig
}

async function loadChannelZapi(
  channelId: string
): Promise<LoadedChannel | { loadError: string }> {
  const supabase = await createClient()
  const { data: channel, error } = await supabase
    .from('channels')
    .select('id, type, status, config')
    .eq('id', channelId)
    .maybeSingle()
  if (error || !channel) return { loadError: error?.message ?? 'Canal nao encontrado' }
  if (channel.type !== 'whatsapp_zapi')
    return { loadError: 'Canal nao e do tipo whatsapp_zapi' }
  const config = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!config.instance_id || !config.token)
    return { loadError: 'Configure instance_id e token primeiro' }
  return {
    channel: channel as LoadedChannel['channel'],
    config: config as ZapiChannelConfig,
  }
}

export async function createChannel(input: {
  type: ChannelType
  name: string
  config?: Record<string, unknown>
}) {
  if (input.name.trim().length === 0) return { error: 'Nome obrigatorio' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  const config: Record<string, unknown> = { ...(input.config ?? {}) }
  // Canais com webhook recebem um secret gerado automaticamente
  if (['whatsapp_zapi', 'instagram', 'facebook_messenger'].includes(input.type)) {
    config.webhook_secret = generateSecret()
  }

  const { data, error } = await supabase
    .from('channels')
    .insert({
      restaurant_id,
      type: input.type,
      name: input.name.trim(),
      status: 'pending_setup',
      config,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard/configuracoes/canais')
  return { ok: true, channelId: data?.id as string | undefined }
}

export async function updateChannel(input: {
  id: string
  name?: string
  status?: ChannelStatus
  config?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.status !== undefined) patch.status = input.status
  if (input.config !== undefined) patch.config = input.config

  const { error } = await supabase.from('channels').update(patch).eq('id', input.id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/configuracoes/canais')
  return { ok: true }
}

export async function rotateWebhookSecret(channelId: string) {
  const supabase = await createClient()
  const { data: channel } = await supabase
    .from('channels')
    .select('config')
    .eq('id', channelId)
    .maybeSingle()

  const currentConfig = (channel?.config ?? {}) as Record<string, unknown>
  const newConfig = { ...currentConfig, webhook_secret: generateSecret() }

  const { error } = await supabase
    .from('channels')
    .update({ config: newConfig })
    .eq('id', channelId)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/configuracoes/canais')
  return { ok: true, secret: newConfig.webhook_secret as string }
}

export async function deleteChannel(channelId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('channels').delete().eq('id', channelId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/configuracoes/canais')
  return { ok: true }
}

// =============================================================
// Z-API specific actions
// =============================================================

export async function saveZapiCredentials(input: {
  channelId: string
  instance_id: string
  token: string
  client_token?: string
}) {
  if (!input.instance_id.trim() || !input.token.trim()) {
    return { error: 'instance_id e token sao obrigatorios' }
  }
  const supabase = await createClient()
  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .select('config')
    .eq('id', input.channelId)
    .maybeSingle()
  if (chErr || !channel) return { error: chErr?.message ?? 'Canal nao encontrado' }

  const current = (channel.config ?? {}) as Record<string, unknown>
  const webhook_secret =
    typeof current.webhook_secret === 'string' ? current.webhook_secret : generateSecret()

  const nextConfig: ZapiChannelConfig = {
    provider: 'zapi',
    instance_id: input.instance_id.trim(),
    token: input.token.trim(),
    client_token: input.client_token?.trim() || undefined,
    webhook_secret,
    connected_phone: (current.connected_phone as string) ?? undefined,
    notify_sent_by_me: true,
  }

  const { error } = await supabase
    .from('channels')
    .update({ config: nextConfig })
    .eq('id', input.channelId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/configuracoes/canais')
  return { ok: true }
}

export type ZapiActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function toError(e: unknown): { ok: false; error: string } {
  const msg = e instanceof ZapiError ? e.message : (e as Error).message
  return { ok: false, error: msg }
}

export async function getZapiQrCode(
  channelId: string
): Promise<ZapiActionResult<{ connected: boolean; qr: string | null }>> {
  const loaded = await loadChannelZapi(channelId)
  if ('loadError' in loaded) return { ok: false, error: loaded.loadError }

  try {
    const client = new ZapiClient(loaded.config)
    const status = await client.getStatus()
    if (status.connected) {
      return { ok: true, connected: true, qr: null }
    }
    const qr = await client.getQrCodeImage()
    return { ok: true, connected: false, qr: qr.value }
  } catch (e) {
    return toError(e)
  }
}

export async function getZapiStatus(
  channelId: string
): Promise<ZapiActionResult<{ status: { connected: boolean } }>> {
  const loaded = await loadChannelZapi(channelId)
  if ('loadError' in loaded) return { ok: false, error: loaded.loadError }

  try {
    const client = new ZapiClient(loaded.config)
    const status = await client.getStatus()
    return { ok: true, status: { connected: status.connected } }
  } catch (e) {
    return toError(e)
  }
}

export async function registerZapiWebhooks(
  channelId: string
): Promise<ZapiActionResult<{ webhookUrl: string }>> {
  const loaded = await loadChannelZapi(channelId)
  if ('loadError' in loaded) return { ok: false, error: loaded.loadError }

  const baseUrl = await resolveBaseUrl()
  const webhookUrl = `${baseUrl}/api/webhooks/zapi/${channelId}?s=${loaded.config.webhook_secret}`

  try {
    const client = new ZapiClient(loaded.config)
    await client.updateEveryWebhooks(webhookUrl, true)

    const supabase = await createClient()
    await supabase
      .from('channels')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', channelId)

    revalidatePath('/dashboard/configuracoes/canais')
    return { ok: true, webhookUrl }
  } catch (e) {
    return toError(e)
  }
}

export async function disconnectZapi(
  channelId: string
): Promise<ZapiActionResult<{ disconnected: true }>> {
  const loaded = await loadChannelZapi(channelId)
  if ('loadError' in loaded) return { ok: false, error: loaded.loadError }

  try {
    const client = new ZapiClient(loaded.config)
    await client.disconnect()

    const supabase = await createClient()
    await supabase
      .from('channels')
      .update({ status: 'disconnected' })
      .eq('id', channelId)

    revalidatePath('/dashboard/configuracoes/canais')
    return { ok: true, disconnected: true }
  } catch (e) {
    return toError(e)
  }
}

export async function restartZapi(
  channelId: string
): Promise<ZapiActionResult<{ restarted: true }>> {
  const loaded = await loadChannelZapi(channelId)
  if ('loadError' in loaded) return { ok: false, error: loaded.loadError }

  try {
    const client = new ZapiClient(loaded.config)
    await client.restart()
    return { ok: true, restarted: true }
  } catch (e) {
    return toError(e)
  }
}

export async function syncZapiConnectedPhone(
  channelId: string
): Promise<ZapiActionResult<{ connected: boolean; phone?: string }>> {
  const loaded = await loadChannelZapi(channelId)
  if ('loadError' in loaded) return { ok: false, error: loaded.loadError }

  try {
    const client = new ZapiClient(loaded.config)
    const me = await client.getMe()
    if (me.connected && me.phone) {
      const supabase = await createClient()
      const nextConfig = { ...loaded.config, connected_phone: me.phone }
      await supabase
        .from('channels')
        .update({
          status: 'active',
          config: nextConfig,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', channelId)
    }
    return { ok: true, connected: me.connected, phone: me.phone }
  } catch (e) {
    return toError(e)
  }
}
