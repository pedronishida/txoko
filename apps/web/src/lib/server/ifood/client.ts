// =============================================================
// iFood Merchant API Client
// Base URL: https://merchant-api.ifood.com.br
// Auth: OAuth 2.0 client_credentials
// Referencia: https://developer.ifood.com.br/reference/
// =============================================================

import type {
  IfoodEvent,
  IfoodOrder,
  IfoodTokenResponse,
} from './types'

const IFOOD_API_BASE = 'https://merchant-api.ifood.com.br'

export class IfoodApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'IfoodApiError'
    this.status = status
    this.body = body
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  token?: string
  formBody?: Record<string, string>
}

export class IfoodClient {
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {
    if (!clientId) throw new Error('IfoodClient: clientId faltando')
    if (!clientSecret) throw new Error('IfoodClient: clientSecret faltando')
  }

  // -----------------------------------------------------------
  // HTTP helper
  // -----------------------------------------------------------
  private async request<T>(
    path: string,
    opts: RequestOptions = {}
  ): Promise<T> {
    const url = `${IFOOD_API_BASE}${path}`
    const headers: Record<string, string> = {}

    let reqBody: string | undefined

    if (opts.formBody) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      reqBody = new URLSearchParams(opts.formBody).toString()
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      reqBody = JSON.stringify(opts.body)
    }

    if (opts.token) {
      headers['Authorization'] = `Bearer ${opts.token}`
    }

    const method = opts.method ?? (reqBody ? 'POST' : 'GET')
    const res = await fetch(url, {
      method,
      headers,
      body: reqBody,
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
        parsed && typeof parsed === 'object' && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : `iFood ${method} ${path} falhou (${res.status})`
      throw new IfoodApiError(msg, res.status, parsed)
    }

    return parsed as T
  }

  // -----------------------------------------------------------
  // Auth: solicita token via client_credentials
  // -----------------------------------------------------------
  async authenticate(): Promise<IfoodTokenResponse> {
    return this.request<IfoodTokenResponse>(
      '/authentication/v1.0/oauth/token',
      {
        formBody: {
          grantType: 'client_credentials',
          clientId: this.clientId,
          clientSecret: this.clientSecret,
        },
      }
    )
  }

  // -----------------------------------------------------------
  // Polling: busca eventos pendentes do merchant
  // -----------------------------------------------------------
  async pollEvents(token: string): Promise<IfoodEvent[]> {
    const result = await this.request<IfoodEvent[] | null>(
      '/order/v1.0/events:polling',
      { token }
    )
    return result ?? []
  }

  // -----------------------------------------------------------
  // Acknowledge: confirma processamento dos eventos
  // -----------------------------------------------------------
  async acknowledgeEvents(token: string, eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return
    await this.request<void>(
      '/order/v1.0/events/acknowledgment',
      {
        method: 'POST',
        token,
        body: eventIds.map((id) => ({ id })),
      }
    )
  }

  // -----------------------------------------------------------
  // Orders: busca detalhes de um pedido
  // -----------------------------------------------------------
  async getOrder(token: string, orderId: string): Promise<IfoodOrder> {
    return this.request<IfoodOrder>(
      `/order/v1.0/orders/${orderId}`,
      { token }
    )
  }

  // -----------------------------------------------------------
  // Order lifecycle
  // -----------------------------------------------------------
  async confirmOrder(token: string, orderId: string): Promise<void> {
    await this.request<void>(
      `/order/v1.0/orders/${orderId}/confirm`,
      { method: 'POST', token }
    )
  }

  async dispatchOrder(token: string, orderId: string): Promise<void> {
    await this.request<void>(
      `/order/v1.0/orders/${orderId}/dispatch`,
      { method: 'POST', token }
    )
  }

  async readyToPickup(token: string, orderId: string): Promise<void> {
    await this.request<void>(
      `/order/v1.0/orders/${orderId}/readyToPickup`,
      { method: 'POST', token }
    )
  }

  async cancelOrder(
    token: string,
    orderId: string,
    cancellationCode: string,
    reason: string
  ): Promise<void> {
    await this.request<void>(
      `/order/v1.0/orders/${orderId}/requestCancellation`,
      {
        method: 'POST',
        token,
        body: { cancellationCode, reason },
      }
    )
  }

  // -----------------------------------------------------------
  // Merchant: lista merchants vinculados ao client
  // -----------------------------------------------------------
  async listMerchants(token: string): Promise<Array<{ id: string; name: string; status: { code: string } }>> {
    const result = await this.request<Array<{ id: string; name: string; status: { code: string } }>>(
      '/merchant/v1.0/merchants',
      { token }
    )
    return result ?? []
  }
}
