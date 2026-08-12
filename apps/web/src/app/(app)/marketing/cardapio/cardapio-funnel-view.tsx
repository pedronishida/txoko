'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

export type MenuFunnelRow = {
  day: string
  source: string
  sessions: number
  with_pageview: number
  with_cart: number
  with_checkout: number
  with_submit: number
  abandoned: number
  revenue_cents: number
}

export type MenuSessionRow = {
  id: string
  client_session_id: string | null
  started_at: string
  last_seen_at: string
  source: string
  cart_items_count: number
  cart_total_cents: number
  device_type: string | null
  abandoned_at: string | null
  alert_sent_at: string | null
  submitted_at: string | null
  order_id: string | null
  customer_id: string | null
  customer_name: string | null
}

type Props = {
  funnel: MenuFunnelRow[]
  sessions: MenuSessionRow[]
}

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direto',
  campaign: 'Campanha',
  inbox: 'Inbox',
  menu_share: 'Compartilhado',
  qr_table: 'QR mesa',
  organic: 'Organico',
}

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusTone(session: MenuSessionRow) {
  return session.submitted_at
    ? 'text-success'
    : session.abandoned_at && !session.alert_sent_at
      ? 'text-accent-foreground'
      : session.alert_sent_at
        ? 'text-foreground/75'
        : session.cart_items_count > 0
          ? 'text-foreground'
          : 'text-muted'
}

function statusLabel(session: MenuSessionRow) {
  return session.submitted_at
    ? 'Pedido feito'
    : session.alert_sent_at
      ? 'Alerta enviado'
      : session.abandoned_at
        ? 'Abandonada'
        : session.cart_items_count > 0
          ? 'No carrinho'
          : 'Visitou'
}

export function CardapioFunnelView({ funnel, sessions }: Props) {
  const today = new Date().toISOString().slice(0, 10)

  const todayTotals = useMemo(
    () =>
      funnel
        .filter((row) => row.day.slice(0, 10) === today)
        .reduce(
          (acc, row) => ({
            sessions: acc.sessions + Number(row.sessions ?? 0),
            with_cart: acc.with_cart + Number(row.with_cart ?? 0),
            abandoned: acc.abandoned + Number(row.abandoned ?? 0),
            with_submit: acc.with_submit + Number(row.with_submit ?? 0),
            revenue_cents: acc.revenue_cents + Number(row.revenue_cents ?? 0),
          }),
          { sessions: 0, with_cart: 0, abandoned: 0, with_submit: 0, revenue_cents: 0 }
        ),
    [funnel, today]
  )

  const totals = useMemo(
    () =>
      funnel.reduce(
        (acc, row) => ({
          sessions: acc.sessions + Number(row.sessions ?? 0),
          with_cart: acc.with_cart + Number(row.with_cart ?? 0),
          with_checkout: acc.with_checkout + Number(row.with_checkout ?? 0),
          with_submit: acc.with_submit + Number(row.with_submit ?? 0),
          abandoned: acc.abandoned + Number(row.abandoned ?? 0),
          revenue_cents: acc.revenue_cents + Number(row.revenue_cents ?? 0),
        }),
        {
          sessions: 0,
          with_cart: 0,
          with_checkout: 0,
          with_submit: 0,
          abandoned: 0,
          revenue_cents: 0,
        }
      ),
    [funnel]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, MenuFunnelRow>()
    for (const row of funnel) {
      const day = row.day.slice(0, 10)
      const existing = map.get(day)
      if (existing) {
        map.set(day, {
          ...existing,
          sessions: existing.sessions + Number(row.sessions),
          with_pageview: existing.with_pageview + Number(row.with_pageview),
          with_cart: existing.with_cart + Number(row.with_cart),
          with_checkout: existing.with_checkout + Number(row.with_checkout),
          with_submit: existing.with_submit + Number(row.with_submit),
          abandoned: existing.abandoned + Number(row.abandoned),
          revenue_cents: existing.revenue_cents + Number(row.revenue_cents),
        })
      } else {
        map.set(day, { ...row, day })
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.day < b.day ? 1 : -1))
  }, [funnel])

  const conversionRate =
    totals.sessions > 0 ? Math.round((totals.with_submit / totals.sessions) * 100) : 0
  const cartRate =
    totals.sessions > 0 ? Math.round((totals.with_cart / totals.sessions) * 100) : 0

  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
          Hoje
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-6">
          <Stat label="Visitas" value={String(todayTotals.sessions)} />
          <Stat label="Com carrinho" value={String(todayTotals.with_cart)} />
          <Stat
            label="Abandonadas"
            value={String(todayTotals.abandoned)}
            tone={todayTotals.abandoned > 0 ? 'warm' : 'neutral'}
          />
          <Stat label="Pedidos" value={String(todayTotals.with_submit)} />
          <Stat label="Receita" value={currency.format(todayTotals.revenue_cents / 100)} />
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Ultimos 14 dias
          </h2>
          <span className="text-[10px] font-data text-muted tracking-tight">
            {totals.sessions} sessoes · CR {conversionRate}% · cart{' '}
            {cartRate}%
          </span>
        </div>
        {byDay.length === 0 ? (
          <p className="text-[12px] text-muted tracking-tight py-8">
            Sem dados nos ultimos 14 dias.
          </p>
        ) : (
          <div>
            <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr_1fr_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Dia</span>
              <span className="text-right">Visitas</span>
              <span className="text-right">Cart</span>
              <span className="text-right">Checkout</span>
              <span className="text-right">Pedidos</span>
              <span className="text-right">Abandonadas</span>
              <span className="text-right">Receita</span>
            </div>
            <div className="divide-y divide-border max-h-[40vh] overflow-y-auto">
              {byDay.map((row) => (
                <div
                  key={row.day}
                  className="grid grid-cols-[80px_1fr_1fr_1fr_1fr_1fr_120px] gap-4 py-3 items-center"
                >
                  <span className="text-[12px] font-data text-foreground/75">
                    {new Date(row.day + 'T00:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                  <span className="text-[12px] font-data text-foreground text-right">
                    {row.sessions}
                  </span>
                  <span className="text-[12px] font-data text-foreground/75 text-right">
                    {row.with_cart}
                  </span>
                  <span className="text-[12px] font-data text-foreground/75 text-right">
                    {row.with_checkout}
                  </span>
                  <span className="text-[12px] font-data text-foreground text-right">
                    {row.with_submit}
                  </span>
                  <span
                    className={cn(
                      'text-[12px] font-data text-right',
                      row.abandoned > 0 ? 'text-accent-foreground' : 'text-muted'
                    )}
                  >
                    {row.abandoned}
                  </span>
                  <span className="text-[12px] font-data text-foreground text-right">
                    {currency.format(Number(row.revenue_cents) / 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Sessoes recentes
          </h2>
          <span className="text-[10px] font-data text-muted tracking-tight">
            {sessions.length} ultimas
          </span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-[12px] text-muted tracking-tight py-8">
            Nenhuma sessao nos ultimos 7 dias. Quando alguem abrir o cardapio, aparece aqui.
          </p>
        ) : (
          <div>
            <div className="grid grid-cols-[120px_1fr_120px_100px_140px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Iniciada</span>
              <span>Cliente / origem</span>
              <span className="text-right">Cart</span>
              <span>Status</span>
              <span className="text-right">Ultimo evento</span>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="grid grid-cols-[120px_1fr_120px_100px_140px] gap-4 py-3 items-center"
                >
                  <span className="text-[10px] font-data text-muted">
                    {formatDateTime(session.started_at)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] text-foreground tracking-tight truncate">
                      {session.customer_name ?? 'Anonimo'}
                    </p>
                    <p className="text-[10px] font-data text-muted">
                      {SOURCE_LABELS[session.source] ?? session.source}
                      {session.device_type ? ` · ${session.device_type}` : ''}
                    </p>
                  </div>
                  <span className="text-[12px] font-data text-foreground text-right">
                    {session.cart_items_count > 0
                      ? `${session.cart_items_count}× ${currency.format(session.cart_total_cents / 100)}`
                      : '—'}
                  </span>
                  <span className={cn('text-[11px] tracking-tight', statusTone(session))}>
                    {statusLabel(session)}
                  </span>
                  <span className="text-[10px] font-data text-muted text-right">
                    {formatDateTime(session.last_seen_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'warm'
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p
        className={cn(
          'text-[22px] font-medium tracking-[-0.03em] leading-none font-data mt-3',
          tone === 'warm' ? 'text-accent-foreground' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  )
}
