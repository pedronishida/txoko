import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  dispatchWhatsAppBatch,
  dispatchEmailBatch,
  dispatchSmsBatch,
} from '@/lib/server/marketing/dispatch'
import { getOrCreateVariations } from '@/lib/server/marketing/variation-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min max for batch processing

// =============================================================
// POST /api/marketing/dispatch
// =============================================================
// Processa um batch de envios de uma campanha.
// Chamado pelo launchCampaign action ou por scheduler (futuro).
// Usa service_role pra bypassar RLS (nao tem user auth context).
// =============================================================

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedKey = process.env.MARKETING_DISPATCH_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: {
    campaignId: string
    batchSize?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Load campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, restaurant_id, channel, status')
    .eq('id', body.campaignId)
    .maybeSingle()

  if (campErr || !campaign) {
    return NextResponse.json(
      { error: campErr?.message ?? 'campaign not found' },
      { status: 404 }
    )
  }

  if (campaign.status !== 'running') {
    return NextResponse.json(
      { error: `campaign status is ${campaign.status}, expected running` },
      { status: 400 }
    )
  }

  const restaurantId = campaign.restaurant_id as string

  // Load the first step's template
  const { data: step } = await supabase
    .from('campaign_steps')
    .select('template_id')
    .eq('campaign_id', body.campaignId)
    .eq('step_type', 'send_message')
    .order('step_order')
    .limit(1)
    .maybeSingle()

  let templateBody = ''
  let templateImageUrl: string | null = null
  let templateDocumentUrl: string | null = null
  let templateDocumentExt: string | null = null
  let templateLinkUrl: string | null = null
  let templateLinkTitle: string | null = null
  let templateLinkDescription: string | null = null
  let aiVariations: string[] | undefined

  if (step?.template_id) {
    const { data: template } = await supabase
      .from('campaign_templates')
      .select('*')
      .eq('id', step.template_id)
      .maybeSingle()

    if (template) {
      if (campaign.channel === 'whatsapp') {
        templateBody = (template.wa_body as string) ?? ''
        templateImageUrl = template.wa_image_url as string | null
        templateDocumentUrl = template.wa_document_url as string | null
        templateDocumentExt = template.wa_document_ext as string | null
        templateLinkUrl = template.wa_link_url as string | null
        templateLinkTitle = template.wa_link_title as string | null
        templateLinkDescription = template.wa_link_description as string | null
      } else if (campaign.channel === 'sms') {
        templateBody = (template.sms_body as string) ?? ''
      } else if (campaign.channel === 'email') {
        templateBody = (template.email_html as string) ?? ''
      }

      // Load AI variations if enabled
      if (template.ai_variation_enabled && templateBody) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('name')
          .eq('id', restaurantId)
          .maybeSingle()

        const variations = await getOrCreateVariations(
          supabase,
          step.template_id as string,
          campaign.channel as 'whatsapp' | 'email' | 'sms',
          {
            templateBody,
            count: (template.ai_variation_count as number) ?? 5,
            temperature: Number(template.ai_variation_temp ?? 0.7),
            restaurantName: (restaurant?.name as string) ?? 'Restaurante',
          }
        )
        aiVariations = variations.map((v) => v.body)
      }
    }
  }

  // If no template/step, try using campaign description as body (simple broadcast)
  if (!templateBody) {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('description')
      .eq('id', body.campaignId)
      .maybeSingle()
    templateBody = (camp?.description as string) ?? 'Mensagem da campanha'
  }

  // Find WhatsApp channel for this restaurant
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('type', 'whatsapp_zapi')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!channel && campaign.channel === 'whatsapp') {
    // Mark campaign as error
    await supabase
      .from('campaigns')
      .update({
        status: 'error',
        error_message: 'Nenhum canal WhatsApp ativo encontrado',
      })
      .eq('id', body.campaignId)

    return NextResponse.json(
      { error: 'no active whatsapp channel' },
      { status: 400 }
    )
  }

  try {
    let result

    if (campaign.channel === 'whatsapp') {
      result = await dispatchWhatsAppBatch(supabase, {
        campaignId: body.campaignId,
        restaurantId,
        channelId: channel?.id as string,
        templateBody,
        templateImageUrl,
        templateDocumentUrl,
        templateDocumentExt,
        templateLinkUrl,
        templateLinkTitle,
        templateLinkDescription,
        aiVariations,
        config: { batchSize: body.batchSize ?? 50 },
      })
    } else if (campaign.channel === 'email') {
      // Load email template fields
      let emailSubject = ''
      let emailPlain: string | undefined
      if (step?.template_id) {
        const { data: tmpl } = await supabase
          .from('campaign_templates')
          .select('email_subject, email_plain')
          .eq('id', step.template_id)
          .maybeSingle()
        emailSubject = (tmpl?.email_subject as string) ?? 'Novidades do restaurante'
        emailPlain = tmpl?.email_plain as string | undefined
      }

      result = await dispatchEmailBatch(supabase, {
        campaignId: body.campaignId,
        restaurantId,
        templateSubject: emailSubject,
        templateHtml: templateBody,
        templatePlain: emailPlain,
        aiVariations,
        config: { batchSize: body.batchSize ?? 50 },
      })
    } else if (campaign.channel === 'sms') {
      result = await dispatchSmsBatch(supabase, {
        campaignId: body.campaignId,
        restaurantId,
        templateBody,
        aiVariations,
        config: { batchSize: body.batchSize ?? 50 },
      })
    } else {
      return NextResponse.json(
        { error: `unsupported channel: ${campaign.channel}` },
        { status: 400 }
      )
    }

    // Check if all recipients are done
    const { count: pendingCount } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', body.campaignId)
      .in('status', ['pending', 'queued'])

    if (pendingCount === 0) {
      await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', body.campaignId)

      await supabase.from('campaign_events').insert({
        campaign_id: body.campaignId,
        event_type: 'completed',
        data: { ...result },
      })
    }

    return NextResponse.json({ ok: true, result, pendingCount })
  } catch (e) {
    const msg = (e as Error).message

    await supabase
      .from('campaigns')
      .update({ status: 'error', error_message: msg.slice(0, 500) })
      .eq('id', body.campaignId)

    await supabase.from('campaign_events').insert({
      campaign_id: body.campaignId,
      event_type: 'error',
      data: { error: msg.slice(0, 500) },
    })

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
