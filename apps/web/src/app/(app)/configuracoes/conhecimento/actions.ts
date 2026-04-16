'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

// =============================================================
// Schemas Zod
// =============================================================

const VALID_CATEGORIES = [
  'horarios',
  'cardapio',
  'reserva',
  'entrega',
  'pagamento',
  'outros',
] as const

const createEntrySchema = z.object({
  title: z.string().min(1, 'Titulo obrigatorio').max(200),
  category: z.enum(VALID_CATEGORIES).nullable().optional(),
  content: z
    .string()
    .min(10, 'Conteudo muito curto (minimo 10 caracteres)')
    .max(8000, 'Conteudo muito longo (maximo 8000 caracteres)'),
  keywords: z.array(z.string().min(1).max(100)).max(50).default([]),
  enabled: z.boolean().default(true),
})

const updateEntrySchema = createEntrySchema.extend({
  id: z.string().uuid(),
})

const idSchema = z.string().uuid()

// =============================================================
// Tipos
// =============================================================

export type KnowledgeEntry = {
  id: string
  restaurant_id: string
  title: string
  category: string | null
  content: string
  keywords: string[]
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type KnowledgeEntryInput = z.infer<typeof createEntrySchema>
export type KnowledgeEntryUpdate = z.infer<typeof updateEntrySchema>

// =============================================================
// Actions
// =============================================================

export async function listKnowledgeEntries(): Promise<
  { ok: true; entries: KnowledgeEntry[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data, error } = await supabase
    .from('ai_knowledge_entries')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  return { ok: true, entries: (data ?? []) as unknown as KnowledgeEntry[] }
}

export async function createKnowledgeEntry(
  input: KnowledgeEntryInput
): Promise<{ ok: true; entry: KnowledgeEntry } | { ok: false; error: string }> {
  const parsed = createEntrySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const restaurantId = await getActiveRestaurantId()

  const { data, error } = await supabase
    .from('ai_knowledge_entries')
    .insert({
      restaurant_id: restaurantId,
      title: parsed.data.title,
      category: parsed.data.category ?? null,
      content: parsed.data.content,
      keywords: parsed.data.keywords,
      enabled: parsed.data.enabled,
      created_by: user.id,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes/conhecimento')
  return { ok: true, entry: data as unknown as KnowledgeEntry }
}

export async function updateKnowledgeEntry(
  input: KnowledgeEntryUpdate
): Promise<{ ok: true; entry: KnowledgeEntry } | { ok: false; error: string }> {
  const parsed = updateEntrySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Entrada invalida' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const { data, error } = await supabase
    .from('ai_knowledge_entries')
    .update({
      title: parsed.data.title,
      category: parsed.data.category ?? null,
      content: parsed.data.content,
      keywords: parsed.data.keywords,
      enabled: parsed.data.enabled,
    })
    .eq('id', parsed.data.id)
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes/conhecimento')
  return { ok: true, entry: data as unknown as KnowledgeEntry }
}

export async function deleteKnowledgeEntry(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'ID invalido' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const { error } = await supabase
    .from('ai_knowledge_entries')
    .delete()
    .eq('id', parsed.data)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes/conhecimento')
  return { ok: true }
}

export async function toggleKnowledgeEntry(
  id: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: 'ID invalido' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const { error } = await supabase
    .from('ai_knowledge_entries')
    .update({ enabled })
    .eq('id', parsed.data)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes/conhecimento')
  return { ok: true }
}
