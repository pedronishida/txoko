import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// AI Order Agent — atende clientes no WhatsApp com tool use
// =============================================================
// Modelo: claude-sonnet-4-5 com loop de tools (max 8 iteracoes)
// Tools: cardapio, horario, montar/confirmar pedido, cadastro de
// cliente, consulta de pedidos e reservas.
// Saida: reply (enviar resposta), escalate ou skip
// =============================================================

const ORDER_AGENT_MODEL = 'claude-sonnet-4-5-20250929'

const ORDER_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_cardapio',
    description:
      'Consulta os produtos disponiveis no cardapio do restaurante. Use quando o cliente pedir o cardapio, perguntar opcoes, ou quando precisar resolver o nome de um produto que ele citou. Retorna lista de produtos com nome, preco, categoria e descricao.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Termo de busca opcional. Match por nome do produto (case insensitive, parcial).',
        },
        category: {
          type: 'string',
          description: 'Filtra por nome de categoria (ex: "Bebidas", "Pizzas")',
        },
        max: {
          type: 'integer',
          description: 'Maximo de resultados. Default 15.',
        },
      },
    },
  },
  {
    name: 'verificar_horario_funcionamento',
    description:
      'Verifica se o restaurante esta aberto agora e qual o horario de funcionamento. Use sempre antes de confirmar um pedido pra delivery ou pickup.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'montar_pedido',
    description:
      'Cria ou atualiza o rascunho de pedido (draft) na conversa. Use quando o cliente disser o que quer pedir. Sempre cite os itens encontrados pelo nome exato (use consultar_cardapio antes pra resolver). Use isto pra TODA atualizacao do pedido (adicionar, remover, ajustar quantidade) — o draft eh substituido a cada chamada.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Lista completa de itens do pedido (substitui o draft anterior).',
          items: {
            type: 'object',
            properties: {
              product_name: {
                type: 'string',
                description:
                  'Nome do produto exatamente como aparece no cardapio (resolva via consultar_cardapio).',
              },
              qty: { type: 'integer', description: 'Quantidade. Minimo 1.' },
              notes: {
                type: 'string',
                description: 'Observacoes opcionais (ex: "sem cebola").',
              },
            },
            required: ['product_name', 'qty'],
          },
        },
        delivery_type: {
          type: 'string',
          enum: ['pickup', 'delivery', 'dine_in'],
          description: 'Como o cliente vai receber o pedido.',
        },
        delivery_address: {
          type: 'object',
          description: 'Obrigatorio se delivery_type=delivery.',
          properties: {
            street: { type: 'string' },
            number: { type: 'string' },
            complement: { type: 'string' },
            reference: { type: 'string' },
          },
        },
        payment_method: {
          type: 'string',
          enum: ['pix', 'cash', 'credit', 'debit'],
          description: 'Forma de pagamento. Confirme com o cliente.',
        },
        customer_name: {
          type: 'string',
          description: 'Nome do cliente. Pergunte se ainda nao souber.',
        },
        customer_phone: {
          type: 'string',
          description: 'Telefone (digits only). Geralmente vem da conversa.',
        },
        notes: { type: 'string', description: 'Observacoes gerais do pedido.' },
      },
      required: ['items'],
    },
  },
  {
    name: 'confirmar_pedido',
    description:
      'Confirma o pedido (cria order real no sistema) ou cancela o draft. Use APENAS depois do cliente revisar os itens e confirmar explicitamente que quer fechar. Se o cliente quiser ajustar, use montar_pedido novamente.',
    input_schema: {
      type: 'object',
      properties: {
        confirmar: {
          type: 'boolean',
          description: 'true = cria order, false = cancela draft.',
        },
      },
      required: ['confirmar'],
    },
  },
  {
    name: 'salvar_cliente',
    description:
      'Cria ou atualiza o cadastro do cliente (na tabela customers). Use logo na PRIMEIRA mensagem se ainda nao souber o nome — pergunte de forma natural ("oi! qual seu nome?") e depois chame esta tool. Tambem use sempre que o cliente revelar dados novos: aniversario, restricao alimentar, preferencia, alergia. Append em notes pra preservar historico — nao sobrescreve. NAO peca dados pessoais sensiveis (CPF, cartao).',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nome do cliente (primeiro nome basta, ex: "Joao", "Maria Silva").',
        },
        birthday: {
          type: 'string',
          description: 'Aniversario YYYY-MM-DD se cliente mencionar.',
        },
        preferences: {
          type: 'array',
          description:
            'Preferencias alimentares (ex: ["vegetariano", "carne mal passada", "sem cebola"]).',
          items: { type: 'string' },
        },
        restrictions: {
          type: 'array',
          description: 'Alergias / restricoes (ex: ["amendoim", "lactose", "gluten"]).',
          items: { type: 'string' },
        },
        notes_extra: {
          type: 'string',
          description:
            'Observacoes livres pra registrar (ex: "frequenta as quartas", "trabalha proximo").',
        },
      },
    },
  },
  {
    name: 'consultar_meus_pedidos',
    description:
      'Consulta os pedidos do cliente atual (resolve por telefone). Use quando o cliente pergunta "cade meu pedido?", "ja saiu?", "quanto tempo ainda?". Retorna lista com numero, status e itens dos ultimos pedidos.',
    input_schema: {
      type: 'object',
      properties: {
        only_active: {
          type: 'boolean',
          description:
            'Se true, retorna so pedidos abertos/em preparo/prontos (default false = inclui historicos).',
        },
        max: {
          type: 'integer',
          description: 'Maximo de pedidos a retornar (default 5).',
        },
      },
    },
  },
  {
    name: 'criar_reserva_cliente',
    description:
      'Cria uma reserva pra mesa em nome do cliente atual. Use quando cliente pede "quero reservar uma mesa pra X pessoas no dia Y as Z horas". Confirme TODOS os dados (data, hora, qtd pessoas, ocasiao se houver) antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data da reserva YYYY-MM-DD.' },
        time: { type: 'string', description: 'Hora HH:MM (24h).' },
        party_size: {
          type: 'integer',
          description: 'Quantidade de pessoas (>=1).',
        },
        notes: {
          type: 'string',
          description: 'Observacoes (ex: "aniversario", "mesa perto da janela").',
        },
      },
      required: ['date', 'time', 'party_size'],
    },
  },
]

type ToolContext = {
  supabase: SupabaseClient
  restaurantId: string
  conversationId: string
  customerId: string | null
  customerPhone: string | null
}

async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case 'consultar_cardapio':
        return await consultarCardapio(input as ConsultarCardapioInput, ctx)
      case 'verificar_horario_funcionamento':
        return await verificarHorarioFuncionamento(ctx)
      case 'montar_pedido':
        return await montarPedido(input as MontarPedidoInput, ctx)
      case 'confirmar_pedido':
        return await confirmarPedido(input as ConfirmarPedidoInput, ctx)
      case 'salvar_cliente':
        return await salvarCliente(input as SalvarClienteInput, ctx)
      case 'consultar_meus_pedidos':
        return await consultarMeusPedidos(input as ConsultarMeusPedidosInput, ctx)
      case 'criar_reserva_cliente':
        return await criarReservaCliente(input as CriarReservaClienteInput, ctx)
      default:
        return `ERRO: tool desconhecida "${name}"`
    }
  } catch (err) {
    return `ERRO: ${(err as Error).message ?? 'tool failed'}`
  }
}

type ConsultarCardapioInput = { query?: string; category?: string; max?: number }

async function consultarCardapio(
  input: ConsultarCardapioInput,
  ctx: ToolContext
): Promise<string> {
  const limit = Math.min(Math.max(input.max ?? 15, 1), 30)
  let query = ctx.supabase
    .from('products')
    .select('id, name, description, price, category:categories(name)')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('is_active', true)
    .order('name')
    .limit(limit)
  if (input.query) query = query.ilike('name', `%${input.query}%`)

  const { data, error } = await query
  if (error) return `ERRO: ${error.message}`

  type ProductRow = {
    id: string
    name: string
    description: string | null
    price: number | string
    category: { name: string } | { name: string }[] | null
  }
  let products = (data ?? []) as ProductRow[]
  if (input.category) {
    products = products.filter((p) =>
      ((Array.isArray(p.category) ? p.category[0] : p.category)?.name ?? '')
        .toLowerCase()
        .includes(input.category!.toLowerCase())
    )
  }
  if (products.length === 0) {
    return 'Nenhum produto encontrado com esses criterios. Tente sem filtro.'
  }

  const lines = products.map((p) => {
    const category = Array.isArray(p.category) ? p.category[0] : p.category
    const categoryName = category?.name ?? 'Sem categoria'
    const description = p.description ? ` — ${p.description.slice(0, 80)}` : ''
    return `- "${p.name}" (${categoryName}) R$ ${Number(p.price).toFixed(2)}${description}`
  })
  return `${products.length} produtos:\n${lines.join('\n')}`
}

type BusinessDayHours = { closed?: boolean; open?: string; close?: string }
type BusinessHours = Record<string, BusinessDayHours | undefined>

async function verificarHorarioFuncionamento(ctx: ToolContext): Promise<string> {
  const { data } = await ctx.supabase
    .from('restaurants')
    .select('settings, ai_agent_config, name')
    .eq('id', ctx.restaurantId)
    .maybeSingle()

  const agentConfig = (data?.ai_agent_config ?? {}) as { business_hours?: BusinessHours }
  const settings = (data?.settings ?? {}) as { business_hours?: BusinessHours }
  const businessHours = agentConfig.business_hours ?? settings.business_hours ?? null
  if (!businessHours) {
    return 'Horario nao configurado. Assuma que esta aberto e prossiga com o pedido.'
  }

  const now = new Date()
  const day = businessHours[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()]]
  if (!day || day.closed) return 'Restaurante FECHADO hoje. Informe o cliente.'

  const open = day.open ?? '00:00'
  const close = day.close ?? '23:59'
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return current >= open && current <= close
    ? `Aberto agora. Funcionamento hoje: ${open} as ${close}.`
    : `FECHADO agora. Hoje abre ${open} e fecha ${close}. Informe o cliente que pode agendar mas nao retiraremos antes do horario.`
}

type MontarPedidoInput = {
  items: Array<{ product_name: string; qty: number; notes?: string }>
  delivery_type?: 'pickup' | 'delivery' | 'dine_in'
  delivery_address?: {
    street?: string
    number?: string
    complement?: string
    reference?: string
  }
  payment_method?: 'pix' | 'cash' | 'credit' | 'debit'
  customer_name?: string
  customer_phone?: string
  notes?: string
}

type DraftItem = {
  product_id: string
  name: string
  qty: number
  unit_price_cents: number
  notes?: string
}

async function montarPedido(input: MontarPedidoInput, ctx: ToolContext): Promise<string> {
  if (!input.items || input.items.length === 0) {
    return 'ERRO: items vazio. Confirme com o cliente o que ele quer.'
  }

  const { data } = await ctx.supabase
    .from('products')
    .select('id, name, price, is_active')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('is_active', true)
  if (!data || data.length === 0) {
    return 'ERRO: cardapio vazio. Restaurante sem produtos ativos.'
  }

  type ProductRow = { id: string; name: string; price: number | string; is_active: boolean }
  const products = data as ProductRow[]
  const resolved: DraftItem[] = []
  const notFound: string[] = []

  for (const item of input.items) {
    const needle = item.product_name.trim().toLowerCase()
    let product = products.find((p) => p.name.toLowerCase() === needle)
    if (!product) product = products.find((p) => p.name.toLowerCase().includes(needle))
    if (!product) {
      notFound.push(item.product_name)
      continue
    }
    resolved.push({
      product_id: product.id,
      name: product.name,
      qty: Math.max(1, Math.floor(item.qty)),
      unit_price_cents: Math.round(100 * Number(product.price)),
      notes: item.notes,
    })
  }

  if (notFound.length > 0) {
    return `ERRO: nao achei "${notFound.join('", "')}" no cardapio. Use consultar_cardapio com nomes alternativos antes de tentar de novo.`
  }

  let customerId = ctx.customerId
  if (!customerId && (input.customer_phone || ctx.customerPhone)) {
    const phone = (input.customer_phone ?? ctx.customerPhone ?? '').replace(/\D/g, '')
    if (phone.length >= 8) {
      const { data: existing } = await ctx.supabase
        .from('customers')
        .select('id')
        .eq('restaurant_id', ctx.restaurantId)
        .eq('phone', phone)
        .maybeSingle()
      if (existing) {
        customerId = existing.id as string
      } else if (input.customer_name) {
        const { data: created } = await ctx.supabase
          .from('customers')
          .insert({ restaurant_id: ctx.restaurantId, name: input.customer_name, phone })
          .select('id')
          .single()
        customerId = (created?.id as string | undefined) ?? null
      }
    }
  }

  const { data: existingDraft } = await ctx.supabase
    .from('order_drafts')
    .select('id')
    .eq('conversation_id', ctx.conversationId)
    .eq('status', 'building')
    .maybeSingle()

  const draftRow = {
    restaurant_id: ctx.restaurantId,
    conversation_id: ctx.conversationId,
    customer_id: customerId,
    items: resolved,
    delivery_type: input.delivery_type ?? null,
    delivery_address: input.delivery_address ?? null,
    payment_method: input.payment_method ?? null,
    notes: input.notes ?? null,
    expires_at: new Date(Date.now() + 86400000).toISOString(), // 24h
  }

  let draftId: string
  if (existingDraft) {
    const { data: updated, error } = await ctx.supabase
      .from('order_drafts')
      .update(draftRow)
      .eq('id', existingDraft.id)
      .select('id')
      .single()
    if (error) return `ERRO: ${error.message}`
    draftId = updated.id as string
  } else {
    const { data: inserted, error } = await ctx.supabase
      .from('order_drafts')
      .insert(draftRow)
      .select('id')
      .single()
    if (error) return `ERRO: ${error.message}`
    draftId = inserted.id as string
  }

  const total = (
    resolved.reduce((sum, item) => sum + item.unit_price_cents * item.qty, 0) / 100
  ).toFixed(2)
  const itemLines = resolved
    .map(
      (item) =>
        `- ${item.qty}x ${item.name} (R$ ${(item.unit_price_cents / 100).toFixed(2)} cada)${item.notes ? ` [${item.notes}]` : ''}`
    )
    .join('\n')
  const missing =
    [
      input.delivery_type ? null : 'delivery_type',
      input.payment_method ? null : 'payment_method',
      input.delivery_type === 'delivery' && !input.delivery_address
        ? 'delivery_address'
        : null,
      !customerId && !input.customer_name ? 'customer_name' : null,
    ]
      .filter(Boolean)
      .join(', ') || 'nenhum — pronto pra confirmar'

  return `DRAFT_ID=${draftId}\nTotal R$ ${total}\nItens:\n${itemLines}\n\nMissing:${missing}`
}

type ConfirmarPedidoInput = { confirmar: boolean }

async function confirmarPedido(
  input: ConfirmarPedidoInput,
  ctx: ToolContext
): Promise<string> {
  const { data: draft, error } = await ctx.supabase
    .from('order_drafts')
    .select('*')
    .eq('conversation_id', ctx.conversationId)
    .eq('status', 'building')
    .maybeSingle()
  if (error) return `ERRO: ${error.message}`
  if (!draft) return 'ERRO: nenhum draft ativo. Use montar_pedido primeiro.'

  if (!input.confirmar) {
    await ctx.supabase
      .from('order_drafts')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', draft.id)
    return 'OK: draft cancelado.'
  }

  const items = (draft.items ?? []) as DraftItem[]
  if (items.length === 0) return 'ERRO: draft sem itens. Use montar_pedido antes.'
  if (!draft.delivery_type) return 'ERRO: delivery_type nao definido. Pergunte ao cliente.'
  if (!draft.payment_method) return 'ERRO: payment_method nao definido. Pergunte ao cliente.'
  if (draft.delivery_type === 'delivery' && !draft.delivery_address) {
    return 'ERRO: endereco de entrega obrigatorio pra delivery.'
  }
  if (!draft.customer_id) {
    return 'ERRO: customer_id nao definido. Use montar_pedido com customer_name+phone.'
  }

  const total = items.reduce((sum, item) => sum + (item.unit_price_cents / 100) * item.qty, 0)
  const orderType =
    draft.delivery_type === 'pickup'
      ? 'takeaway'
      : draft.delivery_type === 'dine_in'
        ? 'dine_in'
        : 'delivery'

  const { data: order, error: orderError } = await ctx.supabase
    .from('orders')
    .insert({
      restaurant_id: draft.restaurant_id,
      customer_id: draft.customer_id,
      type: orderType,
      status: 'open',
      subtotal: total,
      discount: 0,
      service_fee: 0,
      delivery_fee: 0,
      total,
      notes: draft.notes,
      source: 'ai_agent',
      delivery_address: draft.delivery_address,
    })
    .select('id')
    .single()
  if (orderError || !order) return `ERRO ao criar order: ${orderError?.message ?? 'unknown'}`

  const itemsPayload = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.qty,
    unit_price: item.unit_price_cents / 100,
    total_price: (item.unit_price_cents / 100) * item.qty,
    notes: item.notes ?? null,
  }))
  const { error: itemsError } = await ctx.supabase.from('order_items').insert(itemsPayload)
  if (itemsError) {
    await ctx.supabase.from('orders').delete().eq('id', order.id)
    return `ERRO ao salvar itens: ${itemsError.message}`
  }

  await ctx.supabase.from('payments').insert({
    restaurant_id: draft.restaurant_id,
    order_id: order.id,
    method: draft.payment_method,
    amount: total,
    status: 'pending',
  })
  await ctx.supabase
    .from('order_drafts')
    .update({
      status: 'confirmed',
      confirmed_order_id: order.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', draft.id)

  return `OK: pedido criado (id=${order.id}, total=R$ ${total.toFixed(2)}). Aparece no KDS automaticamente. Avise o cliente que vamos comecar a preparar.`
}

type SalvarClienteInput = {
  name?: string
  birthday?: string
  preferences?: string[]
  restrictions?: string[]
  notes_extra?: string
}

async function salvarCliente(input: SalvarClienteInput, ctx: ToolContext): Promise<string> {
  if (!ctx.customerPhone) return 'ERRO: nao tem telefone do cliente nesta conversa.'
  const phone = ctx.customerPhone.replace(/\D/g, '')

  const { data } = await ctx.supabase
    .from('customers')
    .select('id, name, notes, birthday')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('phone', phone)
    .maybeSingle()
  const existing = data as {
    id: string
    name: string | null
    notes: string | null
    birthday: string | null
  } | null

  const noteParts: string[] = []
  if (input.preferences && input.preferences.length > 0) {
    noteParts.push(`[Preferencias: ${input.preferences.join(', ')}]`)
  }
  if (input.restrictions && input.restrictions.length > 0) {
    noteParts.push(`[Alergias/restricoes: ${input.restrictions.join(', ')}]`)
  }
  if (input.notes_extra) noteParts.push(input.notes_extra.trim())

  const newNotes = noteParts.join(' ').trim()
  const mergedNotes = existing?.notes
    ? newNotes
      ? `${existing.notes}\n${newNotes}`.trim()
      : existing.notes
    : newNotes || null
  const name = input.name?.trim() || existing?.name || null
  if (!name && !existing) {
    return 'ERRO: cliente novo sem name. Pergunte o nome antes de chamar salvar_cliente sem name.'
  }
  const birthday = input.birthday ?? null

  if (existing) {
    const updates: { name?: string; notes?: string | null; birthday?: string } = {}
    if (input.name?.trim()) updates.name = input.name.trim()
    if (mergedNotes !== existing.notes) updates.notes = mergedNotes
    if (birthday && !existing.birthday) updates.birthday = birthday
    if (Object.keys(updates).length === 0) {
      return 'OK: nenhuma mudanca a aplicar (ja conhecido).'
    }
    const { error } = await ctx.supabase.from('customers').update(updates).eq('id', existing.id)
    return error
      ? `ERRO: ${error.message}`
      : `OK: cadastro atualizado para ${name ?? '(sem nome)'}${newNotes ? ` — registrado: ${newNotes}` : ''}.`
  }

  const { error } = await ctx.supabase
    .from('customers')
    .insert({ restaurant_id: ctx.restaurantId, name, phone, notes: mergedNotes, birthday })
  return error
    ? `ERRO: ${error.message}`
    : `OK: cliente novo cadastrado: ${name}${newNotes ? ` — registrado: ${newNotes}` : ''}.`
}

type ConsultarMeusPedidosInput = { only_active?: boolean; max?: number }

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `ha ${minutes}min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `ha ${hours}h`
  const days = Math.round(hours / 24)
  return days < 30 ? `ha ${days}d` : `ha ${Math.round(days / 30)}m`
}

async function consultarMeusPedidos(
  input: ConsultarMeusPedidosInput,
  ctx: ToolContext
): Promise<string> {
  if (!ctx.customerPhone) return 'ERRO: nao tem telefone do cliente nesta conversa.'
  const phone = ctx.customerPhone.replace(/\D/g, '')
  const limit = Math.min(Math.max(input.max ?? 5, 1), 15)

  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('id')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('phone', phone)
    .maybeSingle()
  if (!customer) {
    return 'OK: voce ainda nao tem nenhum pedido conosco. Posso te ajudar a fazer o primeiro?'
  }

  let query = ctx.supabase
    .from('orders')
    .select('id, number, status, total, opened_at, closed_at, order_items(quantity, products(name))')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('customer_id', customer.id)
    .order('opened_at', { ascending: false })
    .limit(limit)
  if (input.only_active) query = query.in('status', ['draft', 'open', 'in_kitchen', 'ready'])

  const { data, error } = await query
  if (error) return `ERRO: ${error.message}`
  if (!data || data.length === 0) {
    return input.only_active
      ? 'OK: nenhum pedido ativo no momento.'
      : 'OK: ainda nao temos historico de pedidos pra esse telefone.'
  }

  const statusLabels: Record<string, string> = {
    draft: 'rascunho',
    open: 'aberto',
    in_kitchen: 'em preparo',
    ready: 'pronto pra entrega/retirada',
    served: 'entregue',
    paid: 'pago',
    cancelled: 'cancelado',
  }

  type OrderRow = {
    id: string
    number: number
    status: string
    total: number | string
    opened_at: string
    closed_at: string | null
    order_items: Array<{ quantity: number; products: { name: string } | null }> | null
  }
  const orders = data as unknown as OrderRow[]
  const lines = orders.map((order) => {
    const items = order.order_items ?? []
    const itemsSummary = items
      .slice(0, 4)
      .map((item) => `${item.quantity}× ${item.products?.name ?? 'item'}`)
      .join(', ')
    const more = items.length > 4 ? ` (+${items.length - 4} mais)` : ''
    const statusLabel = statusLabels[order.status] ?? order.status
    const total = `R$ ${Number(order.total).toFixed(2).replace('.', ',')}`
    const when = formatRelativeTime(order.opened_at)
    return `#${order.number} · ${statusLabel} · ${total} · ${when}${itemsSummary ? `\n   ${itemsSummary}${more}` : ''}`
  })
  return `${orders.length} pedido${orders.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
}

type CriarReservaClienteInput = {
  date: string
  time: string
  party_size: number
  notes?: string
}

async function criarReservaCliente(
  input: CriarReservaClienteInput,
  ctx: ToolContext
): Promise<string> {
  if (!ctx.customerPhone) return 'ERRO: nao tem telefone do cliente nesta conversa.'

  const partySize = Number(input.party_size)
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    return 'ERRO: numero de pessoas invalido (precisa ser 1-50).'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return 'ERRO: data invalida. Formato YYYY-MM-DD (ex: 2026-05-15).'
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    return 'ERRO: hora invalida. Formato HH:MM (ex: 19:30).'
  }
  const scheduledFor = new Date(`${input.date}T${input.time}:00`)
  if (isNaN(scheduledFor.getTime())) return 'ERRO: data/hora invalida.'
  if (scheduledFor.getTime() < Date.now() - 3600000) {
    return 'ERRO: nao da pra reservar pra horario passado.'
  }

  const phone = ctx.customerPhone.replace(/\D/g, '')
  let customerId = ctx.customerId
  if (!customerId) {
    const { data: customer } = await ctx.supabase
      .from('customers')
      .select('id, name')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('phone', phone)
      .maybeSingle()
    if (customer) customerId = customer.id as string
  }

  let guestName = 'Cliente'
  if (customerId) {
    const { data: customer } = await ctx.supabase
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .maybeSingle()
    if (customer?.name) guestName = customer.name as string
  }

  const { data: reservation, error } = await ctx.supabase
    .from('reservations')
    .insert({
      restaurant_id: ctx.restaurantId,
      customer_id: customerId,
      guest_name: guestName,
      guest_phone: phone,
      guest_count: partySize,
      scheduled_for: scheduledFor.toISOString(),
      status: 'pending',
      notes: input.notes ?? null,
      source: 'whatsapp',
    })
    .select('id')
    .single()

  return error
    ? `ERRO: ${error.message}`
    : `OK: reserva pendente criada pra ${partySize} pessoa${partySize === 1 ? '' : 's'} em ${input.date} as ${input.time}. Confirme com o cliente que avisaremos quando o gerente confirmar (id ${(reservation.id as string).slice(0, 8)}).`
}

function buildSystemPrompt(opts: {
  restaurantName: string
  persona: string
  customerName?: string | null
  customerNotes?: string | null
  isFirstContact?: boolean
}): string {
  const customerBlock = opts.customerName
    ? `CLIENTE NESTA CONVERSA: ${opts.customerName}.${opts.customerNotes ? `\nNOTAS DO PERFIL: ${opts.customerNotes}` : ''}\nUse o primeiro nome dele naturalmente (sem exagero — 1x no inicio basta).`
    : opts.isFirstContact
      ? 'CLIENTE NOVO (primeira conversa) — pergunte o nome de forma natural na PRIMEIRA mensagem ("oi! tudo bem? qual seu nome?") antes de qualquer outra coisa. Quando ele responder, chame salvar_cliente(name="..."). Faca isso UMA vez so.'
      : 'CLIENTE SEM NOME CADASTRADO — pergunte o nome quando achar oportuno e chame salvar_cliente.'

  return `Voce e ${opts.persona} do restaurante ${opts.restaurantName}.
Sua tarefa eh atender clientes via WhatsApp: receber bem, tirar duvidas, coletar pedidos, e fazer reservas.

${customerBlock}

REGRAS DE OURO:
- Seja natural, breve e amigavel — escreva como brasileiro fala (sem rebuscado).
- NUNCA invente produtos ou precos. Use SEMPRE consultar_cardapio antes de cotar precos.
- Quando o cliente disser o que quer, use montar_pedido com nomes EXATOS do cardapio.
- ANTES de confirmar_pedido(true), sempre LEIA o resumo de volta pro cliente e pergunte se esta certo.
- Pra delivery, sempre peca endereco (rua, numero, complemento opcional). Pra pickup, pode dispensar.
- Sempre confirme forma de pagamento (pix/dinheiro/cartao na entrega) antes de confirmar.
- Se cliente fizer pergunta nao relacionada a pedido (reclamacao, reembolso, gerente), responda algo basico tipo "vou chamar alguem da equipe pra te atender" e PARE de usar tools.
- NAO use emojis em excesso — no maximo 1 por mensagem se fizer sentido.
- NUNCA peca dados sensiveis: CPF, cartao, senha. Pagamento eh confirmado, nao processado aqui.

CAPTURA DE PERFIL (Sprint E.3):
- Quando o cliente revelar dados pessoais espontaneamente (aniversario, restricao, alergia, preferencia tipo "sou vegetariano"), chame salvar_cliente IMEDIATAMENTE sem perguntar permissao.
- NAO faca interrogatorio de cadastro — colete passivamente conforme a conversa flui.
- "Sou alergico a amendoim" → salvar_cliente(restrictions=["amendoim"])
- "Faco aniversario dia 15/03" → salvar_cliente(birthday="2026-03-15")
- "Sempre peco sem cebola" → salvar_cliente(preferences=["sem cebola"])

SELF-SERVICE:
- "cade meu pedido?" / "ja saiu?" / "quanto demora?" → consultar_meus_pedidos(only_active=true)
- "ja vinhei semana passada?" / "qual meu ultimo pedido?" → consultar_meus_pedidos
- "quero reservar mesa" → confirme data/hora/qtd → criar_reserva_cliente

FLUXO PEDIDO TIPICO:
1. Cliente diz o que quer
2. consultar_cardapio (resolve nomes/precos se necessario)
3. montar_pedido (cria/atualiza draft)
4. Pergunte o que falta (delivery/pickup, endereco, pagamento, nome se primeira vez)
5. montar_pedido novamente quando o cliente responder
6. Repete ate ter tudo
7. Mostra resumo final e pede confirmacao
8. Se cliente confirmar -> confirmar_pedido(confirmar=true)
9. Avisa que pedido foi enviado pra cozinha

IMPORTANTE: Escreva sempre em portugues brasileiro. Mensagens curtas (max 3 linhas).`
}

export type OrderAgentMessage = { role: 'user' | 'assistant'; content: string }

export type OrderAgentToolCall = { name: string; input: unknown; result: string }

export type OrderAgentInput = {
  messages: OrderAgentMessage[]
  restaurantName: string
  persona: string
  supabase: SupabaseClient
  restaurantId: string
  conversationId: string
  customerId: string | null
  customerPhone: string | null
  customerName?: string | null
  customerNotes?: string | null
  isFirstContact?: boolean
}

export type OrderAgentResult =
  | { action: 'skip'; reason: string }
  | { action: 'reply'; text: string; toolCalls: OrderAgentToolCall[]; iterations: number }
  | { action: 'escalate'; reason: string; toolCalls: OrderAgentToolCall[] }

export async function runOrderAgent(input: OrderAgentInput): Promise<OrderAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { action: 'skip', reason: 'no_api_key' }
  if (input.messages.length === 0) return { action: 'skip', reason: 'no_messages' }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt({
    restaurantName: input.restaurantName,
    persona: input.persona,
    customerName: input.customerName,
    customerNotes: input.customerNotes,
    isFirstContact: input.isFirstContact,
  })
  const context: ToolContext = {
    supabase: input.supabase,
    restaurantId: input.restaurantId,
    conversationId: input.conversationId,
    customerId: input.customerId,
    customerPhone: input.customerPhone,
  }
  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const toolCalls: OrderAgentToolCall[] = []

  for (let iteration = 0; iteration < 8; iteration++) {
    const response = await client.messages.create({
      model: ORDER_AGENT_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: ORDER_AGENT_TOOLS,
      messages,
    })

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      )
      const text = textBlock?.text?.trim() ?? ''
      if (text.length === 0) {
        return { action: 'escalate', reason: 'modelo retornou resposta vazia', toolCalls }
      }
      return { action: 'reply', text, toolCalls, iterations: iteration + 1 }
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input, context)
      toolCalls.push({ name: toolUse.name, input: toolUse.input, result })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
        is_error: result.startsWith('ERRO'),
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return {
    action: 'escalate',
    reason: 'agente excedeu 8 iteracoes sem fechar a conversa',
    toolCalls,
  }
}
