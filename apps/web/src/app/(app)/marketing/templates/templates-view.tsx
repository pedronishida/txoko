'use client'

import { useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { CampaignTemplate } from '@txoko/shared'
import {
  Bold,
  Copy,
  Italic,
  Link,
  List,
  Minus,
  Plus,
  Strikethrough,
  X,
} from 'lucide-react'
import {
  deleteTemplate,
  duplicateTemplate,
  generateTemplateVariations,
  previewAiVariations,
  saveTemplate,
} from './actions'
import { extractVariables } from '@/lib/server/marketing/template-renderer'

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

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

const VARIABLES = [
  { key: '{name}', label: 'Nome completo' },
  { key: '{first_name}', label: 'Primeiro nome' },
  { key: '{loyalty_points}', label: 'Pontos' },
  { key: '{total_orders}', label: 'Pedidos' },
  { key: '{total_spent}', label: 'Gasto total' },
  { key: '{restaurant_name}', label: 'Restaurante' },
  { key: '{last_visit}', label: 'Ultima visita' },
]

const MOCK_CONTEXT: Record<string, string> = {
  '{name}': 'Joao Silva',
  '{first_name}': 'Joao',
  '{loyalty_points}': '240',
  '{total_orders}': '12',
  '{total_spent}': 'R$ 890,00',
  '{restaurant_name}': 'Restaurante Demo',
  '{last_visit}': '10/04/2026',
}

function applyMockVars(text: string) {
  return text.replace(/\{[\w_]+\}/g, (m) => MOCK_CONTEXT[m] ?? m)
}

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type TemplateTab = 'whatsapp' | 'email' | 'sms'

type Props = {
  templates: CampaignTemplate[]
}

// ---------------------------------------------------------------
// Main view
// ---------------------------------------------------------------

export function TemplatesView({ templates }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CampaignTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<'all' | TemplateTab>('all')
  const [pending, startTransition] = useTransition()

  const filtered = templates.filter((tmpl) => {
    if (
      (channelFilter === 'whatsapp' && !tmpl.wa_body) ||
      (channelFilter === 'email' && !tmpl.email_subject && !tmpl.email_html) ||
      (channelFilter === 'sms' && !tmpl.sms_body)
    ) {
      return false
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase()
      if (
        ![tmpl.name, tmpl.category, tmpl.wa_body, tmpl.email_subject, tmpl.sms_body]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      ) {
        return false
      }
    }
    return true
  })

  const channelCounts = {
    all: templates.length,
    whatsapp: templates.filter((t) => t.wa_body).length,
    email: templates.filter((t) => t.email_subject || t.email_html).length,
    sms: templates.filter((t) => t.sms_body).length,
  }

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

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateTemplate(id)
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
      <header className="px-8 pt-6 pb-8 border-b border-border flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.03em] text-foreground leading-none">
            Templates
          </h1>
          <p className="text-[13px] text-muted mt-2 tracking-tight">
            Modelos de mensagem para WhatsApp, email e SMS
          </p>
        </div>
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-primary text-primary-foreground text-[13px] font-medium rounded-md hover:bg-primary-hover transition-colors"
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

        {templates.length > 0 && (
          <div className="mb-6 space-y-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, categoria ou conteudo..."
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'Todos', count: channelCounts.all },
                  { key: 'whatsapp', label: 'WhatsApp', count: channelCounts.whatsapp },
                  { key: 'email', label: 'Email', count: channelCounts.email },
                  { key: 'sms', label: 'SMS', count: channelCounts.sms },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setChannelFilter(tab.key)}
                  className={cn(
                    'px-3 py-1 rounded-md text-[11px] font-medium tracking-tight transition-colors',
                    channelFilter === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground/75 hover:text-foreground hover:border-stone'
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'ml-1.5 text-[10px] font-data',
                      channelFilter === tab.key ? 'text-foreground/60' : 'text-muted'
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {templates.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[14px] text-muted tracking-tight">
              Nenhum template criado
            </p>
            <p className="text-[12px] text-muted tracking-tight mt-1.5">
              Templates sao modelos de mensagem reutilizaveis com variaveis
              dinamicas
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13px] text-muted tracking-tight">
              Nenhum template corresponde aos filtros
            </p>
            <button
              onClick={() => {
                setSearch('')
                setChannelFilter('all')
              }}
              className="text-[11px] text-foreground/75 hover:text-foreground tracking-tight mt-2"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((tmpl) => {
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
                      <span className="text-[14px] font-medium text-foreground tracking-tight">
                        {tmpl.name}
                      </span>
                      {tmpl.category && (
                        <span className="text-[10px] text-muted tracking-tight">
                          {CATEGORY_LABEL[tmpl.category] ?? tmpl.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted tracking-tight line-clamp-2">
                      {tmpl.wa_body ?? tmpl.sms_body ?? tmpl.email_subject ?? ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted tracking-tight">
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
                        className="text-[10px] text-success hover:text-success/80 tracking-tight disabled:opacity-40"
                      >
                        gerar variacoes
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(tmpl.id)}
                      disabled={pending}
                      className="text-[10px] text-foreground/75 hover:text-foreground tracking-tight disabled:opacity-40"
                    >
                      duplicar
                    </button>
                    <button
                      onClick={() => openForm(tmpl)}
                      className="text-[10px] text-foreground/75 hover:text-foreground tracking-tight"
                    >
                      editar
                    </button>
                    <button
                      onClick={() => handleDelete(tmpl.id)}
                      disabled={pending}
                      className="text-[10px] text-muted hover:text-primary tracking-tight disabled:opacity-40"
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
        <TemplateEditor
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

// ---------------------------------------------------------------
// Template Editor — two-column WYSIWYG
// ---------------------------------------------------------------

function TemplateEditor({
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
  const [activeTab, setActiveTab] = useState<TemplateTab>('whatsapp')

  // WhatsApp fields
  const [waBody, setWaBody] = useState(template?.wa_body ?? '')
  const [waImageUrl, setWaImageUrl] = useState(template?.wa_image_url ?? '')
  const [waLinkUrl, setWaLinkUrl] = useState(template?.wa_link_url ?? '')
  const [waLinkTitle, setWaLinkTitle] = useState(template?.wa_link_title ?? '')
  const [waLinkDesc, setWaLinkDesc] = useState(template?.wa_link_description ?? '')

  // Email fields
  const [emailSubject, setEmailSubject] = useState(template?.email_subject ?? '')
  const [emailHtml, setEmailHtml] = useState(template?.email_html ?? '')

  // SMS fields
  const [smsBody, setSmsBody] = useState(template?.sms_body ?? '')

  // AI
  const [aiEnabled, setAiEnabled] = useState(template?.ai_variation_enabled ?? false)
  const [aiCount, setAiCount] = useState(template?.ai_variation_count ?? 5)
  const [aiTemp, setAiTemp] = useState(template?.ai_variation_temp ?? 0.7)
  const [aiVariations, setAiVariations] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)

  const [pending, startTransition] = useTransition()

  const waBodyRef = useRef<HTMLTextAreaElement>(null)
  const smsBodyRef = useRef<HTMLTextAreaElement>(null)

  const detectedVars = extractVariables(
    [waBody, emailSubject, emailHtml, smsBody].join(' ')
  )

  // Insert variable at cursor
  function insertVar(varKey: string, target: 'wa' | 'sms') {
    const ref = target === 'wa' ? waBodyRef : smsBodyRef
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const current = target === 'wa' ? waBody : smsBody
    const next = current.slice(0, start) + varKey + current.slice(end)
    if (target === 'wa') setWaBody(next)
    else setSmsBody(next)
    // restore focus + cursor after state update
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + varKey.length
      el.selectionEnd = start + varKey.length
    }, 0)
  }

  // WhatsApp formatting
  function applyWaFormat(fmt: 'bold' | 'italic' | 'strike') {
    const el = waBodyRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const sel = waBody.slice(start, end)
    const wrap = { bold: '*', italic: '_', strike: '~' }[fmt]
    const next = waBody.slice(0, start) + wrap + sel + wrap + waBody.slice(end)
    setWaBody(next)
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + 1 + sel.length + 1
      el.selectionEnd = start + 1 + sel.length + 1
    }, 0)
  }

  function handlePreviewVariations() {
    if (!template?.id && !waBody) return
    setAiLoading(true)
    startTransition(async () => {
      const res = await previewAiVariations({
        body: waBody,
        count: aiCount,
        temperature: aiTemp,
      })
      setAiLoading(false)
      if ('variations' in res) setAiVariations(res.variations as string[])
      if ('error' in res && res.error) onError(res.error)
    })
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveTemplate({
        id: template?.id,
        name,
        category: category || undefined,
        wa_body: waBody || undefined,
        wa_image_url: waImageUrl || undefined,
        wa_link_url: waLinkUrl || undefined,
        wa_link_title: waLinkTitle || undefined,
        wa_link_description: waLinkDesc || undefined,
        email_subject: emailSubject || undefined,
        email_html: emailHtml || undefined,
        email_plain: emailHtml ? stripHtml(emailHtml) : undefined,
        sms_body: smsBody || undefined,
        variables: detectedVars,
        ai_variation_enabled: aiEnabled,
        ai_variation_count: aiCount,
        ai_variation_temp: aiTemp,
      })
      if ('error' in res && res.error) {
        onError(res.error)
        return
      }
      onClose()
    })
  }

  const waCharCount = waBody.length
  const smsSegments = Math.ceil(smsBody.length / 160) || 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-6xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <h2 className="text-[14px] font-medium text-foreground tracking-tight shrink-0">
              {template ? 'Editar template' : 'Novo template'}
            </h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do template..."
              className="flex-1 max-w-[260px] h-8 px-3 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-8 px-2 bg-night border border-border rounded-md text-[11px] text-foreground/75 focus:outline-none focus:border-stone-dark transition-colors"
            >
              <option value="">Categoria</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="h-8 px-3 text-[12px] text-foreground/75 hover:text-foreground border border-border hover:border-stone-dark rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending || !name.trim()}
              className="h-8 px-4 bg-primary text-primary-foreground rounded-md text-[12px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-40"
            >
              {pending ? 'Salvando...' : template ? 'Salvar' : 'Criar template'}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-muted-subtle transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Channel tabs */}
        <div className="px-6 border-b border-border shrink-0">
          <div className="flex items-center gap-6">
            {(['whatsapp', 'email', 'sms'] as const).map((ch) => {
              const hasContent =
                ch === 'whatsapp'
                  ? Boolean(waBody)
                  : ch === 'email'
                    ? Boolean(emailHtml || emailSubject)
                    : Boolean(smsBody)
              return (
                <button
                  key={ch}
                  onClick={() => setActiveTab(ch)}
                  className={cn(
                    'relative py-3 text-[12px] font-medium tracking-tight transition-colors',
                    activeTab === ch ? 'text-foreground' : 'text-muted hover:text-foreground/75'
                  )}
                >
                  {ch === 'whatsapp' ? 'WhatsApp' : ch === 'email' ? 'Email' : 'SMS'}
                  {hasContent && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-success inline-block align-middle" />
                  )}
                  {activeTab === ch && (
                    <span className="absolute left-0 right-0 bottom-0 h-px bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: form */}
          <div className="w-1/2 border-r border-border overflow-y-auto p-6 space-y-5">
            {/* WhatsApp tab */}
            {activeTab === 'whatsapp' && (
              <>
                {/* Toolbar */}
                <div className="flex items-center gap-1">
                  <ToolbarBtn title="Negrito (*text*)" onClick={() => applyWaFormat('bold')}>
                    <Bold size={12} />
                  </ToolbarBtn>
                  <ToolbarBtn title="Italico (_text_)" onClick={() => applyWaFormat('italic')}>
                    <Italic size={12} />
                  </ToolbarBtn>
                  <ToolbarBtn title="Tachado (~text~)" onClick={() => applyWaFormat('strike')}>
                    <Strikethrough size={12} />
                  </ToolbarBtn>
                  <span className="w-px h-5 bg-muted-subtle mx-1" />
                  <span className="text-[10px] text-muted tracking-tight">Variaveis:</span>
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVar(v.key, 'wa')}
                      title={v.label}
                      className="h-6 px-1.5 rounded text-[9px] font-data text-foreground/75 hover:text-foreground hover:bg-muted-subtle transition-colors tracking-tight"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>

                <Field label="Corpo da mensagem">
                  <textarea
                    ref={waBodyRef}
                    value={waBody}
                    onChange={(e) => setWaBody(e.target.value)}
                    rows={8}
                    placeholder="Ola {first_name}! Temos uma novidade especial..."
                    className="w-full px-3.5 py-2.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark resize-none transition-colors"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[10px] text-muted tracking-tight">
                      Use *negrito*, _italico_, ~tachado~
                    </p>
                    <span
                      className={cn(
                        'text-[10px] font-data tracking-tight',
                        waCharCount > 1000 ? 'text-accent-foreground' : 'text-muted'
                      )}
                    >
                      {waCharCount}/1000
                    </span>
                  </div>
                </Field>

                <Field label="URL da imagem (opcional)">
                  <input
                    value={waImageUrl}
                    onChange={(e) => setWaImageUrl(e.target.value)}
                    placeholder="https://exemplo.com/imagem.jpg"
                    className="w-full h-9 px-3.5 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted font-data focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Link URL">
                    <input
                      value={waLinkUrl}
                      onChange={(e) => setWaLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full h-9 px-3.5 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted font-data focus:outline-none focus:border-stone-dark transition-colors"
                    />
                  </Field>
                  <Field label="Titulo do link">
                    <input
                      value={waLinkTitle}
                      onChange={(e) => setWaLinkTitle(e.target.value)}
                      placeholder="Ex: Ver cardapio"
                      className="w-full h-9 px-3.5 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
                    />
                  </Field>
                </div>

                <Field label="Descricao do link">
                  <input
                    value={waLinkDesc}
                    onChange={(e) => setWaLinkDesc(e.target.value)}
                    placeholder="Descricao breve do link..."
                    className="w-full h-9 px-3.5 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>
              </>
            )}

            {/* Email tab */}
            {activeTab === 'email' && (
              <>
                <Field label="Assunto">
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="{first_name}, temos uma novidade!"
                    className="w-full h-9 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>

                {/* Email toolbar */}
                <div className="flex items-center gap-1 flex-wrap">
                  <ToolbarBtn title="Negrito" onClick={() => wrapEmailSelection('b')}>
                    <Bold size={12} />
                  </ToolbarBtn>
                  <ToolbarBtn title="Italico" onClick={() => wrapEmailSelection('i')}>
                    <Italic size={12} />
                  </ToolbarBtn>
                  <ToolbarBtn title="Link" onClick={() => wrapEmailSelection('a')}>
                    <Link size={12} />
                  </ToolbarBtn>
                  <ToolbarBtn title="Lista" onClick={() => insertEmailBlock('<ul><li></li></ul>')}>
                    <List size={12} />
                  </ToolbarBtn>
                  <ToolbarBtn title="Separador" onClick={() => insertEmailBlock('<hr />')}>
                    <Minus size={12} />
                  </ToolbarBtn>
                  <span className="w-px h-5 bg-muted-subtle mx-1" />
                  <span className="text-[10px] text-muted tracking-tight">Variaveis:</span>
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertEmailVar(v.key)}
                      title={v.label}
                      className="h-6 px-1.5 rounded text-[9px] font-data text-foreground/75 hover:text-foreground hover:bg-muted-subtle transition-colors tracking-tight"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>

                <Field label="HTML do email">
                  <textarea
                    id="email-html-editor"
                    value={emailHtml}
                    onChange={(e) => setEmailHtml(e.target.value)}
                    rows={12}
                    placeholder="<p>Ola {first_name},</p><p>Visite-nos neste fim de semana e aproveite nossas novidades.</p>"
                    className="w-full px-3.5 py-2.5 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted font-data focus:outline-none focus:border-stone-dark resize-none transition-colors"
                    spellCheck={false}
                  />
                </Field>
              </>
            )}

            {/* SMS tab */}
            {activeTab === 'sms' && (
              <>
                <div className="flex items-center gap-1 flex-wrap mb-1">
                  <span className="text-[10px] text-muted tracking-tight">Variaveis:</span>
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVar(v.key, 'sms')}
                      title={v.label}
                      className="h-6 px-1.5 rounded text-[9px] font-data text-foreground/75 hover:text-foreground hover:bg-muted-subtle transition-colors tracking-tight"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>

                <Field label="Mensagem SMS">
                  <textarea
                    ref={smsBodyRef}
                    value={smsBody}
                    onChange={(e) => setSmsBody(e.target.value)}
                    rows={4}
                    placeholder="{restaurant_name}: {first_name}, novidades te esperam neste fim de semana!"
                    className="w-full px-3.5 py-2.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark resize-none transition-colors"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[10px] text-muted tracking-tight">
                      {smsBody.length > 160
                        ? `${smsSegments} segmentos`
                        : 'Um unico SMS'}
                    </p>
                    <span
                      className={cn(
                        'text-[10px] font-data tracking-tight',
                        smsBody.length > 160 ? 'text-accent-foreground' : 'text-muted'
                      )}
                    >
                      {smsBody.length}/{smsSegments > 1 ? smsSegments * 153 : 160}
                    </span>
                  </div>
                </Field>
              </>
            )}

            {/* AI Variation section */}
            <div className="border-t border-border pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[12px] text-foreground tracking-tight">
                    Variacao por IA
                  </p>
                  <p className="text-[11px] text-muted tracking-tight mt-0.5">
                    Claude gera variacoes para evitar envios identicos
                  </p>
                </div>
                <button
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={cn(
                    'h-7 px-3 text-[11px] font-medium rounded-md transition-colors tracking-tight',
                    aiEnabled
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/75 hover:text-foreground hover:bg-muted-subtle border border-border'
                  )}
                >
                  {aiEnabled ? 'Ativo' : 'Inativo'}
                </button>
              </div>

              {aiEnabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={`Quantidade: ${aiCount}`}>
                      <input
                        type="range"
                        min={3}
                        max={10}
                        step={1}
                        value={aiCount}
                        onChange={(e) => setAiCount(Number(e.target.value))}
                        className="w-full accent-cloud"
                      />
                    </Field>
                    <Field label={`Criatividade: ${aiTemp.toFixed(1)}`}>
                      <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.1}
                        value={aiTemp}
                        onChange={(e) => setAiTemp(Number(e.target.value))}
                        className="w-full accent-cloud"
                      />
                    </Field>
                  </div>

                  <button
                    onClick={handlePreviewVariations}
                    disabled={aiLoading || !waBody}
                    className="h-8 px-4 text-[11px] font-medium text-success border border-success/30 hover:bg-success/5 rounded-md transition-colors disabled:opacity-40 tracking-tight"
                  >
                    {aiLoading ? 'Gerando...' : 'Gerar preview de variacoes'}
                  </button>

                  {aiVariations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
                        Variacoes geradas
                      </p>
                      {aiVariations.map((v, i) => (
                        <div
                          key={i}
                          className="p-3 bg-night border border-border rounded-md text-[12px] text-foreground/75 tracking-tight leading-relaxed"
                        >
                          <span className="text-[9px] font-data text-muted mr-2">
                            #{i + 1}
                          </span>
                          {v}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detected variables */}
            {detectedVars.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
                  Variaveis detectadas
                </p>
                <div className="flex flex-wrap gap-2">
                  {detectedVars.map((v) => (
                    <span
                      key={v}
                      className="text-[11px] font-data text-foreground/75 bg-night px-1.5 py-0.5 rounded tracking-tight"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: preview */}
          <div className="w-1/2 overflow-y-auto p-6 bg-night/30">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-5">
              Preview
            </p>

            {activeTab === 'whatsapp' && (
              <WaPreview
                body={waBody}
                imageUrl={waImageUrl}
                linkUrl={waLinkUrl}
                linkTitle={waLinkTitle}
                linkDesc={waLinkDesc}
              />
            )}

            {activeTab === 'email' && (
              <EmailPreview
                subject={emailSubject}
                html={emailHtml}
              />
            )}

            {activeTab === 'sms' && (
              <SmsPreview body={smsBody} />
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // ---- helpers for email editor ----
  function wrapEmailSelection(tag: string) {
    const el = document.getElementById('email-html-editor') as HTMLTextAreaElement | null
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const sel = emailHtml.slice(start, end)
    const attrs = tag === 'a' ? ' href="https://"' : ''
    const wrapped = `<${tag}${attrs}>${sel}</${tag}>`
    setEmailHtml(emailHtml.slice(0, start) + wrapped + emailHtml.slice(end))
  }

  function insertEmailBlock(block: string) {
    const el = document.getElementById('email-html-editor') as HTMLTextAreaElement | null
    if (!el) return
    const pos = el.selectionStart ?? emailHtml.length
    setEmailHtml(emailHtml.slice(0, pos) + '\n' + block + '\n' + emailHtml.slice(pos))
  }

  function insertEmailVar(varKey: string) {
    const el = document.getElementById('email-html-editor') as HTMLTextAreaElement | null
    if (!el) return
    const pos = el.selectionStart ?? emailHtml.length
    setEmailHtml(emailHtml.slice(0, pos) + varKey + emailHtml.slice(pos))
  }
}

// ---------------------------------------------------------------
// Preview components
// ---------------------------------------------------------------

function WaPreview({
  body,
  imageUrl,
  linkUrl,
  linkTitle,
  linkDesc,
}: {
  body: string
  imageUrl: string
  linkUrl: string
  linkTitle: string
  linkDesc: string
}) {
  const renderedBody = applyMockVars(body)
  const styledBody = renderedBody
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/~(.*?)~/g, '<s>$1</s>')
    .replace(/\n/g, '<br />')

  return (
    <div className="flex justify-center">
      <div className="w-72 bg-[#0A0A0A] rounded-2xl p-4 border border-white/5">
        {/* WhatsApp header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
          <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
            <span className="text-[10px] text-success font-medium">R</span>
          </div>
          <div>
            <p className="text-[11px] text-foreground font-medium">Restaurante Demo</p>
            <p className="text-[9px] text-muted">online</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Message bubble */}
          {(body || imageUrl) && (
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-[#005C4B] rounded-tl-xl rounded-bl-xl rounded-tr-xl p-3 space-y-2">
                {imageUrl && (
                  <div className="w-full aspect-video bg-muted-subtle rounded-md overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.currentTarget
                        el.style.display = 'none'
                      }}
                    />
                  </div>
                )}
                {body && (
                  <p
                    className="text-[12px] text-[#E9EBD8] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: styledBody }}
                  />
                )}
                <p className="text-[9px] text-[#B2C5BB] text-right">
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )}

          {/* Link preview */}
          {linkUrl && (
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-[#1F2C34] border border-white/10 rounded-xl overflow-hidden">
                <div className="h-1 bg-success" />
                <div className="p-2.5">
                  <p className="text-[11px] text-foreground font-medium truncate">{linkTitle || linkUrl}</p>
                  {linkDesc && (
                    <p className="text-[10px] text-muted tracking-tight mt-0.5 line-clamp-2">{linkDesc}</p>
                  )}
                  <p className="text-[9px] text-muted font-data mt-1 truncate">{linkUrl}</p>
                </div>
              </div>
            </div>
          )}

          {!body && !imageUrl && !linkUrl && (
            <p className="text-center text-[11px] text-muted tracking-tight py-4">
              Escreva o conteudo para ver o preview
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function EmailPreview({ subject, html }: { subject: string; html: string }) {
  const renderedSubject = applyMockVars(subject)
  const renderedHtml = applyMockVars(html)

  return (
    <div className="space-y-3">
      {subject && (
        <div className="p-3 bg-night border border-border rounded-md">
          <p className="text-[10px] text-muted mb-1 tracking-tight">Assunto</p>
          <p className="text-[13px] text-foreground tracking-tight">{renderedSubject}</p>
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden shadow-lg">
        {/* Email header */}
        <div className="bg-[#1A1A1A] px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-success/20 flex items-center justify-center shrink-0">
            <span className="text-[9px] text-success font-medium">R</span>
          </div>
          <div>
            <p className="text-[10px] text-foreground">Restaurante Demo &lt;contato@restaurante.com&gt;</p>
            <p className="text-[9px] text-muted">Para: {MOCK_CONTEXT['{name}']}</p>
          </div>
        </div>

        {/* Email body */}
        <div className="px-5 py-4 min-h-[120px]">
          {html ? (
            <div
              className="text-[13px] text-[#1A1A1A] leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <p className="text-[11px] text-gray-400 text-center py-6">
              Adicione HTML para ver o preview
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
          <p className="text-[9px] text-gray-400 text-center">
            Restaurante Demo · Cancelar inscricao
          </p>
        </div>
      </div>
    </div>
  )
}

function SmsPreview({ body }: { body: string }) {
  const rendered = applyMockVars(body)

  return (
    <div className="flex justify-center">
      {/* Phone mockup */}
      <div className="w-60 bg-[#0A0A0A] rounded-[32px] p-3 border-2 border-white/10 shadow-xl">
        {/* Notch */}
        <div className="w-16 h-1.5 bg-white/10 rounded-full mx-auto mb-3" />

        {/* Screen */}
        <div className="bg-[#1C1C1E] rounded-2xl p-3 min-h-[200px]">
          <div className="text-center mb-4">
            <p className="text-[9px] text-gray-500">Restaurante Demo</p>
            <p className="text-[8px] text-gray-600">Mensagem de texto</p>
          </div>

          {body ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#3C3C3E] rounded-tl-xl rounded-tr-xl rounded-br-xl px-3 py-2">
                <p className="text-[11px] text-white leading-relaxed">{rendered}</p>
              </div>
            </div>
          ) : (
            <p className="text-center text-[10px] text-gray-600 py-4">
              Escreva a mensagem SMS
            </p>
          )}
        </div>

        {/* Home indicator */}
        <div className="w-24 h-1 bg-white/20 rounded-full mx-auto mt-2.5" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Micro components
// ---------------------------------------------------------------

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded text-foreground/75 hover:text-foreground hover:bg-muted-subtle transition-colors"
    >
      {children}
    </button>
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

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
