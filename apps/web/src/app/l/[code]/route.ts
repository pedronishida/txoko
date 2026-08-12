/**
 * GET /l/:code — redirect de link rastreado.
 *
 * Resolve o short_code, registra o clique (fire-and-forget) e propaga
 * UTMs da URL curta pra URL de destino. Codigo invalido/expirado
 * redireciona pro site.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  detectDeviceType,
  hashIp,
  isBotUserAgent,
  recordLinkClick,
  resolveTrackedLink,
} from '@/lib/server/tracked-links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.txoko.com.br'

function getClientIp(req: NextRequest): string | null {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded
    ? (forwarded.split(',')[0]?.trim() ?? null)
    : (req.headers.get('x-real-ip') ?? null)
}

function appendMissingUtms(targetUrl: string, shortUrl: URL): string {
  let url: URL
  try {
    url = new URL(targetUrl)
  } catch {
    return targetUrl
  }
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    if (url.searchParams.has(key)) continue
    const value = shortUrl.searchParams.get(key)
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  if (!code || code.length < 4 || code.length > 24 || !/^[A-Za-z0-9]+$/.test(code)) {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 })
  }

  let supabase: ReturnType<typeof createServiceClient>
  try {
    supabase = createServiceClient()
  } catch {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 })
  }

  const link = await resolveTrackedLink(supabase, code)
  if (!link) return NextResponse.redirect(FALLBACK_URL, { status: 302 })

  const { data: linkRow } = await supabase
    .from('tracked_links')
    .select('restaurant_id')
    .eq('id', link.id)
    .maybeSingle()
  const restaurantId = (linkRow?.restaurant_id as string | undefined) ?? null

  const requestUrl = new URL(req.url)
  const userAgent = req.headers.get('user-agent')
  const referrer = req.headers.get('referer')
  const ip = getClientIp(req)
  const geo = {
    country: req.headers.get('cf-ipcountry'),
    city: req.headers.get('cf-ipcity'),
  }
  const isBot = isBotUserAgent(userAgent)
  const deviceType = detectDeviceType(userAgent)

  if (restaurantId) {
    recordLinkClick(supabase, {
      trackedLinkId: link.id,
      restaurantId,
      ipHash: ip ? hashIp(ip) : null,
      userAgent,
      referrer,
      country: geo.country,
      city: geo.city,
      isBot,
      deviceType,
      utm: {
        source: requestUrl.searchParams.get('utm_source'),
        medium: requestUrl.searchParams.get('utm_medium'),
        campaign: requestUrl.searchParams.get('utm_campaign'),
        content: requestUrl.searchParams.get('utm_content'),
        term: requestUrl.searchParams.get('utm_term'),
      },
    }).catch((err) => {
      console.error('[tracked-links] register click failed', err)
    })
  }

  const destination = appendMissingUtms(link.target_url, requestUrl)
  return NextResponse.redirect(destination, { status: 302 })
}
