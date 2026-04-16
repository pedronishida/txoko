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
  name: string
  legal_name: string | null
  cnpj: string | null
  phone: string | null
  email: string | null
  address_full: string | null
  settings: RestaurantSettings
}

export async function updateRestaurant(input: RestaurantUpdate) {
  const supabase = await createClient()

  const payload = {
    name: input.name,
    legal_name: input.legal_name,
    cnpj: input.cnpj,
    phone: input.phone,
    email: input.email,
    address: input.address_full ? { full: input.address_full } : null,
    settings: input.settings,
  }

  const { error } = await supabase
    .from('restaurants')
    .update(payload)
    .eq('id', input.id)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes')
  revalidatePath('/financeiro')
  revalidatePath('/pdv')
  return { ok: true }
}

// =============================================================
// AI Agent settings
// =============================================================

export type AiAgentConfig = {
  persona: string
  escalate_keywords: string[]
  min_confidence: number
  business_hours_only: boolean
}

const updateAiAgentSchema = z.object({
  restaurantId: z.string().uuid(),
  enabled: z.boolean(),
  config: z.object({
    persona: z.string().max(500),
    escalate_keywords: z.array(z.string().min(1).max(100)).max(50),
    min_confidence: z.number().min(0).max(1),
    business_hours_only: z.boolean(),
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
  return { ok: true }
}
