'use client'

import { useState, useTransition } from 'react'
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createAutomation, updateAutomation, type AutomationInput } from './actions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TriggerType = AutomationInput['trigger_type']
type ActionType = AutomationInput['action_type']

const TRIGGERS: Array<{
  type: TriggerType
  icon: string
  label: string
  description: string
  configFields: ConfigField[]
}> = [
  {
    type: 'birthday',
    icon: '🎂',
    label: 'Aniversario do cliente',
    description: 'Dispara no dia do aniversario do cliente',
    configFields: [],
  },
  {
    type: 'no_visit_30d',
    icon: '💤',
    label: 'Cliente inativo',
    description: 'Cliente sem visita por X dias',
    configFields: [
      { key: 'days', label: 'Dias sem visita', type: 'number', default: 30, min: 1, max: 365 },
    ],
  },
  {
    type: 'new_customer',
    icon: '🆕',
    label: 'Novo cliente',
    description: 'Primeira compra ou cadastro',
    configFields: [],
  },
  {
    type: 'review_negative',
    icon: '⭐',
    label: 'Avaliacao negativa',
    description: 'Nota abaixo do limite configurado',
    configFields: [
      { key: 'max_rating', label: 'Nota maxima (inclusive)', type: 'number', default: 3, min: 1, max: 5 },
    ],
  },
  {
    type: 'low_stock',
    icon: '📦',
    label: 'Estoque baixo',
    description: 'Insumo abaixo do nivel minimo',
    configFields: [],
  },
  {
    type: 'order_completed',
    icon: '✅',
    label: 'Pedido concluido',
    description: 'Disparado apos a entrega ou fechamento',
    configFields: [],
  },
]

const ACTIONS: Array<{
  type: ActionType
  icon: string
  label: string
  description: string
  configFields: ConfigField[]
}> = [
  {
    type: 'send_whatsapp',
    icon: '💬',
    label: 'Enviar WhatsApp',
    description: 'Envia mensagem via WhatsApp ao cliente',
    configFields: [
      { key: 'message', label: 'Mensagem (variaveis: {nome}, {desconto})', type: 'textarea', default: 'Ola {nome}, temos uma novidade para voce!' },
    ],
  },
  {
    type: 'send_email',
    icon: '📧',
    label: 'Enviar E-mail',
    description: 'Envia email ao cliente',
    configFields: [
      { key: 'subject', label: 'Assunto', type: 'text', default: 'Uma mensagem para voce' },
      { key: 'body', label: 'Corpo do email', type: 'textarea', default: 'Ola {nome},' },
    ],
  },
  {
    type: 'create_task',
    icon: '🏷️',
    label: 'Criar tarefa interna',
    description: 'Adiciona uma tarefa ao painel da equipe',
    configFields: [
      { key: 'task_title', label: 'Titulo da tarefa', type: 'text', default: 'Verificar cliente {nome}' },
    ],
  },
  {
    type: 'notify_staff',
    icon: '🔔',
    label: 'Notificar equipe',
    description: 'Alerta no painel ou Slack',
    configFields: [
      { key: 'message', label: 'Mensagem de alerta', type: 'text', default: 'Atencao: {evento}' },
    ],
  },
  {
    type: 'apply_discount',
    icon: '🎁',
    label: 'Criar cupom de desconto',
    description: 'Gera um cupom para o cliente',
    configFields: [
      { key: 'discount_pct', label: 'Desconto (%)', type: 'number', default: 10, min: 1, max: 100 },
      { key: 'expiry_days', label: 'Validade (dias)', type: 'number', default: 30, min: 1 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConfigField = {
  key: string
  label: string
  type: 'text' | 'number' | 'textarea'
  default: string | number
  min?: number
  max?: number
}

export type AutomationEditData = {
  id: string
  name: string
  description: string | null
  trigger_type: TriggerType | null
  trigger_config: Record<string, unknown>
  action_type: ActionType | null
  action_config: Record<string, unknown>
  enabled: boolean
}

type Props = {
  onClose: () => void
  onSaved: () => void
  editing?: AutomationEditData | null
}

// ---------------------------------------------------------------------------
// Automation Builder Component
// ---------------------------------------------------------------------------

export function AutomationBuilder({ onClose, onSaved, editing }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [triggerType, setTriggerType] = useState<TriggerType | null>(
    editing?.trigger_type ?? null
  )
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    editing?.trigger_config ?? {}
  )

  // Step 2
  const [actionType, setActionType] = useState<ActionType | null>(
    editing?.action_type ?? null
  )
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>(
    editing?.action_config ?? {}
  )

  // Step 3
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [enabledImmediately, setEnabledImmediately] = useState(editing?.enabled ?? true)

  const selectedTrigger = TRIGGERS.find((t) => t.type === triggerType)
  const selectedAction = ACTIONS.find((a) => a.type === actionType)

  function handleSelectTrigger(type: TriggerType) {
    setTriggerType(type)
    const def = TRIGGERS.find((t) => t.type === type)
    if (def) {
      const defaults: Record<string, unknown> = {}
      def.configFields.forEach((f) => { defaults[f.key] = f.default })
      setTriggerConfig(defaults)
    }
  }

  function handleSelectAction(type: ActionType) {
    setActionType(type)
    const def = ACTIONS.find((a) => a.type === type)
    if (def) {
      const defaults: Record<string, unknown> = {}
      def.configFields.forEach((f) => { defaults[f.key] = f.default })
      setActionConfig(defaults)
    }
  }

  function generateName() {
    if (selectedTrigger && selectedAction && !name) {
      setName(`${selectedTrigger.label} → ${selectedAction.label}`)
    }
  }

  function handleSave() {
    if (!triggerType || !actionType) return
    setError(null)

    const input: AutomationInput = {
      name: name || `${selectedTrigger?.label ?? triggerType} → ${selectedAction?.label ?? actionType}`,
      description: description || undefined,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      action_type: actionType,
      action_config: actionConfig,
      enabled: enabledImmediately,
    }

    startTransition(async () => {
      const res = editing
        ? await updateAutomation(editing.id, input)
        : await createAutomation(input)

      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      onSaved()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[14px] font-medium text-cloud tracking-tight">
              {editing ? 'Editar automacao' : 'Nova automacao'}
            </h2>
            <p className="text-[11px] text-stone mt-0.5 tracking-tight">
              {step === 1 && 'Passo 1 de 3 — Escolha o gatilho'}
              {step === 2 && 'Passo 2 de 3 — Configure a acao'}
              {step === 3 && 'Passo 3 de 3 — Revise e salve'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4 pb-0 shrink-0">
          <div className="flex items-center gap-2">
            {([1, 2, 3] as const).map((s, idx) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors',
                    step === s
                      ? 'bg-leaf text-night'
                      : step > s
                        ? 'bg-leaf/30 text-leaf'
                        : 'bg-night-lighter text-stone'
                  )}
                >
                  {step > s ? <Check size={10} /> : s}
                </div>
                {idx < 2 && (
                  <div
                    className={cn(
                      'flex-1 h-px w-12',
                      step > s ? 'bg-leaf/40' : 'bg-night-lighter'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
              {error}
            </div>
          )}

          {/* Step 1: Trigger */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {TRIGGERS.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => handleSelectTrigger(t.type)}
                    className={cn(
                      'p-4 text-left rounded-lg border transition-all',
                      triggerType === t.type
                        ? 'border-leaf bg-leaf/5'
                        : 'border-night-lighter hover:border-stone-dark'
                    )}
                  >
                    <div className="text-xl mb-2">{t.icon}</div>
                    <div className="text-[12px] font-medium text-cloud tracking-tight mb-1">
                      {t.label}
                    </div>
                    <div className="text-[11px] text-stone tracking-tight leading-snug">
                      {t.description}
                    </div>
                  </button>
                ))}
              </div>

              {/* Config fields for selected trigger */}
              {selectedTrigger && selectedTrigger.configFields.length > 0 && (
                <div className="mt-4 p-4 bg-night rounded-lg border border-night-lighter space-y-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                    Configurar gatilho
                  </p>
                  {selectedTrigger.configFields.map((field) => (
                    <ConfigFieldInput
                      key={field.key}
                      field={field}
                      value={triggerConfig[field.key] ?? field.default}
                      onChange={(v) => setTriggerConfig((prev) => ({ ...prev, [field.key]: v }))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Action */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {ACTIONS.map((a) => (
                  <button
                    key={a.type}
                    type="button"
                    onClick={() => handleSelectAction(a.type)}
                    className={cn(
                      'p-4 text-left rounded-lg border transition-all',
                      actionType === a.type
                        ? 'border-leaf bg-leaf/5'
                        : 'border-night-lighter hover:border-stone-dark'
                    )}
                  >
                    <div className="text-xl mb-2">{a.icon}</div>
                    <div className="text-[12px] font-medium text-cloud tracking-tight mb-1">
                      {a.label}
                    </div>
                    <div className="text-[11px] text-stone tracking-tight leading-snug">
                      {a.description}
                    </div>
                  </button>
                ))}
              </div>

              {/* Config fields for selected action */}
              {selectedAction && selectedAction.configFields.length > 0 && (
                <div className="mt-4 p-4 bg-night rounded-lg border border-night-lighter space-y-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                    Configurar acao
                  </p>
                  {selectedAction.configFields.map((field) => (
                    <ConfigFieldInput
                      key={field.key}
                      field={field}
                      value={actionConfig[field.key] ?? field.default}
                      onChange={(v) => setActionConfig((prev) => ({ ...prev, [field.key]: v }))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Preview banner */}
              <div className="p-4 bg-night rounded-lg border border-leaf/20">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                  Resumo da automacao
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-night-lighter rounded-md text-[12px] text-cloud">
                    <span>{selectedTrigger?.icon}</span>
                    <span>{selectedTrigger?.label ?? triggerType}</span>
                  </span>
                  <ChevronRight size={14} className="text-stone shrink-0" />
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-leaf/10 text-leaf rounded-md text-[12px]">
                    <span>{selectedAction?.icon}</span>
                    <span>{selectedAction?.label ?? actionType}</span>
                  </span>
                </div>

                {/* Config summary */}
                {Object.keys(triggerConfig).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-night-lighter">
                    <p className="text-[10px] text-stone tracking-tight mb-1">Gatilho configurado:</p>
                    {Object.entries(triggerConfig).map(([k, v]) => (
                      <p key={k} className="text-[11px] text-stone-light font-data">
                        {k}: <span className="text-cloud">{String(v)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Nome da automacao *
                </label>
                <input
                  type="text"
                  value={name}
                  onFocus={generateName}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Cupom de aniversario"
                  className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Descricao <span className="normal-case font-normal">(opcional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descricao curta do que faz essa automacao"
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors resize-none"
                />
              </div>

              {/* Enable toggle */}
              <div className="flex items-center justify-between py-3 px-4 bg-night rounded-lg border border-night-lighter">
                <div>
                  <p className="text-[13px] text-cloud tracking-tight">Ativar imediatamente</p>
                  <p className="text-[11px] text-stone tracking-tight mt-0.5">
                    A automacao começa a disparar assim que salva
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabledImmediately((v) => !v)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                    enabledImmediately ? 'bg-leaf' : 'bg-night-lighter'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      enabledImmediately ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-night-lighter shrink-0 flex items-center gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
            >
              <ChevronLeft size={13} />
              Voltar
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 1 && !triggerType) {
                  setError('Selecione um gatilho para continuar')
                  return
                }
                if (step === 2 && !actionType) {
                  setError('Selecione uma acao para continuar')
                  return
                }
                setError(null)
                setStep((s) => (s + 1) as 1 | 2 | 3)
              }}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors"
            >
              Proximo
              <ChevronRight size={13} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={pending || !triggerType || !actionType}
              className="h-9 px-5 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
            >
              {pending ? 'Salvando...' : editing ? 'Salvar alteracoes' : 'Criar automacao'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Config field input
// ---------------------------------------------------------------------------

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField
  value: unknown
  onChange: (v: string | number) => void
}) {
  const stringVal = value !== undefined && value !== null ? String(value) : String(field.default)

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="block text-[11px] text-stone-light tracking-tight mb-1.5">
          {field.label}
        </label>
        <textarea
          value={stringVal}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 bg-night-light border border-night-lighter rounded-md text-[12px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors resize-none"
        />
      </div>
    )
  }

  return (
    <div>
      <label className="block text-[11px] text-stone-light tracking-tight mb-1.5">
        {field.label}
      </label>
      <input
        type={field.type}
        value={stringVal}
        min={field.min}
        max={field.max}
        onChange={(e) =>
          onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
        }
        className="w-full h-9 px-3 bg-night-light border border-night-lighter rounded-md text-[12px] text-cloud focus:outline-none focus:border-stone-dark transition-colors font-data"
      />
    </div>
  )
}
