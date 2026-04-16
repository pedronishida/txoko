'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { X, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConversationNote } from '@txoko/shared'
import {
  getConversationNotes,
  createConversationNote,
  deleteConversationNote,
  toggleConversationAiPause,
  generateConversationSummary,
  updateContactTags,
} from '@/app/(app)/inbox/contact-actions'

// =============================================================
// ContactPanel — painel lateral direito do inbox
// Exibe detalhes do contato, resumo IA, notas, tags, cliente
// =============================================================

type ContactPanelProps = {
  conversationId: string
  contact: {
    id: string
    display_name: string
    avatar_url: string | null
    tags: string[]
    notes?: string | null
  }
  customer?: {
    id: string
    name: string
    phone: string | null
    email: string | null
    loyalty_points: number
    total_orders: number
    total_spent: number
    last_visit_at: string | null
  } | null
  stats: {
    totalMessages: number
    firstMessageAt: string | null
  }
  aiSummary: string | null
  aiSummaryGeneratedAt: string | null
  aiPaused: boolean
  channelType?: string | null
  onClose?: () => void
  onAiPauseChange?: (paused: boolean) => void
}

// ----- util helpers -----

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m} min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

// ----- section label -----

function SectionLabel({
  label,
  action,
}: {
  label: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone">
        {label}
      </span>
      {action}
    </div>
  )
}

// =============================================================
// ContactPanel
// =============================================================

export function ContactPanel({
  conversationId,
  contact: initialContact,
  customer,
  stats,
  aiSummary: initialAiSummary,
  aiSummaryGeneratedAt: initialAiSummaryGeneratedAt,
  aiPaused: initialAiPaused,
  channelType,
  onClose,
  onAiPauseChange,
}: ContactPanelProps) {
  // ---- state ----
  const [contact, setContact] = useState(initialContact)
  const [aiSummary, setAiSummary] = useState(initialAiSummary)
  const [aiSummaryGeneratedAt, setAiSummaryGeneratedAt] = useState(
    initialAiSummaryGeneratedAt
  )
  const [aiPaused, setAiPaused] = useState(initialAiPaused)
  const [notes, setNotes] = useState<ConversationNote[]>([])
  const [notesLoaded, setNotesLoaded] = useState(false)

  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteBody, setNoteBody] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [customerExpanded, setCustomerExpanded] = useState(false)

  const [inlineError, setInlineError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [summaryPending, startSummaryTransition] = useTransition()
  const [notesPending, startNotesTransition] = useTransition()
  const [tagsPending, startTagsTransition] = useTransition()
  const [aiPausePending, startAiPauseTransition] = useTransition()

  const tagInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

  // ---- load notes on mount ----
  const loadNotes = useCallback(async () => {
    const res = await getConversationNotes(conversationId)
    if ('ok' in res && res.ok) {
      setNotes(res.notes)
      setNotesLoaded(true)
    }
  }, [conversationId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  // ---- focus helpers ----
  useEffect(() => {
    if (showAddTag) tagInputRef.current?.focus()
  }, [showAddTag])

  useEffect(() => {
    if (showNoteForm) noteTextareaRef.current?.focus()
  }, [showNoteForm])

  // ---- reset when conversation changes ----
  useEffect(() => {
    setContact(initialContact)
    setAiSummary(initialAiSummary)
    setAiSummaryGeneratedAt(initialAiSummaryGeneratedAt)
    setAiPaused(initialAiPaused)
    setNotes([])
    setNotesLoaded(false)
    setShowNoteForm(false)
    setNoteBody('')
    setShowAddTag(false)
    setNewTag('')
    setInlineError(null)
  }, [
    conversationId,
    initialContact,
    initialAiSummary,
    initialAiSummaryGeneratedAt,
    initialAiPaused,
  ])

  useEffect(() => {
    if (!notesLoaded) loadNotes()
  }, [notesLoaded, loadNotes])

  // ---- handlers ----

  function handleGenerateSummary() {
    setInlineError(null)
    startSummaryTransition(async () => {
      const res = await generateConversationSummary(conversationId)
      if ('error' in res) {
        setInlineError(res.error)
        return
      }
      setAiSummary(res.summary)
      setAiSummaryGeneratedAt(new Date().toISOString())
    })
  }

  function handleAddNote() {
    if (!noteBody.trim()) return
    setInlineError(null)
    startNotesTransition(async () => {
      const res = await createConversationNote({
        conversationId,
        body: noteBody.trim(),
      })
      if ('error' in res) {
        setInlineError(res.error)
        return
      }
      setNoteBody('')
      setShowNoteForm(false)
      await loadNotes()
    })
  }

  function handleDeleteNote(noteId: string) {
    setInlineError(null)
    startTransition(async () => {
      const res = await deleteConversationNote(noteId)
      if ('error' in res) {
        setInlineError(res.error)
        return
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    })
  }

  function handleAddTag() {
    const tag = newTag.trim()
    if (!tag || contact.tags.includes(tag)) {
      setNewTag('')
      setShowAddTag(false)
      return
    }
    const updated = [...contact.tags, tag]
    setContact((prev) => ({ ...prev, tags: updated }))
    setNewTag('')
    setShowAddTag(false)
    startTagsTransition(async () => {
      const res = await updateContactTags({ contactId: contact.id, tags: updated })
      if ('error' in res) {
        setInlineError(res.error)
        setContact((prev) => ({
          ...prev,
          tags: prev.tags.filter((t) => t !== tag),
        }))
      }
    })
  }

  function handleRemoveTag(tag: string) {
    const updated = contact.tags.filter((t) => t !== tag)
    setContact((prev) => ({ ...prev, tags: updated }))
    startTagsTransition(async () => {
      const res = await updateContactTags({ contactId: contact.id, tags: updated })
      if ('error' in res) {
        setInlineError(res.error)
        setContact((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
      }
    })
  }

  function handleToggleAiPause() {
    const next = !aiPaused
    setAiPaused(next)
    onAiPauseChange?.(next)
    startAiPauseTransition(async () => {
      const res = await toggleConversationAiPause({
        conversationId,
        paused: next,
      })
      if ('error' in res) {
        setInlineError(res.error)
        setAiPaused(!next)
        onAiPauseChange?.(!next)
      }
    })
  }

  function handleExportConversation() {
    // Fire-and-forget export via window.open or text download
    // For now opens a blank trigger — backend can add a proper endpoint later
    const url = `/api/conversations/${conversationId}/export`
    const a = document.createElement('a')
    a.href = url
    a.download = `conversa-${conversationId.slice(0, 8)}.txt`
    a.click()
  }

  const channelLabel: Record<string, string> = {
    whatsapp_zapi: 'WhatsApp',
    instagram: 'Instagram',
    facebook_messenger: 'Messenger',
    ifood_chat: 'iFood',
    google_reviews: 'Google',
    internal_qr: 'QR interno',
  }

  // =============================================================
  // Render
  // =============================================================

  return (
    <aside
      className="flex flex-col bg-night border-l border-night-lighter overflow-hidden"
      aria-label="Painel do contato"
    >
      {/* ---- 1. Header ---- */}
      <div className="sticky top-0 z-10 bg-night border-b border-night-lighter px-5 pt-4 pb-4 flex flex-col items-center text-center relative">
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fechar painel"
            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        )}

        {/* Avatar */}
        {contact.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contact.avatar_url}
            alt={contact.display_name}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-night-lighter flex items-center justify-center text-[18px] font-medium text-cloud tracking-tight">
            {initials(contact.display_name)}
          </div>
        )}

        <h2 className="mt-3 text-[18px] font-medium text-cloud tracking-tight leading-snug">
          {contact.display_name}
        </h2>

        {customer?.phone && (
          <p className="mt-0.5 text-[12px] font-data text-stone">{customer.phone}</p>
        )}

        {channelType && channelLabel[channelType] && (
          <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full bg-night-lighter text-[10px] text-stone-light tracking-tight">
            {channelLabel[channelType]}
          </span>
        )}
      </div>

      {/* ---- Scrollable content ---- */}
      <div className="flex-1 overflow-y-auto">

        {/* Inline error banner */}
        {inlineError && (
          <div className="mx-5 mt-4 px-3 py-2 bg-coral/10 border border-coral/20 rounded-md flex items-center justify-between gap-2">
            <span className="text-[11px] text-coral tracking-tight">{inlineError}</span>
            <button
              onClick={() => setInlineError(null)}
              className="text-coral/60 hover:text-coral shrink-0"
              aria-label="Fechar erro"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {/* ---- 2. Stats mini-grid ---- */}
        <div className="px-5 py-4 border-b border-night-lighter/50">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone">
                Mensagens
              </p>
              <p className="text-[18px] font-medium font-data text-cloud tracking-tight leading-none mt-1.5">
                {stats.totalMessages}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone">
                Primeira msg
              </p>
              <p className="text-[14px] font-medium font-data text-cloud tracking-tight leading-none mt-1.5">
                {stats.firstMessageAt
                  ? formatDate(stats.firstMessageAt)
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* ---- 3. AI Summary ---- */}
        <div className="px-5 py-4 border-b border-night-lighter/50">
          <SectionLabel
            label="Resumo da conversa"
            action={
              aiSummary ? (
                <button
                  onClick={handleGenerateSummary}
                  disabled={summaryPending}
                  aria-label="Atualizar resumo"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors disabled:opacity-40"
                >
                  <RefreshCw
                    size={12}
                    className={summaryPending ? 'animate-spin' : ''}
                  />
                </button>
              ) : null
            }
          />

          {summaryPending && !aiSummary && (
            <div className="text-[12px] text-stone tracking-tight animate-pulse">
              Gerando resumo...
            </div>
          )}

          {!summaryPending && !aiSummary && (
            <div className="space-y-3">
              <p className="text-[12px] text-stone tracking-tight leading-relaxed">
                Clique para gerar um resumo inteligente desta conversa.
              </p>
              <button
                onClick={handleGenerateSummary}
                disabled={summaryPending}
                className="h-8 px-3.5 bg-leaf text-night rounded-md text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 tracking-tight"
              >
                Gerar resumo
              </button>
            </div>
          )}

          {aiSummary && (
            <div className="bg-night-lighter/30 border border-night-lighter rounded-lg px-3.5 py-3 space-y-2">
              {aiSummary.split('\n\n').map((para, i) => (
                <p
                  key={i}
                  className="text-[13px] text-cloud-dark leading-relaxed tracking-tight"
                >
                  {para}
                </p>
              ))}
              {aiSummaryGeneratedAt && (
                <p className="text-[10px] text-stone-dark font-data pt-1 border-t border-night-lighter/50">
                  Atualizado {formatRelativeTime(aiSummaryGeneratedAt)}
                </p>
              )}
            </div>
          )}

          {summaryPending && aiSummary && (
            <p className="mt-2 text-[11px] text-stone tracking-tight animate-pulse">
              Atualizando...
            </p>
          )}
        </div>

        {/* ---- 4. Internal Notes ---- */}
        <div className="px-5 py-4 border-b border-night-lighter/50">
          <SectionLabel
            label="Notas internas"
            action={
              <button
                onClick={() => setShowNoteForm((v) => !v)}
                aria-label="Adicionar nota"
                className="w-6 h-6 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <Plus size={13} />
              </button>
            }
          />

          {/* Note form */}
          {showNoteForm && (
            <div className="mb-3 space-y-2">
              <textarea
                ref={noteTextareaRef}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleAddNote()
                  }
                  if (e.key === 'Escape') {
                    setShowNoteForm(false)
                    setNoteBody('')
                  }
                }}
                rows={3}
                placeholder="Escreva uma nota para a equipe..."
                className="w-full px-3 py-2.5 bg-night-lighter/30 border border-night-lighter rounded-md text-[12px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark resize-none transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowNoteForm(false)
                    setNoteBody('')
                  }}
                  className="h-7 px-2.5 text-[11px] text-stone hover:text-cloud transition-colors rounded-md hover:bg-night-lighter tracking-tight"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={notesPending || !noteBody.trim()}
                  className="h-7 px-3 bg-cloud text-night rounded-md text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 tracking-tight"
                >
                  {notesPending ? 'Salvando...' : 'Salvar nota'}
                </button>
              </div>
              <p className="text-[10px] text-stone-dark font-data tracking-tight">
                ⌘↵ para salvar · Esc para cancelar
              </p>
            </div>
          )}

          {/* Notes list */}
          {notesLoaded && notes.length === 0 && !showNoteForm && (
            <p className="text-[12px] text-stone tracking-tight leading-relaxed">
              Nenhuma nota ainda — use para alinhar com a equipe.
            </p>
          )}

          <div className="space-y-2">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onDelete={() => handleDeleteNote(note.id)}
              />
            ))}
          </div>
        </div>

        {/* ---- 5. Tags ---- */}
        <div className="px-5 py-4 border-b border-night-lighter/50">
          <SectionLabel
            label="Tags"
            action={
              <button
                onClick={() => setShowAddTag((v) => !v)}
                aria-label="Adicionar tag"
                className="text-[10px] text-stone hover:text-cloud transition-colors tracking-tight"
              >
                + Adicionar
              </button>
            }
          />

          {/* Tag add input */}
          {showAddTag && (
            <div className="mb-2 flex items-center gap-2">
              <input
                ref={tagInputRef}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                  if (e.key === 'Escape') {
                    setShowAddTag(false)
                    setNewTag('')
                  }
                }}
                placeholder="Nome da tag"
                className="flex-1 h-7 px-2.5 bg-night-lighter/30 border border-night-lighter rounded-md text-[12px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark transition-colors"
              />
              <button
                onClick={handleAddTag}
                disabled={tagsPending || !newTag.trim()}
                className="h-7 px-2.5 bg-cloud text-night rounded-md text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                OK
              </button>
            </div>
          )}

          {contact.tags.length === 0 && !showAddTag && (
            <p className="text-[12px] text-stone tracking-tight">Nenhuma tag</p>
          )}

          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-night-lighter text-[11px] text-cloud-dark tracking-tight group"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`Remover tag ${tag}`}
                    className="text-stone-dark hover:text-cloud transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ---- 6. Customer Data (collapsible) ---- */}
        {customer && (
          <div className="px-5 py-4 border-b border-night-lighter/50">
            <button
              onClick={() => setCustomerExpanded((v) => !v)}
              className="w-full flex items-center justify-between group"
              aria-expanded={customerExpanded}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone">
                Cliente vinculado
              </span>
              {customerExpanded ? (
                <ChevronDown size={12} className="text-stone-dark" />
              ) : (
                <ChevronRight size={12} className="text-stone-dark" />
              )}
            </button>

            {customerExpanded && (
              <div className="mt-3 space-y-3 animate-fade-in">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <p className="text-[10px] text-stone-dark uppercase tracking-wider">
                      Nome
                    </p>
                    <p className="text-[13px] text-cloud tracking-tight mt-0.5">
                      {customer.name}
                    </p>
                  </div>
                  {customer.email && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-stone-dark uppercase tracking-wider">
                        E-mail
                      </p>
                      <p className="text-[12px] text-cloud-dark tracking-tight mt-0.5 truncate">
                        {customer.email}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-stone-dark uppercase tracking-wider">
                      Fidelidade
                    </p>
                    <p className="text-[16px] font-medium font-data text-leaf leading-none mt-1.5">
                      {customer.loyalty_points}
                      <span className="text-[10px] text-stone ml-1">pts</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-dark uppercase tracking-wider">
                      Pedidos
                    </p>
                    <p className="text-[16px] font-medium font-data text-cloud leading-none mt-1.5">
                      {customer.total_orders}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-dark uppercase tracking-wider">
                      Total gasto
                    </p>
                    <p className="text-[14px] font-medium font-data text-cloud leading-none mt-1.5">
                      {formatCurrency(customer.total_spent)}
                    </p>
                  </div>
                  {customer.last_visit_at && (
                    <div>
                      <p className="text-[10px] text-stone-dark uppercase tracking-wider">
                        Última visita
                      </p>
                      <p className="text-[12px] font-data text-stone leading-none mt-1.5">
                        {formatDate(customer.last_visit_at)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- 7. AI Controls ---- */}
        <div className="px-5 py-4 border-b border-night-lighter/50">
          <SectionLabel label="Automacao IA" />

          <div className="flex items-start gap-3">
            <button
              role="switch"
              aria-checked={aiPaused}
              onClick={handleToggleAiPause}
              disabled={aiPausePending}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 disabled:opacity-40',
                aiPaused ? 'bg-warm' : 'bg-night-lighter'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-cloud transition-transform',
                  aiPaused ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </button>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-[13px] font-medium tracking-tight',
                  aiPaused ? 'text-warm' : 'text-stone-light'
                )}
              >
                {aiPaused ? 'IA pausada' : 'IA ativa'}
              </p>
              <p className="text-[11px] text-stone tracking-tight mt-0.5 leading-relaxed">
                {aiPaused
                  ? 'Respostas automáticas desativadas nesta conversa.'
                  : 'A IA pode responder automaticamente nesta conversa.'}
              </p>
            </div>
          </div>
        </div>

        {/* ---- 8. Actions ---- */}
        <div className="px-5 py-4 space-y-2">
          <SectionLabel label="Acoes" />

          <button
            onClick={handleExportConversation}
            className="w-full h-9 border border-night-lighter rounded-md text-[12px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors tracking-tight"
          >
            Exportar conversa (.txt)
          </button>

          <button
            onClick={() => {
              if (
                window.confirm(
                  'Tem certeza? Esta ação vai apagar permanentemente o contato e toda a conversa.'
                )
              ) {
                // destructive — backend must implement this endpoint
                alert('Funcionalidade disponível em breve.')
              }
            }}
            className="w-full h-9 border border-coral/30 rounded-md text-[12px] text-coral hover:bg-coral/5 hover:border-coral/60 transition-colors tracking-tight"
          >
            Apagar contato e conversa
          </button>
        </div>

        {/* bottom padding */}
        <div className="h-6" />
      </div>
    </aside>
  )
}

// =============================================================
// NoteCard
// =============================================================

function NoteCard({
  note,
  onDelete,
}: {
  note: ConversationNote
  onDelete: () => void
}) {
  return (
    <div className="group relative bg-night-lighter/30 border border-night-lighter rounded-md px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-night-lighter flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[9px] font-medium text-cloud">
            {note.author_id ? note.author_id.slice(0, 1).toUpperCase() : 'A'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-cloud tracking-tight leading-relaxed whitespace-pre-wrap break-words">
            {note.body}
          </p>
          <p className="text-[10px] text-stone-dark font-data mt-1 tracking-tight">
            {formatRelativeTime(note.created_at)}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label="Apagar nota"
          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-md text-stone hover:text-coral hover:bg-coral/10 shrink-0"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}
