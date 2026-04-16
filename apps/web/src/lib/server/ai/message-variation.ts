import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'

// =============================================================
// Marketing — AI Message Variation Engine
// =============================================================
// Gera N variacoes de um template base usando Claude.
// Cada variacao preserva {variables} e segue regras anti-spam.
// =============================================================

export type VariationRequest = {
  templateBody: string
  channel: 'whatsapp' | 'email' | 'sms'
  count: number
  temperature: number
  restaurantName: string
  restaurantType?: string
  tone?: string
}

export type Variation = {
  body: string
  subject?: string
}

const CHANNEL_RULES: Record<string, string> = {
  whatsapp: [
    'Use formatacao WhatsApp: *negrito*, _italico_',
    'Maximo 1000 caracteres',
    'SEM URLs encurtadas (bit.ly, etc)',
    'SEM CAPS para enfase (exceto nomes proprios)',
    'SEM palavras spam: gratis, oferta imperdivel, clique agora, so hoje',
    'Preserve TODOS os {variable} placeholders exatamente como estao',
    'Cada variacao deve ser significativamente diferente, nao apenas sinonimos',
    'Tom humano e natural, como uma mensagem pessoal',
    'Maximo 1 emoji por variacao',
  ].join('\n- '),
  email: [
    'Gere subject line (5-10 palavras) + body para cada variacao',
    'Subject: evitar spam triggers, ser curioso mas nao clickbait',
    'Body: texto limpo, paragrafo curto, mobile-friendly',
    'Preserve TODOS os {variable} placeholders',
    'Tom profissional mas acolhedor',
  ].join('\n- '),
  sms: [
    'Maximo 160 caracteres por variacao (1 segmento SMS)',
    'SEM URLs a menos que seja essencial',
    'Preserve TODOS os {variable} placeholders',
    'Extremamente conciso mas caloroso',
  ].join('\n- '),
}

export function hashTemplateBody(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)
}

export async function generateVariations(
  req: VariationRequest
): Promise<Variation[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Fallback: retorna o template original N vezes (sem variacao)
    return Array.from({ length: req.count }, () => ({
      body: req.templateBody,
    }))
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      temperature: req.temperature,
      system: `Voce e um copywriter de marketing para um ${req.restaurantType ?? 'restaurante'} brasileiro chamado "${req.restaurantName}". Gere variacoes de mensagens de marketing que soem humanas e personalizadas. NUNCA inclua explicacoes, apenas o JSON.`,
      messages: [
        {
          role: 'user',
          content: `Gere ${req.count} variacoes distintas desta mensagem de marketing. Cada uma deve transmitir a mesma informacao core mas com palavras, estrutura e personalidade diferentes.

MENSAGEM ORIGINAL:
"""
${req.templateBody}
"""

CANAL: ${req.channel}
REGRAS DO CANAL:
- ${CHANNEL_RULES[req.channel]}

REGRAS ANTI-SPAM (CRITICO):
- NUNCA usar: "gratis", "desconto imperdivel", "clique aqui", "oferta limitada", "so hoje"
- Maximo 1 emoji por variacao
- NUNCA usar CAPS para enfase
- Tom caloroso e conversacional, nunca vendedor
- Cada msg deve parecer escrita pessoalmente, nao mass-sent

Output APENAS um JSON array. Para whatsapp/sms: [{"body":"..."}]. Para email: [{"subject":"...","body":"..."}].`,
        },
      ],
    })

    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : ''
    const cleaned = text
      .replace(/^```(?:json)?\s*|\s*```$/g, '')
      .trim()
    const variations = JSON.parse(cleaned) as Variation[]
    return variations.slice(0, req.count)
  } catch {
    // Fallback silencioso
    return Array.from({ length: req.count }, () => ({
      body: req.templateBody,
    }))
  }
}
