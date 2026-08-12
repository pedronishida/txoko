'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { createResendClient } from '@/lib/server/marketing/email-client'
import { createTwilioClient, toE164 } from '@/lib/server/marketing/sms-client'

export type EmailProviderConfig = {
  api_key: string
  from_email: string
  from_name?: string
  reply_to?: string
}

export type SmsProviderConfig = {
  account_sid: string
  auth_token: string
  from_number: string
}

export type MarketingProviderSettings = {
  email: EmailProviderConfig | null
  sms: SmsProviderConfig | null
}

const emailConfigSchema = z.object({
  api_key: z.string().min(10),
  from_email: z.string().email(),
  from_name: z.string().max(100).optional(),
  reply_to: z.string().email().optional().or(z.literal('')),
})

const smsConfigSchema = z.object({
  account_sid: z.string().min(10).startsWith('AC'),
  auth_token: z.string().min(10),
  from_number: z.string().min(8),
})

export async function getMarketingSettings(): Promise<MarketingProviderSettings> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .maybeSingle()
  const marketing = ((data?.settings ?? {}) as Record<string, unknown>).marketing ?? {}
  const providers = marketing as {
    email?: EmailProviderConfig
    sms?: SmsProviderConfig
  }
  return { email: providers.email ?? null, sms: providers.sms ?? null }
}

async function updateMarketingSettings(input: {
  email?: EmailProviderConfig | null
  sms?: SmsProviderConfig | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('restaurants')
    .select('settings')
    .eq('id', restaurantId)
    .maybeSingle()
  const settings = (data?.settings ?? {}) as Record<string, unknown>
  const marketing = (settings.marketing ?? {}) as Record<string, unknown>

  if (input.email !== undefined) {
    if (input.email === null) delete marketing.email
    else marketing.email = input.email
  }
  if (input.sms !== undefined) {
    if (input.sms === null) delete marketing.sms
    else marketing.sms = input.sms
  }

  const next = { ...settings, marketing }
  const { error } = await supabase
    .from('restaurants')
    .update({ settings: next })
    .eq('id', restaurantId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/marketing')
  return { ok: true }
}

export async function updateResendConfig(input: {
  api_key: string
  from_email: string
  from_name?: string
  reply_to?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = emailConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' }
  }
  const config: EmailProviderConfig = {
    api_key: parsed.data.api_key,
    from_email: parsed.data.from_email,
    from_name: parsed.data.from_name,
  }
  if (parsed.data.reply_to) config.reply_to = parsed.data.reply_to
  return await updateMarketingSettings({ email: config })
}

export async function disconnectResend(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return await updateMarketingSettings({ email: null })
}

export async function updateTwilioConfig(input: {
  account_sid: string
  auth_token: string
  from_number: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = smsConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' }
  }
  return await updateMarketingSettings({ sms: parsed.data })
}

export async function disconnectTwilio(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return await updateMarketingSettings({ sms: null })
}

export async function sendResendTest(input: {
  to: string
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const parsed = z.object({ to: z.string().email() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Email invalido' }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('restaurants')
    .select('settings, name')
    .eq('id', restaurantId)
    .maybeSingle()

  const client = createResendClient((data?.settings ?? {}) as Record<string, unknown>)
  if (!client) return { ok: false, error: 'Resend nao configurado' }

  try {
    const result = await client.send({
      to: parsed.data.to,
      subject: `Teste de envio — ${data?.name ?? 'Txoko'}`,
      html: '<p>Este eh um email de teste do Txoko. Se voce esta vendo isso, sua conta Resend esta conectada corretamente.</p>',
      text: 'Este eh um email de teste do Txoko. Se voce esta vendo isso, sua conta Resend esta conectada corretamente.',
    })
    return { ok: true, messageId: result.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function sendTwilioTest(input: {
  to: string
}): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()
  const { data } = await supabase
    .from('restaurants')
    .select('settings, name')
    .eq('id', restaurantId)
    .maybeSingle()

  const client = createTwilioClient((data?.settings ?? {}) as Record<string, unknown>)
  if (!client) return { ok: false, error: 'Twilio nao configurado' }

  try {
    const result = await client.send({
      to: toE164(input.to),
      body: `[Txoko] Teste de envio do canal SMS para ${data?.name ?? 'sua conta'}.`,
    })
    return { ok: true, sid: result.sid }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
