'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type RestaurantSettings = {
  service_rate?: number
  open_time?: string
  close_time?: string
  timezone?: string
  currency?: string
  locale?: string
  loyalty_points_per?: number
}

export type RestaurantUpdate = {
  id: string
  name?: string
  legal_name?: string | null
  cnpj?: string | null
  phone?: string | null
  email?: string | null
  address_full?: string | null
  settings?: RestaurantSettings
}

export async function updateRestaurant(input: RestaurantUpdate) {
  const supabase = await createClient()

  let mergedSettings: Record<string, unknown> | undefined
  if (input.settings) {
    const { data: current } = await supabase
      .from('restaurants')
      .select('settings')
      .eq('id', input.id)
      .maybeSingle()
    mergedSettings = {
      ...((current?.settings as Record<string, unknown>) ?? {}),
      ...input.settings,
    }
  }

  const payload: Record<string, unknown> = {}
  if (input.name !== undefined) payload.name = input.name
  if (input.legal_name !== undefined) payload.legal_name = input.legal_name
  if (input.cnpj !== undefined) payload.cnpj = input.cnpj
  if (input.phone !== undefined) payload.phone = input.phone
  if (input.email !== undefined) payload.email = input.email
  if (input.address_full !== undefined) {
    payload.address = input.address_full ? { full: input.address_full } : null
  }
  if (mergedSettings !== undefined) payload.settings = mergedSettings

  if (Object.keys(payload).length === 0) return { ok: true }

  const { error } = await supabase
    .from('restaurants')
    .update(payload)
    .eq('id', input.id)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes')
  revalidatePath('/configuracoes/operacao')
  revalidatePath('/financeiro')
  revalidatePath('/pdv')
  return { ok: true }
}

// =============================================================
// AI Agent settings
// =============================================================

export type AiAgentMode = 'chat' | 'order_taking'

export type AiAgentDayHours = {
  open?: string
  close?: string
  closed?: boolean
}

export type AiAgentBusinessHours = {
  sun?: AiAgentDayHours
  mon?: AiAgentDayHours
  tue?: AiAgentDayHours
  wed?: AiAgentDayHours
  thu?: AiAgentDayHours
  fri?: AiAgentDayHours
  sat?: AiAgentDayHours
}

export type AiAgentConfig = {
  persona: string
  escalate_keywords: string[]
  min_confidence: number
  business_hours_only: boolean
  mode?: AiAgentMode
  business_hours?: AiAgentBusinessHours
  greeting_message?: string
  off_hours_message?: string
  order_taking_rollout_mode?: 'allowlist' | 'all'
  order_taking_allowlist?: string[]
}

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

const dayHoursSchema = z.object({
  open: z.string().regex(timeRegex).optional(),
  close: z.string().regex(timeRegex).optional(),
  closed: z.boolean().optional(),
})

const businessHoursSchema = z.object({
  sun: dayHoursSchema.optional(),
  mon: dayHoursSchema.optional(),
  tue: dayHoursSchema.optional(),
  wed: dayHoursSchema.optional(),
  thu: dayHoursSchema.optional(),
  fri: dayHoursSchema.optional(),
  sat: dayHoursSchema.optional(),
})

const updateAiAgentSchema = z.object({
  restaurantId: z.string().uuid(),
  enabled: z.boolean(),
  config: z.object({
    persona: z.string().max(500),
    escalate_keywords: z.array(z.string().min(1).max(100)).max(50),
    min_confidence: z.number().min(0).max(1),
    business_hours_only: z.boolean(),
    mode: z.enum(['chat', 'order_taking']).optional(),
    business_hours: businessHoursSchema.optional(),
    greeting_message: z.string().max(500).optional(),
    off_hours_message: z.string().max(500).optional(),
    order_taking_rollout_mode: z.enum(['allowlist', 'all']).optional(),
    order_taking_allowlist: z
      .array(z.string().regex(/^\d{10,15}$/, 'apenas digitos, 10 a 15'))
      .max(100)
      .optional(),
  }),
})

export async function updateAiAgentSettings(input: {
  restaurantId: string
  enabled: boolean
  config: AiAgentConfig
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateAiAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const { error } = await supabase
    .from('restaurants')
    .update({
      ai_agent_enabled: parsed.data.enabled,
      ai_agent_config: parsed.data.config,
    })
    .eq('id', parsed.data.restaurantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes')
  revalidatePath('/configuracoes/assistente')
  return { ok: true }
}

// ---------------------------------------------------------------
// Self-service: precos das modalidades da estacao
// ---------------------------------------------------------------
// O dono pensa em "quanto custa o buffet", nao em "produto com
// service_mode". Estas actions escondem esse encanamento: cada modalidade
// e um produto com `service_mode` preenchido, que as RPCs da estacao
// resolvem na hora de lancar na comanda.

export type SelfServicePrices = {
  avontade: number | null
  por_kg: number | null
  por_kg_2mix: number | null
}

const SELF_SERVICE_PRODUCTS: {
  mode: keyof SelfServicePrices
  name: string
  byWeight: boolean
}[] = [
  { mode: 'avontade', name: 'Self-Service a Vontade', byWeight: false },
  { mode: 'por_kg', name: 'Self-Service por Quilo', byWeight: true },
  { mode: 'por_kg_2mix', name: 'Self-Service por Quilo · 2 Misturas', byWeight: true },
]

const priceField = z
  .union([z.number(), z.null()])
  .refine((v) => v === null || (v > 0 && v < 100000), 'Preco invalido')

const selfServiceSchema = z.object({
  restaurantId: z.string().uuid(),
  prices: z.object({
    avontade: priceField,
    por_kg: priceField,
    por_kg_2mix: priceField,
  }),
})

export async function updateSelfServicePrices(input: {
  restaurantId: string
  prices: SelfServicePrices
}) {
  const parsed = selfServiceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const { restaurantId, prices } = parsed.data

  const { data: existing, error: readErr } = await supabase
    .from('products')
    .select('id, service_mode')
    .eq('restaurant_id', restaurantId)
    .not('service_mode', 'is', null)

  if (readErr) return { ok: false, error: readErr.message }

  const byMode = new Map(
    (existing ?? []).map((p) => [p.service_mode as string, p.id as string])
  )

  for (const def of SELF_SERVICE_PRODUCTS) {
    const price = prices[def.mode]
    const id = byMode.get(def.mode)

    // Sem preco = modalidade nao usada. Desativa em vez de apagar, pra nao
    // quebrar o historico de comandas que ja usaram esse produto.
    if (price == null) {
      if (id) {
        const { error } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('id', id)
        if (error) return { ok: false, error: error.message }
      }
      continue
    }

    const row = {
      restaurant_id: restaurantId,
      name: def.name,
      service_mode: def.mode,
      sold_by_weight: def.byWeight,
      // `price` e not null na tabela; pra item por peso o valor que vale e
      // o price_per_kg, entao espelhamos os dois.
      price: def.byWeight ? 0 : price,
      price_per_kg: def.byWeight ? price : null,
      is_active: true,
    }

    const { error } = id
      ? await supabase.from('products').update(row).eq('id', id)
      : await supabase.from('products').insert(row)

    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/configuracoes/operacao')
  revalidatePath('/cardapio')
  return { ok: true }
}
