'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import { IfoodClient, IfoodApiError } from '@/lib/server/ifood/client'
import { getValidToken } from '@/lib/server/ifood/token'
import type { IfoodIntegration } from '@/lib/server/ifood/types'

// =============================================================
// iFood Settings Server Actions
// =============================================================

const SaveCredentialsSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID obrigatorio'),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
})

export async function saveIfoodCredentials(input: {
  merchantId: string
  clientId?: string
  clientSecret?: string
}) {
  const parsed = SaveCredentialsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados invalidos' }
  }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: existing } = await supabase
    .from('ifood_integrations')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  const patch = {
    merchant_id: parsed.data.merchantId,
    client_id: parsed.data.clientId ?? null,
    // Preserva client_secret existente se nao fornecido (nao sobrescreve com null)
    ...(parsed.data.clientSecret !== undefined && { client_secret: parsed.data.clientSecret }),
    // Limpa token se credenciais mudaram
    access_token: null,
    token_expires_at: null,
  }

  let error: { message: string } | null = null

  if (existing) {
    const { error: updErr } = await supabase
      .from('ifood_integrations')
      .update(patch)
      .eq('restaurant_id', restaurantId)
    error = updErr
  } else {
    const { error: insErr } = await supabase
      .from('ifood_integrations')
      .insert({ restaurant_id: restaurantId, ...patch })
    error = insErr
  }

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/canais')
  return { ok: true }
}

export async function toggleIfoodIntegration(enabled: boolean) {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { error } = await supabase
    .from('ifood_integrations')
    .update({ enabled })
    .eq('restaurant_id', restaurantId)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes/canais')
  return { ok: true }
}

export async function testIfoodConnection() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: integration, error: intErr } = await supabase
    .from('ifood_integrations')
    .select('id, merchant_id, client_id, client_secret, access_token, token_expires_at')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (intErr || !integration) {
    return { ok: false, error: 'Integracao iFood nao configurada' }
  }

  if (!integration.client_id || !integration.client_secret) {
    return { ok: false, error: 'Client ID e Client Secret sao necessarios para testar a conexao' }
  }

  const tokenResult = await getValidToken(supabase, integration as IfoodIntegration)
  if ('error' in tokenResult) {
    return { ok: false, error: tokenResult.error }
  }

  try {
    const client = new IfoodClient(
      integration.client_id as string,
      integration.client_secret as string
    )
    const merchants = await client.listMerchants(tokenResult.token)
    const matched = merchants.find((m) => m.id === integration.merchant_id)
    return {
      ok: true,
      merchantName: matched?.name ?? 'Merchant encontrado',
      merchantStatus: matched?.status?.code ?? 'UNKNOWN',
      totalMerchants: merchants.length,
    }
  } catch (e) {
    const msg = e instanceof IfoodApiError ? e.message : (e as Error).message
    return { ok: false, error: msg }
  }
}

export async function getIfoodIntegration() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data, error } = await supabase
    .from('ifood_integrations')
    .select('id, merchant_id, client_id, enabled, last_polled_at, last_order_id, webhook_secret')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (error) return { error: error.message }
  return { integration: data as IfoodIntegrationPublic | null }
}

export type IfoodIntegrationPublic = {
  id: string
  merchant_id: string
  client_id: string | null
  enabled: boolean
  last_polled_at: string | null
  last_order_id: string | null
  webhook_secret: string
}

// Mapeamentos de produto
export async function listIfoodProductMappings() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data, error } = await supabase
    .from('ifood_product_mappings')
    .select('id, ifood_sku, ifood_name, product_id, auto_create, products(name)')
    .eq('restaurant_id', restaurantId)
    .order('ifood_name', { ascending: true })

  if (error) return { error: error.message }
  return { mappings: data ?? [] }
}

const UpdateMappingSchema = z.object({
  mappingId: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  autoCreate: z.boolean(),
})

export async function updateIfoodProductMapping(input: {
  mappingId: string
  productId: string | null
  autoCreate: boolean
}) {
  const parsed = UpdateMappingSchema.safeParse(input)
  if (!parsed.success) return { error: 'Dados invalidos' }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { error } = await supabase
    .from('ifood_product_mappings')
    .update({
      product_id: parsed.data.productId,
      auto_create: parsed.data.autoCreate,
    })
    .eq('id', parsed.data.mappingId)
    .eq('restaurant_id', restaurantId)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes/canais/ifood-produtos')
  return { ok: true }
}
