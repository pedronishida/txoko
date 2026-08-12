import type { SupabaseClient } from '@supabase/supabase-js'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'
import { emitNotification } from '@/lib/server/emit-notification'

// =============================================================
// Deteccao de anomalias operacionais (agente admin)
// =============================================================
// - Faturamento abaixo da media (janela 4h vs mesmas 4h nas ultimas 4 semanas)
// - Pico de cancelamentos na ultima hora
// - Insumos com estoque zerado nas ultimas 24h
// =============================================================

const formatBRL = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

export type Anomaly = {
  kind: 'slow_revenue' | 'cancellation_spike' | 'critical_stock'
  title: string
  message: string
  severity: 'critical' | 'warning'
  metadata: Record<string, unknown>
  dedupKey: string
}

export async function detectAnomalies(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const today = new Date().toISOString().slice(0, 10)
  const utcHour = new Date().getUTCHours()

  // Faturamento so faz sentido em horario de operacao (12h-23h UTC)
  if (utcHour >= 12 && utcHour <= 23) {
    const slowRevenue = await checkSlowRevenue(supabase, restaurantId)
    if (slowRevenue) anomalies.push(slowRevenue)
  }

  const cancellationSpike = await checkCancellationSpike(supabase, restaurantId)
  if (cancellationSpike) anomalies.push(cancellationSpike)

  const criticalStock = await checkCriticalStock(supabase, restaurantId, today)
  anomalies.push(...criticalStock)

  return anomalies
}

async function checkSlowRevenue(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<Anomaly | null> {
  const windowStart = new Date(Date.now() - 14_400_000).toISOString()
  const windowEnd = new Date().toISOString()
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('total')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'cancelled')
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
  const recentRevenue = (recentOrders ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0)

  const historicalRevenues: number[] = []
  for (let week = 1; week <= 4; week++) {
    const referenceEnd = new Date(Date.now() - 7 * week * 86_400_000)
    const referenceStart = new Date(referenceEnd.getTime() - 14_400_000).toISOString()
    const referenceEndIso = referenceEnd.toISOString()
    const { data: pastOrders } = await supabase
      .from('orders')
      .select('total')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'cancelled')
      .gte('created_at', referenceStart)
      .lte('created_at', referenceEndIso)
    const pastRevenue = (pastOrders ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0)
    historicalRevenues.push(pastRevenue)
  }

  const avgHistorical =
    historicalRevenues.reduce((sum, value) => sum + value, 0) / Math.max(historicalRevenues.length, 1)
  if (avgHistorical < 50 || recentRevenue >= 0.5 * avgHistorical) return null

  const pctBelow = ((avgHistorical - recentRevenue) / avgHistorical) * 100
  return {
    kind: 'slow_revenue',
    title: `Faturamento ${pctBelow.toFixed(0)}% abaixo da media`,
    message: `Ultimas 4h: ${formatBRL(recentRevenue)}. Media historica: ${formatBRL(avgHistorical)}. Quer que eu sugira uma promo flash?`,
    severity: pctBelow > 70 ? 'critical' : 'warning',
    metadata: { recent_revenue: recentRevenue, avg_historical: avgHistorical, pct_below: pctBelow },
    dedupKey: `slow_rev:${restaurantId}:${new Date().toISOString().slice(0, 10)}`,
  }
}

async function checkCancellationSpike(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<Anomaly | null> {
  const windowStart = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'cancelled')
    .gte('updated_at', windowStart)
  const cancellations = count ?? 0
  if (cancellations < 5) return null
  return {
    kind: 'cancellation_spike',
    title: `${cancellations} cancelamentos na ultima hora`,
    message: 'Volume incomum. Pode ser problema na cozinha, sistema fora do ar, ou cliente insatisfeito. Vale verificar.',
    severity: cancellations >= 10 ? 'critical' : 'warning',
    metadata: { count: cancellations, window: '1h' },
    dedupKey: `cancel_spike:${restaurantId}:${new Date().toISOString().slice(0, 13)}`,
  }
}

async function checkCriticalStock(
  supabase: SupabaseClient,
  restaurantId: string,
  today: string
): Promise<Anomaly[]> {
  const { data: zeroedIngredients } = await supabase
    .from('ingredients')
    .select('id, name, current_stock, min_stock, unit, updated_at')
    .eq('restaurant_id', restaurantId)
    .eq('current_stock', 0)
  if (!zeroedIngredients || zeroedIngredients.length === 0) return []

  const sinceMs = Date.now() - 86_400_000
  const relevant = zeroedIngredients.filter(
    (item) =>
      (item.updated_at ? new Date(item.updated_at).getTime() : 0) >= sinceMs &&
      Number(item.min_stock ?? 0) > 0
  )
  if (relevant.length === 0) return []

  if (relevant.length === 1) {
    const item = relevant[0]
    return [
      {
        kind: 'critical_stock',
        title: `Estoque zerado: ${item.name}`,
        message: `${item.name} esta em 0 ${item.unit ?? ''}. Comprar com urgencia ou ajustar cardapio.`,
        severity: 'critical',
        metadata: { ingredient_id: item.id, ingredient_name: item.name },
        dedupKey: `crit_stock:${item.id}:${today}`,
      },
    ]
  }

  return [
    {
      kind: 'critical_stock',
      title: `${relevant.length} insumos zerados`,
      message: `${relevant
        .slice(0, 5)
        .map((item) => item.name)
        .join(', ')}${relevant.length > 5 ? ` +${relevant.length - 5}` : ''} — comprar com urgencia.`,
      severity: 'critical',
      metadata: { count: relevant.length, items: relevant.map((item) => item.name) },
      dedupKey: `crit_stock_batch:${restaurantId}:${today}`,
    },
  ]
}

export type AnomalyDeliveryInput = {
  restaurantId: string
  restaurantName: string
  anomalies: Anomaly[]
  sendToPhone: string | null
  channel: { id: string; config: Partial<ZapiChannelConfig> | null } | null
}

export type AnomalyDeliveryResult = {
  delivered: number
  notification_only: number
  skipped: number
}

export async function deliverAnomalies(
  supabase: SupabaseClient,
  input: AnomalyDeliveryInput
): Promise<AnomalyDeliveryResult> {
  let delivered = 0
  let notificationOnly = 0
  let skipped = 0

  for (const anomaly of input.anomalies) {
    const result = await emitNotification(supabase, {
      restaurantId: input.restaurantId,
      type: 'system',
      title: anomaly.title,
      body: anomaly.message,
      severity: anomaly.severity,
      dedupKey: anomaly.dedupKey,
      metadata: { anomaly_kind: anomaly.kind, ...anomaly.metadata },
    })
    if (!result.ok && result.reason === 'duplicate') {
      skipped += 1
      continue
    }

    if (
      input.sendToPhone &&
      input.channel &&
      typeof input.channel.config?.instance_id === 'string' &&
      typeof input.channel.config?.token === 'string'
    ) {
      const config = input.channel.config
      const message = `🚨 Alerta — ${input.restaurantName}

${anomaly.title}
${anomaly.message}`
      try {
        await new ZapiClient(config as ZapiChannelConfig).sendText({
          phone: input.sendToPhone.replace(/\D/g, ''),
          message,
        })
        delivered += 1
      } catch (err) {
        console.error(
          '[anomaly] zapi send failed:',
          err instanceof ZapiError ? err.message : (err as Error).message
        )
        notificationOnly += 1
      }
    } else {
      notificationOnly += 1
    }
  }

  return { delivered, notification_only: notificationOnly, skipped }
}
