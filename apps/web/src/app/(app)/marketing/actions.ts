'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { loadAbStats, pickWinner, refreshAbStats } from '@/lib/server/marketing/ab-testing'
import type { CampaignChannel, CampaignStatus, CampaignType } from '@txoko/shared'

export async function createCampaign(input: {
  name: string
  description?: string
  type: CampaignType
  channel: CampaignChannel
  audience_id?: string
  scheduled_at?: string
  trigger_event?: string
}) {
  if (!input.name.trim()) return { error: 'Nome obrigatorio' }
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      restaurant_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      channel: input.channel,
      audience_id: input.audience_id || null,
      scheduled_at: input.scheduled_at || null,
      trigger_event: input.trigger_event || null,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/marketing')
  return { ok: true, campaignId: data?.id as string }
}

export async function updateCampaignStatus(input: {
  campaignId: string
  status: CampaignStatus
}) {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: input.status }

  if (input.status === 'running') patch.started_at = now
  if (input.status === 'completed') patch.completed_at = now

  const { error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', input.campaignId)
  if (error) return { error: error.message }

  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('campaign_events').insert({
    campaign_id: input.campaignId,
    event_type: input.status === 'running' ? 'started' : input.status,
    actor_user_id: user?.id ?? null,
    data: { status: input.status },
  })

  revalidatePath('/marketing')
  return { ok: true }
}

export async function deleteCampaign(campaignId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId)
  if (error) return { error: error.message }
  revalidatePath('/marketing')
  return { ok: true }
}

export async function createTemplate(input: {
  name: string
  category?: string
  wa_body?: string
  wa_image_url?: string
  email_subject?: string
  email_html?: string
  sms_body?: string
  variables?: string[]
  ai_variation_enabled?: boolean
}) {
  if (!input.name.trim()) return { error: 'Nome obrigatorio' }
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('campaign_templates')
    .insert({
      restaurant_id,
      name: input.name.trim(),
      category: input.category || null,
      wa_body: input.wa_body || null,
      wa_image_url: input.wa_image_url || null,
      email_subject: input.email_subject || null,
      email_html: input.email_html || null,
      sms_body: input.sms_body || null,
      variables: input.variables ?? [],
      ai_variation_enabled: input.ai_variation_enabled ?? false,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/marketing/templates')
  return { ok: true, templateId: data?.id as string }
}

export async function createAudience(input: {
  name: string
  description?: string
  filters: unknown[]
}) {
  if (!input.name.trim()) return { error: 'Nome obrigatorio' }
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('campaign_audiences')
    .insert({
      restaurant_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      filters: input.filters,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/marketing/audiences')
  return { ok: true, audienceId: data?.id as string }
}

export async function launchCampaign(campaignId: string) {
  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()

  // Load campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (campErr || !campaign) return { error: campErr?.message ?? 'Campanha nao encontrada' }
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return { error: `Campanha com status ${campaign.status} nao pode ser lancada` }
  }

  // Ensure there's at least one step (create default if missing)
  const { count: stepCount } = await supabase
    .from('campaign_steps')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  if (!stepCount || stepCount === 0) {
    // Find first template for this restaurant
    const { data: firstTemplate } = await supabase
      .from('campaign_templates')
      .select('id')
      .eq('restaurant_id', restaurant_id)
      .limit(1)
      .maybeSingle()

    // Create a simple send_message step
    await supabase.from('campaign_steps').insert({
      campaign_id: campaignId,
      step_order: 1,
      step_type: 'send_message',
      template_id: firstTemplate?.id ?? null,
    })
  }

  // Load customers (WhatsApp: need phone; Email: need email)
  let customerQuery = supabase
    .from('customers')
    .select('id, phone, email')
    .eq('restaurant_id', restaurant_id)

  if (campaign.channel === 'whatsapp' || campaign.channel === 'sms') {
    customerQuery = customerQuery.not('phone', 'is', null)
  } else if (campaign.channel === 'email') {
    customerQuery = customerQuery.not('email', 'is', null)
  }

  const { data: customers, error: custErr } = await customerQuery
  if (custErr) return { error: custErr.message }
  if (!customers || customers.length === 0) {
    const fieldLabel = campaign.channel === 'email' ? 'e-mail' : 'telefone'
    return { error: `Nenhum cliente com ${fieldLabel} cadastrado` }
  }

  // Check for opt-outs
  const { data: optOuts } = await supabase
    .from('opt_outs')
    .select('customer_id')
    .eq('restaurant_id', restaurant_id)
    .in('channel', [campaign.channel, 'all'])

  const optOutSet = new Set((optOuts ?? []).map((o) => o.customer_id as string))
  const eligibleCustomers = customers.filter(
    (c) => !optOutSet.has(c.id as string)
  )

  if (eligibleCustomers.length === 0) {
    return { error: 'Todos os clientes elegíveis fizeram opt-out' }
  }

  // Insert recipients
  const recipients = eligibleCustomers.map((c, i) => ({
    campaign_id: campaignId,
    customer_id: c.id as string,
    status: 'queued' as const,
    channel: campaign.channel,
    variant_index: i % 5,
  }))

  const { error: recipErr } = await supabase
    .from('campaign_recipients')
    .insert(recipients)

  if (recipErr) return { error: recipErr.message }

  // Update campaign status
  const { data: { user } } = await supabase.auth.getUser()
  await supabase
    .from('campaigns')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      audience_count: eligibleCustomers.length,
    })
    .eq('id', campaignId)

  await supabase.from('campaign_events').insert({
    campaign_id: campaignId,
    event_type: 'started',
    actor_user_id: user?.id ?? null,
    data: {
      audience_count: eligibleCustomers.length,
      opted_out_count: customers.length - eligibleCustomers.length,
    },
  })

  // Fire dispatch in background (fire-and-forget via fetch to our own API)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.txoko.com.br'
  const dispatchKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (dispatchKey) {
    fetch(`${siteUrl}/api/marketing/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dispatchKey}`,
      },
      body: JSON.stringify({ campaignId }),
    }).catch(() => {
      // fire-and-forget: dispatch errors are logged in campaign_events
    })
  }

  revalidatePath('/marketing')
  return { ok: true, recipientCount: eligibleCustomers.length }
}

export async function setupAbTest(input: {
  campaignId: string
  stepId: string
  templateAId: string
  templateBId: string
  splitPct: number
}) {
  const supabase = await createClient()

  // Update step as ab_split
  await supabase
    .from('campaign_steps')
    .update({ step_type: 'ab_split', ab_split_pct: input.splitPct })
    .eq('id', input.stepId)

  // Create variant records
  await supabase.from('campaign_ab_variants').upsert([
    {
      campaign_id: input.campaignId,
      step_id: input.stepId,
      variant: 'a',
      template_id: input.templateAId,
    },
    {
      campaign_id: input.campaignId,
      step_id: input.stepId,
      variant: 'b',
      template_id: input.templateBId,
    },
  ], { onConflict: 'campaign_id,step_id,variant' })

  revalidatePath(`/marketing/campaigns/${input.campaignId}`)
  return { ok: true }
}

export async function getAbTestResults(campaignId: string) {
  const supabase = await createClient()
  await refreshAbStats(supabase, campaignId)
  const stats = await loadAbStats(supabase, campaignId)
  const winner = pickWinner(stats)
  return { ok: true, stats, winner }
}

