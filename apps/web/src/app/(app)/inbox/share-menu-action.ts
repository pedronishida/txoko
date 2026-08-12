'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createTrackedLink } from '@/lib/server/tracked-links'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'

// =============================================================
// Compartilhar cardapio pelo inbox (link curto trackeavel + Z-API)
// =============================================================

const enviarCardapioSchema = z.object({
  conversationId: z.string().uuid(),
  caption: z.string().max(500).optional(),
})

export async function enviarCardapio(input: {
  conversationId: string
  caption?: string
}) {
  const parsed = enviarCardapioSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'nao autenticado' }

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select(
      `id, channel_id, contact_id,
       channel:channels(id, type, config, status, restaurant_id)`
    )
    .eq('id', parsed.data.conversationId)
    .maybeSingle()

  if (convErr || !conv) return { error: convErr?.message ?? 'Conversa nao encontrada' }

  const channel = (Array.isArray(conv.channel) ? conv.channel[0] : conv.channel) as {
    id: string
    type: string
    config: Partial<ZapiChannelConfig> | null
    status: string
    restaurant_id: string
  } | null

  if (!channel || channel.type !== 'whatsapp_zapi' || channel.status !== 'active') {
    return { error: 'Canal WhatsApp nao esta ativo' }
  }

  const restaurantId = channel.restaurant_id

  const { data: identity } = await supabase
    .from('contact_identities')
    .select('external_id')
    .eq('contact_id', conv.contact_id)
    .eq('channel_id', conv.channel_id)
    .maybeSingle()

  if (!identity?.external_id) return { error: 'Contato sem identidade WhatsApp' }

  const { data: contact } = await supabase
    .from('contacts')
    .select('customer_id')
    .eq('id', conv.contact_id)
    .maybeSingle()
  const customerId: string | null = contact?.customer_id ?? null

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug, name')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant?.slug) return { error: 'Restaurante sem slug publico configurado' }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!baseUrl) return { error: 'NEXT_PUBLIC_SITE_URL nao configurado' }

  const target = new URL(`/menu/${restaurant.slug}`, baseUrl)
  if (customerId) target.searchParams.set('cu', customerId)
  target.searchParams.set('s', 'menu_share')

  let shortUrl: string
  try {
    const link = await createTrackedLink(
      supabase,
      {
        restaurantId,
        customerId,
        targetUrl: target.toString(),
        source: 'menu_share',
        label: 'Cardapio compartilhado via inbox',
        metadata: {
          conversation_id: parsed.data.conversationId,
          sent_by_user: user.id,
        },
      },
      baseUrl
    )
    shortUrl = link.url
  } catch (e) {
    return { error: `Falha ao criar link: ${(e as Error).message}` }
  }

  const defaultMessage = `Da uma olhada no nosso cardapio: ${shortUrl}`
  const message = parsed.data.caption
    ? `${parsed.data.caption.trim()}\n\n${shortUrl}`
    : defaultMessage

  const cfg = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!cfg.instance_id || !cfg.token) {
    return { error: 'Z-API sem credenciais configuradas' }
  }

  let externalMessageId: string | null = null
  let initialStatus: 'pending' | 'sent' = 'sent'
  try {
    const client = new ZapiClient(cfg as ZapiChannelConfig)
    const res = await client.sendLink({
      phone: identity.external_id,
      message,
      linkUrl: shortUrl,
      title: `Cardapio ${restaurant.name ?? ''}`.trim(),
      linkDescription: 'Faca seu pedido por aqui',
      image: '',
    })
    externalMessageId = res.messageId
    initialStatus = 'pending'
  } catch (e) {
    const msg = e instanceof ZapiError ? e.message : (e as Error).message
    return { error: `Z-API: ${msg}` }
  }

  const { error: insertErr } = await supabase.from('messages').insert({
    conversation_id: parsed.data.conversationId,
    direction: 'outbound',
    sender_type: 'agent',
    sender_user_id: user.id,
    body: message,
    external_message_id: externalMessageId,
    status: initialStatus,
  })

  if (insertErr) {
    return { error: `Mensagem enviada mas nao registrada: ${insertErr.message}` }
  }

  return { ok: true, shortUrl, messageId: externalMessageId }
}
