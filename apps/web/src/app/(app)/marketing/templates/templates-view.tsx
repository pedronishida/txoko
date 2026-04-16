'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { CampaignTemplate } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import {
  deleteTemplate,
  generateTemplateVariations,
  saveTemplate,
} from './actions'
import { extractVariables } from '@/lib/server/marketing/template-renderer'

const CATEGORIES = [
  'promotional',
  'transactional',
  'welcome',
  'reactivation',
  'loyalty',
  'birthday',
]

const CATEGORY_LABEL: Record<string, string> = {
  promotional: 'Promocional',
  transactional: 'Transacional',
  welcome: 'Boas-vindas',
  reactivation: 'Reativacao',
  loyalty: 'Fidelidade',
  birthday: 'Aniversario',
}

type Props = {
  templates: CampaignTemplate[]
}

export function TemplatesView({ templates }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CampaignTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openForm(tmpl: CampaignTemplate | null) {
    setError(null)
    setEditing(tmpl)
    setShowForm(true)
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este template?')) return
    startTransition(async () => {
      const res = await deleteTemplate(id)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleGenerateVariations(id: string) {
    startTransition(async () => {
      const res = await generateTemplateVariations(id)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  return (
    <div className="-mx-8 -mt-6">
      <header className="px-8 pt-6 pb-8 border-b border-night-lighter flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
            Templates
          </h1>
          <p className="text-[13px] text-stone mt-2 tracking-tight">
            Modelos de mensagem para WhatsApp, email e SMS
          </p>
        </div>
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Novo template
        </button>
      </header>

      <div className="px-8 py-8">
        {error && (
          <div className="mb-6 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={12} />
            </button>
          </div>
        )}

        {templates.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[14px] text-stone tracking-tight">
              Nenhum template criado
            </p>
            <p className="text-[12px] text-stone-dark tracking-tight mt-1.5">
              Templates sao modelos de mensagem reutilizaveis com variaveis
              dinamicas
            </p>
          </div>
        ) : (
          <div className="divide-y divide-night-lighter">
            {templates.map((tmpl) => {
              const hasWa = Boolean(tmpl.wa_body)
              const hasEmail = Boolean(tmpl.email_subject || tmpl.email_html)
              const hasSms = Boolean(tmpl.sms_body)
              const channels = [
                hasWa && 'WhatsApp',
                hasEmail && 'Email',
                hasSms && 'SMS',
              ]
                .filter(Boolean)
                .join(' · ')

              return (
                <div
                  key={tmpl.id}
                  className="group py-5 flex items-start justify-between gap-6"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-[14px] font-medium text-cloud tracking-tight">
                        {tmpl.name}
                      </span>
                      {tmpl.category && (
                        <span className="text-[10px] text-stone-dark tracking-tight">
                          {CATEGORY_LABEL[tmpl.category] ?? tmpl.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-stone tracking-tight line-clamp-2">
                      {tmpl.wa_body ?? tmpl.sms_body ?? tmpl.email_subject ?? ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-dark tracking-tight">
                      <span>{channels || 'Sem conteudo'}</span>
                      {tmpl.ai_variation_enabled && (
                        <>
                          <span>·</span>
                          <span>
                            IA {tmpl.ai_variation_count} variacoes
                          </span>
                        </>
                      )}
                      {tmpl.variables.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{tmpl.variables.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {tmpl.ai_variation_enabled && (
                      <button
                        onClick={() => handleGenerateVariations(tmpl.id)}
                        disabled={pending}
                        className="text-[10px] text-leaf hover:text-leaf/80 tracking-tight disabled:opacity-40"
                      >
                        gerar variacoes
                      </button>
                    )}
                    <button
                      onClick={() => openForm(tmpl)}
                      className="text-[10px] text-stone-light hover:text-cloud tracking-tight"
                    >
                      editar
                    </button>
                    <button
                      onClick={() => handleDelete(tmpl.id)}
                      disabled={pending}
                      className="text-[10px] text-stone-dark hover:text-primary tracking-tight disabled:opacity-40"
                    >
                      remover
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <TemplateFormModal
          template={editing}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function TemplateFormModal({
  template,
  onClose,
  onError,
}: {
  template: CampaignTemplate | null
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [category, setCategory] = useState(template?.category ?? '')
  const [waBody, setWaBody] = useState(template?.wa_body ?? '')
  const [waImageUrl, setWaImageUrl] = useState(template?.wa_image_url ?? '')
  const [emailSubject, setEmailSubject] = useState(
    template?.email_subject ?? ''
  )
  const [emailHtml, setEmailHtml] = useState(template?.email_html ?? '')
  const [smsBody, setSmsBody] = useState(template?.sms_body ?? '')
  const [aiEnabled, setAiEnabled] = useState(
    template?.ai_variation_enabled ?? false
  )
  const [aiCount, setAiCount] = useState(template?.ai_variation_count ?? 5)
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'email' | 'sms'>(
    'whatsapp'
  )
  const [pending, startTransition] = useTransition()

  const detectedVars = extractVariables(
    [waBody, emailSubject, emailHtml, smsBody].join(' ')
  )

  function handleSave() {
    startTransition(async () => {
      const res = await saveTemplate({
        id: template?.id,
        name,
        category: category || undefined,
        wa_body: waBody || undefined,
        wa_image_url: waImageUrl || undefined,
        email_subject: emailSubject || undefined,
        email_html: emailHtml || undefined,
        sms_body: smsBody || undefined,
        variables: detectedVars,
        ai_variation_enabled: aiEnabled,
        ai_variation_count: aiCount,
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
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between sticky top-0 bg-night-light z-10">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            {template ? 'Editar template' : 'Novo template'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Promo fim de semana"
                className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
              />
            </Field>
            <Field label="Categoria">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
              >
                <option value="">Nenhuma</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Channel tabs */}
          <div>
            <div className="flex items-center gap-5 mb-5 pb-3 border-b border-night-lighter">
              {(['whatsapp', 'email', 'sms'] as const).map((ch) => {
                const active = activeTab === ch
                return (
                  <button
                    key={ch}
                    onClick={() => setActiveTab(ch)}
                    className={cn(
                      'relative text-[12px] font-medium tracking-tight transition-colors pb-3 -mb-3',
                      active
                        ? 'text-cloud'
                        : 'text-stone hover:text-stone-light'
                    )}
                  >
                    {ch === 'whatsapp'
                      ? 'WhatsApp'
                      : ch === 'email'
                        ? 'Email'
                        : 'SMS'}
                    {active && (
                      <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
                    )}
                  </button>
                )
              })}
            </div>

            {activeTab === 'whatsapp' && (
              <div className="space-y-4">
                <Field label="Corpo da mensagem">
                  <textarea
                    value={waBody}
                    onChange={(e) => setWaBody(e.target.value)}
                    rows={6}
                    placeholder="Ola {first_name}! Temos uma novidade especial pra voce..."
                    className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark resize-none transition-colors"
                  />
                  <p className="text-[10px] text-stone-dark mt-1.5 tracking-tight">
                    Use *negrito*, _italico_. Variaveis:{' '}
                    {'{name} {first_name} {loyalty_points} {birthday} {restaurant}'}
                  </p>
                </Field>
                <Field label="URL da imagem (opcional)">
                  <input
                    value={waImageUrl}
                    onChange={(e) => setWaImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark font-data focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>
              </div>
            )}

            {activeTab === 'email' && (
              <div className="space-y-4">
                <Field label="Assunto">
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Ex: {first_name}, temos uma surpresa pra voce"
                    className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>
                <Field label="Corpo (HTML)">
                  <textarea
                    value={emailHtml}
                    onChange={(e) => setEmailHtml(e.target.value)}
                    rows={8}
                    placeholder="<p>Ola {first_name},</p><p>...</p>"
                    className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[12px] text-cloud placeholder:text-stone-dark font-data focus:outline-none focus:border-stone-dark resize-none transition-colors"
                  />
                </Field>
              </div>
            )}

            {activeTab === 'sms' && (
              <div className="space-y-4">
                <Field label="Mensagem SMS">
                  <textarea
                    value={smsBody}
                    onChange={(e) => setSmsBody(e.target.value)}
                    rows={3}
                    placeholder="{restaurant}: {first_name}, temos novidades! Visite-nos neste fim de semana."
                    className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark resize-none transition-colors"
                  />
                  <p className="text-[10px] text-stone-dark mt-1.5 tracking-tight">
                    {smsBody.length}/160 caracteres
                    {smsBody.length > 160 &&
                      ` (${Math.ceil(smsBody.length / 153)} segmentos)`}
                  </p>
                </Field>
              </div>
            )}
          </div>

          {/* AI Variation */}
          <div className="border-t border-night-lighter pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] text-cloud tracking-tight">
                  Variacao por IA
                </p>
                <p className="text-[11px] text-stone-dark tracking-tight mt-0.5">
                  Claude gera variacoes do template pra evitar envios
                  identicos
                </p>
              </div>
              <button
                onClick={() => setAiEnabled(!aiEnabled)}
                className={cn(
                  'h-8 px-3 text-[11px] font-medium rounded-md transition-colors tracking-tight',
                  aiEnabled
                    ? 'bg-cloud text-night'
                    : 'text-stone-light hover:text-cloud hover:bg-night-lighter'
                )}
              >
                {aiEnabled ? 'Ativo' : 'Desativado'}
              </button>
            </div>
            {aiEnabled && (
              <div className="mt-4 flex items-center gap-4">
                <Field label="Variacoes">
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value) || 5)}
                    className="w-20 h-9 px-3 bg-night border border-night-lighter rounded-md text-[12px] text-cloud font-data text-center focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Detected variables */}
          {detectedVars.length > 0 && (
            <div className="border-t border-night-lighter pt-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                Variaveis detectadas
              </p>
              <div className="flex flex-wrap gap-2">
                {detectedVars.map((v) => (
                  <span
                    key={v}
                    className="text-[11px] font-data text-stone-light tracking-tight"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
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
              {pending ? 'Salvando' : template ? 'Salvar' : 'Criar template'}
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
