'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { validateContent, type ContentIssue } from '@/lib/server/marketing/content-validator'
import { getOrCreateVariations } from '@/lib/server/marketing/variation-cache'

export async function saveTemplate(input: {
  id?: string
  name: string
  category?: string
  wa_body?: string
  wa_image_url?: string
  wa_document_url?: string
  wa_document_ext?: string
  wa_link_url?: string
  wa_link_title?: string
  wa_link_description?: string
  email_subject?: string
  email_html?: string
  email_plain?: string
  sms_body?: string
  variables?: string[]
  ai_variation_enabled?: boolean
  ai_variation_count?: number
  ai_variation_temp?: number
}) {
  if (!input.name.trim()) return { error: 'Nome obrigatorio' }

  const supabase = await createClient()
  const restaurant_id = await getActiveRestaurantId()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const payload = {
    restaurant_id,
    name: input.name.trim(),
    category: input.category || null,
    wa_body: input.wa_body || null,
    wa_image_url: input.wa_image_url || null,
    wa_document_url: input.wa_document_url || null,
    wa_document_ext: input.wa_document_ext || null,
    wa_link_url: input.wa_link_url || null,
    wa_link_title: input.wa_link_title || null,
    wa_link_description: input.wa_link_description || null,
    email_subject: input.email_subject || null,
    email_html: input.email_html || null,
    email_plain: input.email_plain || null,
    sms_body: input.sms_body || null,
    variables: input.variables ?? [],
    ai_variation_enabled: input.ai_variation_enabled ?? false,
    ai_variation_count: input.ai_variation_count ?? 5,
    ai_variation_temp: input.ai_variation_temp ?? 0.7,
    created_by: user?.id ?? null,
  }

  if (input.id) {
    const { error } = await supabase
      .from('campaign_templates')
      .update(payload)
      .eq('id', input.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('campaign_templates')
      .insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/marketing/templates')
  return { ok: true }
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('campaign_templates')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/marketing/templates')
  return { ok: true }
}

export async function validateTemplateContent(
  body: string,
  channel: 'whatsapp' | 'email' | 'sms'
): Promise<ContentIssue[]> {
  return validateContent(body, channel)
}

export async function generateTemplateVariations(templateId: string) {
  const supabase = await createClient()

  const { data: template } = await supabase
    .from('campaign_templates')
    .select('wa_body, sms_body, email_html, ai_variation_count, ai_variation_temp, restaurant_id')
    .eq('id', templateId)
    .maybeSingle()

  if (!template) return { error: 'Template nao encontrado' }

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', template.restaurant_id)
    .maybeSingle()

  const results: Record<string, unknown> = {}

  // WhatsApp variations
  if (template.wa_body) {
    const variations = await getOrCreateVariations(supabase, templateId, 'whatsapp', {
      templateBody: template.wa_body as string,
      count: (template.ai_variation_count as number) ?? 5,
      temperature: Number(template.ai_variation_temp ?? 0.7),
      restaurantName: (restaurant?.name as string) ?? 'Restaurante',
    })
    results.whatsapp = variations
  }

  // SMS variations
  if (template.sms_body) {
    const variations = await getOrCreateVariations(supabase, templateId, 'sms', {
      templateBody: template.sms_body as string,
      count: (template.ai_variation_count as number) ?? 5,
      temperature: Number(template.ai_variation_temp ?? 0.7),
      restaurantName: (restaurant?.name as string) ?? 'Restaurante',
    })
    results.sms = variations
  }

  // Email variations
  if (template.email_html) {
    const variations = await getOrCreateVariations(supabase, templateId, 'email', {
      templateBody: template.email_html as string,
      count: (template.ai_variation_count as number) ?? 5,
      temperature: Number(template.ai_variation_temp ?? 0.7),
      restaurantName: (restaurant?.name as string) ?? 'Restaurante',
    })
    results.email = variations
  }

  revalidatePath('/marketing/templates')
  return { ok: true, variations: results }
}
