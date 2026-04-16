import type { SupabaseClient } from '@supabase/supabase-js'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'
import { ResendClient, EmailClientError, createResendClient } from './email-client'
import { TwilioClient, SmsClientError, createTwilioClient, toE164 } from './sms-client'
import { renderTemplate, loadTemplateContext } from './template-renderer'

// =============================================================
// Marketing — Dispatch Engine (multi-canal)
// =============================================================
// Processa batch de recipients: carrega template, renderiza por
// customer, envia via Z-API / Resend / Twilio, atualiza status.
// =============================================================

type DispatchConfig = {
  minDelayMs: number // min delay entre mensagens (default 3000)
  maxDelayMs: number // max delay (default 15000)
  batchSize: number  // recipients por batch (default 50)
}

const DEFAULT_CONFIG: DispatchConfig = {
  minDelayMs: 3000,
  maxDelayMs: 15000,
  batchSize: 50,
}

/**
 * Gera delay gaussiano entre min e max (distribuicao mais natural que uniform).
 */
function humanizedDelay(min: number, max: number): number {
  // Box-Muller para normal distribution, clamped a [min, max]
  const u1 = Math.random()
  const u2 = Math.random()
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const mean = (min + max) / 2
  const stddev = (max - min) / 4 // 95% dentro do range
  const value = mean + stddev * normal
  return Math.max(min, Math.min(max, Math.round(value)))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type DispatchResult = {
  campaignId: string
  total: number
  sent: number
  failed: number
  skipped: number
  errors: Array<{ customerId: string; error: string }>
}

/**
 * Despacha um batch de recipients de uma campanha via WhatsApp.
 * Chamado pelo campaign launcher/scheduler.
 */
export async function dispatchWhatsAppBatch(
  supabase: SupabaseClient,
  input: {
    campaignId: string
    restaurantId: string
    channelId: string
    templateBody: string
    templateImageUrl?: string | null
    templateDocumentUrl?: string | null
    templateDocumentExt?: string | null
    templateLinkUrl?: string | null
    templateLinkTitle?: string | null
    templateLinkDescription?: string | null
    aiVariations?: string[] // pre-generated variations
    config?: Partial<DispatchConfig>
  }
): Promise<DispatchResult> {
  const cfg = { ...DEFAULT_CONFIG, ...input.config }
  const result: DispatchResult = {
    campaignId: input.campaignId,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  // Load channel config
  const { data: channel } = await supabase
    .from('channels')
    .select('id, type, config, status')
    .eq('id', input.channelId)
    .maybeSingle()

  if (!channel || channel.type !== 'whatsapp_zapi' || channel.status !== 'active') {
    throw new Error('Canal WhatsApp nao esta ativo')
  }

  const zapiConfig = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!zapiConfig.instance_id || !zapiConfig.token) {
    throw new Error('Canal Z-API sem credenciais configuradas')
  }
  const client = new ZapiClient(zapiConfig as ZapiChannelConfig)

  // Load pending recipients
  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('id, customer_id, contact_id, variant_index')
    .eq('campaign_id', input.campaignId)
    .eq('status', 'queued')
    .order('created_at')
    .limit(cfg.batchSize)

  if (!recipients || recipients.length === 0) return result
  result.total = recipients.length

  // Load opt-outs for this restaurant
  const { data: optOuts } = await supabase
    .from('opt_outs')
    .select('customer_id')
    .eq('restaurant_id', input.restaurantId)
    .in('channel', ['whatsapp', 'all'])

  const optOutSet = new Set((optOuts ?? []).map((o) => o.customer_id as string))

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!
    const recipientId = recipient.id as string
    const customerId = recipient.customer_id as string

    // Check opt-out
    if (optOutSet.has(customerId)) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'opted_out' })
        .eq('id', recipientId)
      result.skipped++
      continue
    }

    // Resolve phone via contact_identities
    const { data: identity } = await supabase
      .from('contact_identities')
      .select('external_id')
      .eq('contact_id', recipient.contact_id)
      .eq('channel_id', input.channelId)
      .maybeSingle()

    if (!identity) {
      // Fallback: try customer phone directly
      const { data: customer } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', customerId)
        .maybeSingle()

      if (!customer?.phone) {
        await supabase
          .from('campaign_recipients')
          .update({
            status: 'skipped',
            failure_reason: 'Sem telefone cadastrado',
          })
          .eq('id', recipientId)
        result.skipped++
        continue
      }
    }

    const phone =
      (identity?.external_id as string) ??
      (
        await supabase
          .from('customers')
          .select('phone')
          .eq('id', customerId)
          .maybeSingle()
      ).data?.phone

    if (!phone) {
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'skipped',
          failure_reason: 'Sem telefone',
        })
        .eq('id', recipientId)
      result.skipped++
      continue
    }

    // Mark as sending
    await supabase
      .from('campaign_recipients')
      .update({ status: 'sending' })
      .eq('id', recipientId)

    try {
      // Load template context and render
      const ctx = await loadTemplateContext(
        supabase,
        customerId,
        input.restaurantId
      )

      // Select body: use AI variation if available, else original
      const baseBody =
        input.aiVariations &&
        input.aiVariations.length > 0 &&
        recipient.variant_index != null
          ? input.aiVariations[
              (recipient.variant_index as number) %
                input.aiVariations.length
            ]!
          : input.templateBody

      const renderedBody = renderTemplate(baseBody, ctx)

      // Humanized delay (skip for first message)
      const delaySeconds = Math.round(
        humanizedDelay(cfg.minDelayMs, cfg.maxDelayMs) / 1000
      )

      // Send via Z-API
      let zapiResult: { messageId: string }

      if (input.templateImageUrl) {
        zapiResult = await client.sendImage({
          phone: phone as string,
          image: input.templateImageUrl,
          caption: renderedBody,
          delayMessage: i > 0 ? delaySeconds : undefined,
        })
      } else if (input.templateDocumentUrl && input.templateDocumentExt) {
        zapiResult = await client.sendDocument({
          phone: phone as string,
          document: input.templateDocumentUrl,
          extension: input.templateDocumentExt,
          caption: renderedBody,
          delayMessage: i > 0 ? delaySeconds : undefined,
        })
      } else if (input.templateLinkUrl) {
        zapiResult = await client.sendLink({
          phone: phone as string,
          message: renderedBody,
          linkUrl: input.templateLinkUrl,
          title: input.templateLinkTitle ?? '',
          linkDescription: input.templateLinkDescription ?? '',
          image: input.templateImageUrl ?? '',
          delayMessage: i > 0 ? delaySeconds : undefined,
        })
      } else {
        zapiResult = await client.sendText({
          phone: phone as string,
          message: renderedBody,
          delayMessage: i > 0 ? delaySeconds : undefined,
          delayTyping: i > 0 ? Math.min(delaySeconds, 5) : undefined,
        })
      }

      // Mark as sent
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'sent',
          external_message_id: zapiResult.messageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipientId)

      // Log event
      await supabase.from('campaign_events').insert({
        campaign_id: input.campaignId,
        recipient_id: recipientId,
        event_type: 'sent',
        data: {
          channel: 'whatsapp',
          phone,
          messageId: zapiResult.messageId,
          variant_index: recipient.variant_index,
        },
      })

      result.sent++

      // Delay between messages (humanized)
      if (i < recipients.length - 1) {
        await sleep(humanizedDelay(cfg.minDelayMs, cfg.maxDelayMs))
      }
    } catch (e) {
      const errMsg =
        e instanceof ZapiError ? e.message : (e as Error).message

      await supabase
        .from('campaign_recipients')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: errMsg.slice(0, 500),
          retry_count: (recipient as Record<string, unknown>).retry_count
            ? ((recipient as Record<string, unknown>).retry_count as number) +
              1
            : 1,
        })
        .eq('id', recipientId)

      await supabase.from('campaign_events').insert({
        campaign_id: input.campaignId,
        recipient_id: recipientId,
        event_type: 'failed',
        data: { error: errMsg.slice(0, 500) },
      })

      result.failed++
      result.errors.push({ customerId, error: errMsg })

      // If too many consecutive failures, stop the batch (circuit breaker)
      if (result.failed >= 5 && result.sent === 0) {
        throw new Error(
          `Circuit breaker: ${result.failed} falhas consecutivas sem sucesso. Ultimo erro: ${errMsg}`
        )
      }
    }
  }

  return result
}

// =============================================================
// Email dispatch
// =============================================================
export async function dispatchEmailBatch(
  supabase: SupabaseClient,
  input: {
    campaignId: string
    restaurantId: string
    templateSubject: string
    templateHtml: string
    templatePlain?: string
    aiVariations?: string[]
    config?: Partial<DispatchConfig>
  }
): Promise<DispatchResult> {
  const cfg = { ...DEFAULT_CONFIG, ...input.config, minDelayMs: 200, maxDelayMs: 1000 }
  const result: DispatchResult = {
    campaignId: input.campaignId,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  // Load restaurant settings for Resend config
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', input.restaurantId)
    .maybeSingle()

  const resendClient = createResendClient(
    (restaurant?.settings ?? {}) as Record<string, unknown>
  )
  if (!resendClient) {
    throw new Error('Resend nao configurado. Adicione API key em Configuracoes.')
  }

  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('id, customer_id, variant_index')
    .eq('campaign_id', input.campaignId)
    .eq('status', 'queued')
    .order('created_at')
    .limit(cfg.batchSize)

  if (!recipients || recipients.length === 0) return result
  result.total = recipients.length

  const { data: optOuts } = await supabase
    .from('opt_outs')
    .select('customer_id')
    .eq('restaurant_id', input.restaurantId)
    .in('channel', ['email', 'all'])

  const optOutSet = new Set((optOuts ?? []).map((o) => o.customer_id as string))

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!
    const recipientId = recipient.id as string
    const customerId = recipient.customer_id as string

    if (optOutSet.has(customerId)) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'opted_out' })
        .eq('id', recipientId)
      result.skipped++
      continue
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('email, name')
      .eq('id', customerId)
      .maybeSingle()

    if (!customer?.email) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', failure_reason: 'Sem email' })
        .eq('id', recipientId)
      result.skipped++
      continue
    }

    await supabase
      .from('campaign_recipients')
      .update({ status: 'sending' })
      .eq('id', recipientId)

    try {
      const ctx = await loadTemplateContext(supabase, customerId, input.restaurantId)

      const baseHtml =
        input.aiVariations?.length && recipient.variant_index != null
          ? input.aiVariations[(recipient.variant_index as number) % input.aiVariations.length]!
          : input.templateHtml

      const renderedHtml = renderTemplate(baseHtml, ctx)
      const renderedSubject = renderTemplate(input.templateSubject, ctx)

      const emailResult = await resendClient.send({
        to: customer.email as string,
        subject: renderedSubject,
        html: renderedHtml,
        text: input.templatePlain
          ? renderTemplate(input.templatePlain, ctx)
          : undefined,
      })

      await supabase
        .from('campaign_recipients')
        .update({
          status: 'sent',
          external_message_id: emailResult.id,
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipientId)

      result.sent++

      if (i < recipients.length - 1) {
        await sleep(humanizedDelay(cfg.minDelayMs, cfg.maxDelayMs))
      }
    } catch (e) {
      const errMsg = e instanceof EmailClientError ? e.message : (e as Error).message
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: errMsg.slice(0, 500),
        })
        .eq('id', recipientId)
      result.failed++
      result.errors.push({ customerId, error: errMsg })
      if (result.failed >= 5 && result.sent === 0) {
        throw new Error(`Circuit breaker email: ${errMsg}`)
      }
    }
  }

  return result
}

// =============================================================
// SMS dispatch
// =============================================================
export async function dispatchSmsBatch(
  supabase: SupabaseClient,
  input: {
    campaignId: string
    restaurantId: string
    templateBody: string
    aiVariations?: string[]
    config?: Partial<DispatchConfig>
  }
): Promise<DispatchResult> {
  const cfg = { ...DEFAULT_CONFIG, ...input.config, minDelayMs: 500, maxDelayMs: 2000 }
  const result: DispatchResult = {
    campaignId: input.campaignId,
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', input.restaurantId)
    .maybeSingle()

  const twilioClient = createTwilioClient(
    (restaurant?.settings ?? {}) as Record<string, unknown>
  )
  if (!twilioClient) {
    throw new Error('Twilio nao configurado. Adicione credenciais em Configuracoes.')
  }

  const { data: recipients } = await supabase
    .from('campaign_recipients')
    .select('id, customer_id, variant_index')
    .eq('campaign_id', input.campaignId)
    .eq('status', 'queued')
    .order('created_at')
    .limit(cfg.batchSize)

  if (!recipients || recipients.length === 0) return result
  result.total = recipients.length

  const { data: optOuts } = await supabase
    .from('opt_outs')
    .select('customer_id')
    .eq('restaurant_id', input.restaurantId)
    .in('channel', ['sms', 'all'])

  const optOutSet = new Set((optOuts ?? []).map((o) => o.customer_id as string))

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!
    const recipientId = recipient.id as string
    const customerId = recipient.customer_id as string

    if (optOutSet.has(customerId)) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'opted_out' })
        .eq('id', recipientId)
      result.skipped++
      continue
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('phone')
      .eq('id', customerId)
      .maybeSingle()

    if (!customer?.phone) {
      await supabase
        .from('campaign_recipients')
        .update({ status: 'skipped', failure_reason: 'Sem telefone' })
        .eq('id', recipientId)
      result.skipped++
      continue
    }

    await supabase
      .from('campaign_recipients')
      .update({ status: 'sending' })
      .eq('id', recipientId)

    try {
      const ctx = await loadTemplateContext(supabase, customerId, input.restaurantId)

      const baseBody =
        input.aiVariations?.length && recipient.variant_index != null
          ? input.aiVariations[(recipient.variant_index as number) % input.aiVariations.length]!
          : input.templateBody

      const rendered = renderTemplate(baseBody, ctx)

      const smsResult = await twilioClient.send({
        to: toE164(customer.phone as string),
        body: rendered,
      })

      await supabase
        .from('campaign_recipients')
        .update({
          status: 'sent',
          external_message_id: smsResult.sid,
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipientId)

      result.sent++

      if (i < recipients.length - 1) {
        await sleep(humanizedDelay(cfg.minDelayMs, cfg.maxDelayMs))
      }
    } catch (e) {
      const errMsg = e instanceof SmsClientError ? e.message : (e as Error).message
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: errMsg.slice(0, 500),
        })
        .eq('id', recipientId)
      result.failed++
      result.errors.push({ customerId, error: errMsg })
      if (result.failed >= 5 && result.sent === 0) {
        throw new Error(`Circuit breaker SMS: ${errMsg}`)
      }
    }
  }

  return result
}
