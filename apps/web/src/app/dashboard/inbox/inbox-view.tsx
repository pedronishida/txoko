'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type {
  Channel,
  ChannelType,
  Conversation,
  ConversationIntent,
  ConversationPriority,
  ConversationStatus,
  ConversationWithRelations,
  Message,
  MessageTemplate,
  ReviewSentiment,
} from '@txoko/shared'
import { MoreHorizontal, Plus, Send, X } from 'lucide-react'
import {
  assignConversationToMe,
  classifyConversation,
  createManualConversation,
  getMessages,
  markConversationRead,
  sendMessage,
  updateConversationPriority,
  updateConversationStatus,
} from './actions'

// =============================================================
// Inbox — dashboard de conversas (Linear / Raycast vibe)
// Tipografia como estrutura. Sem icones decorativos.
// Um unico accent (primary) reservado para unread + CTAs.
// =============================================================

type StatusFilter = 'all' | 'open' | 'pending_agent' | 'resolved' | 'closed'
type ChannelFilter = 'all' | ChannelType

const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp_zapi: 'WhatsApp',
  instagram: 'Instagram',
  facebook_messenger: 'Messenger',
  ifood_chat: 'iFood',
  google_reviews: 'Google',
  internal_qr: 'QR interno',
}

const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Aberta',
  pending_customer: 'Aguardando cliente',
  pending_agent: 'Aguardando nos',
  resolved: 'Resolvida',
  closed: 'Fechada',
  spam: 'Spam',
}

const PRIORITY_LABEL: Record<ConversationPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

const INTENT_LABEL: Record<ConversationIntent, string> = {
  question: 'Pergunta',
  complaint: 'Reclamacao',
  order: 'Pedido',
  praise: 'Elogio',
  reservation: 'Reserva',
  spam: 'Spam',
  other: 'Outro',
}

const SENTIMENT_LABEL: Record<ReviewSentiment, string> = {
  positive: 'Positivo',
  neutral: 'Neutro',
  negative: 'Negativo',
}

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'Abertas' },
  { id: 'pending_agent', label: 'Aguardando' },
  { id: 'resolved', label: 'Resolvidas' },
]

type Props = {
  conversations: ConversationWithRelations[]
  channels: Channel[]
  templates: MessageTemplate[]
  restaurantId: string
}

export function InboxView({
  conversations: initialConversations,
  channels,
  templates,
  restaurantId,
}: Props) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [composer, setComposer] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const threadEndRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (channelFilter !== 'all' && c.channel?.type !== channelFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const name = c.contact?.display_name?.toLowerCase() ?? ''
        const preview = c.last_message_preview?.toLowerCase() ?? ''
        if (!name.includes(q) && !preview.includes(q)) return false
      }
      return true
    })
  }, [conversations, statusFilter, channelFilter, searchQuery])

  const loadThread = useCallback(async (conversationId: string) => {
    setLoadingMessages(true)
    const res = await getMessages(conversationId)
    if ('messages' in res && res.messages) {
      setMessages(res.messages)
    }
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    loadThread(selectedId)
    const current = conversations.find((c) => c.id === selectedId)
    if (current && current.unread_count > 0) {
      markConversationRead(selectedId).then(() => {
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
        )
      })
    }
  }, [selectedId, loadThread, conversations])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const supabase = createClient()
    const convChannel = supabase
      .channel(`inbox-conversations-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setConversations((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Conversation
              if (prev.some((c) => c.id === row.id)) return prev
              return [
                { ...row, contact: null, channel: null } as ConversationWithRelations,
                ...prev,
              ]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Conversation
              return prev.map((c) =>
                c.id === row.id ? ({ ...c, ...row } as ConversationWithRelations) : c
              )
            }
            if (payload.eventType === 'DELETE') {
              const row = payload.old as Conversation
              return prev.filter((c) => c.id !== row.id)
            }
            return prev
          })
        }
      )
      .subscribe()

    const msgChannel = supabase
      .channel(`inbox-messages-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            if (selectedId && row.conversation_id === selectedId) {
              return [...prev, row]
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(msgChannel)
    }
  }, [restaurantId, selectedId])

  function handleSend() {
    if (!selectedId || composer.trim().length === 0) return
    const body = composer
    startTransition(async () => {
      const res = await sendMessage({ conversationId: selectedId, body })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setComposer('')
      loadThread(selectedId)
    })
  }

  function handleChangeStatus(status: ConversationStatus) {
    if (!selectedId) return
    startTransition(async () => {
      const res = await updateConversationStatus({ conversationId: selectedId, status })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, status } : c))
      )
    })
  }

  function handleChangePriority(priority: ConversationPriority) {
    if (!selectedId) return
    startTransition(async () => {
      const res = await updateConversationPriority({
        conversationId: selectedId,
        priority,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, priority } : c))
      )
    })
  }

  function handleAssignToMe() {
    if (!selectedId) return
    startTransition(async () => {
      const res = await assignConversationToMe(selectedId)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleClassify() {
    if (!selectedId) return
    setShowActionsMenu(false)
    startTransition(async () => {
      const res = await classifyConversation(selectedId)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      if ('result' in res && res.result) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  ai_summary: res.result!.summary,
                  ai_intent: res.result!.intent,
                  ai_sentiment: res.result!.sentiment,
                }
              : c
          )
        )
      }
    })
  }

  function applyTemplate(template: MessageTemplate) {
    const name = selected?.contact?.display_name ?? 'cliente'
    setComposer(template.body.replace(/\{contact_name\}/g, name))
    setShowTemplatesPanel(false)
  }

  function formatRelative(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'agora'
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const days = Math.floor(h / 24)
    if (days < 7) return `${days}d`
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  function formatFullTime(d: string) {
    return new Date(d).toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function initials(name?: string | null) {
    if (!name) return '—'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] -mx-6 -mt-4">
      {/* Page header — typography only */}
      <header className="px-8 pt-6 pb-6 border-b border-night-lighter flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
            Inbox
          </h1>
          <p className="text-[13px] text-stone mt-2 tracking-tight">
            {conversations.length === 0
              ? 'Nenhuma conversa ainda'
              : `${filtered.length} de ${conversations.length} ${
                  conversations.length === 1 ? 'conversa' : 'conversas'
                }`}
          </p>
        </div>
        <button
          onClick={() => {
            setError(null)
            setShowNewModal(true)
          }}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Nova conversa
        </button>
      </header>

      <div className="flex-1 grid grid-cols-[340px_1fr] min-h-0">
        {/* LIST COLUMN */}
        <aside className="border-r border-night-lighter flex flex-col min-h-0">
          {/* Filter tabs */}
          <div className="px-5 pt-5 pb-3 flex items-center gap-5 border-b border-night-lighter">
            {STATUS_TABS.map((tab) => {
              const count =
                tab.id === 'all'
                  ? conversations.length
                  : conversations.filter((c) => c.status === tab.id).length
              const active = statusFilter === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    'relative text-[12px] font-medium tracking-tight transition-colors pb-2.5 -mb-2.5',
                    active
                      ? 'text-cloud'
                      : 'text-stone hover:text-stone-light'
                  )}
                >
                  {tab.label}
                  <span className="ml-1.5 text-[10px] font-data text-stone-dark">
                    {count}
                  </span>
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Search + channel filter */}
          <div className="px-5 py-3 border-b border-night-lighter space-y-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-8 px-0 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none"
            />
            {channels.length > 1 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
                className="w-full h-7 bg-transparent text-[11px] text-stone border-0 focus:outline-none cursor-pointer"
              >
                <option value="all">Todos os canais</option>
                {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-[13px] text-stone tracking-tight">
                  Nenhuma conversa aqui
                </p>
              </div>
            )}
            {filtered.map((conv) => {
              const channelLabel = conv.channel
                ? CHANNEL_LABEL[conv.channel.type]
                : null
              const isActive = conv.id === selectedId
              const hasUnread = conv.unread_count > 0
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    'w-full text-left px-5 py-4 border-b border-night-lighter/50 transition-colors relative group',
                    isActive ? 'bg-night-light/60' : 'hover:bg-night-light/30'
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-0 bottom-0 w-px bg-cloud" />
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-night-lighter flex items-center justify-center shrink-0 text-[10px] font-medium text-cloud tracking-tight">
                      {initials(conv.contact?.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'text-[13px] tracking-tight truncate',
                            hasUnread
                              ? 'font-semibold text-cloud'
                              : 'font-medium text-cloud'
                          )}
                        >
                          {conv.contact?.display_name ?? 'Contato'}
                        </span>
                        <span className="text-[10px] font-data text-stone-dark shrink-0">
                          {formatRelative(conv.last_message_at)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          'text-[12px] truncate mt-0.5',
                          hasUnread ? 'text-stone-light' : 'text-stone'
                        )}
                      >
                        {conv.last_message_preview ?? 'Sem mensagem'}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {channelLabel && (
                          <span className="text-[10px] text-stone-dark tracking-tight">
                            {channelLabel}
                          </span>
                        )}
                        {conv.priority === 'urgent' && (
                          <span className="text-[10px] text-primary tracking-tight font-medium">
                            · Urgente
                          </span>
                        )}
                        {conv.priority === 'high' && (
                          <span className="text-[10px] text-stone-light tracking-tight">
                            · Alta
                          </span>
                        )}
                        {hasUnread && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* THREAD COLUMN */}
        <section className="flex flex-col min-h-0 bg-bg">
          {!selected && <EmptyThread />}

          {selected && (
            <>
              {/* Thread header */}
              <div className="px-8 py-5 border-b border-night-lighter flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-night-lighter flex items-center justify-center shrink-0 text-[11px] font-medium text-cloud">
                    {initials(selected.contact?.display_name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[14px] font-medium text-cloud tracking-tight truncate leading-tight">
                      {selected.contact?.display_name ?? 'Contato'}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {selected.channel && (
                        <span className="text-[11px] text-stone tracking-tight">
                          {CHANNEL_LABEL[selected.channel.type]}
                        </span>
                      )}
                      <span className="text-stone-dark text-[11px]">·</span>
                      <span className="text-[11px] text-stone tracking-tight">
                        {STATUS_LABEL[selected.status]}
                      </span>
                      {selected.priority !== 'normal' && (
                        <>
                          <span className="text-stone-dark text-[11px]">·</span>
                          <span
                            className={cn(
                              'text-[11px] tracking-tight',
                              selected.priority === 'urgent'
                                ? 'text-primary'
                                : 'text-stone'
                            )}
                          >
                            {PRIORITY_LABEL[selected.priority]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowActionsMenu((v) => !v)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-stone-light hover:text-cloud hover:bg-night-light transition-colors"
                    aria-label="Acoes"
                  >
                    <MoreHorizontal size={16} strokeWidth={2} />
                  </button>
                  {showActionsMenu && (
                    <div
                      className="absolute right-0 top-10 w-56 bg-night-light border border-night-lighter rounded-lg overflow-hidden z-20"
                      onMouseLeave={() => setShowActionsMenu(false)}
                    >
                      <button
                        onClick={handleClassify}
                        className="w-full text-left px-3.5 py-2.5 text-[12px] text-cloud hover:bg-night-lighter transition-colors"
                      >
                        Classificar com IA
                      </button>
                      {!selected.assignee_id && (
                        <button
                          onClick={() => {
                            setShowActionsMenu(false)
                            handleAssignToMe()
                          }}
                          className="w-full text-left px-3.5 py-2.5 text-[12px] text-cloud hover:bg-night-lighter transition-colors border-t border-night-lighter"
                        >
                          Atribuir a mim
                        </button>
                      )}
                      <div className="border-t border-night-lighter px-3.5 pt-2.5 pb-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-stone-dark font-medium">
                          Prioridade
                        </span>
                      </div>
                      {(Object.keys(PRIORITY_LABEL) as ConversationPriority[]).map(
                        (p) => (
                          <button
                            key={p}
                            onClick={() => {
                              setShowActionsMenu(false)
                              handleChangePriority(p)
                            }}
                            className={cn(
                              'w-full text-left px-3.5 py-2 text-[12px] transition-colors flex items-center justify-between',
                              selected.priority === p
                                ? 'text-cloud bg-night-lighter/50'
                                : 'text-stone-light hover:bg-night-lighter hover:text-cloud'
                            )}
                          >
                            {PRIORITY_LABEL[p]}
                            {selected.priority === p && (
                              <span className="text-[10px] text-stone-dark">atual</span>
                            )}
                          </button>
                        )
                      )}
                      <div className="border-t border-night-lighter px-3.5 pt-2.5 pb-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-stone-dark font-medium">
                          Status
                        </span>
                      </div>
                      {(Object.keys(STATUS_LABEL) as ConversationStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setShowActionsMenu(false)
                            handleChangeStatus(s)
                          }}
                          className={cn(
                            'w-full text-left px-3.5 py-2 text-[12px] transition-colors flex items-center justify-between',
                            selected.status === s
                              ? 'text-cloud bg-night-lighter/50'
                              : 'text-stone-light hover:bg-night-lighter hover:text-cloud'
                          )}
                        >
                          {STATUS_LABEL[s]}
                          {selected.status === s && (
                            <span className="text-[10px] text-stone-dark">atual</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* AI summary banner */}
              {selected.ai_summary && (
                <div className="px-8 py-3.5 border-b border-night-lighter bg-night-light/30">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-stone-dark shrink-0">
                      Resumo IA
                    </span>
                    <p className="text-[12px] text-stone-light leading-relaxed tracking-tight">
                      {selected.ai_summary}
                    </p>
                  </div>
                  {(selected.ai_intent || selected.ai_sentiment) && (
                    <div className="flex items-center gap-3 mt-1.5 pl-[68px]">
                      {selected.ai_intent && (
                        <span className="text-[10px] text-stone tracking-tight">
                          {INTENT_LABEL[selected.ai_intent]}
                        </span>
                      )}
                      {selected.ai_intent && selected.ai_sentiment && (
                        <span className="text-stone-dark text-[10px]">·</span>
                      )}
                      {selected.ai_sentiment && (
                        <span
                          className={cn(
                            'text-[10px] tracking-tight',
                            selected.ai_sentiment === 'negative'
                              ? 'text-primary'
                              : 'text-stone'
                          )}
                        >
                          {SENTIMENT_LABEL[selected.ai_sentiment]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Thread body */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4 relative">
                <PresenceIndicator metadata={selected.metadata} />
                {loadingMessages && (
                  <div className="text-center text-[11px] text-stone tracking-tight py-6">
                    Carregando
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <div className="text-center text-[11px] text-stone tracking-tight py-6">
                    Conversa sem mensagens
                  </div>
                )}
                {messages.map((msg, i) => {
                  const outbound = msg.direction === 'outbound'
                  const system = msg.sender_type === 'system'
                  const prevMsg = messages[i - 1]
                  const showAuthor =
                    !prevMsg ||
                    prevMsg.direction !== msg.direction ||
                    new Date(msg.created_at).getTime() -
                      new Date(prevMsg.created_at).getTime() >
                      5 * 60 * 1000

                  if (system) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <span className="text-[10px] text-stone-dark tracking-tight">
                          {msg.body}
                        </span>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        outbound ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[62%]',
                          showAuthor ? 'mt-3' : 'mt-0.5'
                        )}
                      >
                        {Array.isArray(msg.attachments) &&
                          msg.attachments.length > 0 && (
                            <MessageAttachments
                              attachments={msg.attachments as MessageAttachment[]}
                              outbound={outbound}
                            />
                          )}
                        {msg.body && !isOnlyPlaceholderBody(msg.body) && (
                          <div
                            className={cn(
                              'rounded-lg px-3.5 py-2.5',
                              outbound
                                ? 'bg-cloud text-night'
                                : 'bg-night-light text-cloud border border-night-lighter'
                            )}
                          >
                            <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed tracking-tight">
                              {msg.body}
                            </p>
                          </div>
                        )}
                        <div
                          className={cn(
                            'mt-1 flex items-center gap-1.5 text-[10px] text-stone-dark font-data',
                            outbound ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <span>{formatFullTime(msg.created_at)}</span>
                          {outbound && msg.status === 'read' && <span>· lida</span>}
                          {outbound && msg.status === 'delivered' && (
                            <span>· entregue</span>
                          )}
                          {outbound && msg.status === 'sent' && <span>· enviada</span>}
                          {outbound && msg.status === 'pending' && (
                            <span>· enviando</span>
                          )}
                          {outbound && msg.status === 'failed' && (
                            <span className="text-primary">· falhou</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>

              {error && (
                <div className="mx-8 mb-3 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary flex items-center justify-between">
                  <span className="tracking-tight">{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="ml-3 text-primary/60 hover:text-primary"
                    aria-label="Fechar"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Composer */}
              <div className="border-t border-night-lighter px-8 py-4 relative">
                {showTemplatesPanel && templates.length > 0 && (
                  <div className="absolute bottom-full left-8 right-8 mb-2 bg-night-light border border-night-lighter rounded-lg overflow-hidden max-h-72 overflow-y-auto z-10">
                    <div className="px-3.5 py-2 border-b border-night-lighter flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-medium text-stone-dark">
                        Respostas rapidas
                      </span>
                      <button
                        onClick={() => setShowTemplatesPanel(false)}
                        className="text-stone hover:text-cloud"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-night-lighter transition-colors border-b border-night-lighter/50 last:border-0"
                      >
                        <div className="flex items-baseline justify-between gap-2 mb-0.5">
                          <span className="text-[12px] font-medium text-cloud tracking-tight">
                            {t.name}
                          </span>
                          {t.shortcut && (
                            <span className="text-[10px] font-data text-stone-dark">
                              {t.shortcut}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone line-clamp-2 tracking-tight">
                          {t.body}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-3">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={1}
                    placeholder="Escreva uma mensagem"
                    className="flex-1 resize-none bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none leading-relaxed tracking-tight min-h-[36px] max-h-32 py-2"
                  />
                  <div className="flex items-center gap-1">
                    {templates.length > 0 && (
                      <button
                        onClick={() => setShowTemplatesPanel((v) => !v)}
                        className="h-8 px-2.5 text-[11px] font-medium text-stone-light hover:text-cloud transition-colors rounded-md hover:bg-night-light tracking-tight"
                      >
                        Templates
                      </button>
                    )}
                    <button
                      onClick={handleSend}
                      disabled={pending || composer.trim().length === 0}
                      className="h-8 w-8 flex items-center justify-center bg-cloud text-night rounded-md hover:bg-cloud-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Enviar"
                    >
                      <Send size={13} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-stone-dark mt-2 font-data tracking-tight">
                  ⌘↵ para enviar
                </p>
              </div>
            </>
          )}
        </section>
      </div>

      {showNewModal && (
        <NewConversationModal
          channels={channels}
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false)
            setSelectedId(id)
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function EmptyThread() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <p className="text-[13px] text-stone tracking-tight">
        Selecione uma conversa
      </p>
      <p className="text-[11px] text-stone-dark mt-1.5 tracking-tight">
        As mensagens aparecem aqui em tempo real
      </p>
    </div>
  )
}

type MessageAttachment = {
  type: string
  url?: string
  mimeType?: string
  fileName?: string
  seconds?: number
  latitude?: number
  longitude?: number
  address?: string
  width?: number
  height?: number
  ptt?: boolean
  mirror_error?: string
  [key: string]: unknown
}

const PLACEHOLDER_BODIES = new Set([
  '[imagem]',
  '[audio]',
  '[video]',
  '[documento]',
  '[sticker]',
])
function isOnlyPlaceholderBody(body: string) {
  return PLACEHOLDER_BODIES.has(body.trim())
}

function MessageAttachments({
  attachments,
  outbound,
}: {
  attachments: MessageAttachment[]
  outbound: boolean
}) {
  return (
    <div className="space-y-1.5 mb-1">
      {attachments.map((att, i) => (
        <AttachmentItem key={i} att={att} outbound={outbound} />
      ))}
    </div>
  )
}

function AttachmentItem({
  att,
  outbound,
}: {
  att: MessageAttachment
  outbound: boolean
}) {
  if (att.mirror_error) {
    return (
      <div className="rounded-md border border-night-lighter px-3 py-2 text-[11px] text-stone tracking-tight">
        Midia indisponivel
      </div>
    )
  }

  if (att.type === 'image' && att.url) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.fileName ?? 'imagem'}
          className="max-w-full rounded-lg max-h-80 object-cover"
          loading="lazy"
        />
      </a>
    )
  }

  if (att.type === 'audio' && att.url) {
    return (
      <div
        className={cn(
          'rounded-md p-2.5',
          outbound
            ? 'bg-cloud/10'
            : 'bg-night-light border border-night-lighter'
        )}
      >
        <audio controls src={att.url} className="w-full h-8" />
      </div>
    )
  }

  if (att.type === 'video' && att.url) {
    return (
      <div className="rounded-lg overflow-hidden max-w-[320px]">
        <video
          controls
          src={att.url}
          className="w-full max-h-80 bg-black"
          preload="metadata"
        />
      </div>
    )
  }

  if (att.type === 'document' && att.url) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'block rounded-md px-3.5 py-2.5 transition-colors',
          outbound
            ? 'bg-cloud/10 hover:bg-cloud/15'
            : 'bg-night-light border border-night-lighter hover:border-stone-dark'
        )}
      >
        <p
          className={cn(
            'text-[12px] font-medium tracking-tight truncate',
            outbound ? 'text-night' : 'text-cloud'
          )}
        >
          {att.fileName ?? 'Documento'}
        </p>
        {att.mimeType && (
          <p
            className={cn(
              'text-[10px] font-data tracking-tight mt-0.5',
              outbound ? 'text-night/50' : 'text-stone-dark'
            )}
          >
            {att.mimeType.split('/')[1]?.toUpperCase() ?? att.mimeType}
          </p>
        )}
      </a>
    )
  }

  if (att.type === 'location' && att.latitude && att.longitude) {
    const mapsUrl = `https://maps.google.com/?q=${att.latitude},${att.longitude}`
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'block rounded-md px-3.5 py-2.5 transition-colors',
          outbound
            ? 'bg-cloud/10 hover:bg-cloud/15'
            : 'bg-night-light border border-night-lighter hover:border-stone-dark'
        )}
      >
        <p
          className={cn(
            'text-[12px] font-medium tracking-tight truncate',
            outbound ? 'text-night' : 'text-cloud'
          )}
        >
          {att.address ?? 'Localizacao'}
        </p>
        <p
          className={cn(
            'text-[10px] font-data tracking-tight mt-0.5',
            outbound ? 'text-night/50' : 'text-stone-dark'
          )}
        >
          {Number(att.latitude).toFixed(4)}, {Number(att.longitude).toFixed(4)}
        </p>
      </a>
    )
  }

  if (att.type === 'sticker' && att.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={att.url} alt="sticker" className="w-32 h-32 object-contain" />
    )
  }

  return (
    <div className="rounded-md border border-night-lighter px-3 py-2 text-[11px] text-stone tracking-tight">
      {att.fileName ?? att.type}
    </div>
  )
}

function PresenceIndicator({ metadata }: { metadata: Record<string, unknown> }) {
  const presence = (metadata?.presence ?? null) as
    | { status?: string; updated_at?: string; last_seen?: number | null }
    | null

  if (!presence || !presence.status) return null

  const updatedAt = presence.updated_at ? new Date(presence.updated_at).getTime() : 0
  const ageMs = Date.now() - updatedAt
  const fresh = ageMs < 30_000

  if (!fresh) return null
  if (presence.status !== 'COMPOSING' && presence.status !== 'RECORDING') return null

  const label =
    presence.status === 'COMPOSING' ? 'digitando' : 'gravando audio'

  return (
    <div className="sticky top-0 -mx-8 -mt-6 mb-4 px-8 py-2 bg-night/80 backdrop-blur-sm border-b border-night-lighter flex items-center gap-2 text-[11px] text-stone tracking-tight">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-stone-light animate-pulse" />
        <span
          className="w-1 h-1 rounded-full bg-stone-light animate-pulse"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-stone-light animate-pulse"
          style={{ animationDelay: '300ms' }}
        />
      </span>
      <span>{label}</span>
    </div>
  )
}

function NewConversationModal({
  channels,
  onClose,
  onCreated,
  onError,
}: {
  channels: Channel[]
  onClose: () => void
  onCreated: (id: string) => void
  onError: (msg: string) => void
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const [displayName, setDisplayName] = useState('')
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSave() {
    if (!channelId) {
      onError('Selecione um canal')
      return
    }
    startTransition(async () => {
      const res = await createManualConversation({ channelId, displayName, body })
      if ('error' in res && res.error) {
        onError(res.error)
        return
      }
      if ('conversationId' in res && res.conversationId) {
        onCreated(res.conversationId)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            Nova conversa
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-stone-dark mb-2">
              Canal
            </label>
            {channels.length === 0 ? (
              <p className="text-[12px] text-primary tracking-tight">
                Nenhum canal configurado. Crie um em Configuracoes.
              </p>
            ) : (
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {CHANNEL_LABEL[c.type] ?? c.type} — {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-stone-dark mb-2">
              Nome do contato
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Joao da Silva"
              className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-stone-dark mb-2">
              Primeira mensagem
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Escreva a mensagem inicial"
              className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark resize-none transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending || channels.length === 0}
              className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
            >
              {pending ? 'Criando' : 'Criar conversa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
