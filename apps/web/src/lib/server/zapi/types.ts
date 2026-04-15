// =============================================================
// Z-API types — subset usado pelo Txoko
// =============================================================

export type ZapiChannelConfig = {
  provider?: 'zapi'
  instance_id: string
  token: string
  client_token?: string
  webhook_secret: string
  connected_phone?: string
  notify_sent_by_me?: boolean
}

export type ZapiSendResponse = {
  zaapId?: string
  messageId: string
  id?: string
}

export type ZapiStatus = {
  connected: boolean
  session?: boolean
  smartphoneConnected?: boolean
  error?: string
}

export type ZapiQrCodeImageResponse = {
  value: string // data:image/png;base64,...
}

export type ZapiMeResponse = {
  connected: boolean
  session: boolean
  smartphoneConnected?: boolean
  displayName?: string
  phone?: string
}

// -------------------------------------------------------------
// Webhook event types — discriminated union pelo campo `type`
// -------------------------------------------------------------

export type ZapiEventType =
  | 'ReceivedCallback'
  | 'DeliveryCallback'
  | 'MessageStatusCallback'
  | 'ConnectedCallback'
  | 'DisconnectedCallback'
  | 'PresenceChatCallback'

export type ZapiReceivedPayload = {
  type: 'ReceivedCallback'
  instanceId: string
  messageId: string
  phone: string
  fromMe: boolean
  momment: number
  status?: string
  senderName?: string
  senderPhoto?: string
  chatName?: string
  isGroup: boolean
  isNewsletter?: boolean
  connectedPhone?: string
  senderLid?: string
  participantPhone?: string
  forwarded?: boolean
  referenceMessageId?: string

  // Conteudo (um destes)
  text?: { message: string; title?: string; description?: string; url?: string; thumbnailUrl?: string }
  image?: { imageUrl: string; mimeType?: string; caption?: string; width?: number; height?: number; viewOnce?: boolean }
  audio?: { audioUrl: string; mimeType?: string; seconds?: number; ptt?: boolean }
  video?: { videoUrl: string; mimeType?: string; seconds?: number; caption?: string; viewOnce?: boolean }
  document?: { documentUrl: string; mimeType?: string; title?: string; fileName?: string; pageCount?: number }
  sticker?: { stickerUrl: string; mimeType?: string }
  contact?: { displayName?: string; vCard?: string }
  location?: { latitude: number; longitude: number; address?: string; url?: string }
  reaction?: {
    value: string
    time?: number
    referencedMessage?: { messageId: string; fromMe: boolean; phone: string; participant?: string }
  }
  buttonsResponseMessage?: { buttonId: string; message: string }
  listResponseMessage?: { message: string; title?: string; selectedRowId: string }
  poll?: unknown
  pollVote?: unknown
}

export type ZapiDeliveryPayload = {
  type: 'DeliveryCallback'
  instanceId: string
  phone: string
  zaapId?: string
  messageId: string
}

export type ZapiMessageStatusPayload = {
  type: 'MessageStatusCallback'
  instanceId: string
  status: 'SENT' | 'RECEIVED' | 'READ' | 'READ_BY_ME' | 'PLAYED'
  ids: string[]
  momment?: number
  phone?: string
  isGroup?: boolean
}

export type ZapiConnectedPayload = {
  type: 'ConnectedCallback'
  instanceId: string
  connected: true
  momment?: number
  phone?: string
}

export type ZapiDisconnectedPayload = {
  type: 'DisconnectedCallback'
  instanceId: string
  disconnected: true
  error?: string
  momment?: number
}

export type ZapiPresencePayload = {
  type: 'PresenceChatCallback'
  instanceId: string
  phone: string
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'COMPOSING' | 'PAUSED' | 'RECORDING'
  lastSeen?: number | null
}

export type ZapiWebhookEvent =
  | ZapiReceivedPayload
  | ZapiDeliveryPayload
  | ZapiMessageStatusPayload
  | ZapiConnectedPayload
  | ZapiDisconnectedPayload
  | ZapiPresencePayload
