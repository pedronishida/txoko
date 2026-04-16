import { NextResponse, after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { ingestInboundMessage } from '@/lib/server/inbox-ingest'
import {
  mirrorContactAvatar,
  mirrorMessageAttachments,
  type AttachmentInput,
} from '@/lib/server/inbox-media'
import { runClassifyConversation } from '@/lib/server/ai/run-classify'
import { shouldClassify } from '@/lib/server/ai/classify-conversation'
import { generateAutoReply } from '@/lib/server/ai/auto-agent'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'
import type {
  ZapiConnectedPayload,
  ZapiDeliveryPayload,
  ZapiDisconnectedPayload,
  ZapiMessageStatusPayload,
  ZapiPresencePayload,
  ZapiReceivedPayload,
  ZapiWebhookEvent,
} from '@/lib/server/zapi/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =============================================================
// Z-API Webhook — ponto unico pra TODOS os eventos
// =============================================================
// URL: /api/webhooks/zapi/<channelId>?s=<secret>
// Configurado no Z-API via update-every-webhooks (notifySentByMe: true)
// Dispatch pelo campo `type` do payload.
// =============================================================

function extractBodyAndAttachments(p: ZapiReceivedPayload): {
  body: string | null
  attachments: unknown[]
} {
  if (p.text?.message) {
    return { body: p.text.message, attachments: [] }
  }
  if (p.image?.imageUrl) {
    return {
      body: p.image.caption ?? '[imagem]',
      attachments: [
        {
          type: 'image',
          url: p.image.imageUrl,
          mimeType: p.image.mimeType,
          width: p.image.width,
          height: p.image.height,
        },
      ],
    }
  }
  if (p.audio?.audioUrl) {
    return {
      body: p.audio.ptt ? '[audio]' : '[audio]',
      attachments: [
        {
          type: 'audio',
          url: p.audio.audioUrl,
          mimeType: p.audio.mimeType,
          seconds: p.audio.seconds,
          ptt: p.audio.ptt ?? false,
        },
      ],
    }
  }
  if (p.video?.videoUrl) {
    return {
      body: p.video.caption ?? '[video]',
      attachments: [
        {
          type: 'video',
          url: p.video.videoUrl,
          mimeType: p.video.mimeType,
          seconds: p.video.seconds,
        },
      ],
    }
  }
  if (p.document?.documentUrl) {
    return {
      body: p.document.title ?? p.document.fileName ?? '[documento]',
      attachments: [
        {
          type: 'document',
          url: p.document.documentUrl,
          mimeType: p.document.mimeType,
          fileName: p.document.fileName ?? p.document.title,
          pageCount: p.document.pageCount,
        },
      ],
    }
  }
  if (p.sticker?.stickerUrl) {
    return {
      body: '[sticker]',
      attachments: [{ type: 'sticker', url: p.sticker.stickerUrl }],
    }
  }
  if (p.location) {
    return {
      body: `[localizacao] ${p.location.address ?? ''}`.trim(),
      attachments: [
        {
          type: 'location',
          latitude: p.location.latitude,
          longitude: p.location.longitude,
          address: p.location.address,
          url: p.location.url,
        },
      ],
    }
  }
  if (p.contact) {
    return {
      body: `[contato] ${p.contact.displayName ?? ''}`.trim(),
      attachments: [{ type: 'contact', vcard: p.contact.vCard, name: p.contact.displayName }],
    }
  }
  if (p.buttonsResponseMessage) {
    return { body: p.buttonsResponseMessage.message, attachments: [] }
  }
  if (p.listResponseMessage) {
    return { body: p.listResponseMessage.message, attachments: [] }
  }
  return { body: null, attachments: [] }
}

async function handleReceived(
  supabase: SupabaseClient,
  channel: { id: string; restaurant_id: string; config: unknown },
  payload: ZapiReceivedPayload
) {
  // MVP: ignorar grupos e newsletters (Z-API)
  if (payload.isGroup) return { ignored: 'group' }
  if (payload.isNewsletter) return { ignored: 'newsletter' }
  // Ignorar ecos de mensagens que nos mesmos enviamos (fromMe via Z-API)
  // mas somente se for uma mensagem que ja esta no banco via sendMessage action.
  // Se for fromMe mas nao esta no banco, significa que o usuario atendeu
  // pelo celular — registrar como outbound do canal.
  if (payload.fromMe) {
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('external_message_id', payload.messageId)
      .maybeSingle()
    if (existing) return { ignored: 'echo_of_sent' }

    const { body, attachments } = extractBodyAndAttachments(payload)
    // Resolve conversa por contact_identity do destinatario
    const { data: identity } = await supabase
      .from('contact_identities')
      .select('contact_id')
      .eq('channel_id', channel.id)
      .eq('external_id', payload.phone)
      .maybeSingle()

    if (!identity) return { ignored: 'fromMe_no_identity' }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('restaurant_id', channel.restaurant_id)
      .eq('channel_id', channel.id)
      .eq('contact_id', identity.contact_id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!conv) return { ignored: 'fromMe_no_conversation' }

    await supabase.from('messages').insert({
      conversation_id: conv.id,
      direction: 'outbound',
      sender_type: 'agent',
      body,
      attachments,
      external_message_id: payload.messageId,
      status: 'sent',
      created_at: payload.momment ? new Date(payload.momment).toISOString() : undefined,
    })
    return { ok: true, mirrored_from_phone: true }
  }

  // Reacao: registrar como evento, nao como mensagem nova
  if (payload.reaction && payload.reaction.referencedMessage) {
    const ref = payload.reaction.referencedMessage
    const { data: refMsg } = await supabase
      .from('messages')
      .select('id, conversation_id')
      .eq('external_message_id', ref.messageId)
      .maybeSingle()
    if (refMsg) {
      await supabase.from('conversation_events').insert({
        conversation_id: refMsg.conversation_id,
        type: 'tagged', // reuso do enum, com data indicando reaction
        data: {
          kind: 'reaction',
          message_id: refMsg.id,
          value: payload.reaction.value,
          removed: payload.reaction.value === '',
        },
      })
    }
    return { ok: true, kind: 'reaction' }
  }

  const { body, attachments } = extractBodyAndAttachments(payload)

  const result = await ingestInboundMessage(supabase, {
    restaurantId: channel.restaurant_id,
    channelId: channel.id,
    channelType: 'whatsapp_zapi',
    externalContactId: payload.phone,
    externalMessageId: payload.messageId,
    externalThreadId: payload.phone,
    contactDisplayName: payload.senderName ?? payload.chatName ?? null,
    contactAvatarUrl: payload.senderPhoto ?? null,
    body,
    attachments,
    occurredAt: payload.momment ? new Date(payload.momment).toISOString() : undefined,
  })

  if (!result.ok) return { error: result.error }

  // Espelha midia para Supabase Storage (sincrono mas em paralelo).
  // As URLs Z-API expiram em ~30 dias — este mirror garante permanencia.
  if (result.created && attachments.length > 0) {
    await mirrorMessageAttachments(supabase, {
      messageId: result.messageId,
      restaurantId: channel.restaurant_id,
      conversationId: result.conversationId,
      attachments: attachments as AttachmentInput[],
    })
  }

  // Espelha avatar do contato (senderPhoto expira em 48h).
  // Apenas na criacao do contato — atualizacoes posteriores so se mudar.
  if (result.contactCreated && payload.senderPhoto && result.contactId) {
    await mirrorContactAvatar(supabase, {
      contactId: result.contactId,
      restaurantId: channel.restaurant_id,
      avatarUrl: payload.senderPhoto,
    })
  }

  // Auto-classificar conversa quando atingir marcos de mensagens
  if (result.created) {
    await maybeAutoClassify(supabase, result.conversationId)
  }

  // Auto-agente IA: responde mensagens inbound automaticamente se habilitado
  if (result.created && !payload.fromMe) {
    // Carrega dados necessarios para verificar se auto-agente esta ativo
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, ai_paused, restaurant_id')
      .eq('id', result.conversationId)
      .maybeSingle()

    if (convData && !convData.ai_paused) {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('ai_agent_enabled, ai_agent_config, name')
        .eq('id', convData.restaurant_id as string)
        .maybeSingle()

      if (restaurant?.ai_agent_enabled) {
        after(async () => {
          await runAutoAgent(supabase, {
            conversationId: result.conversationId,
            restaurantId: convData.restaurant_id as string,
            channel,
            contactExternalId: payload.phone,
            restaurant: restaurant as {
              ai_agent_config: Record<string, unknown>
              name: string
            },
          })
        })
      }
    }
  }

  return { ok: true, conversationId: result.conversationId, messageId: result.messageId }
}

async function runAutoAgent(
  supabase: SupabaseClient,
  opts: {
    conversationId: string
    restaurantId: string
    channel: { id: string; restaurant_id: string; config: unknown }
    contactExternalId: string
    restaurant: { ai_agent_config: Record<string, unknown>; name: string }
  }
) {
  try {
    const agentConfig = opts.restaurant.ai_agent_config ?? {}
    const persona =
      typeof agentConfig.persona === 'string'
        ? agentConfig.persona
        : `Assistente virtual amigavel do ${opts.restaurant.name}`
    const escalateKeywords = Array.isArray(agentConfig.escalate_keywords)
      ? (agentConfig.escalate_keywords as string[])
      : ['reclamacao', 'cancelar', 'gerente', 'reembolso', 'reclamação']
    const minConfidence =
      typeof agentConfig.min_confidence === 'number'
        ? agentConfig.min_confidence
        : 0.7

    // Carrega mensagens recentes da conversa
    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('direction, body, created_at')
      .eq('conversation_id', opts.conversationId)
      .order('created_at', { ascending: true })
      .limit(20)

    if (msgErr || !messages) return

    // Carrega entradas da base de conhecimento habilitadas
    const { data: knowledgeEntries } = await supabase
      .from('ai_knowledge_entries')
      .select('title, content, category')
      .eq('restaurant_id', opts.restaurantId)
      .eq('enabled', true)
      .order('created_at', { ascending: true })

    const typedMessages = (messages as Array<{
      direction: string
      body: string | null
      created_at: string
    }>).map((m) => ({
      direction: m.direction as 'inbound' | 'outbound',
      body: m.body,
      created_at: m.created_at,
    }))

    const result = await generateAutoReply({
      messages: typedMessages,
      knowledgeEntries: (knowledgeEntries ?? []) as Array<{
        title: string
        content: string
        category: string | null
      }>,
      restaurantName: opts.restaurant.name,
      persona,
      escalateKeywords,
      minConfidence,
    })

    if (result.action === 'reply') {
      // Envia resposta via Z-API
      const cfg = (opts.channel.config ?? {}) as Partial<ZapiChannelConfig>
      let externalMessageId: string | null = null

      if (cfg.instance_id && cfg.token) {
        try {
          const zapiClient = new ZapiClient(cfg as ZapiChannelConfig)
          const sendRes = await zapiClient.sendText({
            phone: opts.contactExternalId,
            message: result.text,
          })
          externalMessageId = sendRes.messageId
        } catch (e) {
          // Se falhar o envio, nao registra a mensagem
          const msg = e instanceof ZapiError ? e.message : (e as Error).message
          console.error('[auto-agent] zapi send error:', msg)
          return
        }
      }

      // Insere mensagem do bot no banco
      await supabase.from('messages').insert({
        conversation_id: opts.conversationId,
        direction: 'outbound',
        sender_type: 'bot',
        body: result.text,
        external_message_id: externalMessageId,
        status: externalMessageId ? 'pending' : 'sent',
      })

      // Atualiza unread_count = 0 e registra evento
      await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('id', opts.conversationId)

      await supabase.from('conversation_events').insert({
        conversation_id: opts.conversationId,
        type: 'bot_replied',
        data: {
          confidence: result.confidence,
          model: 'claude-haiku-4-5',
          via_zapi: externalMessageId !== null,
        },
      })
    } else if (result.action === 'escalate') {
      // Eleva prioridade para 'high'
      await supabase
        .from('conversations')
        .update({ priority: 'high' })
        .eq('id', opts.conversationId)

      await supabase.from('conversation_events').insert({
        conversation_id: opts.conversationId,
        type: 'bot_escalated',
        data: { reason: result.reason },
      })
    }
    // action === 'skip': nao faz nada
  } catch (e) {
    // Nao bloqueia nada — auto-agente e best-effort
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    console.error('[auto-agent] error:', msg)
  }
}

async function maybeAutoClassify(supabase: SupabaseClient, conversationId: string) {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)

  const { data: conv } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const metadata = (conv?.metadata ?? {}) as Record<string, unknown>
  const aiMeta = (metadata.ai_classify ?? {}) as Record<string, unknown>
  const lastCount =
    typeof aiMeta.classified_message_count === 'number'
      ? (aiMeta.classified_message_count as number)
      : undefined

  if (!count) return
  if (!shouldClassify(count, lastCount)) return

  // Nao bloqueia o webhook se a classificacao falhar
  try {
    await runClassifyConversation(supabase, conversationId)
  } catch {
    // silencioso — heuristic fallback ja esta dentro do helper
  }
}

async function handleDelivery(
  supabase: SupabaseClient,
  payload: ZapiDeliveryPayload
) {
  // Marca mensagem outbound como "sent" quando o Z-API confirma delivery pro servidor
  const { error } = await supabase
    .from('messages')
    .update({ status: 'sent' })
    .eq('external_message_id', payload.messageId)
  if (error) return { error: error.message }
  return { ok: true }
}

async function handleMessageStatus(
  supabase: SupabaseClient,
  payload: ZapiMessageStatusPayload
) {
  if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
    return { ok: true, ignored: 'no_ids' }
  }

  const mapped: Record<string, string> = {
    SENT: 'sent',
    RECEIVED: 'delivered',
    READ: 'read',
    READ_BY_ME: 'read',
    PLAYED: 'played',
  }
  const status = mapped[payload.status]
  if (!status) return { ok: true, ignored: 'unknown_status' }

  // Z-API so emite MessageStatusCallback para mensagens OUTBOUND que nos enviamos.
  const { error } = await supabase
    .from('messages')
    .update({ status })
    .in('external_message_id', payload.ids)
    .eq('direction', 'outbound')
  if (error) return { error: error.message }

  // Also update campaign_recipients if these messages belong to a campaign
  const now = new Date().toISOString()
  const recipientPatch: Record<string, unknown> = { status }
  if (status === 'delivered') recipientPatch.delivered_at = now
  if (status === 'read') recipientPatch.read_at = now

  await supabase
    .from('campaign_recipients')
    .update(recipientPatch)
    .in('external_message_id', payload.ids)

  return { ok: true, status, count: payload.ids.length }
}

async function handleConnected(
  supabase: SupabaseClient,
  channel: { id: string; config: unknown },
  payload: ZapiConnectedPayload
) {
  const config = (channel.config ?? {}) as Record<string, unknown>
  const nextConfig = {
    ...config,
    connected_phone: payload.phone ?? config.connected_phone ?? null,
  }
  const { error } = await supabase
    .from('channels')
    .update({
      status: 'active',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      config: nextConfig,
    })
    .eq('id', channel.id)
  if (error) return { error: error.message }
  return { ok: true }
}

async function handleDisconnected(
  supabase: SupabaseClient,
  channel: { id: string },
  payload: ZapiDisconnectedPayload
) {
  const { error } = await supabase
    .from('channels')
    .update({
      status: 'disconnected',
      last_error: payload.error ?? 'Desconectado',
    })
    .eq('id', channel.id)
  if (error) return { error: error.message }
  return { ok: true }
}

async function handlePresence(
  supabase: SupabaseClient,
  channel: { id: string; restaurant_id: string },
  payload: ZapiPresencePayload
) {
  // Publica no canal Realtime conversation:<id>:presence para UI reagir
  const { data: identity } = await supabase
    .from('contact_identities')
    .select('contact_id')
    .eq('channel_id', channel.id)
    .eq('external_id', payload.phone)
    .maybeSingle()
  if (!identity) return { ok: true, ignored: 'no_identity' }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('restaurant_id', channel.restaurant_id)
    .eq('contact_id', identity.contact_id)
    .eq('channel_id', channel.id)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conv) return { ok: true, ignored: 'no_conversation' }

  // Persiste no metadata temporariamente — UI faz re-render via realtime on conversations
  await supabase
    .from('conversations')
    .update({
      metadata: {
        presence: {
          status: payload.status,
          last_seen: payload.lastSeen ?? null,
          updated_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', conv.id)
  return { ok: true }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params
  const url = new URL(request.url)
  const secret = url.searchParams.get('s') ?? request.headers.get('x-txoko-secret')

  if (!secret) {
    return NextResponse.json({ error: 'missing secret' }, { status: 401 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const { data: channel, error: channelErr } = await supabase
    .from('channels')
    .select('id, restaurant_id, type, config, status')
    .eq('id', channelId)
    .maybeSingle()

  if (channelErr || !channel) {
    return NextResponse.json({ error: 'channel not found' }, { status: 404 })
  }
  if (channel.type !== 'whatsapp_zapi') {
    return NextResponse.json({ error: 'wrong channel type' }, { status: 400 })
  }

  const config = (channel.config ?? {}) as Record<string, unknown>
  const expectedSecret =
    typeof config.webhook_secret === 'string' ? config.webhook_secret : null
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 })
  }

  let payload: ZapiWebhookEvent
  try {
    payload = (await request.json()) as ZapiWebhookEvent
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const channelForHandlers = {
    id: channel.id as string,
    restaurant_id: channel.restaurant_id as string,
    config: channel.config,
  }

  try {
    let result: unknown
    switch (payload.type) {
      case 'ReceivedCallback':
        result = await handleReceived(supabase, channelForHandlers, payload)
        break
      case 'DeliveryCallback':
        result = await handleDelivery(supabase, payload)
        break
      case 'MessageStatusCallback':
        result = await handleMessageStatus(supabase, payload)
        break
      case 'ConnectedCallback':
        result = await handleConnected(supabase, channelForHandlers, payload)
        break
      case 'DisconnectedCallback':
        result = await handleDisconnected(supabase, channelForHandlers, payload)
        break
      case 'PresenceChatCallback':
        result = await handlePresence(supabase, channelForHandlers, payload)
        break
      default: {
        // Evento desconhecido: aceita 200 mas loga no canal
        await supabase
          .from('channels')
          .update({
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', channel.id)
        return NextResponse.json({ ok: true, ignored: 'unknown_type' })
      }
    }

    // Debug trail: grava tipo + resultado resumido no last_error pra diagnostico
    const debugInfo = `[${new Date().toISOString()}] type=${payload.type} result=${JSON.stringify(result).slice(0, 200)}`
    await supabase
      .from('channels')
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: debugInfo,
      })
      .eq('id', channel.id)

    return NextResponse.json({ value: true, result })
  } catch (e) {
    const msg = (e as Error).message
    await supabase
      .from('channels')
      .update({ last_error: msg.slice(0, 500) })
      .eq('id', channel.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Z-API pode fazer GET para verificar o endpoint
export async function GET() {
  return NextResponse.json({ service: 'txoko-zapi-webhook', status: 'ok' })
}
