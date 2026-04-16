// =============================================================
// Marketing — Content Validator
// =============================================================
// Valida conteudo de templates antes do envio. Detecta padroes
// que podem causar ban no WhatsApp ou marcar como spam em email/SMS.
// =============================================================

export type ContentIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
}

const BANNED_WORDS = [
  'gratis',
  'free',
  'ganhe',
  'premio',
  'sorteio',
  'clique aqui',
  'acesse agora',
  'link na bio',
  'oferta imperdivel',
  'so hoje',
  'ultimas vagas',
  'compre ja',
  'aproveite agora',
]

const SHORTENED_URL_PATTERNS = [
  /bit\.ly/i,
  /goo\.gl/i,
  /tinyurl\.com/i,
  /t\.co/i,
  /ow\.ly/i,
  /buff\.ly/i,
  /is\.gd/i,
  /v\.gd/i,
]

export function validateContent(
  body: string,
  channel: 'whatsapp' | 'email' | 'sms'
): ContentIssue[] {
  const issues: ContentIssue[] = []

  if (!body || body.trim().length === 0) {
    issues.push({
      severity: 'error',
      code: 'empty_body',
      message: 'Conteudo vazio',
    })
    return issues
  }

  const lower = body.toLowerCase()

  // Banned words
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      issues.push({
        severity: channel === 'whatsapp' ? 'error' : 'warning',
        code: 'banned_word',
        message: `Palavra proibida: "${word}"`,
      })
    }
  }

  // Shortened URLs
  for (const pattern of SHORTENED_URL_PATTERNS) {
    if (pattern.test(body)) {
      issues.push({
        severity: 'error',
        code: 'shortened_url',
        message: 'URLs encurtadas sao bloqueadas pelo WhatsApp',
      })
    }
  }

  // Excessive caps
  const words = body.split(/\s+/)
  const capsWords = words.filter((w) => w.length > 2 && w === w.toUpperCase())
  if (capsWords.length > 2) {
    issues.push({
      severity: 'warning',
      code: 'excessive_caps',
      message: 'Muitas palavras em MAIUSCULAS aumentam risco de ban',
    })
  }

  // Too many emojis
  const emojiCount = (
    body.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []
  ).length
  if (emojiCount > 3) {
    issues.push({
      severity: 'warning',
      code: 'excessive_emojis',
      message: `${emojiCount} emojis detectados (max recomendado: 3)`,
    })
  }

  // WhatsApp message length
  if (channel === 'whatsapp' && body.length > 4096) {
    issues.push({
      severity: 'error',
      code: 'message_too_long',
      message: `Mensagem com ${body.length} caracteres (max WhatsApp: 4096)`,
    })
  }

  // SMS segment check
  if (channel === 'sms' && body.length > 160) {
    const segments = Math.ceil(body.length / 153) // multipart = 153 chars per segment
    issues.push({
      severity: 'warning',
      code: 'sms_multi_segment',
      message: `SMS com ${segments} segmentos (${body.length} caracteres). Custo multiplicado.`,
    })
  }

  return issues
}

export function hasErrors(issues: ContentIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}
