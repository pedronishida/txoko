'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'
import type { OrderAgentToolCall } from '@/lib/server/ai/order-agent'

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

export type TestCustomerAgentInput = {
  mode: 'chat' | 'order_taking'
  message: string
  customer_phone?: string
}

export type TestCustomerAgentResult =
  | {
      ok: true
      mode: 'chat' | 'order_taking'
      action: 'reply' | 'escalate' | 'skip'
      text: string | null
      confidence: number | null
      reason: string | null
      tool_calls: OrderAgentToolCall[]
      iterations: number | null
    }
  | { ok: false; error: string }

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

// =============================================================
// Seed de FAQs prontas ("Inserir 8 FAQs prontas")
// =============================================================

const KNOWLEDGE_TEMPLATES = [
  {
    title: 'Horario de funcionamento',
    category: 'horarios',
    content:
      'Funcionamos de segunda a sabado, das 11h as 23h. Domingo das 11h as 22h. Feriados podem ter horario reduzido — sempre confira nosso WhatsApp.',
    keywords: ['horario', 'aberto', 'fechado', 'funcionamento', 'que horas', 'abrir'],
  },
  {
    title: 'Endereco e como chegar',
    category: 'outros',
    content:
      'Estamos localizados em [SEU ENDERECO]. Tem estacionamento proprio com [QTD] vagas. Tambem servimos delivery.',
    keywords: ['endereco', 'onde fica', 'como chegar', 'estacionamento', 'localizacao'],
  },
  {
    title: 'Formas de pagamento',
    category: 'pagamento',
    content:
      'Aceitamos: dinheiro, Pix, cartoes de credito/debito (todas as bandeiras), vale-refeicao Sodexo, Alelo e Ticket. Para pedidos delivery, pagamento na entrega ou Pix antes de despachar.',
    keywords: ['pagamento', 'pix', 'cartao', 'dinheiro', 'vale', 'sodexo', 'alelo', 'ticket'],
  },
  {
    title: 'Delivery e taxa de entrega',
    category: 'entrega',
    content:
      'Fazemos delivery proprio em raio de [X] km com taxa de R$ [VALOR]. Tempo estimado: 40 a 60 minutos. Pedido minimo: R$ [VALOR_MIN]. Trabalhamos tambem com iFood.',
    keywords: ['delivery', 'entrega', 'taxa', 'tempo', 'demora', 'raio', 'minimo', 'ifood'],
  },
  {
    title: 'Reservas',
    category: 'reserva',
    content:
      'Aceitamos reservas com no minimo 2 horas de antecedencia, preferencialmente para grupos a partir de 4 pessoas. Mande nome, data, horario e quantidade de pessoas que confirmamos disponibilidade.',
    keywords: ['reserva', 'reservar', 'mesa', 'pessoas', 'agendar', 'aniversario'],
  },
  {
    title: 'Cardapio e pratos do dia',
    category: 'cardapio',
    content:
      'Nosso cardapio completo esta no link [SEU_LINK_DO_CARDAPIO]. Temos pratos do dia variados de segunda a sexta no almoco. Para opcoes vegetarianas/sem gluten, posso te indicar — me fala suas restricoes.',
    keywords: ['cardapio', 'menu', 'prato do dia', 'opcoes', 'vegetariano', 'sem gluten', 'vegano'],
  },
  {
    title: 'Reclamacoes e elogios',
    category: 'outros',
    content:
      'Sua opiniao eh muito importante. Para reclamacoes ou elogios, me passe os detalhes que vou repassar diretamente para a gerencia. Em casos urgentes, pode ligar [TELEFONE_GERENTE].',
    keywords: ['reclamacao', 'elogio', 'gerente', 'feedback', 'queixa', 'problema'],
  },
  {
    title: 'Eventos privados e aluguel do espaco',
    category: 'outros',
    content:
      'Atendemos eventos privados (aniversarios, confraternizacoes, casamentos pequenos) com cardapio personalizado. Capacidade ate [QTD] pessoas. Pra orcamento, mande data, qtd convidados e tipo de evento que retornamos com proposta.',
    keywords: ['evento', 'aluguel', 'aniversario', 'casamento', 'confraternizacao', 'orcamento', 'privado'],
  },
]

export async function seedKnowledgeTemplates(): Promise<
  { ok: true; created: number; skipped: number } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nao autenticado' }

  const restaurantId = await getActiveRestaurantId()

  const { data: existing } = await supabase
    .from('ai_knowledge_entries')
    .select('title')
    .eq('restaurant_id', restaurantId)

  const existingTitles = new Set(
    ((existing ?? []) as { title: string }[]).map((e) => e.title.toLowerCase())
  )
  const toCreate = KNOWLEDGE_TEMPLATES.filter(
    (tpl) => !existingTitles.has(tpl.title.toLowerCase())
  )

  if (toCreate.length === 0) {
    return { ok: true, created: 0, skipped: KNOWLEDGE_TEMPLATES.length }
  }

  const { error } = await supabase.from('ai_knowledge_entries').insert(
    toCreate.map((tpl) => ({
      restaurant_id: restaurantId,
      title: tpl.title,
      category: tpl.category,
      content: tpl.content,
      keywords: tpl.keywords,
      enabled: true,
      created_by: user.id,
    }))
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/configuracoes/conhecimento')
  return {
    ok: true,
    created: toCreate.length,
    skipped: KNOWLEDGE_TEMPLATES.length - toCreate.length,
  }
}

// =============================================================
// Test mode — roda o agente do cliente contra uma mensagem simulada
// =============================================================

export async function testCustomerAgent(
  input: TestCustomerAgentInput
): Promise<TestCustomerAgentResult> {
  if (!input.message?.trim()) return { ok: false, error: 'Mensagem vazia.' }
  if (input.message.length > 1000) return { ok: false, error: 'Max 1000 chars.' }

  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, ai_agent_config')
    .eq('id', restaurantId)
    .maybeSingle()

  if (!restaurant) return { ok: false, error: 'Restaurante nao encontrado.' }

  const agentConfig = (restaurant.ai_agent_config ?? {}) as Record<string, unknown>
  const persona =
    typeof agentConfig.persona === 'string'
      ? agentConfig.persona
      : `Assistente virtual amigavel do ${restaurant.name}`

  if (input.mode === 'chat') {
    const { data: entries } = await supabase
      .from('ai_knowledge_entries')
      .select('title, content, category')
      .eq('restaurant_id', restaurantId)
      .eq('enabled', true)

    const escalateKeywords = Array.isArray(agentConfig.escalate_keywords)
      ? (agentConfig.escalate_keywords as string[])
      : ['reclamacao', 'cancelar', 'gerente', 'reembolso']
    const minConfidence =
      typeof agentConfig.min_confidence === 'number' ? agentConfig.min_confidence : 0.7

    const { generateAutoReply } = await import('@/lib/server/ai/auto-agent')

    try {
      const res = await generateAutoReply({
        messages: [
          {
            direction: 'inbound',
            body: input.message.trim(),
            created_at: new Date().toISOString(),
          },
        ],
        knowledgeEntries: (entries ?? []) as Array<{
          title: string
          content: string
          category: string | null
        }>,
        restaurantName: restaurant.name,
        persona,
        escalateKeywords,
        minConfidence,
      })
      return {
        ok: true,
        mode: 'chat',
        action: res.action,
        text: res.action === 'reply' ? res.text : null,
        confidence: res.action === 'reply' ? res.confidence : null,
        reason: res.action === 'escalate' || res.action === 'skip' ? res.reason : null,
        tool_calls: [],
        iterations: null,
      }
    } catch (err) {
      return { ok: false, error: `Excecao auto-agent: ${(err as Error).message}` }
    }
  }

  const { createServiceClient } = await import('@/lib/supabase/service')
  const { runOrderAgent } = await import('@/lib/server/ai/order-agent')

  const phone = input.customer_phone?.replace(/\D/g, '') ?? ''
  let customerId: string | null = null
  let customerName: string | null = null
  let customerNotes: string | null = null

  if (phone) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, notes')
      .eq('restaurant_id', restaurantId)
      .eq('phone', phone)
      .maybeSingle()
    if (customer) {
      customerId = customer.id
      customerName = customer.name
      customerNotes = customer.notes ?? null
    }
  }

  try {
    const res = await runOrderAgent({
      messages: [{ role: 'user', content: input.message.trim() }],
      restaurantName: restaurant.name,
      persona,
      supabase: createServiceClient(),
      restaurantId,
      conversationId: '00000000-0000-0000-0000-000000000000',
      customerId,
      customerPhone: phone || null,
      customerName,
      customerNotes,
      isFirstContact: !customerId,
    })
    if (res.action === 'reply') {
      return {
        ok: true,
        mode: 'order_taking',
        action: 'reply',
        text: res.text,
        confidence: null,
        reason: null,
        tool_calls: res.toolCalls,
        iterations: res.iterations,
      }
    }
    if (res.action === 'escalate') {
      return {
        ok: true,
        mode: 'order_taking',
        action: 'escalate',
        text: null,
        confidence: null,
        reason: res.reason,
        tool_calls: res.toolCalls,
        iterations: null,
      }
    }
    return {
      ok: true,
      mode: 'order_taking',
      action: 'skip',
      text: null,
      confidence: null,
      reason: res.reason,
      tool_calls: [],
      iterations: null,
    }
  } catch (err) {
    return { ok: false, error: `Excecao order-agent: ${(err as Error).message}` }
  }
}
