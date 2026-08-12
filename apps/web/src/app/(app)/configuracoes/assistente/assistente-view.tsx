'use client'

import { useMemo, useState, useTransition } from 'react'
import { Bot, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/toaster'
import {
  updateAiAgentSettings,
  type AiAgentBusinessHours,
  type AiAgentConfig,
  type AiAgentDayHours,
  type AiAgentMode,
} from '../actions'

export type AgentDraftRow = {
  id: string
  status: string
  created_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  confirmed_order_id: string | null
  items_count: number
  customer_name: string | null
  delivery_type: string | null
  payment_method: string | null
}

export type AgentMessageRow = {
  id: string
  conversation_id: string
  body: string
  status: string
  created_at: string
  contact_name: string | null
}

const DAYS: Array<{ key: keyof AiAgentBusinessHours; label: string }> = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terca' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sabado' },
  { key: 'sun', label: 'Domingo' },
]

const DEFAULT_HOURS: AiAgentBusinessHours = {
  mon: { open: '11:00', close: '23:00' },
  tue: { open: '11:00', close: '23:00' },
  wed: { open: '11:00', close: '23:00' },
  thu: { open: '11:00', close: '23:00' },
  fri: { open: '11:00', close: '23:30' },
  sat: { open: '11:00', close: '23:30' },
  sun: { open: '11:00', close: '22:00' },
}

const STATUS_LABELS: Record<string, string> = {
  building: 'Em construcao',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AssistenteView({
  restaurantId,
  restaurantName,
  enabled: initialEnabled,
  config,
  recentDrafts,
  recentMessages,
}: {
  restaurantId: string
  restaurantName: string
  enabled: boolean
  config: Partial<AiAgentConfig>
  recentDrafts: AgentDraftRow[]
  recentMessages: AgentMessageRow[]
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [mode, setMode] = useState<AiAgentMode>(config.mode ?? 'chat')
  const [persona, setPersona] = useState(
    config.persona ?? 'um atendente amigavel e direto'
  )
  const [keywords, setKeywords] = useState<string[]>(
    config.escalate_keywords ?? ['gerente', 'reembolso', 'cancelar']
  )
  const [minConfidence, setMinConfidence] = useState(config.min_confidence ?? 0.7)
  const [businessHoursOnly, setBusinessHoursOnly] = useState(
    config.business_hours_only ?? false
  )
  const [hours, setHours] = useState<AiAgentBusinessHours>(
    config.business_hours ?? DEFAULT_HOURS
  )
  const [greeting, setGreeting] = useState(config.greeting_message ?? '')
  const [offHours, setOffHours] = useState(config.off_hours_message ?? '')
  const [rolloutMode, setRolloutMode] = useState<'allowlist' | 'all'>(
    config.order_taking_rollout_mode ?? 'allowlist'
  )
  const [allowlist, setAllowlist] = useState<string[]>(
    config.order_taking_allowlist ?? []
  )
  const [newPhone, setNewPhone] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [pending, startTransition] = useTransition()

  const stats = useMemo(() => {
    const total = recentDrafts.length
    const confirmed = recentDrafts.filter((d) => d.status === 'confirmed').length
    return {
      total,
      confirmed,
      cancelled: recentDrafts.filter((d) => d.status === 'cancelled').length,
      building: recentDrafts.filter((d) => d.status === 'building').length,
    }
  }, [recentDrafts])

  function addEscalateKw() {
    const kw = newKeyword.trim().toLowerCase()
    if (!kw || keywords.includes(kw)) {
      setNewKeyword('')
      return
    }
    setKeywords((prev) => [...prev, kw])
    setNewKeyword('')
  }

  function addAllowlistPhone() {
    const digits = newPhone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 15 || allowlist.includes(digits)) {
      setNewPhone('')
      return
    }
    setAllowlist((prev) => [...prev, digits])
    setNewPhone('')
  }

  function updateDayHours(day: keyof AiAgentBusinessHours, patch: AiAgentDayHours) {
    setHours((prev) => ({ ...prev, [day]: { ...(prev[day] ?? {}), ...patch } }))
  }

  function handleSave() {
    startTransition(async () => {
      const res = await updateAiAgentSettings({
        restaurantId,
        enabled,
        config: {
          persona: persona.trim() || 'um atendente amigavel',
          escalate_keywords: keywords,
          min_confidence: minConfidence,
          business_hours_only: businessHoursOnly,
          mode,
          business_hours: hours,
          greeting_message: greeting.trim() || undefined,
          off_hours_message: offHours.trim() || undefined,
          order_taking_rollout_mode: rolloutMode,
          order_taking_allowlist: allowlist,
        },
      })
      if (!res.ok) {
        toast.error('Nao consegui salvar', { description: res.error })
        return
      }
      toast.success('Configuracoes do agente salvas')
    })
  }

  return (
    <div>
      <header className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h2 className="text-[16px] font-medium tracking-[-0.02em] text-foreground leading-none flex items-center gap-2.5">
            <Bot size={16} className="text-success" strokeWidth={1.5} />
            Assistente IA
          </h2>
          <p className="text-[12px] text-foreground/75 tracking-tight mt-1.5">
            {restaurantName} · Configura como o agente atende clientes no WhatsApp
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={pending}
          className="h-9 px-5 text-[13px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-40"
        >
          {pending ? 'Salvando' : 'Salvar'}
        </button>
      </header>

      <section className="py-7 border-y border-border flex items-center justify-between gap-6">
        <div>
          <p
            className={cn(
              'text-[14px] font-medium tracking-tight',
              enabled ? 'text-success' : 'text-foreground/75'
            )}
          >
            {enabled ? 'Agente ativado' : 'Agente desativado'}
          </p>
          <p className="text-[12px] text-muted tracking-tight mt-1 max-w-md">
            Quando ativo, responde mensagens de clientes automaticamente. Funciona em conversas WhatsApp do Inbox.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((prev) => !prev)}
          className={cn(
            'relative w-[42px] h-[22px] rounded-full transition-colors shrink-0',
            enabled ? 'bg-success' : 'bg-muted-subtle'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-[18px] h-[18px] rounded-full bg-primary transition-all',
              enabled ? 'left-[22px]' : 'left-0.5'
            )}
          />
        </button>
      </section>

      <Section title="Modo do agente">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModeCard
            active={mode === 'chat'}
            onClick={() => setMode('chat')}
            title="Chat (Q&A)"
            description="Responde perguntas usando a base de conhecimento. Escala duvidas complexas."
            badge="Mais simples"
          />
          <ModeCard
            active={mode === 'order_taking'}
            onClick={() => setMode('order_taking')}
            title="Coleta pedidos"
            description="Conversa, monta pedido com produtos do cardapio e cria order automaticamente no KDS."
            badge="Beta"
          />
        </div>
      </Section>

      {mode === 'order_taking' && (
        <Section
          title="Rollout do modo coleta de pedidos"
          right={
            <span className="text-[10px] font-data text-muted tracking-tight">
              {rolloutMode === 'all'
                ? 'todos os clientes'
                : `allowlist (${allowlist.length})`}
            </span>
          }
        >
          <p className="text-[12px] text-muted tracking-tight mb-4">
            {'O modo "Coleta pedidos" cria orders no sistema automaticamente. Comece com a allowlist (so atende numeros listados — bom pra testar com 1 ou 2 clientes amigos antes de liberar geral).'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <ModeCard
              active={rolloutMode === 'allowlist'}
              onClick={() => setRolloutMode('allowlist')}
              title="Allowlist (recomendado)"
              description="Atende apenas numeros adicionados na lista abaixo. Modo chat continua atendendo todos."
              badge="Conservador"
            />
            <ModeCard
              active={rolloutMode === 'all'}
              onClick={() => setRolloutMode('all')}
              title="Todos os numeros"
              description="Atende qualquer cliente. Use depois de validar com a allowlist."
              badge="Producao"
            />
          </div>
          {rolloutMode === 'allowlist' && (
            <Field label="Telefones autorizados (apenas digitos, com DDD)">
              <div className="flex gap-2">
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addAllowlistPhone()
                    }
                  }}
                  placeholder="ex: 5511999998888"
                  inputMode="numeric"
                  className="flex-1 bg-transparent border border-border rounded-md px-3 py-2 text-[13px] font-data text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
                />
                <button
                  onClick={addAllowlistPhone}
                  className="h-9 px-3 rounded-md border border-border hover:border-stone text-foreground/75 hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  <span className="text-[12px] tracking-tight">Adicionar</span>
                </button>
              </div>
              {allowlist.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {allowlist.map((phone) => (
                    <span
                      key={phone}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted-subtle text-[11px] font-data text-foreground tracking-tight"
                    >
                      {phone}
                      <button
                        onClick={() => {
                          setAllowlist((prev) => prev.filter((p) => p !== phone))
                        }}
                        className="text-muted hover:text-destructive transition-colors"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-accent-foreground tracking-tight mt-3">
                  Allowlist vazia: o agente NAO vai atender ninguem em modo coleta de pedidos. Adicione pelo menos um numero.
                </p>
              )}
            </Field>
          )}
        </Section>
      )}

      <Section title="Persona">
        <Field label="Como o agente se apresenta">
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={3}
            className="w-full bg-transparent border border-border rounded-md px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            placeholder="ex: 'um atendente amigavel e agil que conhece o menu de cor'"
          />
        </Field>
      </Section>

      <Section title="Mensagens prontas (opcional)">
        <Field label="Saudacao inicial (primeira mensagem)">
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={2}
            className="w-full bg-transparent border border-border rounded-md px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            placeholder="ex: 'Oi! Sou a Mia, atendente virtual do Txoko. Como posso te ajudar hoje?'"
          />
        </Field>
        <Field label="Resposta fora do horario">
          <textarea
            value={offHours}
            onChange={(e) => setOffHours(e.target.value)}
            rows={2}
            className="w-full bg-transparent border border-border rounded-md px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            placeholder="ex: 'Estamos fechados agora. Anote seu pedido e enviaremos no proximo turno!'"
          />
        </Field>
      </Section>

      <Section title="Horario de funcionamento">
        <p className="text-[12px] text-muted tracking-tight mb-4">
          Usado pela tool <code className="text-foreground/75">verificar_horario_funcionamento</code> e por
          <code className="text-foreground/75 ml-1">{'"Responder so no horario"'}</code>.
        </p>
        <label className="flex items-center gap-3 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={businessHoursOnly}
            onChange={(e) => setBusinessHoursOnly(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[13px] text-foreground tracking-tight">
            Responder apenas dentro do horario
          </span>
        </label>
        <div className="space-y-2">
          {DAYS.map((day) => {
            const value = hours[day.key] ?? {}
            return (
              <div
                key={day.key}
                className="grid grid-cols-[100px_120px_120px_100px] gap-3 items-center"
              >
                <span className="text-[12px] text-foreground/75 tracking-tight">
                  {day.label}
                </span>
                <input
                  type="time"
                  value={value.open ?? ''}
                  onChange={(e) => updateDayHours(day.key, { open: e.target.value })}
                  disabled={value.closed}
                  className="bg-transparent border border-border rounded-md px-2.5 py-1.5 text-[12px] font-data text-foreground focus:outline-none focus:border-stone disabled:opacity-30"
                />
                <input
                  type="time"
                  value={value.close ?? ''}
                  onChange={(e) => updateDayHours(day.key, { close: e.target.value })}
                  disabled={value.closed}
                  className="bg-transparent border border-border rounded-md px-2.5 py-1.5 text-[12px] font-data text-foreground focus:outline-none focus:border-stone disabled:opacity-30"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.closed ?? false}
                    onChange={(e) =>
                      updateDayHours(day.key, { closed: e.target.checked })
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[11px] text-muted tracking-tight">
                    Fechado
                  </span>
                </label>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Escalacao para humano">
        <Field label={`Confianca minima pra responder (${Math.round(100 * minConfidence)}%)`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minConfidence}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-[11px] text-muted tracking-tight mt-2">
            Abaixo disso, o agente nao responde e marca a conversa pra atendente humano.
          </p>
        </Field>
        <Field label="Palavras que sempre escalam">
          <div className="flex gap-2">
            <input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEscalateKw()
                }
              }}
              placeholder="ex: gerente, reclamacao, processo..."
              className="flex-1 bg-transparent border border-border rounded-md px-3 py-2 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone tracking-tight"
            />
            <button
              onClick={addEscalateKw}
              className="h-9 px-3 rounded-md border border-border hover:border-stone text-foreground/75 hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Plus size={13} />
              <span className="text-[12px] tracking-tight">Adicionar</span>
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted-subtle text-[11px] text-foreground tracking-tight"
                >
                  {kw}
                  <button
                    onClick={() => {
                      setKeywords((prev) => prev.filter((k) => k !== kw))
                    }}
                    className="text-muted hover:text-destructive transition-colors"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
      </Section>

      <Section
        title="Pedidos coletados pelo agente"
        right={
          <span className="text-[10px] font-data text-muted tracking-tight">
            {stats.confirmed} confirmados · {stats.cancelled} cancelados ·{' '}
            {stats.building} em construcao
          </span>
        }
      >
        {recentDrafts.length === 0 ? (
          <p className="text-[12px] text-muted tracking-tight py-6">
            {'Nenhum pedido coletado ainda. Quando ativar o modo "Coleta pedidos", vai aparecer aqui.'}
          </p>
        ) : (
          <div>
            <div className="grid grid-cols-[120px_1fr_80px_120px_120px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              <span>Quando</span>
              <span>Cliente</span>
              <span className="text-right">Itens</span>
              <span>Forma</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-border max-h-[40vh] overflow-y-auto">
              {recentDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="grid grid-cols-[120px_1fr_80px_120px_120px] gap-4 py-3 items-center"
                >
                  <span className="text-[10px] font-data text-muted">
                    {formatDate(draft.created_at)}
                  </span>
                  <span className="text-[12px] text-foreground tracking-tight truncate">
                    {draft.customer_name ?? 'Anonimo'}
                  </span>
                  <span className="text-[12px] font-data text-foreground/75 text-right">
                    {draft.items_count}
                  </span>
                  <span className="text-[11px] text-foreground/75 tracking-tight">
                    {draft.delivery_type ?? '—'}
                    {draft.payment_method ? ` · ${draft.payment_method}` : ''}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] tracking-tight',
                      (function (status: string) {
                        switch (status) {
                          case 'confirmed':
                            return 'text-success'
                          case 'cancelled':
                          default:
                            return 'text-muted'
                          case 'expired':
                            return 'text-accent-foreground'
                          case 'building':
                            return 'text-foreground'
                        }
                      })(draft.status)
                    )}
                  >
                    {STATUS_LABELS[draft.status] ?? draft.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Mensagens enviadas pelo agente">
        {recentMessages.length === 0 ? (
          <p className="text-[12px] text-muted tracking-tight py-6">
            Sem mensagens automaticas registradas.
          </p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {recentMessages.map((message) => (
              <div
                key={message.id}
                className="border border-border rounded-md px-4 py-3"
              >
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] text-foreground tracking-tight">
                    Para: {message.contact_name ?? 'Cliente'}
                  </span>
                  <span className="text-[10px] font-data text-muted">
                    {formatDate(message.created_at)}
                  </span>
                </div>
                <p className="text-[13px] text-foreground/75 tracking-tight whitespace-pre-wrap">
                  {message.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  title,
  description,
  badge,
}: {
  active: boolean
  onClick: () => void
  title: string
  description: string
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left border rounded-lg px-4 py-4 transition-colors',
        active ? 'border-success bg-success/5' : 'border-border hover:border-stone'
      )}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className={cn(
            'text-[14px] font-medium tracking-tight',
            active ? 'text-success' : 'text-foreground'
          )}
        >
          {title}
        </span>
        {badge && (
          <span className="text-[9px] uppercase tracking-[0.08em] text-muted">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[12px] text-foreground/75 tracking-tight leading-relaxed">
        {description}
      </p>
    </button>
  )
}

function Section({
  title,
  children,
  right,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <section className="py-7 border-b border-border">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          {title}
        </h2>
        {right}
      </div>
      <div className="space-y-5 max-w-3xl">{children}</div>
    </section>
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
      <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
