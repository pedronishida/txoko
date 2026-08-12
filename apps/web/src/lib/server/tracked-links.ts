import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Tracked links — short links /l/:code com registro de cliques
// =============================================================
// Tabelas: tracked_links (short_code -> target_url) e link_clicks.
// Usado pelo redirect /l/[code], pelo tracking do cardapio e por
// campanhas de marketing (applyTrackedLinks).
// =============================================================

const SHORT_CODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export type DeviceType = 'tablet' | 'mobile' | 'desktop'

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true
  const ua = userAgent.toLowerCase()
  return [
    'bot',
    'spider',
    'crawler',
    'preview',
    'whatsapp',
    'telegrambot',
    'slackbot',
    'twitterbot',
    'facebookexternalhit',
    'linkedinbot',
    'discordbot',
    'embedly',
    'curl',
    'wget',
    'python-requests',
    'go-http-client',
    'okhttp',
    'pingdom',
    'uptimerobot',
    'monitor',
  ].some((pattern) => ua.includes(pattern))
}

export function detectDeviceType(
  userAgent: string | null | undefined
): DeviceType | null {
  if (!userAgent) return null
  const ua = userAgent.toLowerCase()
  return /(ipad|tablet|playbook|silk)/i.test(ua)
    ? 'tablet'
    : /(mobile|iphone|android|blackberry|windows phone|opera mini)/i.test(ua)
      ? 'mobile'
      : 'desktop'
}

function generateShortCode(length = 10): string {
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length]
  }
  return code
}

function buildShortLinkUrl(baseUrl: string, shortCode: string): string {
  return `${baseUrl.replace(/\/$/, '')}/l/${shortCode}`
}

export type CreateTrackedLinkInput = {
  restaurantId: string
  campaignId?: string | null
  recipientId?: string | null
  customerId?: string | null
  targetUrl: string
  source?: string
  label?: string | null
  expiresAt?: Date | null
  metadata?: Record<string, unknown>
}

export type CreatedTrackedLink = {
  id: string
  shortCode: string
  url: string
}

export async function createTrackedLink(
  supabase: SupabaseClient,
  input: CreateTrackedLinkInput,
  baseUrl: string
): Promise<CreatedTrackedLink> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = generateShortCode()
    const { data, error } = await supabase
      .from('tracked_links')
      .insert({
        restaurant_id: input.restaurantId,
        campaign_id: input.campaignId ?? null,
        recipient_id: input.recipientId ?? null,
        customer_id: input.customerId ?? null,
        short_code: shortCode,
        target_url: input.targetUrl,
        source: input.source ?? 'manual',
        label: input.label ?? null,
        expires_at: input.expiresAt?.toISOString() ?? null,
        metadata: input.metadata ?? {},
      })
      .select('id, short_code')
      .single()

    if (error) {
      // 23505 = unique_violation (colisao de short_code) — tenta outro
      if (error.code === '23505') continue
      throw error
    }

    return {
      id: data.id as string,
      shortCode: data.short_code as string,
      url: buildShortLinkUrl(baseUrl, data.short_code as string),
    }
  }
  throw new Error('Nao foi possivel gerar short_code unico apos varias tentativas')
}

export type ResolvedTrackedLink = {
  id: string
  short_code: string
  target_url: string
  campaign_id: string | null
  recipient_id: string | null
}

type TrackedLinkRow = ResolvedTrackedLink & {
  is_disabled: boolean
  expires_at: string | null
  restaurant_id: string
}

export async function resolveTrackedLink(
  supabase: SupabaseClient,
  shortCode: string
): Promise<ResolvedTrackedLink | null> {
  const { data } = await supabase
    .from('tracked_links')
    .select(
      'id, short_code, target_url, campaign_id, recipient_id, is_disabled, expires_at, restaurant_id'
    )
    .eq('short_code', shortCode)
    .maybeSingle()

  const link = data as TrackedLinkRow | null
  if (!link) return null
  if (link.is_disabled || (link.expires_at && new Date(link.expires_at) < new Date())) {
    return null
  }
  return {
    id: link.id,
    short_code: link.short_code,
    target_url: link.target_url,
    campaign_id: link.campaign_id,
    recipient_id: link.recipient_id,
  }
}

export type LinkClickUtm = {
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
  term?: string | null
}

export type RecordLinkClickInput = {
  trackedLinkId: string
  restaurantId: string
  ipHash?: string | null
  userAgent?: string | null
  referrer?: string | null
  country?: string | null
  city?: string | null
  isBot?: boolean
  utm?: LinkClickUtm
  deviceType?: DeviceType | null
}

export async function recordLinkClick(
  supabase: SupabaseClient,
  input: RecordLinkClickInput
): Promise<void> {
  await supabase.from('link_clicks').insert({
    tracked_link_id: input.trackedLinkId,
    restaurant_id: input.restaurantId,
    ip_hash: input.ipHash ?? null,
    user_agent: input.userAgent ?? null,
    referrer: input.referrer ?? null,
    country: input.country ?? null,
    city: input.city ?? null,
    is_bot: input.isBot ?? false,
    utm_source: input.utm?.source ?? null,
    utm_medium: input.utm?.medium ?? null,
    utm_campaign: input.utm?.campaign ?? null,
    utm_content: input.utm?.content ?? null,
    utm_term: input.utm?.term ?? null,
    device_type: input.deviceType ?? null,
  })
}

const URL_REGEX = /(https?:\/\/[^\s<>"')]+)/gi

export function replaceUrls(text: string, replacements: Map<string, string>): string {
  return text.replace(URL_REGEX, (url) => replacements.get(url) ?? url)
}

export function extractUrls(...texts: Array<string | null | undefined>): string[] {
  const urls = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    const matches = text.match(URL_REGEX)
    if (matches) {
      for (const url of matches) urls.add(url)
    }
  }
  return Array.from(urls)
}

function isShortLink(url: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(url)
    const base = new URL(baseUrl)
    return parsed.host === base.host && parsed.pathname.startsWith('/l/')
  } catch {
    return false
  }
}

export type ApplyTrackedLinksInput = {
  restaurantId: string
  campaignId?: string | null
  recipientId?: string | null
  customerId?: string | null
  urls: string[]
  baseUrl: string
  source?: string
}

/**
 * Gera short links pra cada URL e retorna o mapa original -> encurtada.
 * URLs que ja sao short links proprios (/l/...) sao ignoradas.
 */
export async function applyTrackedLinks(
  supabase: SupabaseClient,
  input: ApplyTrackedLinksInput
): Promise<Map<string, string>> {
  const replacements = new Map<string, string>()
  const targets = input.urls.filter((url) => url && !isShortLink(url, input.baseUrl))
  if (targets.length === 0) return replacements

  for (const targetUrl of targets) {
    try {
      const { url } = await createTrackedLink(
        supabase,
        {
          restaurantId: input.restaurantId,
          campaignId: input.campaignId ?? null,
          recipientId: input.recipientId ?? null,
          customerId: input.customerId ?? null,
          targetUrl,
          source: input.source ?? 'campaign',
        },
        input.baseUrl
      )
      replacements.set(targetUrl, url)
    } catch (err) {
      console.error('[tracked-links] applyTrackedLinks failed for', targetUrl, err)
    }
  }
  return replacements
}
