// ---------------------------------------------------------------------------
// Webhook collector — polls zapi_webhook_events in Supabase waiting for the
// expected event to appear (written by the Z-API webhook receiver endpoint).
// ---------------------------------------------------------------------------

import type { AdminClient, ZapiWebhookEvent } from './supabase-admin.js'

export type WaitForWebhookParams = {
  messageId: string
  eventType: string
  timeoutMs?: number
  pollIntervalMs?: number
}

export type WaitForAnyWebhookParams = {
  messageId: string
  timeoutMs?: number
  pollIntervalMs?: number
}

/**
 * Polls Supabase until a specific (messageId + eventType) webhook event appears,
 * or until the timeout expires.
 *
 * Returns the matching event row, or null on timeout.
 */
export async function waitForWebhookEvent(
  admin: AdminClient,
  params: WaitForWebhookParams,
): Promise<ZapiWebhookEvent | null> {
  const { messageId, eventType, timeoutMs = 15000, pollIntervalMs = 500 } = params
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data, error } = await admin.webhookEvents.selectByMessageIdAndType(messageId, eventType)

    if (error) {
      console.warn('[webhook-collector] poll error:', (error as { message?: string }).message)
    }

    if (data) return data

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remaining)))
  }

  return null
}

/**
 * Polls Supabase until one or more events arrive for the given messageId.
 * Returns all collected events (may be empty on timeout).
 */
export async function waitForAnyWebhookEvent(
  admin: AdminClient,
  params: WaitForAnyWebhookParams,
): Promise<ZapiWebhookEvent[]> {
  const { messageId, timeoutMs = 15000, pollIntervalMs = 500 } = params
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data, error } = await admin.webhookEvents.selectByMessageId(messageId)

    if (error) {
      console.warn('[webhook-collector] poll error:', (error as { message?: string }).message)
    }

    if (data && data.length > 0) return data

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remaining)))
  }

  return []
}

/**
 * Waits for the "on-message-send" webhook for a given message ID.
 */
export async function waitForSentStatus(
  admin: AdminClient,
  messageId: string,
  timeoutMs = 15000,
): Promise<ZapiWebhookEvent | null> {
  return waitForWebhookEvent(admin, {
    messageId,
    eventType: 'on-message-send',
    timeoutMs,
  })
}

/**
 * Returns the delivery status string from an on-message-status event payload.
 */
export function extractStatus(event: ZapiWebhookEvent): string | null {
  const payload = event.payload as Record<string, unknown>
  if (typeof payload['status'] === 'string') return payload['status']
  return null
}
