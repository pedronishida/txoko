// ---------------------------------------------------------------------------
// Z-API HTTP wrapper
// - Token-bucket rate limiter (default 1 req/s)
// - Exponential backoff retry (3 attempts)
// - Auto-includes Client-Token header
// - Injects x-txoko-test-id for webhook correlation
// ---------------------------------------------------------------------------

import { getConfig } from './config.js'

export type ZapiSendResponse = {
  messageId: string
  zaapId: string
  id: string
}

export type ZapiResult<T = ZapiSendResponse> = {
  status: number
  latencyMs: number
  data: T | null
  error: string | undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class ZapiTestClient {
  private readonly baseUrl: string
  private readonly clientToken: string
  private readonly rateLimitMs: number
  private lastCallAt = 0

  constructor(instanceId: string, token: string, clientToken: string, rateLimitMs = 1000) {
    this.baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}`
    this.clientToken = clientToken
    this.rateLimitMs = rateLimitMs
  }

  /** Static factory that reads from validated config */
  static fromConfig(): ZapiTestClient {
    const cfg = getConfig()
    return new ZapiTestClient(
      cfg.ZAPI_INSTANCE_ID,
      cfg.ZAPI_TOKEN,
      cfg.ZAPI_CLIENT_TOKEN,
      cfg.RATE_LIMIT_MS,
    )
  }

  async send<T = ZapiSendResponse>(
    path: string,
    body: Record<string, unknown>,
    testId?: string,
  ): Promise<ZapiResult<T>> {
    await this.respectRateLimit()
    const url = `${this.baseUrl}${path}`
    const started = Date.now()

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': this.clientToken,
            ...(testId ? { 'x-txoko-test-id': testId } : {}),
          },
          body: JSON.stringify(body),
        })
        const latencyMs = Date.now() - started

        if (res.status === 429) {
          const backoff = 1000 * (attempt + 1)
          await sleep(backoff)
          continue
        }

        const json: unknown = await res.json().catch(() => null)
        return {
          status: res.status,
          latencyMs,
          data: res.ok ? (json as T) : null,
          error: res.ok ? undefined : JSON.stringify(json),
        }
      } catch (err) {
        const latencyMs = Date.now() - started
        if (attempt === 2) {
          return { status: 0, latencyMs, data: null, error: (err as Error).message }
        }
        await sleep(500 * Math.pow(2, attempt))
      }
    }

    // Should never reach here
    return { status: 0, latencyMs: Date.now() - started, data: null, error: 'retries exhausted' }
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  sendText(phone: string, message: string, testId?: string) {
    return this.send('/send-text', { phone, message }, testId)
  }

  sendTextLink(phone: string, message: string, linkUrl: string, testId?: string) {
    return this.send('/send-link', { phone, message, linkUrl }, testId)
  }

  // -------------------------------------------------------------------------
  // Image
  // -------------------------------------------------------------------------

  sendImage(phone: string, image: string, caption?: string, testId?: string) {
    return this.send('/send-image', { phone, image, ...(caption ? { caption } : {}) }, testId)
  }

  sendImageBase64(phone: string, base64: string, extension: string, caption?: string, testId?: string) {
    return this.send(
      '/send-image',
      { phone, image: base64, extension, ...(caption ? { caption } : {}) },
      testId,
    )
  }

  // -------------------------------------------------------------------------
  // Video / PTV
  // -------------------------------------------------------------------------

  sendVideo(phone: string, video: string, caption?: string, testId?: string) {
    return this.send('/send-video', { phone, video, ...(caption ? { caption } : {}) }, testId)
  }

  sendPtv(phone: string, video: string, testId?: string) {
    return this.send('/send-ptv', { phone, video }, testId)
  }

  // -------------------------------------------------------------------------
  // Audio / PTT
  // -------------------------------------------------------------------------

  sendAudio(phone: string, audio: string, testId?: string) {
    return this.send('/send-audio', { phone, audio }, testId)
  }

  sendPtt(phone: string, audio: string, testId?: string) {
    return this.send('/send-audio', { phone, audio, ptt: true }, testId)
  }

  // -------------------------------------------------------------------------
  // Document
  // -------------------------------------------------------------------------

  sendDocument(phone: string, document: string, filename: string, testId?: string) {
    return this.send('/send-document/pdf', { phone, document, fileName: filename }, testId)
  }

  sendDocumentDocx(phone: string, document: string, filename: string, testId?: string) {
    return this.send('/send-document/docx', { phone, document, fileName: filename }, testId)
  }

  // -------------------------------------------------------------------------
  // GIF / Sticker
  // -------------------------------------------------------------------------

  sendGif(phone: string, gif: string, caption?: string, testId?: string) {
    return this.send('/send-gif', { phone, gif, ...(caption ? { caption } : {}) }, testId)
  }

  sendSticker(phone: string, sticker: string, testId?: string) {
    return this.send('/send-sticker', { phone, sticker }, testId)
  }

  // -------------------------------------------------------------------------
  // Location / Contact
  // -------------------------------------------------------------------------

  sendLocation(
    phone: string,
    coords: { lat: number; lng: number; address?: string; name?: string },
    testId?: string,
  ) {
    return this.send(
      '/send-location',
      {
        phone,
        lat: coords.lat,
        lng: coords.lng,
        ...(coords.address ? { address: coords.address } : {}),
        ...(coords.name ? { name: coords.name } : {}),
      },
      testId,
    )
  }

  sendContact(phone: string, contactName: string, contactPhone: string, testId?: string) {
    return this.send('/send-contact', { phone, contactName, contactPhone }, testId)
  }

  // -------------------------------------------------------------------------
  // Buttons — button-actions
  // -------------------------------------------------------------------------

  sendButtonActions(
    phone: string,
    params: {
      message: string
      buttons: Array<{ label: string; id?: string }>
      title?: string
      footer?: string
    },
    testId?: string,
  ) {
    return this.send(
      '/send-button-actions',
      { phone, ...params },
      testId,
    )
  }

  sendButtonList(
    phone: string,
    params: {
      message: string
      buttonLabel: string
      sections: Array<{
        title: string
        rows: Array<{ title: string; description?: string; rowId: string }>
      }>
      title?: string
      footer?: string
    },
    testId?: string,
  ) {
    return this.send('/send-button-list', { phone, ...params }, testId)
  }

  sendButtonImage(
    phone: string,
    params: {
      image: string
      message: string
      buttons: Array<{ label: string; id?: string }>
      title?: string
      footer?: string
      caption?: string
    },
    testId?: string,
  ) {
    return this.send('/send-button-actions', { phone, ...params }, testId)
  }

  sendPix(
    phone: string,
    params: { message: string; pixKey: string; name: string; value?: number },
    testId?: string,
  ) {
    return this.send('/send-pix', { phone, ...params }, testId)
  }

  sendOtp(phone: string, otp: string, testId?: string) {
    return this.send('/send-otp', { phone, otp }, testId)
  }

  // -------------------------------------------------------------------------
  // Option list (sections + rows)
  // -------------------------------------------------------------------------

  sendOptionList(
    phone: string,
    params: {
      message: string
      buttonLabel: string
      sections: Array<{
        title: string
        rows: Array<{ title: string; description?: string; rowId: string }>
      }>
      title?: string
      footer?: string
    },
    testId?: string,
  ) {
    return this.send('/send-option-list', { phone, ...params }, testId)
  }

  // -------------------------------------------------------------------------
  // Carousel
  // -------------------------------------------------------------------------

  sendCarousel(
    phone: string,
    params: {
      message?: string
      cards: Array<{
        image?: string
        title: string
        description?: string
        buttons: Array<{ label: string; type?: 'REPLY' | 'URL'; url?: string; id?: string }>
      }>
    },
    testId?: string,
  ) {
    return this.send('/send-carousel', { phone, ...params }, testId)
  }

  // -------------------------------------------------------------------------
  // Reply
  // -------------------------------------------------------------------------

  sendReply(
    phone: string,
    params: {
      messageId: string
      message?: string
      audio?: string
      image?: string
    },
    testId?: string,
  ) {
    return this.send('/send-text', { phone, ...params }, testId)
  }

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------

  sendReaction(phone: string, messageId: string, reaction: string, testId?: string) {
    return this.send('/send-reaction', { phone, messageId, reaction }, testId)
  }

  removeReaction(phone: string, messageId: string, testId?: string) {
    return this.send('/send-reaction', { phone, messageId, reaction: '' }, testId)
  }

  // -------------------------------------------------------------------------
  // Deletion / Edit
  // -------------------------------------------------------------------------

  deleteMessage(phone: string, messageId: string, owner: string, testId?: string) {
    return this.send('/delete-message', { phone, messageId, owner }, testId)
  }

  editMessage(phone: string, messageId: string, message: string, testId?: string) {
    return this.send('/update-message', { phone, messageId, message }, testId)
  }

  // -------------------------------------------------------------------------
  // Pin / Forward
  // -------------------------------------------------------------------------

  pinMessage(phone: string, messageId: string, testId?: string) {
    return this.send('/pin-message', { phone, messageId }, testId)
  }

  unpinMessage(phone: string, messageId: string, testId?: string) {
    return this.send('/unpin-message', { phone, messageId }, testId)
  }

  forwardMessage(phone: string, messageId: string, targetPhone: string, testId?: string) {
    return this.send('/forward-message', { phone: targetPhone, messageId, fromPhone: phone }, testId)
  }

  // -------------------------------------------------------------------------
  // Poll
  // -------------------------------------------------------------------------

  sendPoll(
    phone: string,
    params: {
      name: string
      options: string[]
      selectableCount?: number
    },
    testId?: string,
  ) {
    return this.send('/send-poll', { phone, ...params }, testId)
  }

  // -------------------------------------------------------------------------
  // Status / Stories
  // -------------------------------------------------------------------------

  sendStatus(
    phone: string,
    params: { type: 'text' | 'image' | 'video'; content: string; caption?: string },
    testId?: string,
  ) {
    return this.send('/send-status', { phone, ...params }, testId)
  }

  // -------------------------------------------------------------------------
  // Rate limiter internals
  // -------------------------------------------------------------------------

  private async respectRateLimit(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCallAt
    if (elapsed < this.rateLimitMs) {
      await sleep(this.rateLimitMs - elapsed)
    }
    this.lastCallAt = Date.now()
  }
}
