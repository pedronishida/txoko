'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type {
  Campaign,
  CampaignAudience,
  CampaignChannel,
  CampaignStatus,
  CampaignTemplate,
  CampaignType,
} from '@txoko/shared'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import {
  createCampaign,
  deleteCampaign,
  launchCampaign,
  updateCampaignStatus,
} from './actions'
import { PageHeader } from '@/components/page-header'
import { MetricBand } from '@/components/metric-band'

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em execucao',
  paused: 'Pausada',
  completed: 'Concluida',
  cancelled: 'Cancelada',
  error: 'Erro',
}

const TYPE_LABEL: Record<CampaignType, string> = {
  one_shot: 'Unica',
  recurring: 'Recorrente',
  triggered: 'Automatica',
}

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
}

type Props = {
  campaigns: Campaign[]
  templates: CampaignTemplate[]
  audiences: CampaignAudience[]
}

export function MarketingView({ campaigns, templates, audiences }: Props) {
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stats = {
    total: campaigns.length,
    draft: campaigns.filter((c) => c.status === 'draft').length,
    running: campaigns.filter((c) => c.status === 'running').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
    totalSent: campaigns.reduce((s, c) => s + c.stats_sent, 0),
    totalDelivered: campaigns.reduce((s, c) => s + c.stats_delivered, 0),
    totalRead: campaigns.reduce((s, c) => s + c.stats_read, 0),
  }

  function handleLaunch(id: string) {
    if (!confirm('Iniciar envio desta campanha? Os destinatarios serao enfileirados.'))
      return
    startTransition(async () => {
      const res = await launchCampaign(id)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handlePause(id: string) {
    startTransition(async () => {
      const res = await updateCampaignStatus({
        campaignId: id,
        status: 'paused',
      })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover esta campanha?')) return
    startTransition(async () => {
      const res = await deleteCampaign(id)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6 pb-5">
        <PageHeader
          title="Marketing"
          subtitle="Campanhas, templates e audiencias para WhatsApp, email e SMS"
          action={
            <button
              onClick={() => {
                setError(null)
                setShowNew(true)
              }}
              className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
            >
              <Plus size={14} strokeWidth={2} />
              Nova campanha
            </button>
          }
        />
      </div>

      {/* KPI band */}
      <section className="px-8 pb-8 border-b border-night-lighter">
        <MetricBand
          metrics={[
            { label: 'Campanhas', value: String(stats.total) },
            { label: 'Rascunhos', value: String(stats.draft) },
            { label: 'Em execucao', value: String(stats.running), tone: stats.running > 0 ? 'positive' : 'neutral' },
            { label: 'Concluidas', value: String(stats.completed) },
            { label: 'Enviadas', value: stats.totalSent.toLocaleString('pt-BR') },
            {
              label: 'Taxa de leitura',
              value:
                stats.totalDelivered > 0
                  ? `${Math.round((stats.totalRead / stats.totalDelivered) * 100)}%`
                  : '—',
            },
          ]}
          columns={4}
          border={false}
        />

        {/* Channel breakdown */}
        {campaigns.length > 0 && (
          <div className="mt-8 pt-6 border-t border-night-lighter">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-4">
              Por canal
            </p>
            <div className="grid grid-cols-3 gap-8">
              {(['whatsapp', 'email', 'sms'] as const).map((ch) => {
                const chCamps = campaigns.filter((c) => c.channel === ch)
                const chSent = chCamps.reduce((s, c) => s + c.stats_sent, 0)
                const chDelivered = chCamps.reduce(
                  (s, c) => s + c.stats_delivered,
                  0
                )
                const chRead = chCamps.reduce((s, c) => s + c.stats_read, 0)
                if (chCamps.length === 0) return null
                return (
                  <div key={ch}>
                    <p className="text-[12px] text-cloud tracking-tight mb-3">
                      {CHANNEL_LABEL[ch]}
                    </p>
                    <div className="flex items-baseline gap-5">
                      <div>
                        <p className="text-[10px] text-stone-dark tracking-tight">
                          Enviadas
                        </p>
                        <p className="text-[16px] font-medium font-data text-cloud mt-1">
                          {chSent.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-stone-dark tracking-tight">
                          Entrega
                        </p>
                        <p className="text-[16px] font-medium font-data text-cloud mt-1">
                          {chSent > 0
                            ? `${Math.round((chDelivered / chSent) * 100)}%`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-stone-dark tracking-tight">
                          Leitura
                        </p>
                        <p className="text-[16px] font-medium font-data text-cloud mt-1">
                          {chDelivered > 0
                            ? `${Math.round((chRead / chDelivered) * 100)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <div className="px-8 py-8">
        {error && (
          <div className="mb-6 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={12} />
            </button>
          </div>
        )}

        {campaigns.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[14px] text-stone tracking-tight">
              Nenhuma campanha criada ainda
            </p>
            <p className="text-[12px] text-stone-dark tracking-tight mt-1.5">
              Crie sua primeira campanha de WhatsApp, email ou SMS
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-4 pb-3 border-b border-night-lighter text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
              <span>Campanha</span>
              <span>Canal</span>
              <span>Tipo</span>
              <span>Status</span>
              <span className="text-right">Enviadas</span>
              <span>Criada em</span>
              <span></span>
            </div>
            <div className="divide-y divide-night-lighter">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className="group grid grid-cols-[2fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-4 py-4 items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/marketing/campaigns/${c.id}`}
                      className="text-[13px] text-cloud tracking-tight truncate block hover:text-cloud-dark transition-colors"
                    >
                      {c.name}
                    </Link>
                    {c.description && (
                      <p className="text-[11px] text-stone-dark tracking-tight truncate mt-0.5">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-stone tracking-tight">
                    {CHANNEL_LABEL[c.channel]}
                  </span>
                  <span className="text-[11px] text-stone-dark tracking-tight">
                    {TYPE_LABEL[c.type]}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] tracking-tight',
                      c.status === 'running' && 'text-leaf',
                      c.status === 'completed' && 'text-cloud',
                      c.status === 'error' && 'text-primary',
                      c.status === 'draft' && 'text-stone',
                      c.status === 'paused' && 'text-warm',
                      c.status === 'scheduled' && 'text-stone-light',
                      c.status === 'cancelled' && 'text-stone-dark'
                    )}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                  <div className="text-right">
                    <span className="text-[12px] font-data text-cloud">
                      {c.stats_sent.toLocaleString('pt-BR')}
                    </span>
                    {c.stats_total > 0 && (
                      <span className="text-[10px] font-data text-stone-dark ml-1">
                        / {c.stats_total}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-data text-stone-dark">
                    {formatDate(c.created_at)}
                  </span>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.status === 'draft' && (
                      <button
                        onClick={() => handleLaunch(c.id)}
                        disabled={pending}
                        className="text-[10px] text-leaf hover:text-leaf/80 tracking-tight disabled:opacity-40"
                      >
                        lancar
                      </button>
                    )}
                    {c.status === 'running' && (
                      <button
                        onClick={() => handlePause(c.id)}
                        disabled={pending}
                        className="text-[10px] text-warm hover:text-warm/80 tracking-tight disabled:opacity-40"
                      >
                        pausar
                      </button>
                    )}
                    {(c.status === 'draft' || c.status === 'cancelled') && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={pending}
                        className="text-[10px] text-stone-dark hover:text-primary tracking-tight disabled:opacity-40"
                      >
                        remover
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <NewCampaignModal
          audiences={audiences}
          onClose={() => setShowNew(false)}
          onError={setError}
        />
      )}
    </div>
  )
}

function NewCampaignModal({
  audiences,
  onClose,
  onError,
}: {
  audiences: CampaignAudience[]
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<CampaignType>('one_shot')
  const [channel, setChannel] = useState<CampaignChannel>('whatsapp')
  const [audienceId, setAudienceId] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await createCampaign({
        name,
        description: description || undefined,
        type,
        channel,
        audience_id: audienceId || undefined,
      })
      if ('error' in res && res.error) {
        onError(res.error)
        return
      }
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            Nova campanha
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Nome *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Promo de aniversario"
              className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>
          <Field label="Descricao">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivo da campanha"
              className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Canal">
              <div className="flex gap-1">
                {(['whatsapp', 'email', 'sms'] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setChannel(ch)}
                    className={cn(
                      'flex-1 h-9 text-[11px] font-medium rounded-md transition-colors tracking-tight',
                      channel === ch
                        ? 'bg-cloud text-night'
                        : 'text-stone-light hover:text-cloud hover:bg-night-lighter'
                    )}
                  >
                    {CHANNEL_LABEL[ch]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Tipo">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CampaignType)}
                className="w-full h-9 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
              >
                {(Object.keys(TYPE_LABEL) as CampaignType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {audiences.length > 0 && (
            <Field label="Audiencia">
              <select
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
                className="w-full h-9 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
              >
                <option value="">Todos os clientes</option>
                {audiences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.cached_count})
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending || !name.trim()}
              className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
            >
              {pending ? 'Criando' : 'Criar campanha'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
