import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import type { Message } from '@txoko/shared'

// =============================================================
// Inbox — Sugestao de respostas rapidas via Claude
// =============================================================
// Input: mensagens da conversa + nome do restaurante
// Output: array de { text, tone } — 3 sugestoes distintas
// Modelo: claude-haiku-4-5 (rapido e barato)
// Cache externo via ai_suggested_replies (gerenciado em actions.ts)
// =============================================================

const SUGGEST_MODEL = 'claude-haiku-4-5-20251001'
const MAX_MESSAGES = 10
const SUGGESTION_COUNT = 3

export type SuggestedReply = {
  text: string
  tone?: 'friendly' | 'formal' | 'apologetic' | 'informative'
}

const VALID_TONES = ['friendly', 'formal', 'apologetic', 'informative'] as const
type ValidTone = (typeof VALID_TONES)[number]

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
      return `[${role}]: ${(m.body as string).slice(0, 500)}`
    })
    .join('\n')
}

function parseSuggestionsResponse(raw: string): SuggestedReply[] | null {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const results: SuggestedReply[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (typeof obj.text !== 'string' || obj.text.trim().length === 0) continue
    const tone =
      typeof obj.tone === 'string' && VALID_TONES.includes(obj.tone as ValidTone)
        ? (obj.tone as ValidTone)
        : undefined
    results.push({ text: obj.text.trim().slice(0, 400), tone })
  }
  return results.length > 0 ? results : null
}

function heuristicFallback(
  messages: Message[],
  restaurantName: string
): SuggestedReply[] {
  const lastInbound = [...messages]
    .reverse()
    .find((m) => m.direction === 'inbound' && m.body)
  const text = lastInbound?.body?.toLowerCase() ?? ''

  if (/reclama|problema|erro|errado/i.test(text)) {
    return [
      {
        text: `Entendemos a situacao e pedimos desculpas pelo inconveniente. Nossa equipe vai resolver isso imediatamente.`,
        tone: 'apologetic',
      },
      {
        text: `Obrigado por nos avisar. Pode me passar mais detalhes para que eu possa te ajudar da melhor forma?`,
        tone: 'friendly',
      },
      {
        text: `Registramos sua ocorrencia e um de nossos responsaveis entrara em contato em breve.`,
        tone: 'formal',
      },
    ]
  }

  if (/reserva|mesa|horario|lugar/i.test(text)) {
    return [
      {
        text: `Claro! Para confirmar sua reserva precisamos: data, horario e numero de pessoas. Pode me informar?`,
        tone: 'friendly',
      },
      {
        text: `Verificamos a disponibilidade para o horario solicitado. Pode confirmar a data e o numero de pessoas?`,
        tone: 'formal',
      },
      {
        text: `Adoramos receber voce no ${restaurantName}! Me diga a data e o horario de preferencia.`,
        tone: 'friendly',
      },
    ]
  }

  return [
    {
      text: `Ola! Como posso ajudar voce hoje?`,
      tone: 'friendly',
    },
    {
      text: `Obrigado por entrar em contato com o ${restaurantName}. Em que posso ser util?`,
      tone: 'formal',
    },
    {
      text: `Oi! Fico feliz em ajudar. Pode me contar mais sobre o que precisa?`,
      tone: 'friendly',
    },
  ]
}

export async function generateSuggestedReplies(
  messages: Message[],
  restaurantName: string
): Promise<SuggestedReply[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || messages.length === 0) {
    return heuristicFallback(messages, restaurantName)
  }

  const transcript = buildTranscript(messages)
  if (transcript.trim().length === 0) {
    return heuristicFallback(messages, restaurantName)
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: SUGGEST_MODEL,
      max_tokens: 600,
      system: [
        `Voce e um assistente de atendimento ao cliente do restaurante "${restaurantName}".`,
        `Analise a conversa e gere ${SUGGESTION_COUNT} sugestoes de resposta distintas para o agente enviar ao cliente.`,
        '',
        'Cada sugestao deve:',
        '- Ter entre 1 e 3 frases',
        '- Ser profissional e cordial',
        '- Responder diretamente ao que o cliente disse ou perguntou',
        '- Usar o tom indicado',
        '',
        'Responda APENAS com JSON valido, sem markdown, sem explicacoes.',
        'Schema: [{"text": string, "tone": "friendly"|"formal"|"apologetic"|"informative"}]',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: `Conversa:\n\n${transcript}\n\nGere ${SUGGESTION_COUNT} sugestoes de resposta:`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === 'text')
    const raw = block && block.type === 'text' ? block.text : ''
    const parsed = parseSuggestionsResponse(raw)
    return parsed ?? heuristicFallback(messages, restaurantName)
  } catch {
    return heuristicFallback(messages, restaurantName)
  }
}

/**
 * Cria um hash estavel baseado nos ultimos 5 corpos de mensagem.
 * Usado para invalidar o cache quando a conversa tem novas mensagens.
 */
export function buildContextHash(messages: Message[]): string {
  const recent = messages.slice(-5)
  const raw = recent
    .map((m) => `${m.id}:${m.body ?? ''}`)
    .join('|')
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}
