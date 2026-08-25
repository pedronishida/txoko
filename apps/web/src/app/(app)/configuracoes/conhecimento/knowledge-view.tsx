'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  toggleKnowledgeEntry,
  seedKnowledgeTemplates,
  type KnowledgeEntry,
  type KnowledgeEntryInput,
} from './actions'

// =============================================================
// Tipos e constantes
// =============================================================

const CATEGORIES = [
  { value: 'horarios', label: 'Horarios' },
  { value: 'cardapio', label: 'Cardapio' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'outros', label: 'Outros' },
] as const

type CategoryValue = (typeof CATEGORIES)[number]['value']

const CATEGORY_COLORS: Record<CategoryValue | 'default', string> = {
  horarios: 'bg-sunken text-ink-soft border-rule',
  cardapio: 'bg-teal-soft text-teal-deep border-teal',
  reserva: 'bg-sunken text-amber-text border-rule',
  entrega: 'bg-teal-tint text-teal border-teal',
  pagamento: 'bg-red-tint text-red border-red',
  outros: 'bg-sunken text-ink-muted border-rule',
  default: 'bg-sunken text-ink-muted border-rule',
}

function getCategoryColor(cat: string | null): string {
  if (!cat) return CATEGORY_COLORS.default
  return CATEGORY_COLORS[cat as CategoryValue] ?? CATEGORY_COLORS.default
}

function getCategoryLabel(cat: string | null): string {
  if (!cat) return 'Sem categoria'
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat
}

// =============================================================
// Form modal
// =============================================================

type EntryFormData = {
  title: string
  category: CategoryValue | ''
  content: string
  keywords: string[]
  enabled: boolean
}

const EMPTY_FORM: EntryFormData = {
  title: '',
  category: '',
  content: '',
  keywords: [],
  enabled: true,
}

type EntryFormModalProps = {
  initial?: KnowledgeEntry
  onClose: () => void
  onSave: (data: EntryFormData) => Promise<void>
  pending: boolean
  error: string | null
}

function EntryFormModal({
  initial,
  onClose,
  onSave,
  pending,
  error,
}: EntryFormModalProps) {
  const isEditing = !!initial
  const [form, setForm] = useState<EntryFormData>(() =>
    initial
      ? {
          title: initial.title,
          category: (initial.category as CategoryValue) ?? '',
          content: initial.content,
          keywords: initial.keywords ?? [],
          enabled: initial.enabled,
        }
      : EMPTY_FORM
  )
  const [keywordInput, setKeywordInput] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase()
    if (!kw || form.keywords.includes(kw)) {
      setKeywordInput('')
      return
    }
    setForm((prev) => ({ ...prev, keywords: [...prev.keywords, kw] }))
    setKeywordInput('')
  }

  function removeKeyword(kw: string) {
    setForm((prev) => ({ ...prev, keywords: prev.keywords.filter((k) => k !== kw) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave(form)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-form-title"
    >
      <div className="w-full max-w-lg bg-night border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <h2
            id="entry-form-title"
            className="text-[15px] font-medium text-foreground tracking-tight"
          >
            {isEditing ? 'Editar entrada' : 'Nova entrada'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-muted-subtle transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        >
          {error && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-[12px] text-destructive tracking-tight">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
              Titulo *
            </label>
            <input
              ref={titleRef}
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Ex: Horario de funcionamento"
              required
              maxLength={200}
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
              Categoria
            </label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  category: e.target.value as CategoryValue | '',
                }))
              }
              className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark transition-colors appearance-none"
            >
              <option value="">Sem categoria</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
              Conteudo *
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Escreva as informacoes que a IA deve usar para responder..."
              required
              minLength={10}
              maxLength={8000}
              rows={6}
              className="w-full px-3.5 py-2.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors resize-none leading-relaxed"
            />
            <p className="text-[10px] text-muted mt-1 font-data">
              {form.content.length}/8000 caracteres
            </p>
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
              Palavras-chave (opcional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addKeyword()
                  }
                }}
                placeholder="Adicionar palavra-chave"
                className="flex-1 h-8 px-3 bg-night border border-border rounded-md text-[12px] text-foreground placeholder:text-muted focus:outline-none focus:border-stone-dark transition-colors"
              />
              <button
                type="button"
                onClick={addKeyword}
                disabled={!keywordInput.trim()}
                className="h-8 px-3 bg-muted-subtle text-foreground rounded-md text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Adicionar
              </button>
            </div>
            {form.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted-subtle text-[11px] text-foreground/75 group"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      aria-label={`Remover ${kw}`}
                      className="text-muted hover:text-destructive transition-colors"
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors shrink-0',
                form.enabled ? 'bg-success' : 'bg-muted-subtle'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-primary transition-transform',
                  form.enabled ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </button>
            <span className="text-[13px] text-foreground/75 tracking-tight">
              {form.enabled ? 'Ativa' : 'Inativa'}
            </span>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-[13px] text-muted hover:text-foreground transition-colors rounded-md hover:bg-muted-subtle tracking-tight"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              await onSave(form)
            }}
            disabled={
              pending ||
              !form.title.trim() ||
              form.content.length < 10
            }
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 tracking-tight"
          >
            {pending ? 'Salvando...' : isEditing ? 'Salvar alteracoes' : 'Criar entrada'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================
// Entry card
// =============================================================

function EntryCard({
  entry,
  onEdit,
  onDelete,
  onToggle,
}: {
  entry: KnowledgeEntry
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const catColor = getCategoryColor(entry.category)
  const catLabel = getCategoryLabel(entry.category)

  return (
    <div
      className={cn(
        'border border-border rounded-xl px-5 py-4 transition-opacity',
        !entry.enabled && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Toggle */}
        <button
          role="switch"
          aria-checked={entry.enabled}
          onClick={onToggle}
          aria-label={entry.enabled ? 'Desativar entrada' : 'Ativar entrada'}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5',
            entry.enabled ? 'bg-success' : 'bg-muted-subtle'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-primary transition-transform',
              entry.enabled ? 'left-[18px]' : 'left-0.5'
            )}
          />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-medium text-foreground tracking-tight">
              {entry.title}
            </h3>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] tracking-tight',
                catColor
              )}
            >
              {catLabel}
            </span>
          </div>
          <p className="text-[12px] text-muted tracking-tight mt-1 leading-relaxed line-clamp-2">
            {entry.content}
          </p>
          {entry.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entry.keywords.slice(0, 5).map((kw) => (
                <span
                  key={kw}
                  className="px-1.5 py-0.5 rounded bg-muted-subtle text-[10px] text-foreground/75 tracking-tight"
                >
                  {kw}
                </span>
              ))}
              {entry.keywords.length > 5 && (
                <span className="text-[10px] text-muted">
                  +{entry.keywords.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            aria-label="Editar"
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-muted-subtle transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Apagar"
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================
// KnowledgeView
// =============================================================

export function KnowledgeView({
  initialEntries,
}: {
  initialEntries: KnowledgeEntry[]
}) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(initialEntries)
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | undefined>(undefined)
  const [modalError, setModalError] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [savePending, startSaveTransition] = useTransition()

  function openCreate() {
    setEditingEntry(undefined)
    setModalError(null)
    setShowModal(true)
  }

  function openEdit(entry: KnowledgeEntry) {
    setEditingEntry(entry)
    setModalError(null)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingEntry(undefined)
    setModalError(null)
  }

  async function handleSave(data: {
    title: string
    category: string
    content: string
    keywords: string[]
    enabled: boolean
  }) {
    setModalError(null)
    const input: KnowledgeEntryInput = {
      title: data.title,
      category: (data.category || null) as KnowledgeEntryInput['category'],
      content: data.content,
      keywords: data.keywords,
      enabled: data.enabled,
    }

    startSaveTransition(async () => {
      if (editingEntry) {
        const res = await updateKnowledgeEntry({ ...input, id: editingEntry.id })
        if (!res.ok) {
          setModalError(res.error)
          return
        }
        setEntries((prev) =>
          prev.map((e) => (e.id === editingEntry.id ? res.entry : e))
        )
      } else {
        const res = await createKnowledgeEntry(input)
        if (!res.ok) {
          setModalError(res.error)
          return
        }
        setEntries((prev) => [res.entry, ...prev])
      }
      closeModal()
    })
  }

  function handleDelete(entry: KnowledgeEntry) {
    if (!window.confirm(`Apagar "${entry.title}"? Esta acao e irreversivel.`)) return
    setInlineError(null)
    startTransition(async () => {
      const res = await deleteKnowledgeEntry(entry.id)
      if (!res.ok) {
        setInlineError(res.error)
        return
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    })
  }

  function handleToggle(entry: KnowledgeEntry) {
    const next = !entry.enabled
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, enabled: next } : e))
    )
    startTransition(async () => {
      const res = await toggleKnowledgeEntry(entry.id, next)
      if (!res.ok) {
        setInlineError(res.error)
        // Reverte
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, enabled: !next } : e))
        )
      }
    })
  }

  const activeCount = entries.filter((e) => e.enabled).length

  function handleSeed() {
    if (
      !confirm(
        'Inserir 8 entradas de FAQ comum (horario, pagamento, delivery, reservas, eventos)? Voce edita depois.'
      )
    )
      return
    startTransition(async () => {
      const res = await seedKnowledgeTemplates()
      if (!res.ok) {
        setInlineError(res.error)
        return
      }
      setInlineError(null)
      window.location.reload()
    })
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-[16px] font-medium tracking-[-0.02em] text-foreground leading-none">
            Base de Conhecimento IA
          </h2>
          <p className="text-[12px] text-foreground/75 tracking-tight mt-1.5">
            {activeCount} entrada{activeCount !== 1 ? 's' : ''} ativa
            {activeCount !== 1 ? 's' : ''} — usadas pelo agente automatico
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/configuracoes/conhecimento/test"
            className="text-[11px] tracking-[0.05em] uppercase px-3 h-9 inline-flex items-center rounded-md border border-border text-muted hover:text-success hover:border-success/40 transition-colors"
          >
            Testar
          </Link>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:opacity-90 transition-opacity tracking-tight"
          >
            <Plus size={14} />
            Nova entrada
          </button>
        </div>
      </div>

      {/* Error banner */}
      {inlineError && (
        <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-center justify-between gap-2">
          <span className="text-[12px] text-destructive tracking-tight">{inlineError}</span>
          <button
            onClick={() => setInlineError(null)}
            className="text-destructive/60 hover:text-destructive shrink-0"
            aria-label="Fechar erro"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="py-16 text-center border border-dashed border-border rounded-xl">
          <p className="text-[14px] text-muted tracking-tight">
            Nenhuma entrada ainda
          </p>
          <p className="text-[12px] text-muted mt-1 tracking-tight max-w-md mx-auto">
            Adicione informacoes sobre horarios, cardapio, reservas e mais para que a IA possa responder clientes automaticamente.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={handleSeed}
              disabled={pending}
              className="flex items-center gap-2 h-9 px-4 bg-success/15 text-success border border-success/30 rounded-md text-[13px] font-medium hover:bg-success/25 transition-colors tracking-tight disabled:opacity-50"
            >
              ⚡ Inserir 8 FAQs prontas
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 h-9 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:opacity-90 transition-opacity tracking-tight"
            >
              <Plus size={14} />
              Criar do zero
            </button>
          </div>
          <p className="text-[10px] text-muted mt-3">
            Os templates sao genericos — voce edita os detalhes depois (endereco, taxas, telefones).
          </p>
        </div>
      )}

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => openEdit(entry)}
              onDelete={() => handleDelete(entry)}
              onToggle={() => handleToggle(entry)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <EntryFormModal
          initial={editingEntry}
          onClose={closeModal}
          onSave={handleSave}
          pending={savePending}
          error={modalError}
        />
      )}
    </div>
  )
}
