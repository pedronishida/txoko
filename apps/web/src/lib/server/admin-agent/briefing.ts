import type { SupabaseClient } from '@supabase/supabase-js'
import { ZapiClient, ZapiError } from '@/lib/server/zapi/client'
import type { ZapiChannelConfig } from '@/lib/server/zapi/types'

// =============================================================
// Briefing diario do agente admin
// =============================================================
// Coleta metricas do dia anterior, persiste em admin_agent_briefings
// e entrega via WhatsApp (texto e/ou audio TTS via OpenAI).
// =============================================================

type TtsResult =
  | { ok: true; audioBuffer: Buffer; size: number; cost_brl: number }
  | { ok: false; error: string }

async function synthesizeSpeech(text: string, voice = 'nova'): Promise<TtsResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY nao configurada' }

  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Texto vazio' }
  if (trimmed.length > 4096) {
    return { ok: false, error: `Texto excede 4096 chars (atual: ${trimmed.length})` }
  }

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'tts-1', input: trimmed, voice, response_format: 'mp3' }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `OpenAI TTS HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }
    const arrayBuffer = await res.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)
    const costBrl = (trimmed.length / 1000) * 0.081
    return { ok: true, audioBuffer, size: audioBuffer.byteLength, cost_brl: costBrl }
  } catch (err) {
    return { ok: false, error: `OpenAI TTS: ${(err as Error).message}` }
  }
}

const formatBRL = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

export type DailyMetrics = {
  date: string
  revenue: number
  revenue_avg_4w: number
  revenue_pct_vs_avg: number
  order_count: number
  avg_ticket: number
  cancellation_rate: number
  top_product: { name: string; qty: number } | null
  reservations_today: number
  reservations_today_party_total: number
  low_stock: Array<{ name: string; current: number; min: number; unit: string }>
  pending_expenses_count: number
  pending_expenses_total: number
  predicted_today_revenue: number | null
  predicted_today_pct_vs_avg: number | null
}

async function collectDailyMetrics(
  supabase: SupabaseClient,
  restaurantId: string,
  now = new Date()
): Promise<DailyMetrics> {
  const yesterday = new Date(now)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const dayStart = startOfUtcDay(yesterday)
  const dayEnd = startOfUtcDay(new Date(dayStart.getTime() + 86_400_000))

  const { data: orders } = await supabase
    .from('orders')
    .select('total, status')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', dayStart.toISOString())
    .lt('created_at', dayEnd.toISOString())

  const validOrders = (orders ?? []).filter((order) => order.status !== 'cancelled')
  const revenue = validOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0)
  const orderCount = validOrders.length
  const cancelledCount = (orders ?? []).filter((order) => order.status === 'cancelled').length
  const cancellationRate = (orders?.length ?? 0) > 0 ? (cancelledCount / orders!.length) * 100 : 0

  const weekday = yesterday.getUTCDay()
  const historicalRevenues: number[] = []
  for (let week = 1; week <= 4; week++) {
    const referenceDay = new Date(yesterday)
    referenceDay.setUTCDate(referenceDay.getUTCDate() - 7 * week)
    const weekStart = startOfUtcDay(referenceDay)
    const weekEnd = startOfUtcDay(new Date(weekStart.getTime() + 86_400_000))
    const { data: weekOrders } = await supabase
      .from('orders')
      .select('total')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'cancelled')
      .gte('created_at', weekStart.toISOString())
      .lt('created_at', weekEnd.toISOString())
    const weekRevenue = (weekOrders ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0)
    historicalRevenues.push(weekRevenue)
  }
  const revenueAvg4w =
    historicalRevenues.length > 0
      ? historicalRevenues.reduce((sum, value) => sum + value, 0) / historicalRevenues.length
      : 0

  const { data: itemRows } = await supabase
    .from('order_items')
    .select('quantity, product:products!inner(name, restaurant_id), order:orders!inner(restaurant_id, status, created_at)')
    .eq('product.restaurant_id', restaurantId)
    .eq('order.restaurant_id', restaurantId)
    .neq('order.status', 'cancelled')
    .gte('order.created_at', dayStart.toISOString())
    .lt('order.created_at', dayEnd.toISOString())
    .limit(2000)

  let topProduct: { name: string; qty: number } | null = null
  if (itemRows && itemRows.length > 0) {
    const quantityByProduct = new Map<string, number>()
    for (const row of itemRows) {
      const product = Array.isArray(row.product) ? row.product[0] : row.product
      const name = product?.name ?? '—'
      quantityByProduct.set(name, (quantityByProduct.get(name) ?? 0) + Number(row.quantity ?? 0))
    }
    const ranked = Array.from(quantityByProduct.entries()).sort((a, b) => b[1] - a[1])
    if (ranked[0]) topProduct = { name: ranked[0][0], qty: ranked[0][1] }
  }

  const todayStart = startOfUtcDay(now)
  const todayEnd = startOfUtcDay(new Date(todayStart.getTime() + 86_400_000))
  const { data: reservations } = await supabase
    .from('reservations')
    .select('guest_count, status')
    .eq('restaurant_id', restaurantId)
    .gte('scheduled_for', todayStart.toISOString())
    .lt('scheduled_for', todayEnd.toISOString())
    .in('status', ['confirmed', 'pending', 'seated'])
  const reservationsToday = reservations?.length ?? 0
  const reservationsPartyTotal = (reservations ?? []).reduce(
    (sum, reservation) => sum + Number(reservation.guest_count ?? 0),
    0
  )

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('name, current_stock, min_stock, unit')
    .eq('restaurant_id', restaurantId)
  const lowStock = (ingredients ?? [])
    .filter(
      (item) => Number(item.current_stock) <= Number(item.min_stock ?? 0) && Number(item.min_stock ?? 0) > 0
    )
    .sort((a, b) => Number(a.current_stock) - Number(b.current_stock))
    .slice(0, 5)
    .map((item) => ({
      name: item.name,
      current: Number(item.current_stock),
      min: Number(item.min_stock),
      unit: item.unit ?? '',
    }))

  const { data: expenses } = await supabase
    .from('financial_transactions')
    .select('amount')
    .eq('restaurant_id', restaurantId)
    .eq('type', 'expense')
    .eq('status', 'pending')
  const pendingExpensesCount = expenses?.length ?? 0
  const pendingExpensesTotal = (expenses ?? []).reduce(
    (sum, expense) => sum + Number(expense.amount ?? 0),
    0
  )

  const todayWeekday = now.getUTCDay()
  let predictedTodayRevenue: number | null = null
  let predictedTodayPctVsAvg: number | null = null
  if (todayWeekday === weekday) {
    predictedTodayRevenue = revenueAvg4w
  } else {
    const sameWeekdayRevenues: number[] = []
    for (let week = 1; week <= 4; week++) {
      const referenceDay = new Date(now)
      referenceDay.setUTCDate(referenceDay.getUTCDate() - 7 * week)
      const weekStart = startOfUtcDay(referenceDay)
      const weekEnd = startOfUtcDay(new Date(weekStart.getTime() + 86_400_000))
      const { data: weekOrders } = await supabase
        .from('orders')
        .select('total')
        .eq('restaurant_id', restaurantId)
        .neq('status', 'cancelled')
        .gte('created_at', weekStart.toISOString())
        .lt('created_at', weekEnd.toISOString())
      const weekRevenue = (weekOrders ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0)
      sameWeekdayRevenues.push(weekRevenue)
    }
    if (sameWeekdayRevenues.length > 0) {
      predictedTodayRevenue =
        sameWeekdayRevenues.reduce((sum, value) => sum + value, 0) / sameWeekdayRevenues.length
    }
  }
  if (predictedTodayRevenue !== null && revenueAvg4w > 0) {
    predictedTodayPctVsAvg = ((predictedTodayRevenue - revenueAvg4w) / revenueAvg4w) * 100
  }

  return {
    date: yesterday.toISOString().slice(0, 10),
    revenue,
    revenue_avg_4w: revenueAvg4w,
    revenue_pct_vs_avg: revenueAvg4w > 0 ? ((revenue - revenueAvg4w) / revenueAvg4w) * 100 : 0,
    order_count: orderCount,
    avg_ticket: orderCount > 0 ? revenue / orderCount : 0,
    cancellation_rate: cancellationRate,
    top_product: topProduct,
    reservations_today: reservationsToday,
    reservations_today_party_total: reservationsPartyTotal,
    low_stock: lowStock,
    pending_expenses_count: pendingExpensesCount,
    pending_expenses_total: pendingExpensesTotal,
    predicted_today_revenue: predictedTodayRevenue,
    predicted_today_pct_vs_avg: predictedTodayPctVsAvg,
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function buildBriefingText(metrics: DailyMetrics, restaurantName: string): string {
  const lines: string[] = []
  lines.push(`Bom dia! Resumo do dia anterior em ${restaurantName}:`)
  lines.push('')

  const revenueBadge =
    Math.abs(metrics.revenue_pct_vs_avg) < 5
      ? ''
      : metrics.revenue_pct_vs_avg > 0
        ? `↑ +${metrics.revenue_pct_vs_avg.toFixed(0)}%`
        : `↓ ${metrics.revenue_pct_vs_avg.toFixed(0)}%`

  lines.push(`💰 Faturamento: ${formatBRL(metrics.revenue)} ${revenueBadge ? `(${revenueBadge} vs media)` : ''}`)
  lines.push(`🧾 ${metrics.order_count} pedidos · ticket medio ${formatBRL(metrics.avg_ticket)}`)
  if (metrics.cancellation_rate > 5) {
    lines.push(`⚠️ Cancelamento: ${metrics.cancellation_rate.toFixed(1)}%`)
  }
  if (metrics.top_product) {
    lines.push(`🏆 Top vendido: ${metrics.top_product.name} (${metrics.top_product.qty}x)`)
  }
  lines.push('')
  if (metrics.reservations_today > 0) {
    lines.push(`📅 Hoje: ${metrics.reservations_today} reservas · ${metrics.reservations_today_party_total} pessoas`)
  }
  if (metrics.low_stock.length > 0) {
    const preview = metrics.low_stock
      .slice(0, 3)
      .map((item) => `${item.name} (${item.current}${item.unit})`)
      .join(', ')
    lines.push(
      `⚠️ Estoque baixo: ${preview}${metrics.low_stock.length > 3 ? ` +${metrics.low_stock.length - 3}` : ''}`
    )
  }
  if (metrics.pending_expenses_count > 0) {
    lines.push(
      `💸 ${metrics.pending_expenses_count} despesa${metrics.pending_expenses_count === 1 ? '' : 's'} pendente${metrics.pending_expenses_count === 1 ? '' : 's'} totalizando ${formatBRL(metrics.pending_expenses_total)}`
    )
  }
  if (
    metrics.predicted_today_revenue !== null &&
    metrics.predicted_today_pct_vs_avg !== null &&
    Math.abs(metrics.predicted_today_pct_vs_avg) > 15
  ) {
    const arrow = metrics.predicted_today_pct_vs_avg > 0 ? '↑' : '↓'
    lines.push('')
    lines.push(
      `🔮 Esperado hoje: ${formatBRL(metrics.predicted_today_revenue)} (${arrow} ${Math.abs(metrics.predicted_today_pct_vs_avg).toFixed(0)}% vs media)`
    )
  }

  return lines.join('\n')
}

export type BriefingFormat = 'text' | 'audio' | 'both'

export type SendBriefingInput = {
  restaurantId: string
  restaurantName: string
  recipientPhone: string
  channel: { id: string; config: unknown } | null
  format?: BriefingFormat
  voice?: string
  force?: boolean
}

export type SendBriefingResult =
  | { ok: true; briefing_id: string; audio_url?: string }
  | { ok: false; reason: string }

export async function sendBriefing(
  supabase: SupabaseClient,
  input: SendBriefingInput
): Promise<SendBriefingResult> {
  const phone = input.recipientPhone.replace(/\D/g, '')
  if (!phone) return { ok: false, reason: 'phone_invalid' }

  const format = input.format ?? 'text'
  const voice = input.voice ?? 'nova'
  const briefingDate = new Date().toISOString().slice(0, 10)

  if (!input.force) {
    const { data: existing } = await supabase
      .from('admin_agent_briefings')
      .select('id, delivered_at')
      .eq('restaurant_id', input.restaurantId)
      .eq('recipient_phone', phone)
      .eq('briefing_date', briefingDate)
      .maybeSingle()
    if (existing?.delivered_at) return { ok: false, reason: 'already_sent_today' }
  }

  const metrics = await collectDailyMetrics(supabase, input.restaurantId)
  const textSummary = buildBriefingText(metrics, input.restaurantName)

  const { data: briefing, error: upsertError } = await supabase
    .from('admin_agent_briefings')
    .upsert(
      {
        restaurant_id: input.restaurantId,
        recipient_phone: phone,
        briefing_date: briefingDate,
        payload: metrics,
        text_summary: textSummary,
      },
      { onConflict: 'restaurant_id,recipient_phone,briefing_date' }
    )
    .select('id')
    .single()

  if (upsertError || !briefing) return { ok: false, reason: upsertError?.message ?? 'persist_failed' }
  const briefingId = briefing.id as string

  if (!input.channel) {
    await supabase.from('admin_agent_briefings').update({ delivery_error: 'no_channel' }).eq('id', briefingId)
    return { ok: false, reason: 'no_channel' }
  }

  const config = (input.channel.config ?? {}) as Partial<ZapiChannelConfig>
  if (!config.instance_id || !config.token) {
    await supabase
      .from('admin_agent_briefings')
      .update({ delivery_error: 'channel_no_credentials' })
      .eq('id', briefingId)
    return { ok: false, reason: 'channel_no_credentials' }
  }

  const client = new ZapiClient(config as ZapiChannelConfig)
  let audioUrl: string | null = null

  if (format === 'audio' || format === 'both') {
    const speechText = textSummary
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2700}-\u{27BF}↑↓↔←→]/gu, '')
      .replace(/R\$\s*([\d.]+),(\d{2})/g, (_match: string, reais: string, centavos: string) => {
        const wholeReais = parseInt(reais.replace(/\./g, ''), 10)
        const cents = parseInt(centavos, 10)
        return cents === 0 ? `${wholeReais} reais` : `${wholeReais} reais e ${cents} centavos`
      })
      .replace(/R\$\s*([\d.]+)/g, (_match: string, reais: string) => `${parseInt(reais.replace(/\./g, ''), 10)} reais`)
      .replace(/(\d+)%/g, '$1 por cento')
      .replace(/(\d+)h(\b)/g, '$1 horas$2')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim()

    const tts = await synthesizeSpeech(speechText, voice)
    if (tts.ok) {
      const storagePath = `${input.restaurantId}/${briefingDate}-${briefingId.slice(0, 8)}.mp3`
      const { error: uploadError } = await supabase.storage
        .from('admin-briefings')
        .upload(storagePath, tts.audioBuffer, { contentType: 'audio/mpeg', upsert: true })
      if (uploadError) {
        await supabase
          .from('admin_agent_briefings')
          .update({ delivery_error: `upload_failed: ${uploadError.message}` })
          .eq('id', briefingId)
      } else {
        const { data: publicUrl } = supabase.storage.from('admin-briefings').getPublicUrl(storagePath)
        audioUrl = publicUrl.publicUrl
      }
      if (audioUrl) {
        try {
          await client.sendAudio({ phone, audio: audioUrl, waveform: true })
        } catch (err) {
          const message = err instanceof ZapiError ? err.message : (err as Error).message
          await supabase
            .from('admin_agent_briefings')
            .update({ delivery_error: `zapi_audio: ${message}` })
            .eq('id', briefingId)
          return { ok: false, reason: `zapi_audio: ${message}` }
        }
      }
    } else {
      await supabase
        .from('admin_agent_briefings')
        .update({ delivery_error: `tts_failed: ${tts.error}` })
        .eq('id', briefingId)
      if (format === 'audio') {
        // Fallback: formato audio sem TTS vira texto
        try {
          await client.sendText({ phone, message: textSummary })
          await supabase
            .from('admin_agent_briefings')
            .update({ delivered_at: new Date().toISOString() })
            .eq('id', briefingId)
          return { ok: true, briefing_id: briefingId }
        } catch (err) {
          return {
            ok: false,
            reason: `tts+text fallback: ${err instanceof ZapiError ? err.message : (err as Error).message}`,
          }
        }
      }
    }
  }

  if (format === 'text' || format === 'both') {
    try {
      await client.sendText({ phone, message: textSummary })
    } catch (err) {
      const message = err instanceof ZapiError ? err.message : (err as Error).message
      await supabase
        .from('admin_agent_briefings')
        .update({ delivery_error: `zapi_text: ${message}` })
        .eq('id', briefingId)
      return { ok: false, reason: `zapi_text: ${message}` }
    }
  }

  await supabase
    .from('admin_agent_briefings')
    .update({ delivered_at: new Date().toISOString(), audio_url: audioUrl })
    .eq('id', briefingId)

  return { ok: true, briefing_id: briefingId, ...(audioUrl ? { audio_url: audioUrl } : {}) }
}
