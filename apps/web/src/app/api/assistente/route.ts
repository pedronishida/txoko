import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveRestaurantId } from '@/lib/server/restaurant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SYSTEM_PROMPT = `Voce e o assistente IA do Txoko, um sistema de gestao para restaurantes.

Seu papel e ajudar o dono/gerente a tomar decisoes de negocio com base em dados REAIS do restaurante. Os dados atuais sao anexados ao final de cada mensagem do usuario dentro do bloco <DADOS_ATUAIS>.

REGRAS:
- Responda sempre em portugues brasileiro, de forma direta e concisa (maximo 3-4 paragrafos).
- Use os dados em <DADOS_ATUAIS> como fonte unica da verdade. Se a pergunta exige dados que nao estao la, diga claramente.
- Formatacao: **negrito** para numeros e metricas chave. Use "- " para listas (sem bullets unicode).
- Quando for sugerir uma acao, seja especifica (ex: "aumentar o preco do Risoto de Camarao em 8%" vs "aumentar precos").
- Nunca invente numeros. Nunca responda perguntas nao relacionadas a gestao do restaurante.
- Se o usuario pedir graficos complexos, explique em texto — voce nao renderiza imagens aqui.

CONTEXTO DO PRODUTO:
- Moeda padrao: BRL (Real brasileiro)
- Estados de pedido: open | preparing | ready | delivered | closed | cancelled
- Tipos de pedido: dine_in | takeaway | delivery | counter
- Metodos de pagamento: cash | credit | debit | pix | voucher | online
- Tabelas principais disponiveis: orders, order_items, products, categories, tables, customers, payments, ingredients, suppliers, product_recipes
- Triggers: ao fechar pedido, o estoque e subtraido automaticamente via fichas tecnicas e pontos de fidelidade sao creditados
- CMV e estimado como soma de (products.cost * order_items.quantity) do periodo
`

type ChatMessage = { role: 'user' | 'assistant'; content: string }

async function buildContext() {
  const supabase = await createClient()
  const restaurantId = await getActiveRestaurantId()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const [
    { data: monthOrders },
    { data: todayPayments },
    { data: ingredients },
    { data: activeOrders },
    { data: topItemsRaw },
    { count: customerCount },
    { data: restaurant },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('total, service_fee, delivery_fee, subtotal, status, type, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', monthStart)
      .neq('status', 'cancelled'),
    supabase
      .from('payments')
      .select('method, amount')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', todayStart.toISOString())
      .eq('status', 'approved'),
    supabase
      .from('ingredients')
      .select('name, current_stock, min_stock, unit')
      .eq('restaurant_id', restaurantId)
      .order('name'),
    supabase
      .from('orders')
      .select('id, type, total, status, table_id')
      .eq('restaurant_id', restaurantId)
      .in('status', ['open', 'preparing', 'ready']),
    supabase
      .from('order_items')
      .select('quantity, total_price, product:products!inner(name, restaurant_id)')
      .eq('product.restaurant_id', restaurantId)
      .gte('created_at', monthStart)
      .limit(2000),
    supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId),
    supabase.from('restaurants').select('name, settings').eq('id', restaurantId).maybeSingle(),
  ])

  const orders = monthOrders ?? []
  const revenue = orders.reduce((s, o) => s + Number(o.total ?? 0), 0)
  const orderCount = orders.length
  const avgTicket = orderCount > 0 ? revenue / orderCount : 0

  const payments = todayPayments ?? []
  const todayRevenue = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const paymentByMethod: Record<string, number> = {}
  for (const p of payments) {
    paymentByMethod[p.method as string] =
      (paymentByMethod[p.method as string] ?? 0) + Number(p.amount ?? 0)
  }

  const ings = ingredients ?? []
  const lowStock = ings.filter(
    (i) => Number(i.current_stock) <= Number(i.min_stock)
  )
  const warningStock = ings.filter(
    (i) =>
      Number(i.current_stock) > Number(i.min_stock) &&
      Number(i.current_stock) <= Number(i.min_stock) * 1.5
  )

  type TopItem = {
    quantity: number
    total_price: number
    product: { name: string } | { name: string }[] | null
  }
  const topItems = (topItemsRaw ?? []) as TopItem[]
  const productTotals: Record<string, { qty: number; revenue: number }> = {}
  for (const it of topItems) {
    const prod = Array.isArray(it.product) ? it.product[0] : it.product
    const name = prod?.name ?? 'Desconhecido'
    const agg = (productTotals[name] ??= { qty: 0, revenue: 0 })
    agg.qty += Number(it.quantity)
    agg.revenue += Number(it.total_price)
  }
  const topProducts = Object.entries(productTotals)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 5)

  const active = activeOrders ?? []
  const activeByType: Record<string, number> = {}
  for (const o of active) {
    activeByType[o.type as string] = (activeByType[o.type as string] ?? 0) + 1
  }

  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const lines: string[] = []
  lines.push(
    `Restaurante: ${restaurant?.name ?? 'Txoko'} | Data/hora: ${now.toLocaleString('pt-BR')}`
  )
  lines.push('')
  lines.push('== MES ATUAL ==')
  lines.push(`- Receita: ${fmt(revenue)}`)
  lines.push(`- Pedidos (nao cancelados): ${orderCount}`)
  lines.push(`- Ticket medio: ${fmt(avgTicket)}`)
  lines.push('')
  lines.push('== HOJE ==')
  lines.push(`- Pagamentos aprovados: ${fmt(todayRevenue)} (${payments.length} transacoes)`)
  if (Object.keys(paymentByMethod).length > 0) {
    lines.push(
      `- Por metodo: ${Object.entries(paymentByMethod)
        .map(([m, v]) => `${m} ${fmt(v)}`)
        .join(' | ')}`
    )
  }
  lines.push('')
  lines.push('== OPERACAO AGORA ==')
  lines.push(
    `- Pedidos ativos: ${active.length} (${Object.entries(activeByType)
      .map(([t, c]) => `${t}: ${c}`)
      .join(', ') || 'nenhum'})`
  )
  lines.push(`- Clientes cadastrados: ${customerCount ?? 0}`)
  lines.push('')
  lines.push('== ESTOQUE ==')
  lines.push(`- Total de insumos: ${ings.length}`)
  lines.push(`- Criticos (<= minimo): ${lowStock.length}`)
  if (lowStock.length > 0) {
    lines.push(
      '  ' +
        lowStock
          .slice(0, 10)
          .map(
            (i) => `${i.name} (${Number(i.current_stock)}/${Number(i.min_stock)} ${i.unit})`
          )
          .join(', ')
    )
  }
  lines.push(`- Atencao (<= 1.5x minimo): ${warningStock.length}`)
  lines.push('')
  if (topProducts.length > 0) {
    lines.push('== TOP 5 PRODUTOS (MES) ==')
    topProducts.forEach(([name, v], i) => {
      lines.push(`${i + 1}. ${name} — ${v.qty} vendidos, ${fmt(v.revenue)}`)
    })
  }

  return lines.join('\n')
}

export async function POST(req: Request) {
  // Exige autenticacao — so users logados no dashboard podem usar
  const authCheck = await createClient()
  const {
    data: { user },
  } = await authCheck.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Assistente indisponivel no momento. O administrador precisa configurar a ANTHROPIC_API_KEY no Worker.',
      },
      { status: 503 }
    )
  }

  let body: { messages?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalido' }, { status: 400 })
  }
  const history = body.messages
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: 'messages obrigatorio' }, { status: 400 })
  }

  // Garantir que a ultima mensagem e do usuario
  const last = history[history.length - 1]
  if (last.role !== 'user') {
    return NextResponse.json({ error: 'ultima mensagem deve ser user' }, { status: 400 })
  }

  let context: string
  try {
    context = await buildContext()
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao buscar contexto: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  const anthropic = new Anthropic({ apiKey })

  // Monta messages: injeta contexto no inicio da ultima mensagem do usuario.
  // Mensagens anteriores vao como texto simples pra manter o cache de mensagens estavel.
  const messages: Anthropic.MessageParam[] = history.map((m, i) => {
    if (i === history.length - 1 && m.role === 'user') {
      return {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `<DADOS_ATUAIS>\n${context}\n</DADOS_ATUAIS>\n\nPergunta: ${m.content}`,
          },
        ],
      }
    }
    return { role: m.role, content: m.content }
  })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    return NextResponse.json({
      text,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read: response.usage.cache_read_input_tokens ?? 0,
        cache_write: response.usage.cache_creation_input_tokens ?? 0,
      },
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY invalida.' },
        { status: 401 }
      )
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'Rate limit atingido. Tente novamente em alguns segundos.' },
        { status: 429 }
      )
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Erro Claude API (${e.status}): ${e.message}` },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
