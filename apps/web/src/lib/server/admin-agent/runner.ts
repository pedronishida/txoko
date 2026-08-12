import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Admin Agent — co-piloto operacional via WhatsApp
// =============================================================
// Loop agentic (Claude Sonnet + tools) que executa acoes reais no
// sistema do restaurante em nome de um admin autorizado
// (admin_agent_users), com RBAC por role, confirmation gate pra
// acoes destrutivas e audit log em admin_agent_actions.
// =============================================================

const AGENT_MODEL = 'claude-sonnet-4-5-20250929'

export type AdminRole = 'owner' | 'manager' | 'kitchen' | 'cashier' | 'waiter'

export type ToolResult = {
  ok: boolean
  text: string
  meta?: Record<string, unknown>
}

type ToolContext = {
  supabase: SupabaseClient
  restaurantId: string
  adminUserId: string | null
  adminPhone: string
  adminRole: AdminRole
  adminName?: string | null
  conversationId: string | null
  lastImageUrl: string | null
}

// -------------------------------------------------------------
// Vision — extracao estruturada a partir de imagem (cupom,
// boleto, comprovante Pix, foto da cozinha)
// -------------------------------------------------------------

type VisionExtractionInput<T> = {
  imageUrl: string
  prompt: string
  schemaHint: string
  validate?: (raw: unknown) => T | null
}

type VisionExtractionResult<T> =
  | { ok: true; data: T; raw: unknown; tokens_in: number; tokens_out: number; cost_brl: number }
  | { ok: false; error: string; raw?: string }

async function extractFromImage<T>(
  input: VisionExtractionInput<T>
): Promise<VisionExtractionResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY nao configurada' }

  const client = new Anthropic({ apiKey })
  const systemPrompt = `Voce eh um extrator de dados estruturados a partir de imagens.

REGRAS ESTRITAS:
- Responda APENAS com um objeto JSON valido, nada mais (sem markdown, sem comentarios, sem explicacao).
- Se algum campo nao puder ser extraido com confianca, use null (nao invente).
- Se a imagem nao for do tipo esperado, responda { "error": "imagem nao reconhecida" }.

SCHEMA ESPERADO:
${input.schemaHint}

INSTRUCAO ESPECIFICA:
${input.prompt}`

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: input.imageUrl } },
            { type: 'text', text: 'Extraia os dados conforme o schema. Responda apenas com JSON.' },
          ],
        },
      ],
    })
  } catch (err) {
    return { ok: false, error: `Vision API: ${(err as Error).message}` }
  }

  const tokensIn = response.usage.input_tokens
  const tokensOut = response.usage.output_tokens
  const costBrl = (tokensIn / 1000) * 0.0162 + (tokensOut / 1000) * 0.081

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  const rawText = textBlock?.text?.trim() ?? ''
  if (!rawText) return { ok: false, error: 'Vision retornou resposta vazia' }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, error: 'Vision nao retornou JSON valido', raw: rawText }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    return { ok: false, error: `Vision JSON parse: ${(err as Error).message}`, raw: rawText }
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    'error' in parsed &&
    typeof (parsed as { error: unknown }).error === 'string'
  ) {
    return { ok: false, error: (parsed as { error: string }).error, raw: rawText }
  }

  if (input.validate) {
    const validated = input.validate(parsed)
    return validated
      ? { ok: true, data: validated, raw: parsed, tokens_in: tokensIn, tokens_out: tokensOut, cost_brl: costBrl }
      : { ok: false, error: 'Validacao do payload falhou', raw: rawText }
  }

  return {
    ok: true,
    data: parsed as T,
    raw: parsed,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_brl: costBrl,
  }
}

// -------------------------------------------------------------
// RBAC — quais tools cada role pode usar
// -------------------------------------------------------------

const ALL_TOOL_NAMES = [
  'consultar_estoque',
  'atualizar_estoque',
  'consultar_pedidos',
  'relatorio',
  'responder_review',
  'processar_cupom_compra',
  'processar_boleto',
  'registrar_despesa',
  'criar_produto',
  'desativar_produto',
  'adicionar_item_pedido',
  'cancelar_pedido',
  'fechar_pedido',
  'consultar_caixa',
  'consultar_despesas',
  'criar_reserva',
  'consultar_reservas',
  'consultar_cliente',
  'top_clientes',
  'atualizar_horario',
  'reconciliar_pix',
  'marcar_prato_pronto',
  'lancar_campanha',
  'gerenciar_acesso',
  'dividir_conta',
  'transferir_mesa',
]

const ROLE_TOOL_ACCESS: Record<AdminRole, Set<string>> = {
  owner: new Set(ALL_TOOL_NAMES),
  manager: new Set(ALL_TOOL_NAMES),
  kitchen: new Set([
    'consultar_estoque',
    'atualizar_estoque',
    'processar_cupom_compra',
    'criar_produto',
    'desativar_produto',
    'consultar_pedidos',
    'marcar_prato_pronto',
  ]),
  cashier: new Set([
    'consultar_pedidos',
    'fechar_pedido',
    'relatorio',
    'consultar_caixa',
    'consultar_despesas',
    'processar_boleto',
    'registrar_despesa',
    'reconciliar_pix',
    'dividir_conta',
  ]),
  waiter: new Set([
    'consultar_pedidos',
    'adicionar_item_pedido',
    'criar_reserva',
    'consultar_reservas',
    'consultar_cliente',
    'marcar_prato_pronto',
    'dividir_conta',
    'transferir_mesa',
  ]),
}

// -------------------------------------------------------------
// Definicao das tools (schemas Anthropic)
// -------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_estoque',
    description:
      'Lista insumos (ingredientes) cadastrados, com estoque atual e minimo. Use quando admin pergunta "quanto tem de X", "tá acabando o que?", ou antes de atualizar estoque pra confirmar o nome certo.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo de busca opcional (nome do insumo, parcial, case-insensitive)',
        },
        only_low: {
          type: 'boolean',
          description: 'Se true, retorna apenas insumos abaixo do estoque minimo',
        },
        max: { type: 'integer', description: 'Maximo de resultados (default 30)' },
      },
    },
  },
  {
    name: 'atualizar_estoque',
    description:
      'Atualiza o estoque atual de um insumo. Use SET (substitui valor) ou DELTA (incremento/decremento). Sempre cite o nome exato do insumo (use consultar_estoque antes pra confirmar).',
    input_schema: {
      type: 'object',
      properties: {
        ingredient_name: {
          type: 'string',
          description: 'Nome do insumo exatamente como aparece em consultar_estoque',
        },
        mode: {
          type: 'string',
          enum: ['set', 'delta'],
          description: 'set = substitui o valor atual; delta = soma/subtrai do valor atual',
        },
        value: {
          type: 'number',
          description:
            'Valor (positivo). Pra delta negativo (consumo), use mode=delta com value negativo.',
        },
      },
      required: ['ingredient_name', 'mode', 'value'],
    },
  },
  {
    name: 'consultar_pedidos',
    description:
      'Lista pedidos recentes ou em aberto. Use quando admin pergunta "como tao os pedidos?", "tem pedido aberto?", "fechou tudo?".',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'preparing', 'ready', 'delivered', 'closed', 'cancelled', 'active'],
          description: "Filtrar por status. 'active' = open+preparing+ready (pedidos em andamento)",
        },
        table_number: { type: 'integer', description: 'Filtrar por numero da mesa' },
        limit: { type: 'integer', description: 'Maximo (default 20)' },
      },
    },
  },
  {
    name: 'relatorio',
    description:
      'Gera relatorio agregado do restaurante. Use pra perguntas tipo "faturamento ontem", "top produtos do mes", "quantos pedidos hoje".',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['revenue', 'order_count', 'top_products', 'avg_ticket', 'cancellation_rate', 'cmv'],
          description: 'Qual metrica calcular',
        },
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month'],
          description: 'Periodo de analise (default today)',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'responder_review',
    description:
      'Posta uma resposta em uma avaliacao recente. Use quando admin diz "responde aquela avaliacao 1 estrela: ...". Se admin nao especificar qual review, peca pra confirmar.',
    input_schema: {
      type: 'object',
      properties: {
        review_id: {
          type: 'string',
          description:
            'UUID do review (ou "latest_negative" pra pegar a mais recente <=3 estrelas sem resposta)',
        },
        response_text: {
          type: 'string',
          description: 'Texto da resposta (max 500 chars). Tom natural, sem robotizacao.',
        },
      },
      required: ['review_id', 'response_text'],
    },
  },
  {
    name: 'processar_cupom_compra',
    description:
      'Le um cupom fiscal/nota de compra (foto enviada pelo admin), extrai itens e valores, cria despesa em financial_transactions e atualiza estoque dos insumos correspondentes (fuzzy match por nome). Use quando admin manda foto de cupom de mercado/atacarejo. NUNCA invente itens — somente extraia o que estiver visivel na imagem.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description:
            'URL da imagem do cupom. Se nao fornecido, usa a ultima imagem enviada pelo admin nesta conversa.',
        },
        supplier_name_hint: {
          type: 'string',
          description:
            'Nome do fornecedor se admin mencionar (ex: "Atacadao", "Sao Joao"). Se nao, IA tenta extrair do cupom.',
        },
        update_stock: {
          type: 'boolean',
          description:
            'Se true (default), atualiza current_stock dos ingredients matchados. Se false, so registra a despesa.',
        },
      },
    },
  },
  {
    name: 'processar_boleto',
    description:
      'Le um boleto bancario (foto), extrai valor, vencimento, beneficiario e cria despesa pendente em financial_transactions. Use quando admin manda foto de boleto/conta de luz/agua/internet.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description: 'URL da imagem do boleto. Default: ultima imagem da conversa.',
        },
        category_hint: {
          type: 'string',
          description:
            'Categoria sugerida (ex: utilities, rent, suppliers). IA pode inferir do beneficiario.',
        },
      },
    },
  },
  {
    name: 'registrar_despesa',
    description:
      'Registra despesa manual (sem foto). Use quando admin diz "paguei R$X de Y" ou similar.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Valor em reais (positivo).' },
        description: { type: 'string', description: 'Descricao curta (max 200 chars).' },
        category: {
          type: 'string',
          description: 'Categoria (ex: utilities, rent, marketing, suppliers, other).',
        },
        paid_today: {
          type: 'boolean',
          description: 'Se true (default), marca como paga hoje. Se false, fica pendente.',
        },
      },
      required: ['amount', 'description'],
    },
  },
  {
    name: 'criar_produto',
    description:
      'Cria novo produto no cardapio. Use quando admin diz "novo prato X R$Y" ou manda foto + nome.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do produto' },
        price: { type: 'number', description: 'Preco em reais' },
        description: { type: 'string', description: 'Descricao curta opcional' },
        category_name: {
          type: 'string',
          description: 'Nome da categoria (ex: "Pizzas", "Bebidas"). Se nao existir, sera criada.',
        },
        cost: { type: 'number', description: 'Custo de producao opcional (CMV)' },
      },
      required: ['name', 'price'],
    },
  },
  {
    name: 'desativar_produto',
    description:
      'Marca produto como inativo (some do cardapio publico). Use quando admin diz "tira X do menu".',
    input_schema: {
      type: 'object',
      properties: {
        product_name: {
          type: 'string',
          description: 'Nome do produto exato (use consultar_cardapio se nao tiver certeza).',
        },
        permanent: {
          type: 'boolean',
          description: 'Se true, marca permanentemente. Se false (default), admin pode reativar facil.',
        },
      },
      required: ['product_name'],
    },
  },
  {
    name: 'adicionar_item_pedido',
    description:
      'Adiciona itens a um pedido existente (em aberto/preparing/ready). Use quando admin diz "mesa X pediu mais Y" ou "soma 2 cervejas no pedido da Maria".',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID do pedido (8 chars curtos OK)' },
        table_number: {
          type: 'integer',
          description: 'Alternativa: numero da mesa (busca pedido aberto dessa mesa)',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_name: {
                type: 'string',
                description: 'Nome do produto exato (use consultar_cardapio se nao souber)',
              },
              qty: { type: 'integer', description: 'Quantidade. Min 1.' },
              notes: { type: 'string', description: 'Observacao opcional (ex: sem cebola)' },
            },
            required: ['product_name', 'qty'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'cancelar_pedido',
    description:
      'ATENCAO ACAO DESTRUTIVA. Cancela um pedido (status=cancelled). Sempre confirme com o admin antes de chamar essa tool — descreva qual pedido vai cancelar e espere "sim" ou "ok" antes de executar. NUNCA chame sem confirmacao explicita do admin.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID do pedido a cancelar' },
        table_number: { type: 'integer', description: 'Alternativa: numero da mesa' },
        motivo: { type: 'string', description: 'Motivo do cancelamento (vai pro audit)' },
      },
      required: ['motivo'],
    },
  },
  {
    name: 'fechar_pedido',
    description:
      'Fecha um pedido com pagamento (status=closed). Use quando admin diz "fechei mesa X no pix" ou "cliente pagou".',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID do pedido' },
        table_number: { type: 'integer', description: 'Alternativa: numero da mesa' },
        payment_method: {
          type: 'string',
          enum: ['cash', 'credit', 'debit', 'pix', 'voucher'],
          description: 'Forma de pagamento',
        },
      },
      required: ['payment_method'],
    },
  },
  {
    name: 'consultar_caixa',
    description:
      'Mostra resumo do caixa do dia (ou outro periodo): receita por forma de pagamento, total de pedidos, ticket medio.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday'],
          description: 'Periodo (default today)',
        },
      },
    },
  },
  {
    name: 'consultar_despesas',
    description:
      'Lista despesas (financial_transactions tipo expense) por periodo e/ou categoria. Use pra "quanto gastei com X mes".',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_month', 'last_month', 'last_30d'],
          description: 'Periodo (default this_month)',
        },
        category: {
          type: 'string',
          description: 'Filtrar por categoria (ex: utilities, suppliers, rent)',
        },
        only_pending: { type: 'boolean', description: 'Se true, lista apenas pendentes' },
      },
    },
  },
  {
    name: 'criar_reserva',
    description:
      'Cria uma reserva. Use quando admin diz "reserva pra X pessoas amanha as Y em nome de Z".',
    input_schema: {
      type: 'object',
      properties: {
        guest_name: { type: 'string', description: 'Nome do cliente' },
        guest_phone: { type: 'string', description: 'Telefone (opcional, recomendado)' },
        guest_count: { type: 'integer', description: 'Numero de pessoas' },
        scheduled_for: {
          type: 'string',
          description:
            'Data/hora ISO 8601 ou formato natural ("amanha 20h", "sexta 19:30"). IA converte pra ISO.',
        },
        duration_minutes: {
          type: 'integer',
          description: 'Duracao prevista em minutos (default 90)',
        },
        notes: { type: 'string', description: 'Observacoes (alergias, ocasiao, etc)' },
      },
      required: ['guest_name', 'guest_count', 'scheduled_for'],
    },
  },
  {
    name: 'consultar_reservas',
    description: 'Lista reservas. Use pra "tem reserva amanha?", "reservas do Carlos".',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data ISO YYYY-MM-DD (default hoje + amanha)' },
        customer_name: {
          type: 'string',
          description: 'Filtrar por nome do cliente (parcial)',
        },
        status: {
          type: 'string',
          enum: ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'],
          description: 'Filtrar por status',
        },
      },
    },
  },
  {
    name: 'consultar_cliente',
    description: 'Busca cliente por telefone ou nome. Retorna info + LTV + ultima visita.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Telefone (qualquer formato)' },
        name: { type: 'string', description: 'Nome (parcial, case insensitive)' },
      },
    },
  },
  {
    name: 'top_clientes',
    description:
      'Lista top N clientes por metrica (LTV, frequencia, engajamento). Use pra "quem sao meus melhores clientes?".',
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['ltv', 'orders', 'engagement', 'churn_risk'],
          description: 'Qual ranking (default ltv)',
        },
        limit: { type: 'integer', description: 'Quantos retornar (default 10, max 25)' },
      },
    },
  },
  {
    name: 'lancar_campanha',
    description:
      'ATENCAO ACAO DESTRUTIVA — Dispara uma campanha de marketing existente (template + audience ja cadastrados no dashboard) pra todos os destinatarios. Use quando admin disser "manda a promo de quarta" ou "dispara aquela campanha de aniversariantes". NAO cria templates/audiences novos — so reusa o que ja existe. Sempre PERGUNTE confirmacao com nome da campanha + numero estimado de destinatarios ANTES de chamar a tool. Cria registro em campaigns(status=scheduled, scheduled_at=now()) — dispatcher worker pega em ate 5min.',
    input_schema: {
      type: 'object',
      properties: {
        template_name_query: {
          type: 'string',
          description:
            'Nome (parcial) do campaign_template ja cadastrado (ex: "promo quarta", "aniversariante").',
        },
        audience_name_query: {
          type: 'string',
          description:
            'Nome (parcial) da campaign_audience ja cadastrada (ex: "todos clientes", "vip", "aniversariantes mes").',
        },
        campaign_name: {
          type: 'string',
          description: 'Nome interno da campanha (default: gerado a partir do template + data).',
        },
        schedule_at: {
          type: 'string',
          description:
            'ISO timestamp futuro pra agendar (ex: "2026-05-10T19:00:00-03:00"). Default: now (dispatch imediato).',
        },
      },
      required: ['template_name_query', 'audience_name_query'],
    },
  },
  {
    name: 'gerenciar_acesso',
    description:
      'Gerencia quem pode falar com o admin agent (admin_agent_users). 4 acoes: "list" (mostra todos), "add" (adiciona telefone+nome+role), "remove" (desativa por telefone), "change_role" (atualiza role). SO owner pode usar — manager nao. Nao deletar fisicamente, so desativa (active=false) pra preservar audit log.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'remove', 'change_role'],
          description: 'Operacao a executar.',
        },
        phone: {
          type: 'string',
          description:
            'Telefone do admin (formato livre, sera normalizado pra digitos). Obrigatorio em add/remove/change_role.',
        },
        display_name: { type: 'string', description: 'Nome amigavel (obrigatorio em add).' },
        role: {
          type: 'string',
          enum: ['owner', 'manager', 'kitchen', 'cashier', 'waiter'],
          description:
            'Permissao (obrigatorio em add e change_role). Owner = tudo; manager = quase tudo; kitchen/cashier/waiter = escopo restrito.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'dividir_conta',
    description:
      'Calcula como dividir a conta de um pedido aberto. Modo simples: total/N pessoas. Modo por consumo: cada pessoa paga so o que ela pediu (o admin descreve quem pediu o que). NAO altera o pedido — so retorna mensagem formatada que o admin pode copiar pra mandar pro grupo. Nao cria payments — quando cada um pagar, usa reconciliar_pix ou fechar_pedido.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: {
          type: 'integer',
          description: 'Numero do pedido (ex: 123). Use consultar_pedidos se nao souber.',
        },
        order_id: { type: 'string', description: 'UUID do pedido (alternativa ao order_number).' },
        split_into: {
          type: 'integer',
          description: 'Numero de pessoas pra dividir igualmente (modo simples). Default 2.',
        },
        by_consumption: {
          type: 'array',
          description:
            'Modo por consumo: lista de pessoas e o que cada uma pediu (nome + lista de items). Sobrescreve split_into.',
          items: {
            type: 'object',
            properties: {
              person_name: { type: 'string' },
              item_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Nomes dos produtos que essa pessoa pediu (fuzzy match).',
              },
            },
            required: ['person_name', 'item_names'],
          },
        },
        include_service_fee: {
          type: 'boolean',
          description:
            'Se true, inclui taxa de servico no rateio (default true se o pedido tem service_fee).',
        },
      },
    },
  },
  {
    name: 'transferir_mesa',
    description:
      'Move o pedido aberto de uma mesa pra outra (ex: cliente pediu pra trocar). Atualiza orders.table_id, libera a mesa de origem (status=free se nao houver mais pedidos abertos), ocupa a destino. Falha se a destino ja estiver ocupada por outro pedido.',
    input_schema: {
      type: 'object',
      properties: {
        from_table_number: { type: 'integer', description: 'Numero da mesa de origem (ex: 5).' },
        to_table_number: { type: 'integer', description: 'Numero da mesa de destino (ex: 12).' },
      },
      required: ['from_table_number', 'to_table_number'],
    },
  },
  {
    name: 'marcar_prato_pronto',
    description:
      'Marca um ou mais order_items em status "preparing" como "ready" (prontos pra entregar). Aceita 3 modos: (1) descricao textual: "lasanha mesa 5 pronta" → matcheia order_item; (2) foto da janela da cozinha: vision identifica os pratos visiveis e matcheia em batch; (3) order_item_ids explicito (raro). Use sempre que cozinha sinalizar prato pronto via texto, audio ou foto. Se nao achar match, sugira ao admin que confira a observacao.',
    input_schema: {
      type: 'object',
      properties: {
        descriptions: {
          type: 'array',
          description:
            'Lista de descricoes em portugues dos pratos prontos (ex: ["lasanha", "filé com fritas"]). Use quando admin/cozinha mandou texto ou audio.',
          items: { type: 'string' },
        },
        table_hint: {
          type: 'string',
          description:
            'Numero/label da mesa pra restringir a busca (ex: "5", "Mesa 12"). Default: qualquer mesa.',
        },
        image_url: {
          type: 'string',
          description:
            'URL da foto da janela/balcao da cozinha. Se passado, vision identifica os pratos visiveis automaticamente — ignora o campo descriptions. Default: ultima imagem da conversa se nao tiver descriptions.',
        },
        order_item_ids: {
          type: 'array',
          description: 'IDs explicitos dos order_items pra marcar (raro, so quando admin passa direto).',
          items: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'reconciliar_pix',
    description:
      'Le um comprovante Pix (foto/print enviado pelo admin), extrai valor + data + beneficiario + pagador, e tenta vincular automaticamente a um pedido aberto compativel (mesmo valor, ultimos 7 dias). Se achar 1 pedido: registra o pagamento (payments) e fecha o pedido se quitado total. Se achar varios: lista candidatos pra admin escolher. Se nenhum: registra como recebimento avulso em financial_transactions (income). Use quando admin manda print de Pix recebido — substitui marcacao manual no caixa.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description: 'URL da imagem do comprovante. Default: ultima imagem da conversa.',
        },
        order_id: {
          type: 'string',
          description:
            'ID do pedido pra forcar a vinculacao (use quando admin disse "vincula ao pedido X" depois de uma chamada anterior ambigua).',
        },
        payer_name_hint: {
          type: 'string',
          description:
            'Nome do pagador se admin mencionar (ex: "do Joao", "da Maria"). Ajuda no desempate quando 2+ pedidos batem o valor.',
        },
      },
    },
  },
  {
    name: 'atualizar_horario',
    description:
      'ATENCAO ACAO DESTRUTIVA (afeta agente IA + relatorios). Atualiza horario de funcionamento. Use pra "hoje fecha as 22h" ou "alterar horario de quarta". Sempre confirme com o admin antes.',
    input_schema: {
      type: 'object',
      properties: {
        weekday: {
          type: 'string',
          enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'all'],
          description: 'Dia da semana ou "all" pra aplicar a todos',
        },
        open: { type: 'string', description: 'Horario abertura HH:MM (ou null pra fechado)' },
        close: { type: 'string', description: 'Horario fechamento HH:MM' },
        closed: { type: 'boolean', description: 'Se true, marca dia como fechado' },
      },
      required: ['weekday'],
    },
  },
]

// -------------------------------------------------------------
// Dispatcher com RBAC
// -------------------------------------------------------------

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!ROLE_TOOL_ACCESS[ctx.adminRole]?.has(toolName)) {
    return {
      ok: false,
      text: `ERRO: voce (${ctx.adminRole}) nao tem permissao pra usar a ferramenta "${toolName}". Pede pro dono ou gerente.`,
      meta: { rbac_denied: true, required_tool: toolName },
    }
  }
  try {
    switch (toolName) {
      case 'consultar_estoque':
        return await toolConsultarEstoque(input as ConsultarEstoqueInput, ctx)
      case 'atualizar_estoque':
        return await toolAtualizarEstoque(input as AtualizarEstoqueInput, ctx)
      case 'consultar_pedidos':
        return await toolConsultarPedidos(input as ConsultarPedidosInput, ctx)
      case 'relatorio':
        return await toolRelatorio(input as RelatorioInput, ctx)
      case 'responder_review':
        return await toolResponderReview(input as ResponderReviewInput, ctx)
      case 'processar_cupom_compra':
        return await toolProcessarCupomCompra(input as ProcessarCupomInput, ctx)
      case 'processar_boleto':
        return await toolProcessarBoleto(input as ProcessarBoletoInput, ctx)
      case 'registrar_despesa':
        return await toolRegistrarDespesa(input as RegistrarDespesaInput, ctx)
      case 'criar_produto':
        return await toolCriarProduto(input as CriarProdutoInput, ctx)
      case 'desativar_produto':
        return await toolDesativarProduto(input as DesativarProdutoInput, ctx)
      case 'adicionar_item_pedido':
        return await toolAdicionarItemPedido(input as AdicionarItemPedidoInput, ctx)
      case 'cancelar_pedido':
        return await toolCancelarPedido(input as CancelarPedidoInput, ctx)
      case 'fechar_pedido':
        return await toolFecharPedido(input as FecharPedidoInput, ctx)
      case 'consultar_caixa':
        return await toolConsultarCaixa(input as ConsultarCaixaInput, ctx)
      case 'consultar_despesas':
        return await toolConsultarDespesas(input as ConsultarDespesasInput, ctx)
      case 'criar_reserva':
        return await toolCriarReserva(input as CriarReservaInput, ctx)
      case 'consultar_reservas':
        return await toolConsultarReservas(input as ConsultarReservasInput, ctx)
      case 'consultar_cliente':
        return await toolConsultarCliente(input as ConsultarClienteInput, ctx)
      case 'top_clientes':
        return await toolTopClientes(input as TopClientesInput, ctx)
      case 'atualizar_horario':
        return await toolAtualizarHorario(input as AtualizarHorarioInput, ctx)
      case 'reconciliar_pix':
        return await toolReconciliarPix(input as ReconciliarPixInput, ctx)
      case 'marcar_prato_pronto':
        return await toolMarcarPratoPronto(input as MarcarPratoProntoInput, ctx)
      case 'lancar_campanha':
        return await toolLancarCampanha(input as LancarCampanhaInput, ctx)
      case 'gerenciar_acesso':
        return await toolGerenciarAcesso(input as GerenciarAcessoInput, ctx)
      case 'dividir_conta':
        return await toolDividirConta(input as DividirContaInput, ctx)
      case 'transferir_mesa':
        return await toolTransferirMesa(input as TransferirMesaInput, ctx)
      default:
        return { ok: false, text: `ERRO: tool desconhecida "${toolName}"` }
    }
  } catch (err) {
    return { ok: false, text: `ERRO inesperado: ${(err as Error).message}` }
  }
}

// -------------------------------------------------------------
// Tools — estoque
// -------------------------------------------------------------

type ConsultarEstoqueInput = { query?: string; only_low?: boolean; max?: number }

async function toolConsultarEstoque(
  input: ConsultarEstoqueInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const max = Math.min(Math.max(input.max ?? 30, 1), 100)
  let query = ctx.supabase
    .from('ingredients')
    .select('id, name, current_stock, min_stock, unit')
    .eq('restaurant_id', ctx.restaurantId)
    .order('name')
    .limit(max)
  if (input.query) query = query.ilike('name', `%${input.query}%`)

  const { data, error } = await query
  if (error) return { ok: false, text: `ERRO: ${error.message}` }

  let rows = data ?? []
  if (input.only_low) {
    rows = rows.filter((row) => Number(row.current_stock) <= Number(row.min_stock ?? 0))
  }
  if (rows.length === 0) {
    return {
      ok: true,
      text: input.query
        ? `Nenhum insumo encontrado com "${input.query}".`
        : 'Nenhum insumo cadastrado ainda.',
    }
  }

  const lines = rows.map((row) => {
    const current = Number(row.current_stock)
    const min = Number(row.min_stock ?? 0)
    return `- "${row.name}": ${current} ${row.unit ?? ''} (min: ${min})${current <= min ? ' ⚠️ ABAIXO DO MINIMO' : ''}`
  })
  return {
    ok: true,
    text: `${rows.length} insumo${rows.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    meta: {
      count: rows.length,
      low_count: rows.filter((row) => Number(row.current_stock) <= Number(row.min_stock ?? 0)).length,
    },
  }
}

type AtualizarEstoqueInput = { ingredient_name: string; mode: 'set' | 'delta'; value: number }

async function toolAtualizarEstoque(
  input: AtualizarEstoqueInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (typeof input.value !== 'number' || !isFinite(input.value)) {
    return { ok: false, text: 'ERRO: valor numerico invalido' }
  }
  const { data: ingredients } = await ctx.supabase
    .from('ingredients')
    .select('id, name, current_stock, unit')
    .eq('restaurant_id', ctx.restaurantId)
  if (!ingredients || ingredients.length === 0) {
    return { ok: false, text: 'ERRO: nenhum insumo cadastrado' }
  }

  const needle = input.ingredient_name.trim().toLowerCase()
  let match = ingredients.find((row) => row.name.toLowerCase() === needle)
  if (!match) match = ingredients.find((row) => row.name.toLowerCase().includes(needle))
  if (!match) {
    return {
      ok: false,
      text: `ERRO: nao achei "${input.ingredient_name}" no estoque. Use consultar_estoque pra ver os nomes cadastrados.`,
    }
  }

  const oldStock = Number(match.current_stock)
  const newStock = input.mode === 'set' ? input.value : oldStock + input.value
  if (newStock < 0) {
    return {
      ok: false,
      text: `ERRO: estoque ficaria negativo (${newStock}). Atual: ${oldStock} ${match.unit ?? ''}.`,
    }
  }

  const { error } = await ctx.supabase
    .from('ingredients')
    .update({ current_stock: newStock })
    .eq('id', match.id)
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : {
        ok: true,
        text: `OK: "${match.name}" atualizado. ${oldStock} → ${newStock} ${match.unit ?? ''}.`,
        meta: { ingredient_id: match.id, old_stock: oldStock, new_stock: newStock },
      }
}

// -------------------------------------------------------------
// Tools — pedidos e relatorios
// -------------------------------------------------------------

type ConsultarPedidosInput = { status?: string; table_number?: number; limit?: number }

async function toolConsultarPedidos(
  input: ConsultarPedidosInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)
  let query = ctx.supabase
    .from('orders')
    .select('id, type, status, total, created_at, table:tables(number), customer:customers(name)')
    .eq('restaurant_id', ctx.restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (input.status === 'active') {
    query = query.in('status', ['open', 'preparing', 'ready'])
  } else if (input.status) {
    query = query.eq('status', input.status)
  }
  if (input.table_number) {
    const { data: table } = await ctx.supabase
      .from('tables')
      .select('id')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('number', input.table_number)
      .maybeSingle()
    if (table?.id) query = query.eq('table_id', table.id)
  }

  const { data, error } = await query
  if (error) return { ok: false, text: `ERRO: ${error.message}` }
  const rows = data ?? []
  if (rows.length === 0) return { ok: true, text: 'Nenhum pedido encontrado nesse filtro.' }

  const lines = rows.map((row) => {
    const table = Array.isArray(row.table) ? row.table[0] : row.table
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer
    const where = table?.number ? `mesa ${table.number}` : row.type
    const who = customer?.name ? ` · ${customer.name}` : ''
    const minutesAgo = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60_000)
    const total = Number(row.total ?? 0)
    return `- #${row.id.slice(0, 8)} ${where}${who} · ${row.status} · R$ ${total.toFixed(2).replace('.', ',')} · ${minutesAgo}min atras`
  })
  return {
    ok: true,
    text: `${rows.length} pedido${rows.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    meta: { count: rows.length },
  }
}

type RelatorioInput = {
  metric: 'revenue' | 'order_count' | 'top_products' | 'avg_ticket' | 'cancellation_rate' | 'cmv'
  period?: 'today' | 'yesterday' | 'last_7d' | 'last_30d' | 'this_month' | 'last_month'
}

function resolveReportPeriod(period?: string): { from: Date; to: Date; label: string } {
  const now = new Date()
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  switch (period) {
    case 'yesterday': {
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      return { from: dayStart(yesterday), to: dayStart(now), label: 'ontem' }
    }
    case 'last_7d':
      return { from: new Date(now.getTime() - 604_800_000), to: now, label: 'ultimos 7 dias' }
    case 'last_30d':
      return { from: new Date(now.getTime() - 2_592_000_000), to: now, label: 'ultimos 30 dias' }
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now, label: 'este mes' }
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
        label: 'mes passado',
      }
    default:
      return { from: dayStart(now), to: now, label: 'hoje' }
  }
}

async function toolRelatorio(input: RelatorioInput, ctx: ToolContext): Promise<ToolResult> {
  const { from, to, label } = resolveReportPeriod(input.period)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const brl = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

  switch (input.metric) {
    case 'revenue': {
      const { data } = await ctx.supabase
        .from('orders')
        .select('total, status')
        .eq('restaurant_id', ctx.restaurantId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .neq('status', 'cancelled')
      const revenue = (data ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0)
      return {
        ok: true,
        text: `Faturamento ${label}: ${brl(revenue)} (${(data ?? []).length} pedidos).`,
        meta: { revenue, count: (data ?? []).length },
      }
    }
    case 'order_count': {
      const { count } = await ctx.supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', ctx.restaurantId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
      return { ok: true, text: `Pedidos ${label}: ${count ?? 0}.`, meta: { count: count ?? 0 } }
    }
    case 'avg_ticket': {
      const { data } = await ctx.supabase
        .from('orders')
        .select('total')
        .eq('restaurant_id', ctx.restaurantId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .neq('status', 'cancelled')
      const rows = data ?? []
      const revenue = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
      const avgTicket = rows.length > 0 ? revenue / rows.length : 0
      return {
        ok: true,
        text: `Ticket medio ${label}: ${brl(avgTicket)} (${rows.length} pedidos).`,
        meta: { avg_ticket: avgTicket, count: rows.length },
      }
    }
    case 'cancellation_rate': {
      const { data } = await ctx.supabase
        .from('orders')
        .select('status')
        .eq('restaurant_id', ctx.restaurantId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
      const total = (data ?? []).length
      const cancelled = (data ?? []).filter((row) => row.status === 'cancelled').length
      const rate = total > 0 ? (cancelled / total) * 100 : 0
      return {
        ok: true,
        text: `Taxa de cancelamento ${label}: ${rate.toFixed(1)}% (${cancelled} de ${total}).`,
        meta: { rate, cancelled, total },
      }
    }
    case 'top_products': {
      const { data } = await ctx.supabase
        .from('order_items')
        .select(
          'quantity, total_price, product:products!inner(name, restaurant_id), order:orders!inner(status, restaurant_id, created_at)'
        )
        .eq('product.restaurant_id', ctx.restaurantId)
        .eq('order.restaurant_id', ctx.restaurantId)
        .neq('order.status', 'cancelled')
        .gte('order.created_at', fromIso)
        .lte('order.created_at', toIso)
        .limit(2000)
      const byProduct = new Map<string, { qty: number; revenue: number }>()
      for (const row of data ?? []) {
        const product = Array.isArray(row.product) ? row.product[0] : row.product
        const name = product?.name ?? '—'
        const entry = byProduct.get(name) ?? { qty: 0, revenue: 0 }
        entry.qty += Number(row.quantity ?? 0)
        entry.revenue += Number(row.total_price ?? 0)
        byProduct.set(name, entry)
      }
      const top = Array.from(byProduct.entries())
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5)
      if (top.length === 0) return { ok: true, text: `Sem vendas no periodo ${label}.` }
      const lines = top.map(
        ([name, entry], i) => `${i + 1}. ${name} — ${entry.qty}× (${brl(entry.revenue)})`
      )
      return {
        ok: true,
        text: `Top 5 produtos ${label}:\n${lines.join('\n')}`,
        meta: { top: top.map(([name, entry]) => ({ name, ...entry })) },
      }
    }
    case 'cmv': {
      const { data } = await ctx.supabase
        .from('order_items')
        .select(
          'quantity, total_price, product:products!inner(cost, restaurant_id), order:orders!inner(status, restaurant_id, created_at)'
        )
        .eq('product.restaurant_id', ctx.restaurantId)
        .eq('order.restaurant_id', ctx.restaurantId)
        .neq('order.status', 'cancelled')
        .gte('order.created_at', fromIso)
        .lte('order.created_at', toIso)
        .limit(5000)
      let revenue = 0
      let cost = 0
      for (const row of data ?? []) {
        const product = Array.isArray(row.product) ? row.product[0] : row.product
        revenue += Number(row.total_price ?? 0)
        cost += Number(product?.cost ?? 0) * Number(row.quantity ?? 0)
      }
      const cmv = revenue > 0 ? (cost / revenue) * 100 : 0
      return {
        ok: true,
        text: `CMV ${label}: ${cmv.toFixed(1)}% — custo ${brl(cost)} sobre receita ${brl(revenue)}.`,
        meta: { cmv, cost, revenue },
      }
    }
    default:
      return { ok: false, text: `ERRO: metrica "${input.metric}" desconhecida` }
  }
}

// -------------------------------------------------------------
// Tools — reviews
// -------------------------------------------------------------

type ResponderReviewInput = { review_id: string; response_text: string }

async function toolResponderReview(
  input: ResponderReviewInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!input.response_text || input.response_text.trim().length < 5) {
    return { ok: false, text: 'ERRO: texto da resposta muito curto (min 5 chars).' }
  }
  if (input.response_text.length > 500) {
    return { ok: false, text: 'ERRO: resposta passou de 500 chars. Encurte.' }
  }

  let reviewId = input.review_id
  if (reviewId === 'latest_negative') {
    const { data: latest } = await ctx.supabase
      .from('reviews')
      .select('id, rating, comment')
      .eq('restaurant_id', ctx.restaurantId)
      .lte('rating', 3)
      .is('reply', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return { ok: true, text: 'Nenhuma avaliacao negativa pendente de resposta.' }
    reviewId = latest.id
  }

  const { data: review } = await ctx.supabase
    .from('reviews')
    .select('id, rating, comment, reply')
    .eq('id', reviewId)
    .eq('restaurant_id', ctx.restaurantId)
    .maybeSingle()
  if (!review) return { ok: false, text: 'ERRO: avaliacao nao encontrada.' }
  if (review.reply) {
    return { ok: false, text: 'ERRO: avaliacao ja tem resposta. Use update_review pra editar (futuro).' }
  }

  const { error } = await ctx.supabase
    .from('reviews')
    .update({
      reply: input.response_text.trim(),
      reply_at: new Date().toISOString(),
      reply_by: ctx.adminUserId,
    })
    .eq('id', reviewId)
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : { ok: true, text: 'OK: resposta postada na avaliacao.', meta: { review_id: reviewId } }
}

// -------------------------------------------------------------
// Tools — multi-modal (cupom, boleto, despesa, produto)
// -------------------------------------------------------------

type ProcessarCupomInput = {
  image_url?: string
  supplier_name_hint?: string
  update_stock?: boolean
}

type ReceiptExtraction = {
  supplier_name: string | null
  date: string | null
  total: number | null
  items: Array<{
    description: string | null
    quantity: number | null
    unit_price: number | null
    total: number | null
  }>
}

async function toolProcessarCupomCompra(
  input: ProcessarCupomInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const imageUrl = input.image_url ?? ctx.lastImageUrl
  if (!imageUrl) {
    return {
      ok: false,
      text: 'ERRO: nenhuma imagem fornecida nem na conversa. Mande uma foto do cupom primeiro.',
    }
  }
  const updateStock = input.update_stock ?? true

  const extraction = await extractFromImage<ReceiptExtraction>({
    imageUrl,
    prompt: `Extraia os dados deste cupom fiscal/nota de compra de mercado/atacarejo. ${input.supplier_name_hint ? `O fornecedor provavelmente eh "${input.supplier_name_hint}".` : ''} Liste TODOS os itens visiveis (max 50). Numeros em formato brasileiro: 1.234,56 vira 1234.56.`,
    schemaHint: `{
  "supplier_name": string | null,    // nome do estabelecimento (ex: "Atacadao", "Sao Joao")
  "date": "YYYY-MM-DD" | null,       // data do cupom
  "total": number | null,             // total da nota (BRL, formato 1234.56)
  "items": [
    {
      "description": string | null,   // nome do produto como aparece (ex: "ARROZ TIPO 1 5KG")
      "quantity": number | null,      // quantidade comprada
      "unit_price": number | null,    // preco unitario BRL
      "total": number | null          // total do item BRL
    }
  ]
}`,
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null
      const obj = raw as Record<string, unknown>
      const items = Array.isArray(obj.items) ? (obj.items as Array<Record<string, unknown>>) : []
      return {
        supplier_name: typeof obj.supplier_name === 'string' ? obj.supplier_name : null,
        date: typeof obj.date === 'string' ? obj.date : null,
        total: typeof obj.total === 'number' ? obj.total : null,
        items: items.map((item) => ({
          description: typeof item.description === 'string' ? item.description : null,
          quantity: typeof item.quantity === 'number' ? item.quantity : null,
          unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
          total: typeof item.total === 'number' ? item.total : null,
        })),
      }
    },
  })
  if (!extraction.ok) return { ok: false, text: `ERRO ao processar imagem: ${extraction.error}` }

  const { data: receipt } = extraction
  if (receipt.items.length === 0) {
    return {
      ok: false,
      text: 'Nenhum item visivel no cupom. Tenta uma foto melhor (mais nitida, sem reflexo).',
    }
  }

  const total = receipt.total ?? receipt.items.reduce((sum, item) => sum + (item.total ?? 0), 0)
  const descriptionPrefix = receipt.supplier_name
    ? `Compra ${receipt.supplier_name}`
    : 'Compra (cupom processado por IA)'
  const { data: transaction, error: insertError } = await ctx.supabase
    .from('financial_transactions')
    .insert({
      restaurant_id: ctx.restaurantId,
      type: 'expense',
      category: 'suppliers',
      description: `${descriptionPrefix} — ${receipt.items.length} itens`,
      amount: total,
      status: 'paid',
      paid_at: receipt.date
        ? new Date(`${receipt.date}T12:00:00`).toISOString()
        : new Date().toISOString(),
      due_date: receipt.date ?? new Date().toISOString().slice(0, 10),
      payment_method: null,
      document_url: imageUrl,
    })
    .select('id')
    .single()
  if (insertError) return { ok: false, text: `ERRO ao registrar despesa: ${insertError.message}` }

  let matched = 0
  let skipped = 0
  const stockLines: string[] = []
  if (updateStock) {
    const { data: ingredients } = await ctx.supabase
      .from('ingredients')
      .select('id, name, current_stock, unit')
      .eq('restaurant_id', ctx.restaurantId)
    if (ingredients && ingredients.length > 0) {
      for (const item of receipt.items) {
        if (!item.description || !item.quantity) {
          skipped++
          continue
        }
        const words = item.description.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
        let best: { id: string; name: string; current_stock: number; score: number } | null = null
        for (const ingredient of ingredients) {
          const name = ingredient.name.toLowerCase()
          const score = words.filter((w) => name.includes(w)).length
          if (score > 0 && (!best || score > best.score)) {
            best = {
              id: ingredient.id,
              name: ingredient.name,
              current_stock: Number(ingredient.current_stock),
              score,
            }
          }
        }
        if (best) {
          const newStock = best.current_stock + item.quantity
          await ctx.supabase.from('ingredients').update({ current_stock: newStock }).eq('id', best.id)
          matched++
          stockLines.push(`+ ${item.quantity} → "${best.name}" (${best.current_stock} → ${newStock})`)
        } else {
          skipped++
        }
      }
    }
  }

  const lines = [
    'OK: cupom processado.',
    `Fornecedor: ${receipt.supplier_name ?? '(nao identificado)'}`,
    `Total: R$ ${total.toFixed(2).replace('.', ',')} · ${receipt.items.length} itens`,
    `Despesa registrada (id: ${transaction.id.slice(0, 8)})`,
  ]
  if (updateStock) {
    lines.push(`Estoque atualizado: ${matched} itens (${skipped} sem match)`)
    if (stockLines.length > 0 && stockLines.length <= 8) lines.push(...stockLines.slice(0, 8))
  }
  return {
    ok: true,
    text: lines.join('\n'),
    meta: {
      transaction_id: transaction.id,
      total,
      items_count: receipt.items.length,
      stock_matched: matched,
      stock_skipped: skipped,
    },
  }
}

type ProcessarBoletoInput = { image_url?: string; category_hint?: string }

type BoletoExtraction = {
  beneficiary: string | null
  amount: number | null
  due_date: string | null
  bar_code: string | null
}

async function toolProcessarBoleto(
  input: ProcessarBoletoInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const imageUrl = input.image_url ?? ctx.lastImageUrl
  if (!imageUrl) {
    return { ok: false, text: 'ERRO: nenhuma imagem fornecida. Mande foto do boleto primeiro.' }
  }

  const extraction = await extractFromImage<BoletoExtraction>({
    imageUrl,
    prompt:
      'Extraia os dados deste boleto bancario brasileiro. Numeros em formato BR (1.234,56 vira 1234.56). Data no formato YYYY-MM-DD.',
    schemaHint: `{
  "beneficiary": string | null,    // nome do beneficiario / cedente
  "amount": number | null,         // valor em BRL (1234.56)
  "due_date": "YYYY-MM-DD" | null, // data de vencimento
  "bar_code": string | null        // codigo de barras 47 ou 48 digitos (opcional)
}`,
  })
  if (!extraction.ok) return { ok: false, text: `ERRO ao ler boleto: ${extraction.error}` }

  const { data: boleto } = extraction
  if (!boleto.amount || !boleto.due_date) {
    return {
      ok: false,
      text: `ERRO: nao consegui ler valor (${boleto.amount}) ou vencimento (${boleto.due_date}) do boleto. Tenta foto mais nitida.`,
    }
  }

  const beneficiary = (boleto.beneficiary ?? '').toLowerCase()
  let category = input.category_hint ?? 'other'
  if (
    beneficiary.includes('eletric') ||
    beneficiary.includes('energi') ||
    beneficiary.includes('cemig') ||
    beneficiary.includes('enel') ||
    beneficiary.includes('cpfl') ||
    beneficiary.includes('agua') ||
    beneficiary.includes('saneamento') ||
    beneficiary.includes('sabesp') ||
    beneficiary.includes('vivo') ||
    beneficiary.includes('claro') ||
    beneficiary.includes('tim')
  ) {
    category = 'utilities'
  } else if (beneficiary.includes('aluguel') || beneficiary.includes('imobil')) {
    category = 'rent'
  }

  const { data: transaction, error } = await ctx.supabase
    .from('financial_transactions')
    .insert({
      restaurant_id: ctx.restaurantId,
      type: 'expense',
      category,
      description: `Boleto ${boleto.beneficiary ?? 'sem identificacao'}`,
      amount: boleto.amount,
      due_date: boleto.due_date,
      status: 'pending',
      document_url: imageUrl,
    })
    .select('id')
    .single()
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : {
        ok: true,
        text: `OK: boleto registrado.\nBeneficiario: ${boleto.beneficiary ?? '?'}\nValor: R$ ${boleto.amount.toFixed(2).replace('.', ',')}\nVencimento: ${boleto.due_date}\nCategoria: ${category}\nStatus: pendente.`,
        meta: { transaction_id: transaction.id, ...boleto, category },
      }
}

type RegistrarDespesaInput = {
  amount: number
  description: string
  category?: string
  paid_today?: boolean
}

async function toolRegistrarDespesa(
  input: RegistrarDespesaInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!input.amount || input.amount <= 0) {
    return { ok: false, text: 'ERRO: valor obrigatorio e positivo' }
  }
  if (!input.description?.trim()) return { ok: false, text: 'ERRO: descricao obrigatoria' }

  const paidToday = input.paid_today ?? true
  const today = new Date().toISOString().slice(0, 10)
  const { data: transaction, error } = await ctx.supabase
    .from('financial_transactions')
    .insert({
      restaurant_id: ctx.restaurantId,
      type: 'expense',
      category: input.category?.trim() ?? 'other',
      description: input.description.trim().slice(0, 200),
      amount: input.amount,
      due_date: today,
      paid_at: paidToday ? new Date().toISOString() : null,
      status: paidToday ? 'paid' : 'pending',
    })
    .select('id')
    .single()
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : {
        ok: true,
        text: `OK: despesa de R$ ${input.amount.toFixed(2).replace('.', ',')} registrada (${paidToday ? 'paga hoje' : 'pendente'}).`,
        meta: { transaction_id: transaction.id },
      }
}

type CriarProdutoInput = {
  name: string
  price: number
  description?: string
  category_name?: string
  cost?: number
}

async function toolCriarProduto(input: CriarProdutoInput, ctx: ToolContext): Promise<ToolResult> {
  if (!input.name?.trim()) return { ok: false, text: 'ERRO: name obrigatorio' }
  if (!input.price || input.price <= 0) return { ok: false, text: 'ERRO: price > 0 obrigatorio' }

  let categoryId: string | null = null
  if (input.category_name?.trim()) {
    const categoryName = input.category_name.trim()
    const { data: existing } = await ctx.supabase
      .from('categories')
      .select('id')
      .eq('restaurant_id', ctx.restaurantId)
      .ilike('name', categoryName)
      .maybeSingle()
    if (existing) {
      categoryId = existing.id
    } else {
      const { data: created } = await ctx.supabase
        .from('categories')
        .insert({ restaurant_id: ctx.restaurantId, name: categoryName, is_active: true })
        .select('id')
        .single()
      categoryId = created?.id ?? null
    }
  }

  const { data: product, error } = await ctx.supabase
    .from('products')
    .insert({
      restaurant_id: ctx.restaurantId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      price: input.price,
      cost: input.cost ?? null,
      category_id: categoryId,
      is_active: true,
      stock_tracked: false,
    })
    .select('id, name')
    .single()
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : {
        ok: true,
        text: `OK: produto "${product.name}" criado por R$ ${input.price.toFixed(2).replace('.', ',')}${input.category_name ? ` (categoria: ${input.category_name})` : ''}.`,
        meta: { product_id: product.id, name: product.name },
      }
}

type DesativarProdutoInput = { product_name: string; permanent?: boolean }

async function toolDesativarProduto(
  input: DesativarProdutoInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!input.product_name?.trim()) return { ok: false, text: 'ERRO: product_name obrigatorio' }

  const needle = input.product_name.trim().toLowerCase()
  const { data: products } = await ctx.supabase
    .from('products')
    .select('id, name, is_active')
    .eq('restaurant_id', ctx.restaurantId)
  if (!products || products.length === 0) return { ok: false, text: 'ERRO: nenhum produto cadastrado' }

  let match = products.find((row) => row.name.toLowerCase() === needle)
  if (!match) match = products.find((row) => row.name.toLowerCase().includes(needle))
  if (!match) return { ok: false, text: `ERRO: nao achei "${input.product_name}" no cardapio` }
  if (!match.is_active) return { ok: true, text: `"${match.name}" ja esta desativado.` }

  const { error } = await ctx.supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', match.id)
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : {
        ok: true,
        text: `OK: "${match.name}" desativado. Pra reativar, me avise.`,
        meta: { product_id: match.id, name: match.name, permanent: input.permanent ?? false },
      }
}

// -------------------------------------------------------------
// Tools — pedidos (mutacoes) e caixa
// -------------------------------------------------------------

const formatBRL = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

type OrderRef = { id: string; status: string; total: number; table_id: string | null }

async function findOrder(
  ctx: ToolContext,
  input: { order_id?: string; table_number?: number }
): Promise<OrderRef | null> {
  if (input.order_id) {
    let query = ctx.supabase
      .from('orders')
      .select('id, status, total, table_id')
      .eq('restaurant_id', ctx.restaurantId)
      .limit(1)
    query = input.order_id.length === 36 ? query.eq('id', input.order_id) : query.like('id', `${input.order_id}%`)
    const { data } = await query.maybeSingle()
    if (data) {
      return { id: data.id, status: data.status, total: Number(data.total ?? 0), table_id: data.table_id ?? null }
    }
  }
  if (input.table_number) {
    const { data: table } = await ctx.supabase
      .from('tables')
      .select('id')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('number', input.table_number)
      .maybeSingle()
    if (!table) return null
    const { data } = await ctx.supabase
      .from('orders')
      .select('id, status, total, table_id')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('table_id', table.id)
      .in('status', ['open', 'preparing', 'ready'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      return { id: data.id, status: data.status, total: Number(data.total ?? 0), table_id: data.table_id ?? null }
    }
  }
  return null
}

type AdicionarItemPedidoInput = {
  order_id?: string
  table_number?: number
  items: Array<{ product_name: string; qty: number; notes?: string }>
}

async function toolAdicionarItemPedido(
  input: AdicionarItemPedidoInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!input.items || input.items.length === 0) return { ok: false, text: 'ERRO: items vazio' }
  const order = await findOrder(ctx, input)
  if (!order) {
    return { ok: false, text: 'ERRO: pedido nao encontrado. Confirme order_id ou table_number.' }
  }
  if (!['open', 'preparing', 'ready'].includes(order.status)) {
    return { ok: false, text: `ERRO: pedido esta ${order.status} — nao pode adicionar item.` }
  }

  const { data: products } = await ctx.supabase
    .from('products')
    .select('id, name, price, is_active')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('is_active', true)
  if (!products) return { ok: false, text: 'ERRO: cardapio vazio' }

  const resolved: Array<{
    product_id: string
    name: string
    qty: number
    unit_price: number
    notes?: string
  }> = []
  const notFound: string[] = []
  for (const item of input.items) {
    const needle = item.product_name.trim().toLowerCase()
    let product = products.find((row) => row.name.toLowerCase() === needle)
    if (!product) product = products.find((row) => row.name.toLowerCase().includes(needle))
    if (!product) {
      notFound.push(item.product_name)
      continue
    }
    resolved.push({
      product_id: product.id,
      name: product.name,
      qty: Math.max(1, Math.floor(item.qty)),
      unit_price: Number(product.price),
      notes: item.notes,
    })
  }
  if (notFound.length > 0) {
    return { ok: false, text: `ERRO: nao achei "${notFound.join('", "')}" no cardapio.` }
  }

  const rows = resolved.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.qty,
    unit_price: item.unit_price,
    total_price: item.unit_price * item.qty,
    notes: item.notes ?? null,
  }))
  const { error } = await ctx.supabase.from('order_items').insert(rows)
  if (error) return { ok: false, text: `ERRO: ${error.message}` }

  const addedTotal = resolved.reduce((sum, item) => sum + item.unit_price * item.qty, 0)
  const newTotal = order.total + addedTotal
  await ctx.supabase.from('orders').update({ total: newTotal, subtotal: newTotal }).eq('id', order.id)

  const lines = resolved.map((item) => `+ ${item.qty}x ${item.name} (${formatBRL(item.unit_price)})`)
  return {
    ok: true,
    text: `OK: itens adicionados ao pedido #${order.id.slice(0, 8)}.\n${lines.join('\n')}\nNovo total: ${formatBRL(newTotal)}`,
    meta: { order_id: order.id, added_total: addedTotal, new_total: newTotal },
  }
}

type CancelarPedidoInput = { order_id?: string; table_number?: number; motivo: string }

async function toolCancelarPedido(
  input: CancelarPedidoInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!input.motivo?.trim()) return { ok: false, text: 'ERRO: motivo obrigatorio (vai pro audit log)' }
  const order = await findOrder(ctx, input)
  if (!order) return { ok: false, text: 'ERRO: pedido nao encontrado.' }
  if (order.status === 'cancelled') return { ok: true, text: 'Pedido ja estava cancelado.' }
  if (order.status === 'closed') {
    return { ok: false, text: 'ERRO: pedido ja foi fechado, nao pode cancelar.' }
  }

  const { error } = await ctx.supabase
    .from('orders')
    .update({
      status: 'cancelled',
      notes: `Cancelado pelo agente IA. Motivo: ${input.motivo.trim().slice(0, 500)}`,
    })
    .eq('id', order.id)
  return error
    ? { ok: false, text: `ERRO: ${error.message}` }
    : {
        ok: true,
        text: `OK: pedido #${order.id.slice(0, 8)} cancelado. Motivo registrado no audit log.`,
        meta: { order_id: order.id, motivo: input.motivo },
      }
}

type FecharPedidoInput = {
  order_id?: string
  table_number?: number
  payment_method: 'cash' | 'credit' | 'debit' | 'pix' | 'voucher'
}

async function toolFecharPedido(input: FecharPedidoInput, ctx: ToolContext): Promise<ToolResult> {
  const order = await findOrder(ctx, input)
  if (!order) return { ok: false, text: 'ERRO: pedido nao encontrado.' }
  if (order.status === 'closed') return { ok: true, text: 'Pedido ja estava fechado.' }

  const paidAt = new Date().toISOString()
  const { error: closeError } = await ctx.supabase
    .from('orders')
    .update({ status: 'closed' })
    .eq('id', order.id)
  if (closeError) return { ok: false, text: `ERRO: ${closeError.message}` }

  const { error: paymentError } = await ctx.supabase.from('payments').insert({
    restaurant_id: ctx.restaurantId,
    order_id: order.id,
    method: input.payment_method,
    amount: order.total,
    status: 'approved',
    paid_at: paidAt,
  })
  if (paymentError) {
    await ctx.supabase.from('orders').update({ status: 'ready' }).eq('id', order.id)
    return { ok: false, text: `ERRO ao registrar pagamento: ${paymentError.message}` }
  }
  return {
    ok: true,
    text: `OK: pedido #${order.id.slice(0, 8)} fechado. ${formatBRL(order.total)} via ${input.payment_method}.`,
    meta: { order_id: order.id, payment_method: input.payment_method, amount: order.total },
  }
}

type ConsultarCaixaInput = { period?: 'today' | 'yesterday' }

async function toolConsultarCaixa(input: ConsultarCaixaInput, ctx: ToolContext): Promise<ToolResult> {
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (input.period === 'yesterday') dayStart.setDate(dayStart.getDate() - 1)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const { data: payments } = await ctx.supabase
    .from('payments')
    .select('method, amount')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('status', 'approved')
    .gte('paid_at', dayStart.toISOString())
    .lt('paid_at', dayEnd.toISOString())
  if (!payments || payments.length === 0) {
    return {
      ok: true,
      text: `Caixa ${input.period === 'yesterday' ? 'de ontem' : 'de hoje'}: sem pagamentos registrados.`,
    }
  }

  const byMethod = new Map<string, { total: number; count: number }>()
  let total = 0
  for (const payment of payments) {
    const method = payment.method ?? 'outro'
    const entry = byMethod.get(method) ?? { total: 0, count: 0 }
    entry.total += Number(payment.amount ?? 0)
    entry.count += 1
    byMethod.set(method, entry)
    total += Number(payment.amount ?? 0)
  }
  const lines = Array.from(byMethod.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([method, entry]) => `- ${method}: ${formatBRL(entry.total)} (${entry.count}x)`)
  return {
    ok: true,
    text: `Caixa ${input.period === 'yesterday' ? 'ontem' : 'hoje'}: ${formatBRL(total)} em ${payments.length} pagamentos.\n${lines.join('\n')}`,
    meta: { total, count: payments.length, by_method: Object.fromEntries(byMethod) },
  }
}

type ConsultarDespesasInput = {
  period?: 'today' | 'this_month' | 'last_month' | 'last_30d'
  category?: string
  only_pending?: boolean
}

async function toolConsultarDespesas(
  input: ConsultarDespesasInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const now = new Date()
  let from: Date
  let label: string
  switch (input.period ?? 'this_month') {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      label = 'hoje'
      break
    case 'last_month':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      label = 'mes passado'
      break
    case 'last_30d':
      from = new Date(now.getTime() - 2_592_000_000)
      label = 'ultimos 30 dias'
      break
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      label = 'este mes'
  }

  let query = ctx.supabase
    .from('financial_transactions')
    .select('description, category, amount, status, due_date, paid_at')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('type', 'expense')
    .gte('due_date', from.toISOString().slice(0, 10))
    .order('due_date', { ascending: false })
    .limit(50)
  if (input.category) query = query.eq('category', input.category)
  if (input.only_pending) query = query.eq('status', 'pending')

  const { data, error } = await query
  if (error) return { ok: false, text: `ERRO: ${error.message}` }
  if (!data || data.length === 0) {
    return {
      ok: true,
      text: `Sem despesas ${label}${input.category ? ` na categoria ${input.category}` : ''}.`,
    }
  }

  const total = data.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const byCategory = new Map<string, number>()
  for (const row of data) {
    const category = row.category ?? 'outras'
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(row.amount ?? 0))
  }
  const lines = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, value]) => `- ${category}: ${formatBRL(value)}`)
  return {
    ok: true,
    text: `Despesas ${label}: ${formatBRL(total)} em ${data.length} lancamentos.\nPor categoria:\n${lines.join('\n')}`,
    meta: { total, count: data.length, by_category: Object.fromEntries(byCategory) },
  }
}

// -------------------------------------------------------------
// Tools — reservas e clientes
// -------------------------------------------------------------

type CriarReservaInput = {
  guest_name: string
  guest_phone?: string
  guest_count: number
  scheduled_for: string
  duration_minutes?: number
  notes?: string
}

async function toolCriarReserva(input: CriarReservaInput, ctx: ToolContext): Promise<ToolResult> {
  if (!input.guest_name?.trim()) return { ok: false, text: 'ERRO: guest_name obrigatorio' }
  if (!input.guest_count || input.guest_count < 1) {
    return { ok: false, text: 'ERRO: guest_count >= 1 obrigatorio' }
  }
  const scheduledFor = new Date(input.scheduled_for)
  if (isNaN(scheduledFor.getTime())) {
    return {
      ok: false,
      text: `ERRO: data invalida "${input.scheduled_for}". Use ISO 8601 tipo "2026-05-15T20:00:00".`,
    }
  }
  if (scheduledFor.getTime() < Date.now() - 60_000) return { ok: false, text: 'ERRO: data no passado' }

  let customerId: string | null = null
  if (input.guest_phone) {
    const phoneDigits = input.guest_phone.replace(/\D/g, '')
    if (phoneDigits.length >= 8) {
      const { data: existing } = await ctx.supabase
        .from('customers')
        .select('id')
        .eq('restaurant_id', ctx.restaurantId)
        .eq('phone', phoneDigits)
        .maybeSingle()
      if (existing) {
        customerId = existing.id
      } else {
        const { data: created } = await ctx.supabase
          .from('customers')
          .insert({ restaurant_id: ctx.restaurantId, name: input.guest_name.trim(), phone: phoneDigits })
          .select('id')
          .single()
        customerId = created?.id ?? null
      }
    }
  }

  const { data: reservation, error } = await ctx.supabase
    .from('reservations')
    .insert({
      restaurant_id: ctx.restaurantId,
      customer_id: customerId,
      guest_name: input.guest_name.trim(),
      guest_phone: input.guest_phone?.replace(/\D/g, '') ?? null,
      guest_count: input.guest_count,
      scheduled_for: scheduledFor.toISOString(),
      duration_minutes: input.duration_minutes ?? 90,
      status: 'confirmed',
      source: 'admin_agent',
      notes: input.notes?.trim() ?? null,
      created_by: ctx.adminUserId,
    })
    .select('id')
    .single()
  if (error) return { ok: false, text: `ERRO: ${error.message}` }

  const formatted = scheduledFor.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return {
    ok: true,
    text: `OK: reserva criada pra ${input.guest_name} (${input.guest_count} pessoas) em ${formatted}.`,
    meta: { reservation_id: reservation.id, customer_id: customerId },
  }
}

type ConsultarReservasInput = { date?: string; customer_name?: string; status?: string }

async function toolConsultarReservas(
  input: ConsultarReservasInput,
  ctx: ToolContext
): Promise<ToolResult> {
  let query = ctx.supabase
    .from('reservations')
    .select('id, guest_name, guest_count, scheduled_for, status')
    .eq('restaurant_id', ctx.restaurantId)
    .order('scheduled_for', { ascending: true })
    .limit(50)
  if (input.date) {
    const from = new Date(`${input.date}T00:00:00`).toISOString()
    const to = new Date(`${input.date}T23:59:59`).toISOString()
    query = query.gte('scheduled_for', from).lte('scheduled_for', to)
  } else {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 2)
    query = query.gte('scheduled_for', from.toISOString()).lt('scheduled_for', to.toISOString())
  }
  if (input.customer_name) query = query.ilike('guest_name', `%${input.customer_name}%`)
  if (input.status) query = query.eq('status', input.status)

  const { data } = await query
  if (!data || data.length === 0) return { ok: true, text: 'Nenhuma reserva encontrada nesse filtro.' }

  const lines = data.map(
    (row) =>
      `- ${new Date(row.scheduled_for).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${row.guest_name} (${row.guest_count}p) · ${row.status}`
  )
  return {
    ok: true,
    text: `${data.length} reserva${data.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    meta: { count: data.length },
  }
}

type ConsultarClienteInput = { phone?: string; name?: string }

async function toolConsultarCliente(
  input: ConsultarClienteInput,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!input.phone && !input.name) return { ok: false, text: 'ERRO: passe phone ou name' }

  let query = ctx.supabase
    .from('customers')
    .select('id, name, phone, email')
    .eq('restaurant_id', ctx.restaurantId)
    .limit(5)
  if (input.phone) {
    const phoneDigits = input.phone.replace(/\D/g, '')
    query = query.eq('phone', phoneDigits)
  } else if (input.name) {
    query = query.ilike('name', `%${input.name.trim()}%`)
  }

  const { data: customers } = await query
  if (!customers || customers.length === 0) {
    return { ok: true, text: 'Cliente nao encontrado no cadastro.' }
  }

  const ids = customers.map((row) => row.id)
  const { data: metrics } = await ctx.supabase
    .from('customer_metrics')
    .select('customer_id, total_orders, total_spent, last_visit_at, churn_risk')
    .in('customer_id', ids)
  const metricsById: Record<
    string,
    { total_orders?: number; total_spent?: number; last_visit_at?: string | null; churn_risk?: number }
  > = {}
  for (const metric of metrics ?? []) metricsById[metric.customer_id] = metric

  return {
    ok: true,
    text: customers
      .map((customer) => {
        const metric = metricsById[customer.id] ?? {}
        const lastVisit = metric.last_visit_at
          ? new Date(metric.last_visit_at).toLocaleDateString('pt-BR')
          : 'nunca'
        return `- ${customer.name}${customer.phone ? ` (${customer.phone})` : ''}: ${metric.total_orders ?? 0} pedidos, LTV ${formatBRL(Number(metric.total_spent ?? 0))}, ultima visita ${lastVisit}, churn ${metric.churn_risk ?? 0}%`
      })
      .join('\n'),
    meta: { count: customers.length },
  }
}

type TopClientesInput = { metric?: 'ltv' | 'orders' | 'engagement' | 'churn_risk'; limit?: number }

async function toolTopClientes(input: TopClientesInput, ctx: ToolContext): Promise<ToolResult> {
  const metric = input.metric ?? 'ltv'
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25)
  const { data: rows } = await ctx.supabase
    .from('customer_metrics')
    .select('customer_id, total_orders, total_spent, churn_risk, engagement_score')
    .eq('restaurant_id', ctx.restaurantId)
    .order(
      metric === 'ltv'
        ? 'total_spent'
        : metric === 'orders'
          ? 'total_orders'
          : metric === 'engagement'
            ? 'engagement_score'
            : 'churn_risk',
      { ascending: false }
    )
    .limit(limit)
  if (!rows || rows.length === 0) return { ok: true, text: 'Sem clientes pra ranquear.' }

  const ids = rows.map((row) => row.customer_id)
  const { data: customers } = await ctx.supabase.from('customers').select('id, name, phone').in('id', ids)
  const customerById: Record<string, { name: string; phone: string | null }> = {}
  for (const customer of customers ?? []) {
    customerById[customer.id] = { name: customer.name ?? '—', phone: customer.phone ?? null }
  }

  const lines = rows.map((row, i) => {
    const customer = customerById[row.customer_id]
    const name = customer?.name ?? '—'
    return metric === 'ltv'
      ? `${i + 1}. ${name}: ${formatBRL(Number(row.total_spent ?? 0))} (${row.total_orders ?? 0}x)`
      : metric === 'orders'
        ? `${i + 1}. ${name}: ${row.total_orders ?? 0} pedidos`
        : metric === 'engagement'
          ? `${i + 1}. ${name}: ${row.engagement_score ?? 0}% engajamento`
          : `${i + 1}. ${name}: ${row.churn_risk ?? 0}% churn`
  })
  return {
    ok: true,
    text: `Top ${limit} por ${metric}:\n${lines.join('\n')}`,
    meta: { count: rows.length, metric },
  }
}

// -------------------------------------------------------------
// Tools — horario de funcionamento
// -------------------------------------------------------------

type AtualizarHorarioInput = {
  weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'all'
  open?: string
  close?: string
  closed?: boolean
}

async function toolAtualizarHorario(
  input: AtualizarHorarioInput,
  ctx: ToolContext
): Promise<ToolResult> {
  const { data: restaurant } = await ctx.supabase
    .from('restaurants')
    .select('ai_agent_config')
    .eq('id', ctx.restaurantId)
    .maybeSingle()
  const config = (restaurant?.ai_agent_config ?? {}) as Record<string, unknown>
  const businessHours = (config.business_hours ?? {}) as Record<string, Record<string, unknown>>
  const weekdays =
    input.weekday === 'all' ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] : [input.weekday]

  const patch: Record<string, unknown> = {}
  if (input.open) patch.open = input.open
  if (input.close) patch.close = input.close
  if (typeof input.closed === 'boolean') patch.closed = input.closed
  if (Object.keys(patch).length === 0) return { ok: false, text: 'ERRO: passe open, close ou closed' }

  for (const day of weekdays) businessHours[day] = { ...(businessHours[day] ?? {}), ...patch }

  const updatedConfig = { ...config, business_hours: businessHours }
  const { error } = await ctx.supabase
    .from('restaurants')
    .update({ ai_agent_config: updatedConfig })
    .eq('id', ctx.restaurantId)
  if (error) return { ok: false, text: `ERRO: ${error.message}` }

  const dayLabels = weekdays.map((day) => WEEKDAY_LABELS[day]).join(', ')
  const description = input.closed ? 'fechado' : `${input.open ?? '?'}-${input.close ?? '?'}`
  return {
    ok: true,
    text: `OK: horario de ${dayLabels} atualizado: ${description}.`,
    meta: { weekday: input.weekday, ...patch },
  }
}

const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'segunda',
  tue: 'terca',
  wed: 'quarta',
  thu: 'quinta',
  fri: 'sexta',
  sat: 'sabado',
  sun: 'domingo',
}

// -------------------------------------------------------------
// Tools — Pix (Sprint E)
// -------------------------------------------------------------

type ReconciliarPixInput = { image_url?: string; order_id?: string; payer_name_hint?: string }

type PixExtraction = {
  amount: number | null
  datetime: string | null
  recipient_name: string | null
  recipient_pix_key: string | null
  payer_name: string | null
  txid: string | null
}

async function toolReconciliarPix(input: ReconciliarPixInput, ctx: ToolContext): Promise<ToolResult> {
  const imageUrl = input.image_url ?? ctx.lastImageUrl
  if (!imageUrl) {
    return {
      ok: false,
      text: 'ERRO: nenhuma imagem fornecida nem na conversa. Mande o print do Pix primeiro.',
    }
  }

  const extraction = await extractFromImage<PixExtraction>({
    imageUrl,
    prompt:
      'Extraia os dados deste comprovante Pix (print de banco, app de pagamento, ou notificacao). Numeros em formato brasileiro (1.234,56 vira 1234.56). Se nao for um Pix, responda { "error": "nao eh pix" }.',
    schemaHint: `{
  "amount": number | null,            // valor transferido em BRL (ex: 89.50)
  "datetime": string | null,          // data/hora ISO 8601 ou "YYYY-MM-DD HH:MM" (ex: "2026-05-09 14:32")
  "recipient_name": string | null,    // nome de quem RECEBEU (deve ser o restaurante/dono)
  "recipient_pix_key": string | null, // chave Pix do recebedor (CPF, email, telefone, aleatoria)
  "payer_name": string | null,        // nome de quem PAGOU (cliente)
  "txid": string | null               // ID/E2E da transacao (32 chars hex tipicamente)
}`,
    validate: (raw) => {
      if (!raw || typeof raw !== 'object') return null
      const obj = raw as Record<string, unknown>
      return {
        amount: typeof obj.amount === 'number' ? obj.amount : null,
        datetime: typeof obj.datetime === 'string' ? obj.datetime : null,
        recipient_name: typeof obj.recipient_name === 'string' ? obj.recipient_name : null,
        recipient_pix_key: typeof obj.recipient_pix_key === 'string' ? obj.recipient_pix_key : null,
        payer_name: typeof obj.payer_name === 'string' ? obj.payer_name : null,
        txid: typeof obj.txid === 'string' ? obj.txid : null,
      }
    },
  })
  if (!extraction.ok) {
    return { ok: false, text: `ERRO ao processar print do Pix: ${extraction.error}` }
  }

  const pix = extraction.data
  if (!pix.amount || pix.amount <= 0) {
    return {
      ok: false,
      text: 'Nao consegui ler o valor do Pix. Manda um print mais nitido (precisa mostrar o valor).',
    }
  }
  const brl = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

  if (input.order_id) {
    return await attachPixToOrder({
      ctx,
      orderId: input.order_id,
      amount: pix.amount,
      txid: pix.txid,
      payerName: pix.payer_name,
      imageUrl,
    })
  }

  const since = new Date(Date.now() - 604_800_000).toISOString()
  const minAmount = pix.amount - 0.5
  const maxAmount = pix.amount + 0.5
  const { data: candidates, error: candidatesError } = await ctx.supabase
    .from('orders')
    .select('id, number, total, table_id, customer_id, opened_at, customers(name), tables(label)')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('status', 'open')
    .gte('opened_at', since)
    .gte('total', minAmount)
    .lte('total', maxAmount)
    .order('opened_at', { ascending: false })
    .limit(10)
  if (candidatesError) return { ok: false, text: `ERRO ao buscar pedidos: ${candidatesError.message}` }

  if (candidates && candidates.length === 1) {
    return await attachPixToOrder({
      ctx,
      orderId: candidates[0].id,
      amount: pix.amount,
      txid: pix.txid,
      payerName: pix.payer_name,
      imageUrl,
    })
  }

  if (candidates && candidates.length > 1) {
    const hint = (input.payer_name_hint ?? pix.payer_name ?? '').trim().toLowerCase()
    if (hint) {
      const matches = candidates.filter((candidate) => {
        const name = (
          (candidate.customers as { name?: string | null } | null)?.name ?? ''
        ).toLowerCase()
        return name.includes(hint) || hint.includes(name)
      })
      if (matches.length === 1) {
        return await attachPixToOrder({
          ctx,
          orderId: matches[0].id,
          amount: pix.amount,
          txid: pix.txid,
          payerName: pix.payer_name,
          imageUrl,
        })
      }
    }
    const lines = candidates.map((candidate, i) => {
      const customerName = (candidate.customers as { name?: string | null } | null)?.name ?? '(sem cliente)'
      const tableLabel = (candidate.tables as { label?: string | null } | null)?.label ?? null
      const tablePrefix = tableLabel ? `mesa ${tableLabel} · ` : ''
      return `${i + 1}. Pedido #${candidate.number} · ${tablePrefix}${customerName} · ${brl(Number(candidate.total))} · aberto ${relativeTime(candidate.opened_at)}`
    })
    return {
      ok: false,
      text: [
        `Pix de ${brl(pix.amount)}${pix.payer_name ? ` (de ${pix.payer_name})` : ''} bate com ${candidates.length} pedidos abertos:`,
        ...lines,
        '',
        'Qual pedido vincular? Responde com o numero (ex: "vincula ao pedido #123").',
      ].join('\n'),
      meta: {
        ambiguous: true,
        candidates: candidates.map((candidate) => ({
          order_id: candidate.id,
          number: candidate.number,
          total: candidate.total,
        })),
        pix_amount: pix.amount,
      },
    }
  }

  const description = pix.payer_name
    ? `Pix recebido de ${pix.payer_name}${pix.txid ? ` (txid ${pix.txid.slice(0, 8)}...)` : ''}`
    : 'Pix recebido (sem pedido vinculado)'
  const paidAt = pix.datetime
    ? (parsePixDatetime(pix.datetime) ?? new Date().toISOString())
    : new Date().toISOString()
  const { data: transaction, error: insertError } = await ctx.supabase
    .from('financial_transactions')
    .insert({
      restaurant_id: ctx.restaurantId,
      type: 'income',
      category: 'pix_received',
      description,
      amount: pix.amount,
      status: 'paid',
      paid_at: paidAt,
      due_date: paidAt.slice(0, 10),
      payment_method: 'pix',
      document_url: imageUrl,
    })
    .select('id')
    .single()
  return insertError
    ? { ok: false, text: `ERRO ao registrar recebimento: ${insertError.message}` }
    : {
        ok: true,
        text: [
          `OK: Pix de ${brl(pix.amount)} registrado como recebimento avulso (sem pedido aberto compativel).`,
          pix.payer_name ? `Pagador: ${pix.payer_name}` : null,
          `ID: ${transaction.id.slice(0, 8)}`,
          '',
          'Se era de algum pedido especifico, me fala que eu vinculo manualmente.',
        ]
          .filter(Boolean)
          .join('\n'),
        meta: { transaction_id: transaction.id, type: 'unmatched', amount: pix.amount },
      }
}

function parsePixDatetime(raw: string): string | null {
  try {
    if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
      const [day, month, rest] = raw.split('/')
      const [year, time] = rest.split(' ')
      const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time ?? '12:00'}:00`
      const parsed = new Date(iso)
      return isNaN(parsed.getTime()) ? null : parsed.toISOString()
    }
    const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'))
    return isNaN(parsed.getTime()) ? null : parsed.toISOString()
  } catch {
    return null
  }
}

async function attachPixToOrder(args: {
  ctx: ToolContext
  orderId: string
  amount: number
  txid: string | null
  payerName: string | null
  imageUrl: string
}): Promise<ToolResult> {
  const { ctx, orderId, amount, txid, payerName, imageUrl } = args
  const brl = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

  const { data: order, error: orderError } = await ctx.supabase
    .from('orders')
    .select('id, number, total, status, customer_id, customers(name)')
    .eq('id', orderId)
    .eq('restaurant_id', ctx.restaurantId)
    .maybeSingle()
  if (orderError) return { ok: false, text: `ERRO: ${orderError.message}` }
  if (!order) return { ok: false, text: `ERRO: pedido ${orderId.slice(0, 8)}... nao encontrado.` }
  if (order.status !== 'open') {
    return {
      ok: false,
      text: `ERRO: pedido #${order.number} ja esta ${order.status === 'closed' ? 'fechado' : order.status}, nao da pra adicionar pagamento.`,
    }
  }

  const { error: paymentError } = await ctx.supabase.from('payments').insert({
    restaurant_id: ctx.restaurantId,
    order_id: orderId,
    method: 'pix',
    amount,
    status: 'approved',
    nsu: txid,
    authorization_code: payerName ? `Pix de ${payerName}` : null,
  })
  if (paymentError) return { ok: false, text: `ERRO ao registrar pagamento: ${paymentError.message}` }

  const { data: payments } = await ctx.supabase
    .from('payments')
    .select('amount')
    .eq('order_id', orderId)
    .eq('status', 'approved')
  const totalPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)
  const orderTotal = Number(order.total)
  let closed = false
  if (totalPaid >= orderTotal - 0.01) {
    const { error: closeError } = await ctx.supabase
      .from('orders')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', orderId)
    if (!closeError) closed = true
  }

  await ctx.supabase.from('financial_transactions').insert({
    restaurant_id: ctx.restaurantId,
    type: 'income',
    category: 'pix_order',
    description: `Pix pedido #${order.number}${payerName ? ` (${payerName})` : ''}`,
    amount,
    status: 'paid',
    paid_at: new Date().toISOString(),
    due_date: new Date().toISOString().slice(0, 10),
    payment_method: 'pix',
    document_url: imageUrl,
  })

  const customerName = (order.customers as { name?: string | null } | null)?.name ?? null
  const lines = [
    `OK: Pix de ${brl(amount)} vinculado ao pedido #${order.number}${customerName ? ` (${customerName})` : ''}.`,
    `Total do pedido: ${brl(orderTotal)} · Pago ate agora: ${brl(totalPaid)}`,
  ]
  if (closed) {
    lines.push('Pedido QUITADO e fechado automaticamente.')
  } else if (totalPaid < orderTotal) {
    lines.push(`Falta ${brl(orderTotal - totalPaid)} pra fechar.`)
  }
  return {
    ok: true,
    text: lines.join('\n'),
    meta: {
      order_id: orderId,
      order_number: order.number,
      amount,
      total_paid: totalPaid,
      order_total: orderTotal,
      closed,
    },
  }
}

function relativeTime(timestamp: string): string {
  const date = new Date(timestamp)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `ha ${minutes}min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `ha ${hours}h`
  return `ha ${Math.round(hours / 24)}d`
}

// -------------------------------------------------------------
// Tools — cozinha (Sprint E)
// -------------------------------------------------------------

type MarcarPratoProntoInput = {
  descriptions?: string[]
  table_hint?: string
  image_url?: string
  order_item_ids?: string[]
}

type PreparingItem = {
  id: string
  product_name: string
  quantity: number
  notes: string | null
  order_id: string
  order_number: number
  table_label: string | null
  created_at: string
}

async function toolMarcarPratoPronto(
  input: MarcarPratoProntoInput,
  ctx: ToolContext
): Promise<ToolResult> {
  let descriptions = input.descriptions ?? []
  const imageUrl = input.image_url ?? (descriptions.length === 0 ? ctx.lastImageUrl : null)
  const explicitIds = input.order_item_ids ?? []

  if (imageUrl && descriptions.length === 0 && explicitIds.length === 0) {
    const extraction = await extractFromImage<{
      pratos: Array<{ description: string | null; quantity: number | null }>
    }>({
      imageUrl,
      prompt:
        'Esta eh uma foto da janela/balcao da cozinha de um restaurante, com pratos prontos esperando pra serem entregues. Identifique cada prato visivel. Use descricoes em portugues, curtas e claras (ex: "lasanha", "filé com fritas", "hamburger"). Se algum prato repete, conte (quantity).',
      schemaHint: `{
  "pratos": [
    {
      "description": string | null,  // nome curto do prato (ex: "lasanha bolonhesa")
      "quantity": number | null      // quantos pratos identicos
    }
  ]
}`,
      validate: (raw) => {
        if (!raw || typeof raw !== 'object') return null
        const obj = raw as Record<string, unknown>
        return {
          pratos: (Array.isArray(obj.pratos) ? (obj.pratos as Array<Record<string, unknown>>) : []).map(
            (prato) => ({
              description: typeof prato.description === 'string' ? prato.description : null,
              quantity: typeof prato.quantity === 'number' ? prato.quantity : 1,
            })
          ),
        }
      },
    })
    if (!extraction.ok) {
      return {
        ok: false,
        text: `ERRO ao analisar foto: ${extraction.error}. Manda uma descricao em texto entao (ex: "lasanha pronta mesa 5").`,
      }
    }
    descriptions = extraction.data.pratos.flatMap((prato) =>
      prato.description ? Array<string>(Math.max(1, prato.quantity ?? 1)).fill(prato.description) : []
    )
    if (descriptions.length === 0) {
      return {
        ok: false,
        text: 'Nao identifiquei pratos na foto. Manda uma foto melhor ou descreva por texto.',
      }
    }
  }

  if (descriptions.length === 0 && explicitIds.length === 0) {
    return { ok: false, text: 'ERRO: passa as descricoes (ex: ["lasanha"]) ou foto da janela.' }
  }

  const since = new Date(Date.now() - 14_400_000).toISOString()
  let query = ctx.supabase
    .from('order_items')
    .select(
      'id, quantity, notes, created_at, status, product_id, products(name), order_id, orders(number, table_id, restaurant_id, tables(label))'
    )
    .eq('status', 'preparing')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(200)
  if (explicitIds.length > 0) query = query.in('id', explicitIds)

  const { data, error } = await query
  if (error) return { ok: false, text: `ERRO: ${error.message}` }

  const tableHint = (input.table_hint ?? '').trim().toLowerCase()
  const preparing: PreparingItem[] = (data ?? [])
    .filter((row) => {
      const order = row.orders as {
        number?: number | null
        restaurant_id?: string
        tables?: { label?: string | null } | null
      } | null
      if (!order || order.restaurant_id !== ctx.restaurantId) return false
      if (tableHint) {
        const label = (order.tables?.label ?? '').toLowerCase()
        if (!label.includes(tableHint) && !tableHint.includes(label)) return false
      }
      return true
    })
    .map((row) => {
      const order = row.orders as {
        number?: number | null
        tables?: { label?: string | null } | null
      } | null
      const product = row.products as { name?: string | null } | null
      return {
        id: row.id,
        product_name: product?.name ?? '(produto)',
        quantity: Number(row.quantity),
        notes: row.notes ?? null,
        order_id: row.order_id,
        order_number: Number(order?.number ?? 0),
        table_label: order?.tables?.label ?? null,
        created_at: row.created_at,
      }
    })
  if (preparing.length === 0) {
    return {
      ok: false,
      text: tableHint ? `Nenhum prato em preparo na mesa ${tableHint}.` : 'Nenhum prato em preparo agora.',
    }
  }

  if (explicitIds.length > 0) return await markItemsReady(ctx, preparing)

  const matched: PreparingItem[] = []
  const unmatched: string[] = []
  const usedIds = new Set<string>()
  for (const description of descriptions) {
    const needle = description.toLowerCase()
    const needleWords = needle.split(/\s+/).filter((w) => w.length > 2)
    let best: { item: PreparingItem; score: number } | null = null
    for (const item of preparing) {
      if (usedIds.has(item.id)) continue
      const productName = item.product_name.toLowerCase()
      const productWords = productName.split(/\s+/).filter((w) => w.length > 2)
      const score =
        needleWords.filter((w) => productName.includes(w)).length +
        productWords.filter((w) => needle.includes(w)).length
      if (score > 0 && (!best || score > best.score)) best = { item, score }
    }
    if (best) {
      matched.push(best.item)
      usedIds.add(best.item.id)
    } else {
      unmatched.push(description)
    }
  }

  return matched.length === 0
    ? {
        ok: false,
        text: `Nao achei match no preparo pros pratos: ${descriptions.join(', ')}.\nEm preparo agora${tableHint ? ` na mesa ${tableHint}` : ''}: ${preparing
          .slice(0, 8)
          .map((item) => item.product_name)
          .join(', ')}.`,
      }
    : await markItemsReady(ctx, matched, unmatched)
}

async function markItemsReady(
  ctx: ToolContext,
  items: PreparingItem[],
  unmatched: string[] = []
): Promise<ToolResult> {
  const ids = items.map((item) => item.id)
  const { error } = await ctx.supabase.from('order_items').update({ status: 'ready' }).in('id', ids)
  if (error) return { ok: false, text: `ERRO ao marcar pronto: ${error.message}` }

  const orderIds = Array.from(new Set(items.map((item) => item.order_id)))
  const fullyReadyOrders: number[] = []
  for (const orderId of orderIds) {
    const { data: orderItems } = await ctx.supabase
      .from('order_items')
      .select('status')
      .eq('order_id', orderId)
    if (
      orderItems &&
      orderItems.length > 0 &&
      orderItems.every((item) => ['ready', 'delivered', 'cancelled'].includes(item.status))
    ) {
      await ctx.supabase
        .from('orders')
        .update({ status: 'ready' })
        .eq('id', orderId)
        .in('status', ['open', 'in_kitchen'])
      const sample = items.find((item) => item.order_id === orderId)
      if (sample) fullyReadyOrders.push(sample.order_number)
    }
  }

  const byTable = new Map<string, PreparingItem[]>()
  for (const item of items) {
    const key = item.table_label ?? `pedido_${item.order_number}`
    if (!byTable.has(key)) byTable.set(key, [])
    byTable.get(key)!.push(item)
  }
  for (const [key, tableItems] of byTable.entries()) {
    const title = key.startsWith('pedido_')
      ? `Pratos prontos · pedido #${tableItems[0].order_number}`
      : `Pratos prontos · mesa ${key}`
    const body = tableItems.map((item) => `${item.quantity}× ${item.product_name}`).join(', ')
    await ctx.supabase.from('notifications').insert({
      restaurant_id: ctx.restaurantId,
      type: 'system',
      title,
      body,
      href: '/pedidos',
    })
  }

  const lines = [
    `OK: ${items.length} prato${items.length === 1 ? '' : 's'} marcado${items.length === 1 ? '' : 's'} como PRONTO.`,
  ]
  for (const item of items) {
    const where = item.table_label ? `mesa ${item.table_label}` : `#${item.order_number}`
    lines.push(`- ${item.quantity}× ${item.product_name} (${where})`)
  }
  if (fullyReadyOrders.length > 0) {
    lines.push(
      `Pedido${fullyReadyOrders.length === 1 ? '' : 's'} ${fullyReadyOrders.map((n) => `#${n}`).join(', ')} todo${fullyReadyOrders.length === 1 ? '' : 's'} pronto${fullyReadyOrders.length === 1 ? '' : 's'} — garcom notificado.`
    )
  }
  if (unmatched.length > 0) lines.push(`Sem match: ${unmatched.join(', ')}.`)
  return {
    ok: true,
    text: lines.join('\n'),
    meta: { ready_count: items.length, ready_ids: ids, orders_closed: fullyReadyOrders, unmatched },
  }
}

// -------------------------------------------------------------
// Tools — operacao avancada (Sprint C+)
// -------------------------------------------------------------

type LancarCampanhaInput = {
  template_name_query: string
  audience_name_query: string
  campaign_name?: string
  schedule_at?: string
}

async function toolLancarCampanha(input: LancarCampanhaInput, ctx: ToolContext): Promise<ToolResult> {
  if (!input.template_name_query || !input.audience_name_query) {
    return { ok: false, text: 'ERRO: passa template_name_query e audience_name_query.' }
  }

  const { data: templates } = await ctx.supabase
    .from('campaign_templates')
    .select('id, name, wa_body')
    .eq('restaurant_id', ctx.restaurantId)
    .ilike('name', `%${input.template_name_query}%`)
    .limit(5)
  if (!templates || templates.length === 0) {
    return {
      ok: false,
      text: `ERRO: nao achei template com "${input.template_name_query}". Cria primeiro no dashboard de Marketing > Templates.`,
    }
  }
  if (templates.length > 1) {
    const names = templates.map((template) => `"${template.name}"`).join(', ')
    return { ok: false, text: `Achei ${templates.length} templates: ${names}. Especifica melhor qual.` }
  }
  const template = templates[0]

  const { data: audiences } = await ctx.supabase
    .from('campaign_audiences')
    .select('id, name, cached_count')
    .eq('restaurant_id', ctx.restaurantId)
    .ilike('name', `%${input.audience_name_query}%`)
    .limit(5)
  if (!audiences || audiences.length === 0) {
    return {
      ok: false,
      text: `ERRO: nao achei audience com "${input.audience_name_query}". Cria primeiro no dashboard de Marketing > Audiences.`,
    }
  }
  if (audiences.length > 1) {
    const names = audiences.map((audience) => `"${audience.name}"`).join(', ')
    return { ok: false, text: `Achei ${audiences.length} audiences: ${names}. Especifica melhor qual.` }
  }
  const audience = audiences[0]
  const audienceCount = Number(audience.cached_count ?? 0)

  const scheduledAt = input.schedule_at ? new Date(input.schedule_at) : new Date()
  if (isNaN(scheduledAt.getTime())) {
    return { ok: false, text: 'ERRO: schedule_at em formato invalido (use ISO 8601).' }
  }

  const campaignName =
    input.campaign_name?.trim() || `${template.name} · ${new Date().toLocaleDateString('pt-BR')}`
  const { data: campaign, error: campaignError } = await ctx.supabase
    .from('campaigns')
    .insert({
      restaurant_id: ctx.restaurantId,
      name: campaignName,
      type: 'one_shot',
      status: 'scheduled',
      channel: 'whatsapp',
      audience_id: audience.id,
      audience_count: audienceCount,
      scheduled_at: scheduledAt.toISOString(),
      next_run_at: scheduledAt.toISOString(),
      stats_total: audienceCount,
    })
    .select('id')
    .single()
  if (campaignError || !campaign) {
    return { ok: false, text: `ERRO ao criar campanha: ${campaignError?.message ?? 'unknown'}` }
  }

  const { error: stepError } = await ctx.supabase.from('campaign_steps').insert({
    campaign_id: campaign.id,
    step_order: 1,
    step_type: 'send_message',
    template_id: template.id,
  })
  if (stepError) {
    await ctx.supabase.from('campaigns').delete().eq('id', campaign.id)
    return { ok: false, text: `ERRO ao criar step: ${stepError.message}` }
  }

  const timing =
    scheduledAt.getTime() > Date.now() + 60_000
      ? `agendada pra ${scheduledAt.toLocaleString('pt-BR')}`
      : 'dispatcher vai mandar nos proximos 5min'
  return {
    ok: true,
    text: `OK: campanha "${campaignName}" criada (id ${campaign.id.slice(0, 8)}). Template: "${template.name}". Audience: "${audience.name}" (~${audienceCount} destinatarios). ${timing}.`,
    meta: {
      campaign_id: campaign.id,
      template_id: template.id,
      audience_id: audience.id,
      audience_count: audienceCount,
      scheduled_at: scheduledAt.toISOString(),
    },
  }
}

type GerenciarAcessoInput = {
  action: 'list' | 'add' | 'remove' | 'change_role'
  phone?: string
  display_name?: string
  role?: AdminRole
}

async function toolGerenciarAcesso(input: GerenciarAcessoInput, ctx: ToolContext): Promise<ToolResult> {
  if (ctx.adminRole !== 'owner') {
    return { ok: false, text: `ERRO: apenas owner pode gerenciar acesso (voce eh ${ctx.adminRole}).` }
  }

  if (input.action === 'list') {
    const { data: admins, error } = await ctx.supabase
      .from('admin_agent_users')
      .select('phone, display_name, role, active, last_action_at, actions_count')
      .eq('restaurant_id', ctx.restaurantId)
      .order('display_name')
    if (error) return { ok: false, text: `ERRO: ${error.message}` }
    if (!admins || admins.length === 0) return { ok: true, text: 'Nenhum admin cadastrado ainda.' }
    const lines = admins.map((admin) => {
      const status = admin.active ? '✅' : '❌'
      const lastAction = admin.last_action_at ? ` · ultima ${relativeTime(admin.last_action_at)}` : ''
      return `${status} ${admin.display_name} (${admin.role}) · ${admin.phone} · ${admin.actions_count} acoes${lastAction}`
    })
    return { ok: true, text: `${admins.length} admin${admins.length === 1 ? '' : 's'}:\n${lines.join('\n')}` }
  }

  if (!input.phone) return { ok: false, text: 'ERRO: phone obrigatorio pra add/remove/change_role.' }
  const phoneDigits = input.phone.replace(/\D/g, '')
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return { ok: false, text: 'ERRO: telefone invalido (10-15 digitos).' }
  }

  if (input.action === 'add') {
    if (!input.display_name) return { ok: false, text: 'ERRO: display_name obrigatorio em add.' }
    if (!input.role) return { ok: false, text: 'ERRO: role obrigatorio em add.' }
    const { data: existing } = await ctx.supabase
      .from('admin_agent_users')
      .select('id, active')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('phone', phoneDigits)
      .maybeSingle()
    if (existing) {
      await ctx.supabase
        .from('admin_agent_users')
        .update({ active: true, display_name: input.display_name, role: input.role })
        .eq('id', existing.id)
      return {
        ok: true,
        text: `OK: ${input.display_name} (${input.role}) ${existing.active ? 'atualizado' : 'reativado'}. Telefone ${phoneDigits}.`,
      }
    }
    const { error } = await ctx.supabase.from('admin_agent_users').insert({
      restaurant_id: ctx.restaurantId,
      phone: phoneDigits,
      display_name: input.display_name,
      role: input.role,
      active: true,
    })
    return error
      ? { ok: false, text: `ERRO: ${error.message}` }
      : {
          ok: true,
          text: `OK: ${input.display_name} (${input.role}) adicionado. Telefone ${phoneDigits}. Ja pode falar com o agente.`,
        }
  }

  if (input.action === 'remove') {
    const { error } = await ctx.supabase
      .from('admin_agent_users')
      .update({ active: false })
      .eq('restaurant_id', ctx.restaurantId)
      .eq('phone', phoneDigits)
    return error
      ? { ok: false, text: `ERRO: ${error.message}` }
      : { ok: true, text: `OK: telefone ${phoneDigits} desativado (audit log preservado).` }
  }

  if (input.action === 'change_role') {
    if (!input.role) return { ok: false, text: 'ERRO: role obrigatorio em change_role.' }
    const { error } = await ctx.supabase
      .from('admin_agent_users')
      .update({ role: input.role })
      .eq('restaurant_id', ctx.restaurantId)
      .eq('phone', phoneDigits)
    return error
      ? { ok: false, text: `ERRO: ${error.message}` }
      : { ok: true, text: `OK: ${phoneDigits} agora eh ${input.role}.` }
  }

  return { ok: false, text: `ERRO: action invalida "${input.action}"` }
}

type DividirContaInput = {
  order_number?: number
  order_id?: string
  split_into?: number
  by_consumption?: Array<{ person_name: string; item_names: string[] }>
  include_service_fee?: boolean
}

async function toolDividirConta(input: DividirContaInput, ctx: ToolContext): Promise<ToolResult> {
  if (!input.order_number && !input.order_id) {
    return { ok: false, text: 'ERRO: passa order_number ou order_id.' }
  }

  let query = ctx.supabase
    .from('orders')
    .select(
      'id, number, status, total, subtotal, discount, service_fee, table_id, tables(label), order_items(quantity, unit_price, total, products(name))'
    )
    .eq('restaurant_id', ctx.restaurantId)
  if (input.order_id) {
    query = query.eq('id', input.order_id)
  } else if (input.order_number) {
    query = query.eq('number', input.order_number)
  }

  const { data: order, error } = await query.maybeSingle()
  if (error) return { ok: false, text: `ERRO: ${error.message}` }
  if (!order) {
    return { ok: false, text: `ERRO: pedido ${input.order_number ?? input.order_id} nao encontrado.` }
  }
  if (order.status !== 'open') {
    return { ok: false, text: `ERRO: pedido #${order.number} ja esta ${order.status}, nao da pra dividir.` }
  }

  const total = Number(order.total)
  const serviceFee = Number(order.service_fee ?? 0)
  const includeServiceFee = input.include_service_fee ?? serviceFee > 0
  const divisibleTotal = includeServiceFee ? total : total - serviceFee
  const tableLabel = (order.tables as { label?: string | null } | null)?.label ?? null
  const brl = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

  if (input.by_consumption && input.by_consumption.length > 0) {
    const pool = (
      (order.order_items ?? []) as Array<{
        quantity: number
        unit_price: number
        total: number
        products: { name?: string | null } | null
      }>
    ).map((item) => ({
      name: (item.products?.name ?? 'item').toLowerCase(),
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
      line_total: Number(item.total),
      remaining_qty: Number(item.quantity),
    }))
    const breakdown: Array<{
      person: string
      items: Array<{ name: string; qty: number; price: number }>
      subtotal: number
    }> = []
    for (const person of input.by_consumption) {
      const personItems: Array<{ name: string; qty: number; price: number }> = []
      let subtotal = 0
      for (const itemName of person.item_names) {
        const needle = itemName.toLowerCase()
        const needleWords = needle.split(/\s+/).filter((w) => w.length > 2)
        const match = pool.find(
          (poolItem) =>
            !(poolItem.remaining_qty <= 0) &&
            (needleWords.some((w) => poolItem.name.includes(w)) ||
              poolItem.name
                .split(/\s+/)
                .filter((w) => w.length > 2)
                .some((w) => needle.includes(w)))
        )
        if (match) {
          match.remaining_qty -= 1
          personItems.push({ name: match.name, qty: 1, price: match.unit_price })
          subtotal += match.unit_price
        }
      }
      breakdown.push({ person: person.person_name, items: personItems, subtotal })
    }

    const unassignedTotal = pool.reduce((sum, item) => sum + item.remaining_qty * item.unit_price, 0)
    const sharedFee = includeServiceFee ? serviceFee : 0
    const sharedPerPerson = breakdown.length > 0 ? (unassignedTotal + sharedFee) / breakdown.length : 0
    const lines = [
      `📋 *Pedido #${order.number}*${tableLabel ? ` (${tableLabel})` : ''}`,
      `Total: ${brl(total)}${includeServiceFee && serviceFee > 0 ? ` (inclui servico ${brl(serviceFee)})` : ''}`,
      '',
    ]
    for (const entry of breakdown) {
      const itemsText =
        entry.items.length > 0
          ? entry.items.map((item) => `${item.name} ${brl(item.price)}`).join(' + ')
          : '(sem itens proprios)'
      const personTotal = entry.subtotal + sharedPerPerson
      lines.push(
        `*${entry.person}*: ${itemsText}${sharedPerPerson > 0 ? ` + ${brl(sharedPerPerson)} (rateio)` : ''} = *${brl(personTotal)}*`
      )
    }
    const difference =
      divisibleTotal -
      (breakdown.reduce((sum, entry) => sum + entry.subtotal, 0) + sharedPerPerson * breakdown.length)
    if (Math.abs(difference) > 0.05) {
      lines.push('')
      lines.push(
        `⚠️ Diferenca de ${brl(Math.abs(difference))}${difference > 0 ? ' restante' : ' a mais'} — confere os items.`
      )
    }
    return {
      ok: true,
      text: lines.join('\n'),
      meta: {
        mode: 'by_consumption',
        order_id: order.id,
        breakdown: breakdown.map((entry) => ({
          person: entry.person,
          subtotal: entry.subtotal,
          shared: sharedPerPerson,
          total: entry.subtotal + sharedPerPerson,
        })),
      },
    }
  }

  const splitInto = Math.max(2, input.split_into ?? 2)
  const perPerson = divisibleTotal / splitInto
  return {
    ok: true,
    text: `📋 *Pedido #${order.number}*${tableLabel ? ` (${tableLabel})` : ''}\nTotal: ${brl(total)}${includeServiceFee && serviceFee > 0 ? ` (inclui servico ${brl(serviceFee)})` : ''}\nDividido em *${splitInto}*: cada um paga *${brl(perPerson)}*`,
    meta: { mode: 'equal', order_id: order.id, split_into: splitInto, per_person: perPerson, total: divisibleTotal },
  }
}

type TransferirMesaInput = { from_table_number: number; to_table_number: number }

async function toolTransferirMesa(input: TransferirMesaInput, ctx: ToolContext): Promise<ToolResult> {
  if (input.from_table_number === input.to_table_number) {
    return { ok: false, text: 'ERRO: from e to sao a mesma mesa.' }
  }

  const { data: tables } = await ctx.supabase
    .from('tables')
    .select('id, number, label, status')
    .eq('restaurant_id', ctx.restaurantId)
    .in('number', [input.from_table_number, input.to_table_number])
  if (!tables || tables.length < 2) {
    const found = tables?.map((table) => table.number) ?? []
    return {
      ok: false,
      text: `ERRO: mesa(s) nao encontrada(s). Esperava ${input.from_table_number} e ${input.to_table_number}, achei ${found.join(', ') || 'nenhuma'}.`,
    }
  }

  const fromTable = tables.find((table) => table.number === input.from_table_number)!
  const toTable = tables.find((table) => table.number === input.to_table_number)!

  const { data: openOrders } = await ctx.supabase
    .from('orders')
    .select('id, number, total')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('table_id', fromTable.id)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
  if (!openOrders || openOrders.length === 0) {
    return { ok: false, text: `ERRO: nao tem pedido aberto na mesa ${input.from_table_number}.` }
  }
  if (openOrders.length > 1) {
    return {
      ok: false,
      text: `ERRO: ${openOrders.length} pedidos abertos na mesa ${input.from_table_number} (${openOrders.map((order) => `#${order.number}`).join(', ')}). Indica qual transferir.`,
    }
  }
  const order = openOrders[0]

  const { data: destinationOrders } = await ctx.supabase
    .from('orders')
    .select('id, number')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('table_id', toTable.id)
    .eq('status', 'open')
  if (destinationOrders && destinationOrders.length > 0) {
    return {
      ok: false,
      text: `ERRO: mesa ${input.to_table_number} ja tem pedido aberto (#${destinationOrders[0].number}). Fecha primeiro ou escolhe outra mesa.`,
    }
  }

  const { error } = await ctx.supabase.from('orders').update({ table_id: toTable.id }).eq('id', order.id)
  if (error) return { ok: false, text: `ERRO ao mover pedido: ${error.message}` }
  await ctx.supabase.from('tables').update({ status: 'free' }).eq('id', fromTable.id)
  await ctx.supabase.from('tables').update({ status: 'occupied' }).eq('id', toTable.id)
  return {
    ok: true,
    text: `OK: pedido #${order.number} transferido da mesa ${input.from_table_number} pra mesa ${input.to_table_number}.`,
    meta: {
      order_id: order.id,
      order_number: order.number,
      from_table_id: fromTable.id,
      to_table_id: toTable.id,
    },
  }
}

// -------------------------------------------------------------
// Agent loop
// -------------------------------------------------------------

export type AdminAgentToolCall = {
  name: string
  input: Record<string, unknown>
  result: string
  ok: boolean
}

export type RunAdminAgentInput = {
  supabase: SupabaseClient
  restaurantId: string
  restaurantName: string
  adminUserId: string | null
  adminPhone: string
  adminRole: AdminRole
  adminName?: string | null
  conversationId: string | null
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  inputKind: 'text' | 'audio' | 'image' | 'mixed'
  inputAttachmentUrl?: string | null
  lastImageUrl?: string | null
  persona?: string
  tone?: string
}

export type RunAdminAgentResult =
  | {
      action: 'reply'
      text: string
      iterations: number
      toolCalls: AdminAgentToolCall[]
      tokensIn: number
      tokensOut: number
      costBrl: number
    }
  | { action: 'skip'; reason: string }
  | { action: 'error'; reason: string }

const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Tom formal, sempre "voce".',
  casual: 'Tom casual brasileiro, pode usar girias leves.',
  direto: 'Tom direto, sem floreios. Maximo 2 linhas por resposta.',
}

function describeRolePermissions(role: AdminRole): string {
  switch (role) {
    case 'owner':
      return 'Acesso total (tudo).'
    case 'manager':
      return 'Gerencia operacao + relatorios + reviews. Sem config + RH.'
    case 'kitchen':
      return 'So estoque + cardapio + receitas. Pedidos vc PODE consultar mas nao alterar.'
    case 'cashier':
      return 'So caixa + pedidos + financeiro. Pode consultar, fechar, registrar.'
    case 'waiter':
      return 'So pedidos + mesas + reservas. Sem financeiro.'
  }
}

function buildSystemPrompt(args: {
  restaurantName: string
  adminName?: string | null
  adminRole: AdminRole
  persona: string
  tone: string
}): string {
  const toneInstruction = TONE_INSTRUCTIONS[args.tone]
  return `Voce e ${args.persona} do restaurante ${args.restaurantName}.

CONTEXTO IMPORTANTE:
- Voce esta conversando com ${args.adminName ?? 'um admin'} (role: ${args.adminRole}) via WhatsApp.
- Voce tem ferramentas que EXECUTAM acoes no sistema do restaurante (atualizar estoque, ler relatorios, etc).
- Toda acao executada eh auditada — o admin sempre pode ver o que voce fez.

REGRAS DE OURO:
- Seja BREVE. Maximo 2-3 linhas por mensagem.
- ${toneInstruction}
- Quando usar ferramentas, NAO comente "vou usar tal tool" — apenas use e responda com o RESULTADO.
- Se a ferramenta retornar erro, traduza pra linguagem normal e sugira proximo passo.
- NUNCA invente dados (precos, estoques, etc). Sempre consulte primeiro com a tool apropriada.

CONFIRMATION GATE — OBRIGATORIO pra acoes DESTRUTIVAS:
Tools marcadas com "ATENCAO ACAO DESTRUTIVA" exigem confirmacao verbal explicita do admin antes de chamar.
Fluxo correto:
  1. Admin pede algo destrutivo (ex: "cancela pedido da mesa 5")
  2. Voce responde DESCREVENDO o que vai fazer e perguntando "confirma?" — SEM CHAMAR a tool ainda
  3. Se admin responder "sim", "ok", "confirma", "pode" → ai voce chama a tool
  4. Se admin responder "nao", "espera", "cancela isso" → voce nao chama a tool
Tools destrutivas atuais: cancelar_pedido, atualizar_horario, lancar_campanha (mass send), gerenciar_acesso (action=remove ou change_role).
Tools que envolvem dinheiro acima de R$ 100 tambem pedem confirmacao mesmo se nao destrutivas.

PERMISSOES (role=${args.adminRole}):
${describeRolePermissions(args.adminRole)}

CASOS COMUNS:
- "tá acabando arroz" → consultar_estoque(query="arroz") pra confirmar nome → confirma com admin → atualizar_estoque
- "faturamento ontem?" → relatorio(metric="revenue", period="yesterday")
- "tem pedido aberto?" → consultar_pedidos(status="active")
- "responde aquela avaliacao 1 estrela: ..." → responder_review(review_id="latest_negative", response_text=...)

MULTI-MODAL (Sprint B):
- Quando admin manda FOTO + texto tipo "compra Atacadao" → processar_cupom_compra (image_url eh automatico do contexto, nao precisa passar)
- Quando admin manda FOTO + texto tipo "boleto luz" → processar_boleto
- Quando admin diz "paguei R$X de Y" sem foto → registrar_despesa
- "novo prato pizza calabresa R$ 45" → criar_produto
- "tira pizza do menu" → desativar_produto

PIX (Sprint E):
- Quando admin manda FOTO + texto tipo "Pix do Joao", "recebi pix", "comprovante", "pagamento", ou print que parece de banco/Nubank/Itau/PicPay → reconciliar_pix
- A tool tenta vincular ao pedido aberto sozinha. Se ambigua (varios pedidos com mesmo valor), ela retorna a lista — ai voce passa pra admin escolher
- Se admin responde "vincula ao pedido #N" depois de uma resposta ambigua → reconciliar_pix(order_id="...", image_url=da_msg_anterior)
- Se admin manda print sem texto, ainda pode ser Pix — chame reconciliar_pix por default antes de processar_cupom_compra (Pix tem padrao bem distinto)

COZINHA — PRATOS PRONTOS (Sprint E):
- Quando cozinha (role=kitchen ou waiter) fala/escreve "lasanha mesa 5 pronta", "saiu o filé", "pode levar a feijoada" → marcar_prato_pronto(descriptions=[...], table_hint="...")
- Quando cozinha manda FOTO da janela com pratos prontos → marcar_prato_pronto(image_url=auto) — vision identifica os pratos automaticamente em batch
- Pode marcar varios de uma vez: "lasanha, hamburger e suco de laranja prontos" → descriptions=["lasanha", "hamburger", "suco de laranja"]
- Se a tool diz "nao achei match", liste pra cozinha o que ta em preparo e peca pra confirmar o nome exato

OPERACAO AVANCADA (Sprint C+):
- "manda a campanha X" / "dispara aquela promo" → CONFIRME nome + audiencia + qtd → lancar_campanha (DESTRUTIVA — sempre confirma)
- "adiciona o Joao como gerente" / "tira a Maria do acesso" / "muda Carlos pra cashier" → gerenciar_acesso (so owner pode usar)
- "divide a conta da mesa 5 em 4" → dividir_conta(order_number=..., split_into=4)
- "divide pelo que cada um pediu" → dividir_conta(by_consumption=[{person_name, item_names}])
- "passa o pedido da mesa 5 pra mesa 12" → transferir_mesa(from=5, to=12)

IMPORTANTE: portugues brasileiro sempre.`
}

export async function runAdminAgent(input: RunAdminAgentInput): Promise<RunAdminAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { action: 'skip', reason: 'no_api_key' }
  if (input.messages.length === 0) return { action: 'skip', reason: 'no_messages' }

  const startedAt = Date.now()
  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt({
    restaurantName: input.restaurantName,
    adminName: input.adminName,
    adminRole: input.adminRole,
    persona: input.persona ?? 'um co-piloto operacional eficiente e direto',
    tone: input.tone ?? 'casual',
  })
  const ctx: ToolContext = {
    supabase: input.supabase,
    restaurantId: input.restaurantId,
    adminUserId: input.adminUserId,
    adminPhone: input.adminPhone,
    adminRole: input.adminRole,
    adminName: input.adminName,
    conversationId: input.conversationId,
    lastImageUrl: input.lastImageUrl ?? null,
  }
  const conversation: Anthropic.MessageParam[] = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
  const toolCalls: AdminAgentToolCall[] = []
  let tokensIn = 0
  let tokensOut = 0
  const inputExcerpt = input.messages[input.messages.length - 1]?.content?.slice(0, 500) ?? ''

  try {
    for (let iteration = 0; iteration < 6; iteration++) {
      const response = await client.messages.create({
        model: AGENT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: conversation,
      })
      tokensIn += response.usage.input_tokens
      tokensOut += response.usage.output_tokens

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )
      if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        )
        const text = textBlock?.text?.trim() ?? ''
        const costBrl = (tokensIn / 1000) * 0.0162 + (tokensOut / 1000) * 0.081
        await persistAgentAudit(input, ctx, toolCalls, {
          iterations: iteration + 1,
          tokensIn,
          tokensOut,
          costBrl,
          durationMs: Date.now() - startedAt,
          inputExcerpt,
        })
        return {
          action: 'reply',
          text: text || 'OK.',
          iterations: iteration + 1,
          toolCalls,
          tokensIn,
          tokensOut,
          costBrl,
        }
      }

      conversation.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, ctx)
        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          result: result.text,
          ok: result.ok,
        })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.text,
          is_error: !result.ok,
        })
      }
      conversation.push({ role: 'user', content: toolResults })
    }

    const costBrl = (tokensIn / 1000) * 0.0162 + (tokensOut / 1000) * 0.081
    await persistAgentAudit(input, ctx, toolCalls, {
      iterations: 6,
      tokensIn,
      tokensOut,
      costBrl,
      durationMs: Date.now() - startedAt,
      inputExcerpt,
    })
    return { action: 'error', reason: 'agente excedeu 6 iteracoes sem fechar a resposta' }
  } catch (err) {
    const reason = (err as Error).message ?? 'unknown error'
    await input.supabase.from('admin_agent_actions').insert({
      restaurant_id: input.restaurantId,
      admin_user_id: input.adminUserId,
      admin_phone: input.adminPhone,
      conversation_id: input.conversationId,
      input_kind: input.inputKind,
      input_excerpt: inputExcerpt,
      input_attachment_url: input.inputAttachmentUrl ?? null,
      tool_name: '__error__',
      tool_input: {},
      status: 'failed',
      error_message: reason.slice(0, 500),
      duration_ms: Date.now() - startedAt,
    })
    return { action: 'error', reason }
  }
}

async function persistAgentAudit(
  input: RunAdminAgentInput,
  ctx: ToolContext,
  toolCalls: AdminAgentToolCall[],
  stats: {
    iterations: number
    tokensIn: number
    tokensOut: number
    costBrl: number
    durationMs: number
    inputExcerpt: string
  }
): Promise<void> {
  const baseRow = {
    restaurant_id: input.restaurantId,
    admin_user_id: input.adminUserId,
    admin_phone: input.adminPhone,
    conversation_id: input.conversationId,
    input_kind: input.inputKind,
    input_excerpt: stats.inputExcerpt,
    input_attachment_url: input.inputAttachmentUrl ?? null,
    iterations: stats.iterations,
    tokens_in: stats.tokensIn,
    tokens_out: stats.tokensOut,
    cost_brl: stats.costBrl,
    duration_ms: stats.durationMs,
  }
  if (toolCalls.length === 0) {
    await input.supabase
      .from('admin_agent_actions')
      .insert({ ...baseRow, tool_name: '__chat__', tool_input: {}, status: 'success' })
  } else {
    const rows = toolCalls.map((call) => ({
      ...baseRow,
      tool_name: call.name,
      tool_input: call.input,
      tool_result: { text: call.result.slice(0, 2000) },
      status: call.ok ? 'success' : 'failed',
      error_message: call.ok ? null : call.result.slice(0, 500),
    }))
    await input.supabase.from('admin_agent_actions').insert(rows)
  }
  if (input.adminUserId) {
    await input.supabase.rpc('increment_admin_user_actions', { p_user_id: input.adminUserId })
  }
}

// -------------------------------------------------------------
// Lookup do admin + rate limit (usados pelo webhook Z-API)
// -------------------------------------------------------------

export type AdminAgentInfo = {
  user: {
    id: string
    restaurant_id: string
    role: AdminRole
    display_name: string
    user_id: string | null
  }
  agent: { enabled: boolean; persona: string; tone: string }
}

export async function findAdminByPhone(
  supabase: SupabaseClient,
  phone: string
): Promise<AdminAgentInfo | null> {
  const phoneDigits = phone.replace(/\D/g, '')
  if (!phoneDigits) return null

  const { data: adminUser } = await supabase
    .from('admin_agent_users')
    .select('id, restaurant_id, role, display_name, user_id, active')
    .eq('phone', phoneDigits)
    .eq('active', true)
    .maybeSingle()
  if (!adminUser) return null

  const { data: agent } = await supabase
    .from('admin_agents')
    .select('enabled, persona, tone')
    .eq('restaurant_id', adminUser.restaurant_id)
    .maybeSingle()
  if (!agent || !agent.enabled) return null

  return {
    user: {
      id: adminUser.id,
      restaurant_id: adminUser.restaurant_id,
      role: adminUser.role,
      display_name: adminUser.display_name,
      user_id: adminUser.user_id ?? null,
    },
    agent: {
      enabled: agent.enabled,
      persona: agent.persona ?? 'um co-piloto operacional eficiente e direto',
      tone: agent.tone ?? 'casual',
    },
  }
}

export async function checkAdminRateLimit(
  supabase: SupabaseClient,
  phone: string,
  maxActionsPerHour: number
): Promise<{ allowed: boolean; current?: number }> {
  const { data: count } = await supabase.rpc('count_admin_actions_in_window', {
    p_admin_phone: phone.replace(/\D/g, ''),
    p_window_minutes: 60,
  })
  const current = (count as number | null) ?? 0
  return current >= maxActionsPerHour ? { allowed: false, current } : { allowed: true }
}
