'use client'

import { useState, useTransition } from 'react'
import { Bot, CheckCircle2, Clock, Plus, Trash2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/toaster'
import { Section, Field, Input } from '../settings-ui'
import {
  updateAdminAgentConfig,
  updateAdminAgentUser,
  deleteAdminAgentUser,
  createAdminAgentUser,
  sendBriefingNow,
} from './actions'
import type {
  AdminAgentConfig,
  AdminAgentUser,
  AdminAgentActionRow,
  AdminAgentRole,
  AdminActionStatus,
  AdminAgentTone,
  BriefingFormat,
  BriefingVoice,
} from './actions'

const ROLE_LABEL: Record<AdminAgentRole, string> = {
  owner: 'Dono (acesso total)',
  manager: 'Gerente',
  kitchen: 'Cozinha (estoque/cardapio)',
  cashier: 'Caixa (financeiro/pedidos)',
  waiter: 'Garcom (pedidos/mesas)',
}

const ROLE_COLOR: Record<AdminAgentRole, string> = {
  owner: 'text-success',
  manager: 'text-foreground',
  kitchen: 'text-accent-foreground',
  cashier: 'text-foreground',
  waiter: 'text-foreground/75',
}

const STATUS_LABEL: Record<AdminActionStatus, string> = {
  success: 'OK',
  failed: 'Erro',
  confirmation_pending: 'Aguard.',
  rejected_by_user: 'Cancel.',
  denied_by_rbac: 'Sem perm.',
}

const STATUS_COLOR: Record<AdminActionStatus, string> = {
  success: 'text-success',
  failed: 'text-destructive',
  confirmation_pending: 'text-accent-foreground',
  rejected_by_user: 'text-muted',
  denied_by_rbac: 'text-accent-foreground',
}

type TabKey = 'visao' | 'equipe' | 'atividade'

type Props = {
  initialConfig: AdminAgentConfig
  initialUsers: AdminAgentUser[]
  initialActions: AdminAgentActionRow[]
}

export function AgenteAdminView({ initialConfig, initialUsers, initialActions }: Props) {
  const [tab, setTab] = useState<TabKey>('visao')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'visao', label: 'Visao' },
    { key: 'equipe', label: `Equipe (${initialUsers.length})` },
    { key: 'atividade', label: `Atividade (${initialActions.length})` },
  ]

  return (
    <div>
      <header className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h2 className="text-[16px] font-medium tracking-[-0.02em] text-foreground leading-none flex items-center gap-2.5">
            <Bot size={16} className="text-success" strokeWidth={1.5} />
            Agente admin (co-piloto via WhatsApp)
          </h2>
          <p className="text-[12px] text-foreground/75 tracking-tight mt-1.5 max-w-2xl">
            Receba comandos por WhatsApp, foto de cupom fiscal, audio. O agente executa no
            sistema com auditoria completa. Apenas numeros cadastrados aqui tem acesso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/configuracoes/agente-admin/test"
            className="text-[11px] tracking-[0.05em] uppercase px-3 py-1.5 rounded-md border border-border text-muted hover:text-success hover:border-success/40 transition-colors whitespace-nowrap"
          >
            Test mode
          </a>
          <a
            href="/configuracoes/agente-admin/analytics"
            className="text-[11px] tracking-[0.05em] uppercase px-3 py-1.5 rounded-md border border-border text-muted hover:text-success hover:border-success/40 transition-colors whitespace-nowrap"
          >
            Analytics →
          </a>
        </div>
      </header>

      <div className="flex gap-5 pb-3 mb-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'relative text-[12px] tracking-tight pb-3 -mb-3 transition-colors',
              tab === t.key
                ? 'text-foreground font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-success after:rounded-full'
                : 'text-muted hover:text-foreground/70'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'visao' && <VisaoTab initial={initialConfig} />}
      {tab === 'equipe' && <EquipeTab initial={initialUsers} />}
      {tab === 'atividade' && <AtividadeTab actions={initialActions} />}
    </div>
  )
}

function VisaoTab({ initial }: { initial: AdminAgentConfig }) {
  const [config, setConfig] = useState(initial)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof AdminAgentConfig>(key: K, value: AdminAgentConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    startTransition(async () => {
      const res = await updateAdminAgentConfig(config)
      if (!res.ok) {
        toast.error('Falha ao salvar', { description: res.error })
        return
      }
      toast.success('Configuracoes salvas')
    })
  }

  return (
    <div className="max-w-3xl">
      <section className="py-7 border-b border-border flex items-center justify-between gap-6">
        <div>
          <p
            className={cn(
              'text-[14px] font-medium tracking-tight',
              config.enabled ? 'text-success' : 'text-foreground/75'
            )}
          >
            {config.enabled ? 'Agente admin ativado' : 'Agente admin desativado'}
          </p>
          <p className="text-[12px] text-muted tracking-tight mt-1 max-w-md">
            Quando ativo, mensagens de numeros na lista da Equipe sao processadas pelo agente.
            Outros numeros caem no agente de cliente normal (se configurado).
          </p>
        </div>
        <button
          role="switch"
          aria-checked={config.enabled}
          onClick={() => set('enabled', !config.enabled)}
          className={cn(
            'relative w-[42px] h-[22px] rounded-full transition-colors shrink-0',
            config.enabled ? 'bg-success' : 'bg-muted-subtle'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-[18px] h-[18px] rounded-full bg-primary transition-all',
              config.enabled ? 'left-[22px]' : 'left-0.5'
            )}
          />
        </button>
      </section>

      <Section title="Personalizacao">
        <Field label="Persona">
          <textarea
            value={config.persona}
            onChange={(e) => set('persona', e.target.value)}
            rows={2}
            className="w-full bg-transparent border border-border rounded-md px-3.5 py-2.5 text-[13px] text-foreground focus:outline-none focus:border-stone tracking-tight"
            placeholder="ex: 'um co-piloto eficiente que conhece o restaurante'"
          />
        </Field>
        <Field label="Tom de resposta">
          <select
            value={config.tone}
            onChange={(e) => set('tone', e.target.value as AdminAgentTone)}
            className="w-full h-10 px-3 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark"
          >
            <option value="casual">Casual (default)</option>
            <option value="formal">Formal</option>
            <option value="direto">Direto (max 2 linhas)</option>
          </select>
        </Field>
      </Section>

      <Section title="Seguranca" description="Confirmacoes e limites pra evitar acoes acidentais">
        <Field
          label={`Pedir confirmacao acima de R$ ${config.confirm_above_brl}`}
          hint="Acoes financeiras acima desse valor pedem 'SIM' antes de executar"
        >
          <input
            type="range"
            min={0}
            max={1000}
            step={50}
            value={config.confirm_above_brl}
            onChange={(e) => set('confirm_above_brl', parseInt(e.target.value, 10))}
            className="w-full"
          />
        </Field>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.confirm_destructive}
            onChange={(e) => set('confirm_destructive', e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[13px] text-foreground tracking-tight">
            Pedir confirmacao em acoes destrutivas (cancelar, deletar, desativar)
          </span>
        </label>
        <Field
          label={`Limite: ${config.max_actions_per_hour} acoes por admin / hora`}
          hint="Acima disso o agente pausa pra evitar loop. Default 50."
        >
          <input
            type="range"
            min={5}
            max={200}
            step={5}
            value={config.max_actions_per_hour}
            onChange={(e) => set('max_actions_per_hour', parseInt(e.target.value, 10))}
            className="w-full"
          />
        </Field>
      </Section>

      <Section
        title="Daily briefing"
        description="Resumo automatico do dia anterior enviado pra um numero. Pode ser texto, audio (TTS natural) ou os dois."
      >
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={config.briefing_enabled}
            onChange={(e) => set('briefing_enabled', e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[13px] text-foreground tracking-tight">
            Enviar briefing automatico
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3 max-w-md mb-4">
          <Field label="Horario UTC (0-23)">
            <Input
              type="number"
              min="0"
              max="23"
              value={String(config.briefing_hour)}
              onChange={(v) => set('briefing_hour', parseInt(v, 10) || 8)}
              mono
            />
          </Field>
          <Field label="Telefone (digitos)">
            <Input
              value={config.briefing_phone ?? ''}
              onChange={(v) => set('briefing_phone', v.replace(/\D/g, '') || null)}
              placeholder="5511999998888"
              mono
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md mb-4">
          <Field label="Formato">
            <select
              value={config.briefing_format}
              onChange={(e) => set('briefing_format', e.target.value as BriefingFormat)}
              className="w-full h-10 px-3 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark"
            >
              <option value="text">Texto</option>
              <option value="audio">Audio (TTS)</option>
              <option value="both">Texto + Audio</option>
            </select>
          </Field>
          <Field label="Voz (so pra audio)">
            <select
              value={config.briefing_voice}
              onChange={(e) => set('briefing_voice', e.target.value as BriefingVoice)}
              disabled={config.briefing_format === 'text'}
              className="w-full h-10 px-3 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark disabled:opacity-40"
            >
              <option value="nova">Nova (feminina, BR-friendly)</option>
              <option value="shimmer">Shimmer (feminina suave)</option>
              <option value="alloy">Alloy (neutra)</option>
              <option value="echo">Echo (masculina)</option>
              <option value="fable">Fable (masculina suave)</option>
              <option value="onyx">Onyx (masculina grave)</option>
            </select>
          </Field>
        </div>
        <BriefingTestButton config={config} />
      </Section>

      <Section
        title="Alertas proativos"
        description="Detecta anomalias e notifica antes do admin perguntar (em breve, Sprint D)"
      >
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.alerts_enabled}
            onChange={(e) => set('alerts_enabled', e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-[13px] text-foreground tracking-tight">
            Detectar anomalias (faturamento abaixo da media, padroes atipicos)
          </span>
        </label>
      </Section>

      <div className="py-10 flex items-center justify-end">
        <button
          onClick={save}
          disabled={pending}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-40"
        >
          {pending ? 'Salvando' : 'Salvar configuracoes'}
        </button>
      </div>
    </div>
  )
}

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

function EquipeTab({ initial }: { initial: AdminAgentUser[] }) {
  const [users, setUsers] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-[12px] text-foreground/75 tracking-tight">
          Apenas numeros listados aqui podem comandar o agente. Outros caem no agente de cliente.
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary-hover transition-colors flex items-center gap-2"
        >
          <Plus size={13} />
          Adicionar pessoa
        </button>
      </div>

      {users.length === 0 ? (
        <div className="border border-border rounded-lg py-12 text-center">
          <p className="text-[13px] text-muted tracking-tight">Ninguem cadastrado ainda</p>
          <p className="text-[11px] text-muted tracking-tight mt-1.5">
            Adicione seu numero pra comecar a usar o agente
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {users.map((user) => (
            <div
              key={user.id}
              className={cn(
                'p-4 flex items-center justify-between gap-4 transition-opacity',
                !user.active && 'opacity-50'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[14px] font-medium text-foreground tracking-tight truncate">
                    {user.display_name}
                  </span>
                  <span className="text-[10px] font-data text-muted">{user.phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={user.role}
                    onChange={(e) => {
                      const role = e.target.value as AdminAgentRole
                      startTransition(async () => {
                        const res = await updateAdminAgentUser({ id: user.id, role })
                        if (!res.ok) {
                          toast.error('Falha', { description: res.error })
                          return
                        }
                        setUsers((prev) =>
                          prev.map((u) => (u.id === user.id ? { ...u, role } : u))
                        )
                        toast.success('Role atualizado')
                      })
                    }}
                    disabled={pending}
                    className={cn(
                      'h-7 px-2 bg-transparent border border-border rounded text-[11px] focus:outline-none focus:border-stone-dark',
                      ROLE_COLOR[user.role]
                    )}
                  >
                    {(Object.keys(ROLE_LABEL) as AdminAgentRole[]).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] font-data text-muted">
                    {user.actions_count} acoes
                    {user.last_action_at && ` · ultimo ${timeAgo(user.last_action_at)}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    startTransition(async () => {
                      const res = await updateAdminAgentUser({
                        id: user.id,
                        active: !user.active,
                      })
                      if (!res.ok) {
                        toast.error('Falha', { description: res.error })
                        return
                      }
                      setUsers((prev) =>
                        prev.map((u) => (u.id === user.id ? { ...u, active: !user.active } : u))
                      )
                      toast.success(
                        `${user.display_name} ${user.active ? 'desativado' : 'ativado'}`
                      )
                    })
                  }}
                  disabled={pending}
                  className={cn(
                    'h-8 px-3 text-[11px] font-medium rounded-md transition-colors',
                    user.active
                      ? 'text-foreground/75 hover:text-foreground hover:bg-muted-subtle'
                      : 'bg-success/20 text-success hover:bg-success/30'
                  )}
                >
                  {user.active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`Remover ${user.display_name} do agente?`)) return
                    startTransition(async () => {
                      const res = await deleteAdminAgentUser(user.id)
                      if (!res.ok) {
                        toast.error('Falha', { description: res.error })
                        return
                      }
                      setUsers((prev) => prev.filter((u) => u.id !== user.id))
                      toast.success(`${user.display_name} removido`)
                    })
                  }}
                  disabled={pending}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Remover"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddPersonModal
          onClose={() => setShowAdd(false)}
          onCreated={(user) => {
            setUsers((prev) => [...prev, user])
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

function AddPersonModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (user: AdminAgentUser) => void
}) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<AdminAgentRole>('manager')
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const res = await createAdminAgentUser({ phone, display_name: name, role })
      if (!res.ok) {
        toast.error('Falha', { description: res.error })
        return
      }
      onCreated({
        id: res.id,
        phone: phone.replace(/\D/g, ''),
        display_name: name,
        role,
        active: true,
        actions_count: 0,
        last_action_at: null,
        created_at: new Date().toISOString(),
      })
      toast.success(`${name} adicionado`)
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
          <h3 className="text-[14px] font-medium text-foreground tracking-tight">
            Adicionar pessoa
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Nome">
            <Input value={name} onChange={(v) => setName(v)} placeholder="Pedro" />
          </Field>
          <Field label="Telefone (com DDD, so digitos)">
            <Input
              value={phone}
              onChange={(v) => setPhone(v.replace(/\D/g, ''))}
              placeholder="5511999998888"
              mono
            />
          </Field>
          <Field label="Permissao (role)">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminAgentRole)}
              className="w-full h-10 px-3 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark"
            >
              {(Object.keys(ROLE_LABEL) as AdminAgentRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-border rounded-md text-[13px] text-foreground/75 hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={pending || !name.trim() || phone.length < 10}
              className="flex-1 h-10 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              {pending ? 'Adicionando' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AtividadeTab({ actions }: { actions: AdminAgentActionRow[] }) {
  if (actions.length === 0) {
    return (
      <div className="border border-border rounded-lg py-16 text-center max-w-3xl">
        <Bot size={28} className="text-muted mx-auto mb-3" strokeWidth={1.25} />
        <p className="text-[13px] text-muted tracking-tight">Nenhuma acao registrada ainda</p>
        <p className="text-[11px] text-muted tracking-tight mt-1.5">
          Quando algum admin mandar mensagem no WhatsApp, aparece aqui
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="grid grid-cols-[120px_1fr_120px_80px_120px_60px] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        <span>Quando</span>
        <span>Admin / mensagem</span>
        <span>Tool</span>
        <span className="text-right">Custo</span>
        <span>Status</span>
        <span />
      </div>
      <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
        {actions.map((action) => (
          <div
            key={action.id}
            className="grid grid-cols-[120px_1fr_120px_80px_120px_60px] gap-4 py-3 items-start"
          >
            <span className="text-[10px] font-data text-muted">
              {new Date(action.created_at).toLocaleString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-foreground tracking-tight">
                {action.admin_name ?? '—'}
                <span className="text-muted ml-1.5 font-data text-[10px]">
                  {action.admin_phone}
                </span>
              </p>
              {action.input_excerpt && (
                <p className="text-[10px] text-foreground/75 tracking-tight mt-0.5 line-clamp-2">
                  “{action.input_excerpt}”
                </p>
              )}
              {action.error_message && (
                <p className="text-[10px] text-destructive tracking-tight mt-0.5">
                  {action.error_message}
                </p>
              )}
            </div>
            <span className="text-[11px] font-data text-foreground/75">{action.tool_name}</span>
            <span className="text-[11px] font-data text-muted text-right">
              {action.cost_brl ? `R$ ${action.cost_brl.toFixed(3)}` : '—'}
            </span>
            <span
              className={cn(
                'text-[10px] tracking-tight flex items-center gap-1',
                STATUS_COLOR[action.status]
              )}
            >
              {action.status === 'success' && <CheckCircle2 size={11} />}
              {action.status === 'failed' && <XCircle size={11} />}
              {action.status === 'confirmation_pending' && <Clock size={11} />}
              {STATUS_LABEL[action.status] ?? action.status}
            </span>
            <span className="text-[10px] font-data text-muted text-right">
              {action.duration_ms ? `${action.duration_ms}ms` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BriefingTestButton({ config }: { config: AdminAgentConfig }) {
  const [pending, startTransition] = useTransition()

  function send() {
    if (!config.briefing_phone) {
      toast.error('Configure o telefone primeiro e salve antes de testar')
      return
    }
    startTransition(async () => {
      const res = await sendBriefingNow()
      if (!res.ok) {
        toast.error('Falha no envio', { description: res.error })
        return
      }
      toast.success(
        config.briefing_format === 'text'
          ? 'Briefing enviado por texto'
          : 'Briefing enviado (audio + texto se aplicavel)'
      )
    })
  }

  return (
    <div className="flex items-center gap-3 mt-2">
      <button
        onClick={send}
        disabled={pending || !config.briefing_phone || !config.briefing_enabled}
        className="h-9 px-4 text-[12px] font-medium rounded-md border border-border text-foreground/75 hover:text-foreground hover:border-stone disabled:opacity-40 transition-colors"
      >
        {pending ? 'Enviando...' : 'Testar agora (envia briefing real)'}
      </button>
      <p className="text-[11px] text-muted tracking-tight">
        Ignora idempotencia diaria. Cobra TTS se formato for audio.
      </p>
    </div>
  )
}
