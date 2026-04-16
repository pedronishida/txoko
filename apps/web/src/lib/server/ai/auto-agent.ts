import Anthropic from '@anthropic-ai/sdk'

// =============================================================
// AI Auto-Agent — gera resposta automatica para mensagens inbound
// =============================================================
// Modelo: claude-haiku-4-5 (rapido e barato)
// Saida: reply (enviar resposta), escalate (prioridade alta) ou skip
// =============================================================

const AUTO_AGENT_MODEL = 'claude-haiku-4-5-20251001'
const MAX_CONTEXT_MESSAGES = 10

export type AutoReplyInput = {
  messages: Array<{
    direction: 'inbound' | 'outbound'
    body: string | null
    created_at: string
  }>
  knowledgeEntries: Array<{
    title: string
    content: string
    category: string | null
  }>
  restaurantName: string
  persona: string
  escalateKeywords: string[]
  minConfidence?: number
}

export type AutoReplyResult =
  | { action: 'reply'; text: string; confidence: number }
  | { action: 'escalate'; reason: string }
  | { action: 'skip'; reason: string }

type ClaudeOutput = {
  action: 'reply' | 'escalate' | 'skip'
  text?: string
  confidence?: number
  reason?: string
}

function buildTranscript(
  messages: Array<{ direction: 'inbound' | 'outbound'; body: string | null; created_at: string }>
): string {
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES)
  return recent
    .filter((m) => m.body && m.body.trim().length > 0)
    .map((m) => {
      const role = m.direction === 'inbound' ? 'Cliente' : 'Atendente'
      return `${role}: ${m.body}`
    })
    .join('\n')
}

function buildKnowledgeContext(
  entries: Array<{ title: string; content: string; category: string | null }>
): string {
  if (entries.length === 0) return 'Nenhuma base de conhecimento disponivel.'
  return entries
    .map((e) => {
      const cat = e.category ? ` [${e.category}]` : ''
      return `## ${e.title}${cat}\n${e.content}`
    })
    .join('\n\n')
}

export async function generateAutoReply(
  input: AutoReplyInput
): Promise<AutoReplyResult> {
  // 1. Verifica API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { action: 'skip', reason: 'no_api_key' }
  }

  // 2. Verifica se ha mensagens
  if (input.messages.length === 0) {
    return { action: 'skip', reason: 'no_messages' }
  }

  // 3. Verifica se a ultima mensagem e inbound
  const lastInbound = [...input.messages]
    .reverse()
    .find((m) => m.direction === 'inbound')

  if (!lastInbound || !lastInbound.body) {
    return { action: 'skip', reason: 'no_inbound_message' }
  }

  // 4. Verifica keywords de escalacao na ultima mensagem inbound
  const lastBody = lastInbound.body.toLowerCase()
  for (const kw of input.escalateKeywords) {
    if (lastBody.includes(kw.toLowerCase())) {
      return {
        action: 'escalate',
        reason: `Keyword de escalacao detectada: "${kw}"`,
      }
    }
  }

  // 5. Verifica se ha base de conhecimento
  if (input.knowledgeEntries.length === 0) {
    return { action: 'skip', reason: 'no_knowledge' }
  }

  const transcript = buildTranscript(input.messages)
  const knowledgeContext = buildKnowledgeContext(input.knowledgeEntries)
  const minConfidence = input.minConfidence ?? 0.7

  const systemPrompt = `Voce e ${input.persona} do restaurante ${input.restaurantName}.
Sua tarefa e responder mensagens de clientes no WhatsApp de forma natural, rapida e util.

BASE DE CONHECIMENTO (use como referencia para responder):
${knowledgeContext}

INSTRUCOES:
- Responda apenas com informacoes presentes na base de conhecimento acima
- Se a pergunta nao estiver coberta pela base, escalene para humano
- Se houver reclamacao, cancelamento, pedido de reembolso ou solicitacao de gerente, escalene
- Seja natural, amigavel e conciso (maximo 3 frases)
- Nao invente informacoes que nao estejam na base de conhecimento

IMPORTANTE: Responda APENAS com um objeto JSON no formato exato abaixo, sem texto adicional:
{
  "action": "reply" | "escalate" | "skip",
  "text": "mensagem de resposta (apenas para action=reply)",
  "confidence": 0.0 a 1.0 (apenas para action=reply),
  "reason": "motivo (apenas para action=escalate ou skip)"
}

Se confidence < ${minConfidence}, prefira escalate a reply.`

  const userPrompt = `Historico da conversa:
${transcript}

Responda a ultima mensagem do cliente.`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: AUTO_AGENT_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Extrai JSON da resposta
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { action: 'skip', reason: 'invalid_model_response' }
    }

    let parsed: ClaudeOutput
    try {
      parsed = JSON.parse(jsonMatch[0]) as ClaudeOutput
    } catch {
      return { action: 'skip', reason: 'json_parse_error' }
    }

    // Valida e retorna
    if (parsed.action === 'reply') {
      if (!parsed.text || typeof parsed.text !== 'string') {
        return { action: 'skip', reason: 'missing_reply_text' }
      }
      const confidence =
        typeof parsed.confidence === 'number' ? parsed.confidence : 0
      if (confidence < minConfidence) {
        return {
          action: 'escalate',
          reason: `Confianca ${confidence.toFixed(2)} abaixo do minimo ${minConfidence}`,
        }
      }
      return {
        action: 'reply',
        text: parsed.text.trim(),
        confidence,
      }
    }

    if (parsed.action === 'escalate') {
      return {
        action: 'escalate',
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'Escalado pelo modelo',
      }
    }

    return {
      action: 'skip',
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Skipped pelo modelo',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    return { action: 'skip', reason: `api_error: ${msg}` }
  }
}
