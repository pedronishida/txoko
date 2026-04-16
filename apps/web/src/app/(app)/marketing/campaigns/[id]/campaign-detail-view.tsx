'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Campaign, CampaignRecipient, RecipientStatus } from '@txoko/shared'
import { getAbTestResults } from '../../actions'

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
}

export function CampaignDetailView({
  campaign,
  recipients,
  events,
  customerMap,
}: Props) {
  const [abStats, setAbStats] = useState<AbVariantStats[] | null>(null)
  const [abWinner, setAbWinner] = useState<{
    winner: 'a' | 'b' | null
    confidence: string
    reason: string
  } | null>(null)
  const [pending, startTransition] = useTransition()

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
      <header className="px-8 pt-6 pb-8 border-b border-night-lighter">
        <Link
          href="/marketing"
          className="inline-flex items-center text-[11px] text-stone hover:text-cloud transition-colors tracking-tight mb-4"
        >
          ← Campanhas
        </Link>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
              {campaign.name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[12px] text-stone tracking-tight">
                {CHANNEL_LABEL[campaign.channel]}
              </span>
              <span className="text-stone-dark text-[12px]">·</span>
              <span
                className={cn(
                  'text-[12px] tracking-tight',
                  campaign.status === 'running' && 'text-leaf',
                  campaign.status === 'completed' && 'text-cloud',
                  campaign.status === 'error' && 'text-primary',
                  campaign.status === 'draft' && 'text-stone'
                )}
              >
                {STATUS_LABEL[campaign.status]}
              </span>
              {campaign.started_at && (
                <>
                  <span className="text-stone-dark text-[12px]">·</span>
                  <span className="text-[11px] font-data text-stone-dark">
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
      <section className="px-8 py-8 border-b border-night-lighter grid grid-cols-2 lg:grid-cols-6 gap-x-8 gap-y-6">
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

      {/* A/B Test Results */}
      {recipients.some((r) => r.ab_variant) && (
        <section className="px-8 py-8 border-b border-night-lighter">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Teste A/B
            </h2>
            <button
              onClick={handleLoadAbResults}
              disabled={pending}
              className="text-[11px] text-stone-light hover:text-cloud tracking-tight transition-colors disabled:opacity-40"
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
                      ? 'border-leaf/30 bg-leaf/5'
                      : 'border-night-lighter'
                  )}
                >
                  <div className="flex items-baseline justify-between mb-4">
                    <span className="text-[14px] font-medium text-cloud tracking-tight">
                      Variante {v.variant.toUpperCase()}
                    </span>
                    {abWinner?.winner === v.variant && (
                      <span className="text-[10px] text-leaf tracking-tight font-medium">
                        Vencedora
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                        Enviadas
                      </p>
                      <p className="text-[18px] font-medium text-cloud font-data mt-1">
                        {v.sent}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                        Entregues
                      </p>
                      <p className="text-[18px] font-medium text-cloud font-data mt-1">
                        {v.deliveryRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                        Lidas
                      </p>
                      <p
                        className={cn(
                          'text-[18px] font-medium font-data mt-1',
                          abWinner?.winner === v.variant
                            ? 'text-leaf'
                            : 'text-cloud'
                        )}
                      >
                        {v.readRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                        Falhas
                      </p>
                      <p className="text-[18px] font-medium text-stone-dark font-data mt-1">
                        {v.failed}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {abWinner && (
            <div className="mt-5">
              <p className="text-[12px] text-stone-light tracking-tight">
                {abWinner.reason}
                <span className="text-stone-dark ml-2">
                  Confianca: {abWinner.confidence}
                </span>
              </p>
            </div>
          )}
        </section>
      )}

      <div className="px-8 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-x-12 gap-y-10">
        {/* Recipients table */}
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Destinatarios
            </h2>
            <div className="flex items-center gap-4 text-[10px] text-stone-dark tracking-tight">
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
            <p className="py-12 text-center text-[13px] text-stone tracking-tight">
              Nenhum destinatario ainda
            </p>
          ) : (
            <div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 pb-3 border-b border-night-lighter text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                <span>Cliente</span>
                <span>Status</span>
                <span>Enviada</span>
                <span>Entregue</span>
              </div>
              <div className="divide-y divide-night-lighter max-h-[50vh] overflow-y-auto">
                {recipients.map((r) => {
                  const customer = customerMap[r.customer_id]
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 py-3 items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] text-cloud tracking-tight truncate">
                          {customer?.name ?? 'Cliente'}
                        </p>
                        {customer?.phone && (
                          <p className="text-[10px] font-data text-stone-dark">
                            {customer.phone}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-[11px] tracking-tight',
                          r.status === 'delivered' && 'text-cloud',
                          r.status === 'read' && 'text-leaf',
                          r.status === 'sent' && 'text-stone-light',
                          r.status === 'failed' && 'text-primary',
                          r.status === 'opted_out' && 'text-warm',
                          (r.status === 'queued' || r.status === 'pending' || r.status === 'sending') && 'text-stone-dark'
                        )}
                      >
                        {RECIPIENT_STATUS_LABEL[r.status]}
                        {r.failure_reason && (
                          <span className="text-[9px] text-stone-dark block truncate">
                            {r.failure_reason}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark">
                        {r.sent_at ? formatTime(r.sent_at) : '—'}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark">
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
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark mb-5">
            Historico
          </h2>
          {events.length === 0 ? (
            <p className="text-[12px] text-stone tracking-tight">
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
                          ? 'bg-leaf'
                          : 'bg-stone-dark'
                    )}
                  />
                  <p className="text-[10px] font-data text-stone-dark tracking-tight">
                    {formatTime(ev.created_at)}
                  </p>
                  <p className="text-[12px] text-cloud tracking-tight leading-snug mt-0.5">
                    {ev.event_type}
                  </p>
                  {ev.data && Object.keys(ev.data).length > 0 && (
                    <p className="text-[10px] text-stone-dark tracking-tight mt-0.5 truncate">
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
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
        {label}
      </p>
      <p
        className={cn(
          'text-[22px] font-medium tracking-[-0.03em] leading-none font-data mt-3',
          tone === 'primary' ? 'text-primary' : 'text-cloud'
        )}
      >
        {value}
      </p>
    </div>
  )
}
