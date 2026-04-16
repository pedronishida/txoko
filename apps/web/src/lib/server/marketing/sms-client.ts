// =============================================================
// Marketing — SMS Client (Twilio)
// =============================================================
// Wrapper para envio de SMS via Twilio REST API.
// Twilio: suporte completo a carriers brasileiros,
// sem SDK pesado (REST only).
// =============================================================

export type SmsConfig = {
  accountSid: string
  authToken: string
  fromNumber: string // E.164: +5511999999999
}

export type SendSmsInput = {
  to: string // E.164 format
  body: string
}

export type SendSmsResult = {
  sid: string
  status: string
}

export class SmsClientError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'SmsClientError'
    this.status = status
  }
}

/**
 * Formata telefone brasileiro pra E.164.
 * "5511966291824" → "+5511966291824"
 * "(11) 96629-1824" → "+5511966291824"
 */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  if (digits.length === 11) return `+55${digits}`
  if (digits.length === 10) return `+55${digits}`
  return `+${digits}`
}

export class TwilioClient {
  constructor(private config: SmsConfig) {
    if (!config.accountSid) throw new Error('Twilio Account SID obrigatorio')
    if (!config.authToken) throw new Error('Twilio Auth Token obrigatorio')
    if (!config.fromNumber) throw new Error('Twilio From Number obrigatorio')
  }

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`
    const auth = btoa(
      `${this.config.accountSid}:${this.config.authToken}`
    )

    const body = new URLSearchParams({
      From: this.config.fromNumber,
      To: toE164(input.to),
      Body: input.body,
    })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const data = await res.json()

    if (!res.ok) {
      const msg =
        typeof data === 'object' && data?.message
          ? String(data.message)
          : `Twilio API error ${res.status}`
      throw new SmsClientError(msg, res.status)
    }

    return {
      sid: data.sid as string,
      status: data.status as string,
    }
  }
}

/**
 * Cria client Twilio a partir das settings do restaurante.
 */
export function createTwilioClient(
  settings: Record<string, unknown>
): TwilioClient | null {
  const marketing = (settings?.marketing ?? {}) as Record<string, unknown>
  const sms = (marketing?.sms ?? {}) as Record<string, unknown>

  if (!sms.account_sid || !sms.auth_token || !sms.from_number) return null

  return new TwilioClient({
    accountSid: sms.account_sid as string,
    authToken: sms.auth_token as string,
    fromNumber: sms.from_number as string,
  })
}
