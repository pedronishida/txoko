'use client'

import { useState, useTransition } from 'react'
import { EmptyState } from '@/components/states'
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
  createAbTestCampaign,
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
              className="inline-flex items-center gap-2 h-9 px-3.5 bg-primary text-primary-foreground text-[13px] font-medium rounded-md hover:bg-primary-hover transition-colors"
            >
              <Plus size={14} strokeWidth={2} />
              Nova campanha
            </button>
          }
        />
      </div>

      {/* KPI band */}
      <section className="px-8 pb-8 border-b border-border">
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
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-4">
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
                    <p className="text-[12px] text-foreground tracking-tight mb-3">
                      {CHANNEL_LABEL[ch]}
                    </p>
                    <div className="flex items-baseline gap-5">
                      <div>
                        <p className="text-[10px] text-muted tracking-tight">
                          Enviadas
                        </p>
                        <p className="text-[16px] font-medium font-data text-foreground mt-1">
                          {chSent.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted tracking-tight">
                          Entrega
                        </p>
                        <p className="text-[16px] font-medium font-data text-foreground mt-1">
                          {chSent > 0
                            ? `${Math.round((chDelivered / chSent) * 100)}%`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted tracking-tight">
                          Leitura
                        </p>
                        <p className="text-[16px] font-medium font-data text-foreground mt-1">
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
          <EmptyState
            title="Nenhuma campanha criada ainda"
            hint="Crie sua primeira campanha de WhatsApp, email ou SMS"
            className="py-20"
          />
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Campanha</span>
              <span>Canal</span>
              <span>Tipo</span>
              <span>Status</span>
              <span className="text-right">Enviadas</span>
              <span>Criada em</span>
              <span></span>
            </div>
            <div className="divide-y divide-border">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className="group grid grid-cols-[2fr_1fr_0.8fr_1fr_1fr_1fr_auto] gap-4 py-4 items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/marketing/campaigns/${c.id}`}
                      className="text-[13px] text-foreground tracking-tight truncate block hover:text-foreground/75 transition-colors"
                    >
                      {c.name}
                    </Link>
                    {c.description && (
                      <p className="text-[11px] text-muted tracking-tight truncate mt-0.5">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted tracking-tight">
                    {CHANNEL_LABEL[c.channel]}
                  </span>
                  <span className="text-[11px] text-muted tracking-tight">
                    {TYPE_LABEL[c.type]}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] tracking-tight font-medium',
                      c.status === 'running' && 'text-success',
                      c.status === 'completed' && 'text-foreground',
                      c.status === 'error' && 'text-destructive',
                      c.status === 'draft' && 'text-muted',
                      c.status === 'paused' && 'text-accent-foreground',
                      c.status === 'scheduled' && 'text-primary',
                      c.status === 'cancelled' && 'text-muted'
                    )}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                  <div className="text-right">
                    <span className="text-[12px] font-data text-foreground">
                      {c.stats_sent.toLocaleString('pt-BR')}
                    </span>
                    {c.stats_total > 0 && (
                      <span className="text-[10px] font-data text-muted ml-1">
                        / {c.stats_total}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-data text-muted">
                    {formatDate(c.created_at)}
                  </span>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.status === 'draft' && (
                      <button
                        onClick={() => handleLaunch(c.id)}
                        disabled={pending}
                        className="text-[10px] text-success hover:text-success/80 tracking-tight disabled:opacity-40"
                      >
                        lancar
                      </button>
                    )}
                    {c.status === 'running' && (
                      <button
                        onClick={() => handlePause(c.id)}
                        disabled={pending}
                        className="text-[10px] text-accent-foreground hover:text-accent-foreground/80 tracking-tight disabled:opacity-40"
                      >
                        pausar
                      </button>
                    )}
                    {(c.status === 'draft' || c.status === 'cancelled') && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={pending}
                        className="text-[10px] text-muted hover:text-primary tracking-tight disabled:opacity-40"
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
          templates={templates}
          onClose={() => setShowNew(false)}
          onError={setError}
        />
      )}
    </div>
  )
}

function NewCampaignModal({
  audiences,
  templates,
  onClose,
  onError,
}: {
  audiences: CampaignAudience[]
  templates: CampaignTemplate[]
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<CampaignType>('one_shot')
  const [channel, setChannel] = useState<CampaignChannel>('whatsapp')
  const [audienceId, setAudienceId] = useState('')
  const [isAbTest, setIsAbTest] = useState(false)
  const [templateAId, setTemplateAId] = useState('')
  const [templateBId, setTemplateBId] = useState('')
  const [splitPct, setSplitPct] = useState(50)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      if (isAbTest) {
        if (!templateAId || !templateBId) {
          onError('Selecione 2 templates pra fazer A/B')
          return
        }
        if (templateAId === templateBId) {
          onError('Os templates A e B precisam ser diferentes')
          return
        }
        const res = await createAbTestCampaign({
          name,
          description: description || undefined,
          type,
          channel,
          audience_id: audienceId || undefined,
          templateAId,
          templateBId,
          splitPct,
        })
        if ('error' in res && res.error) {
          onError(res.error)
          return
        }
        onClose()
        return
      }
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
        className="bg-surface border border-border rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-foreground tracking-tight">
            Nova campanha
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-muted-subtle transition-colors"
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
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>
          <Field label="Descricao">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivo da campanha"
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
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
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground/75 hover:text-foreground hover:bg-muted-subtle'
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
                className="w-full h-9 px-3 bg-night border border-border rounded-md text-[12px] text-foreground focus:outline-none focus:border-stone-dark transition-colors"
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
                className="w-full h-9 px-3 bg-night border border-border rounded-md text-[12px] text-foreground focus:outline-none focus:border-stone-dark transition-colors"
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
          <div className="border-t border-border pt-5">
            <label className="flex items-center justify-between cursor-pointer mb-3">
              <span className="text-[13px] text-foreground tracking-tight">
                Criar como teste A/B
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isAbTest}
                onClick={() => setIsAbTest((v) => !v)}
                className={cn(
                  'relative w-[36px] h-[20px] rounded-full transition-colors',
                  isAbTest ? 'bg-success' : 'bg-muted-subtle'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-[16px] h-[16px] rounded-full bg-primary transition-all',
                    isAbTest ? 'left-[18px]' : 'left-0.5'
                  )}
                />
              </button>
            </label>
            {isAbTest && (
              <div className="space-y-4">
                {templates.length < 2 ? (
                  <p className="text-[11px] text-accent-foreground tracking-tight">
                    Voce precisa de pelo menos 2 templates pra fazer A/B. Crie em <strong>Templates</strong> primeiro.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Variante A">
                        <select
                          value={templateAId}
                          onChange={(e) => setTemplateAId(e.target.value)}
                          className="w-full h-9 px-2 bg-night border border-border rounded-md text-[12px] text-foreground focus:outline-none focus:border-stone-dark transition-colors"
                        >
                          <option value="">— escolha —</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Variante B">
                        <select
                          value={templateBId}
                          onChange={(e) => setTemplateBId(e.target.value)}
                          className="w-full h-9 px-2 bg-night border border-border rounded-md text-[12px] text-foreground focus:outline-none focus:border-stone-dark transition-colors"
                        >
                          <option value="">— escolha —</option>
                          {templates
                            .filter((t) => t.id !== templateAId)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    </div>
                    <Field label={`Split: ${splitPct}% A · ${100 - splitPct}% B`}>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        step={5}
                        value={splitPct}
                        onChange={(e) => setSplitPct(parseInt(e.target.value, 10))}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted tracking-tight mt-1">
                        Tip: 50/50 valida mais rapido com p&lt;0.05. 90/10 minimiza risco da variante B.
                      </p>
                    </Field>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-border rounded-md text-[13px] text-foreground/75 hover:text-foreground hover:border-stone-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending || !name.trim()}
              className="flex-1 h-10 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-40"
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
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
