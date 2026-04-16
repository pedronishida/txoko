// =============================================================
// Marketing — Email Client (Resend)
// =============================================================
// Wrapper para envio de emails via Resend API.
// Resend: serverless-friendly, free tier 100 emails/day,
// SDK minimo (REST only, sem dependencia pesada).
// =============================================================

export type EmailConfig = {
  apiKey: string
  fromEmail: string
  fromName: string
  replyTo?: string
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export type SendEmailResult = {
  id: string
}

export class EmailClientError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'EmailClientError'
    this.status = status
  }
}

export class ResendClient {
  constructor(private config: EmailConfig) {
    if (!config.apiKey) throw new Error('Resend API key obrigatoria')
    if (!config.fromEmail) throw new Error('From email obrigatorio')
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo ?? this.config.replyTo,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const msg =
        typeof data === 'object' && data?.message
          ? String(data.message)
          : `Resend API error ${res.status}`
      throw new EmailClientError(msg, res.status)
    }

    return { id: data.id as string }
  }

  async sendBatch(
    emails: SendEmailInput[]
  ): Promise<Array<{ to: string; result?: SendEmailResult; error?: string }>> {
    // Resend batch API: POST /emails/batch
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(
        emails.map((e) => ({
          from: `${this.config.fromName} <${this.config.fromEmail}>`,
          to: [e.to],
          subject: e.subject,
          html: e.html,
          text: e.text,
          reply_to: e.replyTo ?? this.config.replyTo,
        }))
      ),
    })

    const data = await res.json()

    if (!res.ok) {
      // Fallback: enviar um por um
      const results: Array<{
        to: string
        result?: SendEmailResult
        error?: string
      }> = []
      for (const email of emails) {
        try {
          const result = await this.send(email)
          results.push({ to: email.to, result })
        } catch (e) {
          results.push({
            to: email.to,
            error: (e as Error).message,
          })
        }
      }
      return results
    }

    // Resend batch returns { data: [{ id }] }
    const ids = Array.isArray(data?.data) ? data.data : []
    return emails.map((e, i) => ({
      to: e.to,
      result: ids[i] ? { id: ids[i].id as string } : undefined,
      error: ids[i] ? undefined : 'No ID returned',
    }))
  }
}

/**
 * Cria client Resend a partir das settings do restaurante.
 */
export function createResendClient(
  settings: Record<string, unknown>
): ResendClient | null {
  const marketing = (settings?.marketing ?? {}) as Record<string, unknown>
  const email = (marketing?.email ?? {}) as Record<string, unknown>

  if (!email.api_key || !email.from_email) return null

  return new ResendClient({
    apiKey: email.api_key as string,
    fromEmail: email.from_email as string,
    fromName: (email.from_name as string) ?? 'Restaurante',
    replyTo: email.reply_to as string | undefined,
  })
}
