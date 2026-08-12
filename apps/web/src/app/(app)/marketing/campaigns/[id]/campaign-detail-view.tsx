'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Campaign, CampaignRecipient, RecipientStatus } from '@txoko/shared'
import { getAbTestResults, promoteAbWinner } from '../../actions'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em execucao',
  paused: 'Pausada',
  completed: 'Concluida',
  cancelled: 'Cancelada',
  error: 'Erro',
}

const RECIPIENT_STATUS_LABEL: Record<RecipientStatus, string> = {
  pending: 'Pendente',
  queued: 'Na fila',
  sending: 'Enviando',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
  opted_out: 'Opt-out',
  skipped: 'Ignorada',
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
}

const CURRENCY_FORMAT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

type AbVariantStats = {
  variant: 'a' | 'b'
  templateId: string | null
  sent: number
  delivered: number
  read: number
  failed: number
  deliveryRate: number
  readRate: number
}

type TrackedLink = {
  id: string
  short_code: string
  target_url: string
  label: string | null
  clicks_count: number
  unique_clicks: number
  last_click_at: string | null
}

type CampaignRevenue = {
  total_clicks: number
  unique_clicks: number
  recipients_delivered: number
  orders_attributed: number
  revenue_attributed: number
}

type Props = {
  campaign: Campaign
  recipients: CampaignRecipient[]
  events: Array<{
    id: string
    event_type: string
    data: Record<string, unknown>
    created_at: string
  }>
  customerMap: Record<string, { name: string; phone: string | null }>
  trackedLinks?: TrackedLink[]
  revenue?: CampaignRevenue | null
}

export function CampaignDetailView({
  campaign,
  recipients,
  events,
  customerMap,
  trackedLinks = [],
  revenue = null,
}: Props) {
  const [abStats, setAbStats] = useState<AbVariantStats[] | null>(null)
  const [abWinner, setAbWinner] = useState<{
    winner: 'a' | 'b' | null
    confidence: string
    reason: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const [promotedVariant, setPromotedVariant] = useState<'a' | 'b' | null>(null)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  function handleLoadAbResults() {
    startTransition(async () => {
      const res = await getAbTestResults(campaign.id)
      if ('stats' in res) {
        setAbStats(res.stats as AbVariantStats[])
        setAbWinner(
          res.winner as { winner: 'a' | 'b' | null; confidence: string; reason: string }
        )
      }
    })
  }

  function handlePromoteWinner(variant: 'a' | 'b') {
    setPromoteError(null)
    startTransition(async () => {
      const res = await promoteAbWinner({ campaignId: campaign.id, variant })
      if ('error' in res && res.error) {
        setPromoteError(res.error)
        return
      }
      setPromotedVariant(variant)
    })
  }

  const deliveryRate =
    campaign.stats_total > 0
      ? Math.round((campaign.stats_delivered / campaign.stats_total) * 100)
      : 0
  const readRate =
    campaign.stats_delivered > 0
      ? Math.round((campaign.stats_read / campaign.stats_delivered) * 100)
      : 0
  const failRate =
    campaign.stats_total > 0
      ? Math.round((campaign.stats_failed / campaign.stats_total) * 100)
      : 0

  const statusGroups = useMemo(() => {
    const groups: Record<string, number> = {}
    for (const r of recipients) {
      groups[r.status] = (groups[r.status] ?? 0) + 1
    }
    return groups
  }, [recipients])

  function formatTime(d: string) {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="-mx-8 -mt-6">
      <header className="px-8 pt-6 pb-8 border-b border-border">
        <Link
          href="/marketing"
          className="inline-flex items-center text-[11px] text-muted hover:text-foreground transition-colors tracking-tight mb-4"
        >
          ← Campanhas
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.03em] text-foreground leading-none">
              {campaign.name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[12px] text-muted tracking-tight">
                {CHANNEL_LABEL[campaign.channel]}
              </span>
              <span className="text-muted text-[12px]">·</span>
              <span
                className={cn(
                  'text-[12px] tracking-tight font-medium',
                  campaign.status === 'running' && 'text-success',
                  campaign.status === 'completed' && 'text-foreground',
                  campaign.status === 'error' && 'text-destructive',
                  campaign.status === 'draft' && 'text-muted'
                )}
              >
                {STATUS_LABEL[campaign.status]}
              </span>
              {campaign.started_at && (
                <>
                  <span className="text-muted text-[12px]">·</span>
                  <span className="text-[11px] font-data text-muted">
                    Iniciada {formatTime(campaign.started_at)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {campaign.error_message && (
          <div className="mt-4 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
            {campaign.error_message}
          </div>
        )}
      </header>

      {/* KPI band */}
      <section className="px-8 py-8 border-b border-border grid grid-cols-2 lg:grid-cols-6 gap-x-8 gap-y-6">
        <Metric label="Total" value={String(campaign.stats_total)} />
        <Metric label="Enviadas" value={String(campaign.stats_sent)} />
        <Metric label="Entregues" value={`${deliveryRate}%`} />
        <Metric label="Lidas" value={`${readRate}%`} />
        <Metric
          label="Falhas"
          value={String(campaign.stats_failed)}
          tone={campaign.stats_failed > 0 ? 'primary' : 'neutral'}
        />
        <Metric label="Opt-out" value={String(campaign.stats_opted_out)} />
      </section>

      {/* Link tracking */}
      {(trackedLinks.length > 0 || (revenue && revenue.total_clicks > 0)) && (
        <section className="px-8 py-8 border-b border-border">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Tracking de links
            </h2>
            <span className="text-[10px] font-data text-muted tracking-tight">
              {trackedLinks.length} {trackedLinks.length === 1 ? 'link' : 'links'}
            </span>
          </div>
          {revenue && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-6 mb-8">
              <Metric label="Cliques" value={String(revenue.total_clicks ?? 0)} />
              <Metric label="Cliques unicos" value={String(revenue.unique_clicks ?? 0)} />
              <Metric
                label="CTR"
                value={
                  revenue.recipients_delivered > 0
                    ? `${Math.round((Number(revenue.unique_clicks ?? 0) / Number(revenue.recipients_delivered)) * 100)}%`
                    : '—'
                }
              />
              <Metric label="Pedidos" value={String(revenue.orders_attributed ?? 0)} />
              <Metric
                label="Receita atribuida"
                value={CURRENCY_FORMAT.format(Number(revenue.revenue_attributed ?? 0))}
              />
            </div>
          )}
          {trackedLinks.length > 0 && (
            <div>
              <div className="grid grid-cols-[2fr_80px_80px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                <span>Destino</span>
                <span className="text-right">Cliques</span>
                <span className="text-right">Unicos</span>
                <span className="text-right">Ultimo</span>
              </div>
              <div className="divide-y divide-border max-h-[40vh] overflow-y-auto">
                {trackedLinks.map((link) => (
                  <div
                    key={link.id}
                    className="grid grid-cols-[2fr_80px_80px_120px] gap-4 py-3 items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] text-foreground tracking-tight truncate">
                        {link.label ?? link.target_url}
                      </p>
                      <p className="text-[10px] font-data text-muted truncate">
                        /l/{link.short_code}
                      </p>
                    </div>
                    <span className="text-[12px] font-data text-foreground text-right">
                      {link.clicks_count}
                    </span>
                    <span className="text-[12px] font-data text-foreground/75 text-right">
                      {link.unique_clicks}
                    </span>
                    <span className="text-[10px] font-data text-muted text-right">
                      {link.last_click_at ? formatTime(link.last_click_at) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* A/B Test Results */}
      {recipients.some((r) => r.ab_variant) && (
        <section className="px-8 py-8 border-b border-border">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Teste A/B
            </h2>
            <button
              onClick={handleLoadAbResults}
              disabled={pending}
              className="text-[11px] text-foreground/75 hover:text-foreground tracking-tight transition-colors disabled:opacity-40"
            >
              {abStats ? 'Atualizar' : 'Carregar resultados'}
            </button>
          </div>

          {abStats && abStats.length >= 2 && (
            <div className="grid grid-cols-2 gap-8">
              {abStats.map((v) => (
                <div
                  key={v.variant}
                  className={cn(
                    'border rounded-lg p-5',
                    abWinner?.winner === v.variant
                      ? 'border-success/30 bg-success/5'
                      : 'border-border'
                  )}
                >
                  <div className="flex items-baseline justify-between mb-4">
                    <span className="text-[14px] font-medium text-foreground tracking-tight">
                      Variante {v.variant.toUpperCase()}
                    </span>
                    {abWinner?.winner === v.variant && (
                      <span className="text-[10px] text-success tracking-tight font-medium">
                        Vencedora
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                        Enviadas
                      </p>
                      <p className="text-[18px] font-medium text-foreground font-data mt-1">
                        {v.sent}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                        Entregues
                      </p>
                      <p className="text-[18px] font-medium text-foreground font-data mt-1">
                        {v.deliveryRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                        Lidas
                      </p>
                      <p
                        className={cn(
                          'text-[18px] font-medium font-data mt-1',
                          abWinner?.winner === v.variant
                            ? 'text-success'
                            : 'text-foreground'
                        )}
                      >
                        {v.readRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                        Falhas
                      </p>
                      <p className="text-[18px] font-medium text-muted font-data mt-1">
                        {v.failed}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {abWinner && (
            <div className="mt-5 space-y-3">
              <p className="text-[12px] text-foreground/75 tracking-tight">
                {abWinner.reason}
                <span
                  className={cn(
                    'ml-2 text-[11px]',
                    abWinner.confidence === 'high' && 'text-success',
                    abWinner.confidence === 'medium' && 'text-accent-foreground',
                    abWinner.confidence === 'low' && 'text-muted'
                  )}
                >
                  Confianca: {abWinner.confidence}
                </span>
              </p>
              {abWinner.winner && abWinner.confidence === 'high' && !promotedVariant && (
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <p className="text-[12px] text-foreground tracking-tight flex-1">
                    Promova a variante {abWinner.winner.toUpperCase()} pra usar como template padrao desta campanha.
                  </p>
                  <button
                    onClick={() => handlePromoteWinner(abWinner.winner as 'a' | 'b')}
                    disabled={pending}
                    className="h-9 px-4 bg-success/10 border border-success/30 text-success rounded-md text-[12px] font-medium hover:bg-success/20 transition-colors disabled:opacity-40"
                  >
                    Promover variante {abWinner.winner.toUpperCase()}
                  </button>
                </div>
              )}
              {promotedVariant && (
                <p className="text-[11px] text-success tracking-tight">
                  ✓ Variante {promotedVariant.toUpperCase()} promovida. A campanha agora usa esse template em todos os destinatarios.
                </p>
              )}
              {promoteError && (
                <p className="text-[11px] text-destructive tracking-tight">
                  {promoteError}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="px-8 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-x-12 gap-y-10">
        {/* Recipients table */}
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Destinatarios
            </h2>
            <div className="flex items-center gap-4 text-[10px] text-muted tracking-tight">
              {Object.entries(statusGroups)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <span key={status}>
                    {RECIPIENT_STATUS_LABEL[status as RecipientStatus] ?? status}{' '}
                    <span className="font-data">{count}</span>
                  </span>
                ))}
            </div>
          </div>

          {recipients.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-muted tracking-tight">
              Nenhum destinatario ainda
            </p>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                <span>Cliente</span>
                <span>Status</span>
                <span>Enviada</span>
                <span>Entregue</span>
              </div>
              <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
                {recipients.map((r) => {
                  const customer = customerMap[r.customer_id]
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 py-3 items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] text-foreground tracking-tight truncate">
                          {customer?.name ?? 'Cliente'}
                        </p>
                        {customer?.phone && (
                          <p className="text-[10px] font-data text-muted">
                            {customer.phone}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-[11px] tracking-tight',
                          r.status === 'delivered' && 'text-foreground',
                          r.status === 'read' && 'text-success font-semibold',
                          r.status === 'sent' && 'text-foreground/75',
                          r.status === 'failed' && 'text-destructive font-semibold',
                          r.status === 'opted_out' && 'text-accent-foreground',
                          (r.status === 'queued' || r.status === 'pending' || r.status === 'sending') && 'text-muted'
                        )}
                      >
                        {RECIPIENT_STATUS_LABEL[r.status]}
                        {r.failure_reason && (
                          <span className="text-[9px] text-muted block truncate">
                            {r.failure_reason}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-data text-muted">
                        {r.sent_at ? formatTime(r.sent_at) : '—'}
                      </span>
                      <span className="text-[10px] font-data text-muted">
                        {r.delivered_at
                          ? formatTime(r.delivered_at)
                          : r.read_at
                            ? formatTime(r.read_at)
                            : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* Event log */}
        <aside>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-5">
            Historico
          </h2>
          {events.length === 0 ? (
            <p className="text-[12px] text-muted tracking-tight">
              Nenhum evento registrado
            </p>
          ) : (
            <div className="space-y-5">
              {events.map((ev) => (
                <div key={ev.id} className="relative pl-4">
                  <span
                    className={cn(
                      'absolute left-0 top-1.5 w-1 h-1 rounded-full',
                      ev.event_type === 'error'
                        ? 'bg-primary'
                        : ev.event_type === 'completed'
                          ? 'bg-success'
                          : 'bg-stone-dark'
                    )}
                  />
                  <p className="text-[10px] font-data text-muted tracking-tight">
                    {formatTime(ev.created_at)}
                  </p>
                  <p className="text-[12px] text-foreground tracking-tight leading-snug mt-0.5">
                    {ev.event_type}
                  </p>
                  {ev.data && Object.keys(ev.data).length > 0 && (
                    <p className="text-[10px] text-muted tracking-tight mt-0.5 truncate">
                      {JSON.stringify(ev.data).slice(0, 100)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'primary'
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          'text-[22px] font-medium tracking-[-0.03em] leading-none font-data mt-3',
          tone === 'primary' ? 'text-primary' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  )
}
