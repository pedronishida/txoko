import type {
  ZapiChannelConfig,
  ZapiMeResponse,
  ZapiQrCodeImageResponse,
  ZapiSendResponse,
  ZapiStatus,
} from './types'

// =============================================================
// Z-API client
// =============================================================
// Base URL: https://api.z-api.io/instances/{instance}/token/{token}/<action>
// Auth: path params + header Client-Token (quando ativado na conta)
// =============================================================

const ZAPI_BASE = 'https://api.z-api.io'

export class ZapiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ZapiError'
    this.status = status
    this.body = body
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  pathExt?: string // ex: /pdf para send-document/pdf
}

export class ZapiClient {
  constructor(private config: ZapiChannelConfig) {
    if (!config.instance_id) throw new Error('ZapiClient: instance_id faltando')
    if (!config.token) throw new Error('ZapiClient: token faltando')
  }

  private buildUrl(action: string, pathExt?: string) {
    const base = `${ZAPI_BASE}/instances/${this.config.instance_id}/token/${this.config.token}`
    return `${base}/${action}${pathExt ?? ''}`
  }

  private async request<T>(action: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(action, opts.pathExt)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.client_token) {
      headers['Client-Token'] = this.config.client_token
    }

    const method = opts.method ?? (opts.body ? 'POST' : 'GET')
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })

    const text = await res.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }

    if (!res.ok) {
      const msg =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `Z-API ${method} ${action} falhou (${res.status})`
      throw new ZapiError(msg, res.status, parsed)
    }

    return parsed as T
  }

  // -----------------------------------------------------------
  // Instance management
  // -----------------------------------------------------------
  async getStatus(): Promise<ZapiStatus> {
    return this.request<ZapiStatus>('status')
  }

  async getMe(): Promise<ZapiMeResponse> {
    return this.request<ZapiMeResponse>('me')
  }

  async getQrCodeImage(): Promise<ZapiQrCodeImageResponse> {
    return this.request<ZapiQrCodeImageResponse>('qr-code/image')
  }

  async disconnect(): Promise<{ value: boolean }> {
    return this.request<{ value: boolean }>('disconnect')
  }

  async restart(): Promise<{ value: boolean }> {
    return this.request<{ value: boolean }>('restart')
  }

  // -----------------------------------------------------------
  // Webhooks configuration
  // -----------------------------------------------------------
  async updateEveryWebhooks(webhookUrl: string, notifySentByMe = true) {
    return this.request<{ value: boolean }>('update-every-webhooks', {
      method: 'PUT',
      body: { value: webhookUrl, notifySentByMe },
    })
  }

  async updateWebhookReceived(webhookUrl: string) {
    return this.request<{ value: boolean }>('update-webhook-received', {
      method: 'PUT',
      body: { value: webhookUrl },
    })
  }

  // -----------------------------------------------------------
  // Chat / message actions
  // -----------------------------------------------------------
  async readMessage(phone: string, messageId: string) {
    return this.request<void>('read-message', {
      method: 'POST',
      body: { phone, messageId },
    })
  }

  async markChatRead(phone: string) {
    return this.request<{ value: boolean }>('read-chat', {
      method: 'POST',
      body: { phone, action: 'read' },
    })
  }

  // -----------------------------------------------------------
  // Send: text
  // -----------------------------------------------------------
  async sendText(input: {
    phone: string
    message: string
    messageId?: string // pra reply
    delayMessage?: number
    delayTyping?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-text', { body: input })
  }

  // -----------------------------------------------------------
  // Send: image (URL ou base64)
  // -----------------------------------------------------------
  async sendImage(input: {
    phone: string
    image: string // URL ou data:image/...;base64,...
    caption?: string
    messageId?: string
    viewOnce?: boolean
    delayMessage?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-image', { body: input })
  }

  // -----------------------------------------------------------
  // Send: audio
  // -----------------------------------------------------------
  async sendAudio(input: {
    phone: string
    audio: string
    waveform?: boolean
    viewOnce?: boolean
    async?: boolean
    delayMessage?: number
    delayTyping?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-audio', { body: input })
  }

  // -----------------------------------------------------------
  // Send: video
  // -----------------------------------------------------------
  async sendVideo(input: {
    phone: string
    video: string
    caption?: string
    messageId?: string
    viewOnce?: boolean
    async?: boolean
    delayMessage?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-video', { body: input })
  }

  // -----------------------------------------------------------
  // Send: document (extensao vai no path)
  // -----------------------------------------------------------
  async sendDocument(input: {
    phone: string
    document: string
    extension: string // pdf, xlsx, docx, etc
    fileName?: string
    caption?: string
    messageId?: string
    delayMessage?: number
  }): Promise<ZapiSendResponse> {
    const { extension, ...body } = input
    return this.request<ZapiSendResponse>('send-document', {
      pathExt: `/${extension.replace(/^\./, '')}`,
      body,
    })
  }

  // -----------------------------------------------------------
  // Send: location
  // -----------------------------------------------------------
  async sendLocation(input: {
    phone: string
    title: string
    address: string
    latitude: string | number
    longitude: string | number
    messageId?: string
    delayMessage?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-location', { body: input })
  }

  // -----------------------------------------------------------
  // Send: contact
  // -----------------------------------------------------------
  async sendContact(input: {
    phone: string
    contactName: string
    contactPhone: string
    contactBusinessDescription?: string
    messageId?: string
    delayMessage?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-contact', { body: input })
  }

  // -----------------------------------------------------------
  // Send: link com preview
  // -----------------------------------------------------------
  async sendLink(input: {
    phone: string
    message: string
    image: string
    linkUrl: string
    title: string
    linkDescription: string
    linkType?: 'SMALL' | 'MEDIUM' | 'LARGE'
    messageId?: string
    delayMessage?: number
    delayTyping?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-link', { body: input })
  }

  // -----------------------------------------------------------
  // Send: sticker
  // -----------------------------------------------------------
  async sendSticker(input: {
    phone: string
    sticker: string
    stickerAuthor?: string
    messageId?: string
    delayMessage?: number
  }): Promise<ZapiSendResponse> {
    return this.request<ZapiSendResponse>('send-sticker', { body: input })
  }

  // -----------------------------------------------------------
  // Reactions
  // -----------------------------------------------------------
  async sendReaction(input: { phone: string; messageId: string; reaction: string }) {
    return this.request<ZapiSendResponse>('send-reaction', { body: input })
  }

  async removeReaction(input: { phone: string; messageId: string }) {
    return this.request<ZapiSendResponse>('send-remove-reaction', { body: input })
  }

  // -----------------------------------------------------------
  // Delete / forward
  // -----------------------------------------------------------
  async deleteMessage(input: { phone: string; messageId: string; owner?: string }) {
    return this.request<{ value: boolean }>('delete-message', {
      method: 'POST',
      body: input,
    })
  }

  async forwardMessage(input: {
    phone: string
    messageId: string
    messagePhone: string
  }) {
    return this.request<ZapiSendResponse>('forward-message', { body: input })
  }

  // -----------------------------------------------------------
  // Contact metadata
  // -----------------------------------------------------------
  async getContactMetadata(phone: string) {
    return this.request<{
      phone: string
      name?: string
      notify?: string
      short?: string
      imgUrl?: string
      about?: string
    }>(`contacts/${phone}`)
  }

  async getProfilePicture(phone: string) {
    return this.request<{ link?: string }>(`profile-picture?phone=${phone}`)
  }

  async phoneExists(phone: string) {
    return this.request<{ exists: boolean; phone: string; lid?: string }>(
      `phone-exists/${phone}`
    )
  }
}

// -------------------------------------------------------------
// Factory helper: cria client a partir de um record channel
// -------------------------------------------------------------
export function zapiClientFromChannel(channel: {
  type: string
  config: unknown
}): ZapiClient {
  if (channel.type !== 'whatsapp_zapi') {
    throw new Error(`Canal nao e whatsapp_zapi: ${channel.type}`)
  }
  const config = (channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!config.instance_id || !config.token) {
    throw new Error('Canal Z-API sem instance_id/token configurados')
  }
  return new ZapiClient(config as ZapiChannelConfig)
}
