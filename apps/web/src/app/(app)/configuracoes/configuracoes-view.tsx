'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight, X } from 'lucide-react'
import { updateRestaurant, updateAiAgentSettings, type AiAgentConfig } from './actions'
import { PageHeader } from '@/components/page-header'

export type RestaurantFormData = {
  id: string
  name: string
  legal_name: string
  cnpj: string
  phone: string
  email: string
  address_full: string
  service_rate: number
  open_time: string
  close_time: string
  loyalty_points_per: number
  timezone: string
  currency: string
}

export type AiAgentFormData = {
  enabled: boolean
  persona: string
  escalate_keywords: string[]
  min_confidence: number
  business_hours_only: boolean
}

const INTEGRATIONS = [
  { id: 'ifood', name: 'iFood', description: 'Recebe pedidos do iFood no hub' },
  { id: 'rappi', name: 'Rappi', description: 'Integracao de pedidos Rappi' },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Chatbot de pedidos e atendimento',
  },
  { id: 'stone', name: 'Stone', description: 'TEF integrado para pagamentos' },
  { id: 'sefaz', name: 'SEFAZ', description: 'Emissao automatica NFC-e / NF-e' },
  {
    id: 'google',
    name: 'Google Meu Negocio',
    description: 'Sincroniza avaliacoes e horarios',
  },
]

const PLAN_FEATURES = [
  'PDV + comanda eletronica',
  'Pedidos ilimitados',
  'Ate 10 usuarios',
  'Modulo financeiro completo',
  'Estoque + ficha tecnica',
  'Delivery proprio',
  'Assistente IA',
  '20+ automacoes',
  'CRM + fidelidade',
  'KDS inteligente',
  'NFC-e automatica',
]

export function ConfiguracoesView({
  initial,
  initialAiAgent,
}: {
  initial: RestaurantFormData
  initialAiAgent: AiAgentFormData
}) {
  const [form, setForm] = useState<RestaurantFormData>(initial)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // AI Agent state
  const [aiAgent, setAiAgent] = useState<AiAgentFormData>(initialAiAgent)
  const [aiAgentFeedback, setAiAgentFeedback] = useState<'saved' | 'error' | null>(null)
  const [aiAgentError, setAiAgentError] = useState<string | null>(null)
  const [aiAgentPending, startAiAgentTransition] = useTransition()
  const [newEscalateKw, setNewEscalateKw] = useState('')

  function update<K extends keyof RestaurantFormData>(
    key: K,
    value: RestaurantFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSaveAiAgent() {
    setAiAgentFeedback(null)
    setAiAgentError(null)
    startAiAgentTransition(async () => {
      const config: AiAgentConfig = {
        persona: aiAgent.persona,
        escalate_keywords: aiAgent.escalate_keywords,
        min_confidence: aiAgent.min_confidence,
        business_hours_only: aiAgent.business_hours_only,
      }
      const res = await updateAiAgentSettings({
        restaurantId: form.id,
        enabled: aiAgent.enabled,
        config,
      })
      if (!res.ok) {
        setAiAgentFeedback('error')
        setAiAgentError(res.error)
        return
      }
      setAiAgentFeedback('saved')
      setTimeout(() => setAiAgentFeedback(null), 2500)
    })
  }

  function addEscalateKw() {
    const kw = newEscalateKw.trim().toLowerCase()
    if (!kw || aiAgent.escalate_keywords.includes(kw)) {
      setNewEscalateKw('')
      return
    }
    setAiAgent((prev) => ({
      ...prev,
      escalate_keywords: [...prev.escalate_keywords, kw],
    }))
    setNewEscalateKw('')
  }

  function removeEscalateKw(kw: string) {
    setAiAgent((prev) => ({
      ...prev,
      escalate_keywords: prev.escalate_keywords.filter((k) => k !== kw),
    }))
  }

  function handleSave() {
    setFeedback(null)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await updateRestaurant({
        id: form.id,
        name: form.name,
        legal_name: form.legal_name || null,
        cnpj: form.cnpj || null,
        phone: form.phone || null,
        email: form.email || null,
        address_full: form.address_full || null,
        settings: {
          service_rate: form.service_rate,
          open_time: form.open_time,
          close_time: form.close_time,
          timezone: form.timezone,
          currency: form.currency,
          loyalty_points_per: form.loyalty_points_per,
        },
      })
      if ('error' in res && res.error) {
        setFeedback('error')
        setErrorMsg(res.error)
        return
      }
      setFeedback('saved')
      setTimeout(() => setFeedback(null), 2500)
    })
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configuracoes"
        subtitle="Restaurante, operacao e integracoes"
      />

      {/* Dados do restaurante */}
      <Section
        title="Dados do restaurante"
        description="Nome fantasia, razao social e contato exibidos em notas fiscais e cardapio publico"
      >
        <div className="space-y-4">
          <Field label="Nome fantasia">
            <Input
              value={form.name}
              onChange={(v) => update('name', v)}
            />
          </Field>
          <Field label="Razao social">
            <Input
              value={form.legal_name}
              onChange={(v) => update('legal_name', v)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CNPJ">
              <Input
                value={form.cnpj}
                onChange={(v) => update('cnpj', v)}
                placeholder="00.000.000/0000-00"
                mono
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={form.phone}
                onChange={(v) => update('phone', v)}
                placeholder="(11) 99999-9999"
              />
            </Field>
          </div>
          <Field label="E-mail">
            <Input
              value={form.email}
              onChange={(v) => update('email', v)}
              placeholder="contato@exemplo.com"
            />
          </Field>
          <Field label="Endereco">
            <Input
              value={form.address_full}
              onChange={(v) => update('address_full', v)}
              placeholder="Rua, numero, bairro, cidade"
            />
          </Field>
        </div>
      </Section>

      {/* Operacao */}
      <Section
        title="Operacao"
        description="Horarios, taxa de servico e regra de fidelidade"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Abertura">
              <Input
                type="time"
                value={form.open_time}
                onChange={(v) => update('open_time', v)}
                mono
              />
            </Field>
            <Field label="Fechamento">
              <Input
                type="time"
                value={form.close_time}
                onChange={(v) => update('close_time', v)}
                mono
              />
            </Field>
          </div>

          <Field
            label="Taxa de servico"
            hint="Aplicada automaticamente em pedidos do salao. Hoje fixo em 10% no PDV — sera lida desse valor nas proximas iteracoes."
          >
            <div className="flex items-baseline gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={String(form.service_rate)}
                onChange={(v) => update('service_rate', parseFloat(v) || 0)}
                className="w-24 text-center"
                mono
              />
              <span className="text-[12px] text-stone tracking-tight">%</span>
            </div>
          </Field>

          <Field
            label="Fidelidade"
            hint="Pontos por real gasto. Hoje fixo em R$ 10 no trigger SQL."
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] text-stone tracking-tight">
                1 ponto a cada R$
              </span>
              <Input
                type="number"
                min="1"
                step="1"
                value={String(form.loyalty_points_per)}
                onChange={(v) => update('loyalty_points_per', parseFloat(v) || 10)}
                className="w-20 text-center"
                mono
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* Canais */}
      <Link
        href="/configuracoes/canais"
        className="group block border-b border-night-lighter py-8 hover:bg-night-light/30 transition-colors -mx-8 px-8"
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-6">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium text-cloud tracking-tight">
              Canais de atendimento
            </h2>
            <p className="text-[12px] text-stone tracking-tight mt-1">
              Conecte WhatsApp, Instagram, Messenger, iFood e Google ao Inbox
            </p>
          </div>
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            className="text-stone-dark group-hover:text-cloud shrink-0 transition-colors"
          />
        </div>
      </Link>

      {/* Agente IA */}
      <Section
        title="Agente IA"
        description="Configure o assistente automatico que responde mensagens no Inbox"
      >
        <div className="space-y-5">
          {/* Toggle habilitado */}
          <div className="flex items-start gap-3">
            <button
              role="switch"
              aria-checked={aiAgent.enabled}
              onClick={() => setAiAgent((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5',
                aiAgent.enabled ? 'bg-leaf' : 'bg-night-lighter'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-cloud transition-transform',
                  aiAgent.enabled ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </button>
            <div>
              <p className={cn('text-[13px] font-medium tracking-tight', aiAgent.enabled ? 'text-leaf' : 'text-stone-light')}>
                {aiAgent.enabled ? 'Agente IA ativado' : 'Agente IA desativado'}
              </p>
              <p className="text-[11px] text-stone tracking-tight mt-0.5 leading-relaxed">
                Quando ativo, o agente responde automaticamente mensagens simples no Inbox.
              </p>
            </div>
          </div>

          {/* Persona */}
          <Field label="Persona do agente">
            <textarea
              value={aiAgent.persona}
              onChange={(e) => setAiAgent((prev) => ({ ...prev, persona: e.target.value }))}
              placeholder="Ex: Assistente virtual amigavel do Restaurante X"
              maxLength={500}
              rows={3}
              className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors resize-none"
            />
          </Field>

          {/* Confianca minima */}
          <Field
            label="Confianca minima"
            hint="Abaixo desse valor a conversa e escalada para um humano (0 = sem minimo, 1 = apenas respostas certas)"
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={aiAgent.min_confidence}
                onChange={(e) =>
                  setAiAgent((prev) => ({ ...prev, min_confidence: parseFloat(e.target.value) }))
                }
                className="flex-1 accent-leaf"
              />
              <span className="text-[13px] font-data text-cloud w-10 text-right">
                {Math.round(aiAgent.min_confidence * 100)}%
              </span>
            </div>
          </Field>

          {/* Palavras de escalacao */}
          <Field label="Palavras que escalonam para humano">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newEscalateKw}
                onChange={(e) => setNewEscalateKw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addEscalateKw()
                  }
                }}
                placeholder="Ex: reclamacao"
                className="flex-1 h-8 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
              />
              <button
                type="button"
                onClick={addEscalateKw}
                disabled={!newEscalateKw.trim()}
                className="h-8 px-3 bg-night-lighter text-cloud rounded-md text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Adicionar
              </button>
            </div>
            {aiAgent.escalate_keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aiAgent.escalate_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-night-lighter text-[11px] text-cloud-dark group"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeEscalateKw(kw)}
                      aria-label={`Remover ${kw}`}
                      className="text-stone hover:text-coral transition-colors"
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          {/* Link para base de conhecimento */}
          <Link
            href="/configuracoes/conhecimento"
            className="flex items-center justify-between gap-2 py-2.5 px-3.5 border border-night-lighter rounded-md hover:border-stone-dark transition-colors group"
          >
            <span className="text-[13px] text-stone-light group-hover:text-cloud transition-colors tracking-tight">
              Gerenciar base de conhecimento
            </span>
            <ChevronRight size={13} className="text-stone-dark group-hover:text-cloud shrink-0 transition-colors" />
          </Link>

          {/* Feedback + salvar */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="min-w-0 flex-1">
              {aiAgentFeedback === 'error' && aiAgentError && (
                <p className="text-[12px] text-primary tracking-tight">{aiAgentError}</p>
              )}
              {aiAgentFeedback === 'saved' && (
                <p className="text-[12px] text-leaf tracking-tight">Configuracoes do agente salvas</p>
              )}
            </div>
            <button
              onClick={handleSaveAiAgent}
              disabled={aiAgentPending}
              className={cn(
                'h-9 px-4 text-[13px] font-medium rounded-md transition-colors disabled:opacity-40',
                'bg-cloud text-night hover:bg-cloud-dark'
              )}
            >
              {aiAgentPending ? 'Salvando' : 'Salvar agente'}
            </button>
          </div>
        </div>
      </Section>

      {/* Integracoes */}
      <Section
        title="Integracoes"
        description="Disponibilizadas em breve — nosso backlog"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
          {INTEGRATIONS.map((integ) => (
            <div
              key={integ.id}
              className="flex items-baseline justify-between gap-3 py-2 border-b border-night-lighter/50"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-cloud tracking-tight">
                  {integ.name}
                </p>
                <p className="text-[11px] text-stone tracking-tight">
                  {integ.description}
                </p>
              </div>
              <span className="text-[10px] text-stone-dark tracking-tight shrink-0">
                Em breve
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Plano */}
      <Section
        title="Plano atual"
        description="Pro — R$ 299/mes"
        action={
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
            Pro
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {PLAN_FEATURES.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2.5 text-[12px] text-stone-light tracking-tight"
            >
              <span className="text-stone-dark font-data">·</span>
              {feature}
            </div>
          ))}
        </div>
      </Section>

      {/* Save bar */}
      <div className="py-10 border-t border-night-lighter flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          {feedback === 'error' && errorMsg && (
            <p className="text-[12px] text-primary tracking-tight">{errorMsg}</p>
          )}
          {feedback === 'saved' && (
            <p className="text-[12px] text-leaf tracking-tight">
              Configuracoes salvas
            </p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={pending}
          className={cn(
            'h-9 px-4 text-[13px] font-medium rounded-md transition-colors disabled:opacity-40',
            'bg-cloud text-night hover:bg-cloud-dark'
          )}
        >
          {pending ? 'Salvando' : 'Salvar configuracoes'}
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="py-10 border-b border-night-lighter">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight leading-none">
            {title}
          </h2>
          {description && (
            <p className="text-[12px] text-stone tracking-tight mt-1.5">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] text-stone-dark tracking-tight mt-2 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  )
}

type InputProps = {
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  mono?: boolean
  className?: string
  min?: string
  max?: string
  step?: string
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  mono,
  className,
  ...rest
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors',
        mono && 'font-data',
        className
      )}
      {...rest}
    />
  )
}
