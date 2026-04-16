import Anthropic from '@anthropic-ai/sdk'
import type {
  ConversationIntent,
  Message,
  ReviewSentiment,
} from '@txoko/shared'

// =============================================================
// Classificacao automatica de conversas do Inbox via Claude
// =============================================================
// Input: mensagens da conversa
// Output: { intent, sentiment, summary }
// Modelo: haiku 4.5 (rapido e barato para classificacao)
// =============================================================

const CLASSIFY_MODEL = 'claude-haiku-4-5-20251001'
const MAX_MESSAGES = 30

export type ClassifyResult = {
  intent: ConversationIntent
  sentiment: ReviewSentiment
  summary: string
}

const VALID_INTENTS: ConversationIntent[] = [
  'question',
  'complaint',
  'order',
  'praise',
  'reservation',
  'spam',
  'other',
]
const VALID_SENTIMENTS: ReviewSentiment[] = ['positive', 'neutral', 'negative']

function heuristicFallback(messages: Message[]): ClassifyResult {
  const inboundBodies = messages
    .filter((m) => m.direction === 'inbound' && m.body)
    .map((m) => (m.body as string).toLowerCase())
  const text = inboundBodies.join(' ')

  let intent: ConversationIntent = 'other'
  if (/reclama|problema|horrivel|pessimo|ruim|nao recomendo|inaceitavel/i.test(text))
    intent = 'complaint'
  else if (/reserva|mesa|marcar|horario/i.test(text)) intent = 'reservation'
  else if (/pedido|entrega|cardapio|preco|quanto custa/i.test(text)) intent = 'order'
  else if (/obrigad|parabens|adorei|excelente|perfeito|otimo/i.test(text))
    intent = 'praise'
  else if (text.length > 0) intent = 'question'

  let sentiment: ReviewSentiment = 'neutral'
  if (intent === 'complaint') sentiment = 'negative'
  if (intent === 'praise') sentiment = 'positive'

  const firstInbound = inboundBodies[0] ?? ''
  const summary =
    firstInbound.slice(0, 117) + (firstInbound.length > 117 ? '...' : '') ||
    'Conversa sem conteudo inbound'

  return { intent, sentiment, summary }
}

function buildTranscript(messages: Message[]): string {
  const recent = messages.slice(-MAX_MESSAGES)
  return recent
    .filter((m) => m.body && m.body.trim().length > 0)
    .map((m) => {
      const role =
        m.direction === 'inbound'
          ? 'cliente'
          : m.sender_type === 'bot'
            ? 'bot'
            : 'agente'
      const body = (m.body as string).slice(0, 800)
      return `[${role}]: ${body}`
    })
    .join('\n')
}

function parseClassifyResponse(raw: string): ClassifyResult | null {
  // Remove code fences se vierem
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  const intent = obj.intent as string
  const sentiment = obj.sentiment as string
  const summary = obj.summary

  if (!VALID_INTENTS.includes(intent as ConversationIntent)) return null
  if (!VALID_SENTIMENTS.includes(sentiment as ReviewSentiment)) return null
  if (typeof summary !== 'string' || summary.trim().length === 0) return null

  return {
    intent: intent as ConversationIntent,
    sentiment: sentiment as ReviewSentiment,
    summary: summary.trim().slice(0, 240),
  }
}

export async function classifyConversationMessages(
  messages: Message[]
): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || messages.length === 0) {
    return heuristicFallback(messages)
  }

  const transcript = buildTranscript(messages)
  if (transcript.trim().length === 0) {
    return heuristicFallback(messages)
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 400,
      system: [
        'Voce analisa conversas de atendimento de um restaurante brasileiro',
        'e classifica cada conversa.',
        '',
        'Responda APENAS com JSON valido, sem markdown, sem explicacao, sem comentarios.',
        'Schema:',
        '{',
        '  "intent": "question" | "complaint" | "order" | "praise" | "reservation" | "spam" | "other",',
        '  "sentiment": "positive" | "neutral" | "negative",',
        '  "summary": string (ate 200 caracteres, portugues, sem emoji, sem aspas duplas)',
        '}',
        '',
        'Criterios:',
        '- intent: reservation (reserva/mesa), order (pedido/cardapio/preco/delivery), complaint (reclamacao/problema), praise (elogio/agradecimento), question (pergunta generica), spam (propaganda/nao relacionado), other',
        '- sentiment: tom geral das mensagens do cliente',
        '- summary: resuma o que o cliente quer/sente em linguagem direta',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: `Transcript da conversa:\n\n${transcript}\n\nClassifique:`,
        },
      ],
    })
    const block = response.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text : ''
    const parsed = parseClassifyResponse(raw)
    return parsed ?? heuristicFallback(messages)
  } catch {
    return heuristicFallback(messages)
  }
}

/**
 * Decide se a conversa deve ser reclassificada com base no total de mensagens
 * e na ultima vez que foi classificada. Regra:
 *  - Primeira classificacao quando count >= 3
 *  - Reclassifica a cada 10 mensagens novas
 */
export function shouldClassify(totalMessages: number, lastClassifiedAt?: number): boolean {
  if (totalMessages < 3) return false
  if (lastClassifiedAt === undefined) return true
  const diff = totalMessages - lastClassifiedAt
  return diff >= 10
}

// =============================================================
// Resumo detalhado de conversa (para o painel de contato)
// =============================================================
// Retorna 2-4 frases descrevendo pontos-chave, acoes pendentes
// e humor do cliente.
// =============================================================

const SUMMARY_MAX_MESSAGES = 30

function buildSummaryTranscript(messages: Message[]): string {
  const recent = messages.slice(-SUMMARY_MAX_MESSAGES)
  return recent
    .filter((m) => m.body && m.body.trim().length > 0)
    .map((m) => {
      const role =
        m.direction === 'inbound'
          ? 'cliente'
          : m.sender_type === 'bot'
            ? 'bot'
            : 'agente'
      return `[${role}]: ${(m.body as string).slice(0, 800)}`
    })
    .join('\n')
}

function summaryFallback(messages: Message[]): string {
  const lastInbound = [...messages]
    .reverse()
    .find((m) => m.direction === 'inbound' && m.body)
  return lastInbound?.body?.slice(0, 300) ?? 'Conversa sem mensagens do cliente.'
}

export async function generateDetailedSummary(
  messages: Message[]
): Promise<{ summary: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || messages.length === 0) {
    return { summary: summaryFallback(messages) }
  }

  const transcript = buildSummaryTranscript(messages)
  if (transcript.trim().length === 0) {
    return { summary: summaryFallback(messages) }
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 400,
      system: [
        'Voce analisa conversas de atendimento de um restaurante brasileiro.',
        'Gere um resumo de 2 a 4 frases (portugues, sem emoji, sem markdown) que descreva:',
        '1. O que o cliente quer ou discutiu',
        '2. Acoes pendentes ou resolvidas',
        '3. Humor geral do cliente',
        '',
        'Responda APENAS com o texto do resumo, sem JSON, sem titulo, sem explicacoes.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: `Transcript da conversa:\n\n${transcript}\n\nGere o resumo:`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text.trim() : ''
    return { summary: raw.slice(0, 600) || summaryFallback(messages) }
  } catch {
    return { summary: summaryFallback(messages) }
  }
}
