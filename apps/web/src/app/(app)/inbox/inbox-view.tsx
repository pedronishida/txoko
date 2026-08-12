'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useVirtualizer } from '@tanstack/react-virtual'
import type {
  Channel,
  ChannelType,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  ConversationWithRelations,
  Message,
  MessageTemplate,
} from '@txoko/shared'
import type { AiSuggestedReply } from '@txoko/shared'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  Copy,
  Crosshair,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Infinity as InfinityIcon,
  ListChecks,
  Loader2,
  MailWarning,
  MapPin,
  Mic,
  MoreHorizontal,
  Music,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Snowflake,
  Sparkle,
  Sparkles,
  Square,
  SquareUserRound,
  Tag,
  Thermometer,
  Trash2,
  Undo2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import {
  assignConversationToMe,
  assignConversationToUser,
  bulkApplyContactTag,
  bulkMarkRead,
  classifyConversation,
  deleteConversation,
  deleteOutboundMessage,
  generateSuggestedRepliesAction,
  getConversationMedia,
  getMessages,
  markConversationRead,
  markConversationUnread,
  respondConversationTransfer,
  sendAudioMessage,
  sendContactMessage,
  sendDocumentMessage,
  sendImageMessage,
  sendLocationMessage,
  sendMessage,
  sendMessageReaction,
  setConversationAiPauseMode,
  toggleConversationPin,
  transferConversation,
  updateConversationPriority,
  updateConversationStatus,
  uploadInboxMedia,
} from './actions'
import { enviarCardapio } from './share-menu-action'
import { getContactDetails } from './contact-actions'
import type { ContactDetails } from './contact-actions'
import { Toaster, toast } from '@/components/toaster'
import { ContactPanel } from '@/components/inbox/contact-panel'

// =============================================================
// Inbox — dashboard de conversas (Linear / Raycast vibe)
// Filtros laterais + lista virtualizada + thread + painel direito
// =============================================================

type StatusFilterValue = 'all' | 'open' | 'pending_agent' | 'resolved' | 'closed'
type PeriodFilterValue = 'all' | 'today' | '7d' | '30d' | '90d'

type FilterState = {
  status: StatusFilterValue
  channel: 'all' | ChannelType
  assignment: string
  priority: 'all' | ConversationPriority
  tag: string | null
  unreadOnly: boolean
  pausedOnly: boolean
  period: PeriodFilterValue
}

type TeamMember = {
  id: string
  email: string
  name?: string | null
  avatar_url?: string | null
}

// Campos novos de prod ainda nao presentes no tipo compartilhado
type InboxConversation = ConversationWithRelations & {
  is_pinned?: boolean | null
  ai_paused_until?: string | null
  ai_pause_mode?: string | null
}

const FILTERS_WIDTH_KEY = 'txoko_inbox_filters_width_v1'

const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp_zapi: 'WhatsApp',
  instagram: 'Instagram',
  facebook_messenger: 'Messenger',
  ifood_chat: 'iFood',
  google_reviews: 'Google',
  internal_qr: 'QR interno',
}

const DEFAULT_FILTERS: FilterState = {
  status: 'all',
  channel: 'all',
  assignment: 'all',
  priority: 'all',
  tag: null,
  unreadOnly: false,
  pausedOnly: false,
  period: 'all',
}

// =============================================================
// FiltersSidebar — coluna de filtros redimensionavel
// =============================================================

function FiltersSidebar({
  conversations,
  channels,
  users,
  currentUserId,
  value,
  onChange,
}: {
  conversations: InboxConversation[]
  channels: Array<Pick<Channel, 'id' | 'type' | 'name'>>
  users: TeamMember[]
  currentUserId: string | null
  value: FilterState
  onChange: (next: FilterState) => void
}) {
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 220
    const stored = localStorage.getItem(FILTERS_WIDTH_KEY)
    if (!stored) return 220
    const parsed = parseInt(stored, 10)
    return Number.isFinite(parsed) ? Math.max(52, Math.min(360, parsed)) : 220
  })
  const [collapsed, setCollapsed] = useState(width <= 53)
  const dragRef = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    localStorage.setItem(FILTERS_WIDTH_KEY, String(width))
  }, [width])

  const counts = {
    all: conversations.length,
    open: conversations.filter((c) => c.status === 'open').length,
    pending: conversations.filter(
      (c) => c.status === 'pending_agent' || c.status === 'pending_customer'
    ).length,
    resolved: conversations.filter((c) => c.status === 'resolved').length,
    closed: conversations.filter((c) => c.status === 'closed').length,
    paused: conversations.filter((c) => c.ai_paused).length,
    unread: conversations.filter((c) => c.unread_count > 0).length,
    mine: currentUserId
      ? conversations.filter((c) => c.assignee_id === currentUserId).length
      : 0,
    unassigned: conversations.filter((c) => !c.assignee_id).length,
  }

  const tagSet = new Set<string>()
  for (const conv of conversations) {
    for (const tag of conv.contact?.tags ?? []) tagSet.add(tag)
  }
  const allTags = Array.from(tagSet).sort()

  function setStatus(status: StatusFilterValue) {
    onChange({ ...value, status })
  }

  function setChannel(channel: 'all' | ChannelType) {
    onChange({ ...value, channel })
  }

  function setAssignment(assignment: string) {
    onChange({ ...value, assignment })
  }

  function setTag(tag: string | null) {
    onChange({ ...value, tag })
  }

  return (
    <aside
      style={{ width: collapsed ? 52 : width }}
      className="relative shrink-0 border-r border-[var(--border)] bg-bg flex flex-col min-h-0 transition-[width] duration-150 ease-out"
    >
      <div
        className={cn(
          'flex items-center h-12 px-3 border-b border-[var(--border)]',
          collapsed && 'justify-center'
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1">
            <Filter size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <span className="text-[12px] font-medium text-foreground tracking-tight">
              Filtros
            </span>
          </div>
        )}
        <button
          onClick={() => {
            if (collapsed) {
              setCollapsed(false)
              setWidth(220)
            } else {
              setCollapsed(true)
              setWidth(52)
            }
          }}
          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] transition-colors"
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--border-strong)] z-10"
          onPointerDown={(e) => {
            dragRef.current = { x: e.clientX, w: width }
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return
            const delta = e.clientX - dragRef.current.x
            const next = dragRef.current.w + delta
            if (next < 116) {
              setCollapsed(true)
              setWidth(52)
              return
            }
            setCollapsed(false)
            setWidth(Math.max(180, Math.min(360, next)))
          }}
          onPointerUp={(e) => {
            dragRef.current = null
            ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
          }}
        />
      )}

      <div className="flex-1 overflow-y-auto py-2">
        <FilterSection label="Status" collapsed={collapsed}>
          <FilterItem
            collapsed={collapsed}
            icon={<InboxIcon size={13} strokeWidth={1.75} />}
            label="Todas"
            count={counts.all}
            active={value.status === 'all'}
            onClick={() => setStatus('all')}
          />
          <FilterItem
            collapsed={collapsed}
            icon={<CircleDot size={13} strokeWidth={1.75} />}
            label="Abertas"
            count={counts.open}
            active={value.status === 'open'}
            onClick={() => setStatus('open')}
          />
          <FilterItem
            collapsed={collapsed}
            icon={<CircleDot size={13} strokeWidth={1.75} className="text-warning" />}
            label="Aguardando"
            count={counts.pending}
            active={value.status === 'pending_agent'}
            onClick={() => setStatus('pending_agent')}
          />
          <FilterItem
            collapsed={collapsed}
            icon={<CircleCheck size={13} strokeWidth={1.75} />}
            label="Resolvidas"
            count={counts.resolved}
            active={value.status === 'resolved'}
            onClick={() => setStatus('resolved')}
          />
          <FilterItem
            collapsed={collapsed}
            icon={<CircleX size={13} strokeWidth={1.75} />}
            label="Fechadas"
            count={counts.closed}
            active={value.status === 'closed'}
            onClick={() => setStatus('closed')}
          />
        </FilterSection>
        <FilterDivider collapsed={collapsed} />
        <FilterSection label="Rapido" collapsed={collapsed}>
          <QuickFilterItem
            collapsed={collapsed}
            label="Nao lidas"
            count={counts.unread}
            active={value.unreadOnly}
            onClick={() => {
              const next = !value.unreadOnly
              onChange({ ...value, unreadOnly: next })
            }}
          />
          <QuickFilterItem
            collapsed={collapsed}
            label="IA pausada"
            count={counts.paused}
            icon={<Pause size={12} strokeWidth={1.75} />}
            active={value.pausedOnly}
            onClick={() => {
              const next = !value.pausedOnly
              onChange({ ...value, pausedOnly: next })
            }}
          />
        </FilterSection>
        <FilterDivider collapsed={collapsed} />
        <FilterSection label="Atribuicao" collapsed={collapsed}>
          <FilterItem
            collapsed={collapsed}
            label="Todas"
            active={value.assignment === 'all'}
            onClick={() => setAssignment('all')}
          />
          {currentUserId && (
            <FilterItem
              collapsed={collapsed}
              label="Minhas"
              count={counts.mine}
              active={value.assignment === 'mine'}
              onClick={() => setAssignment('mine')}
            />
          )}
          <FilterItem
            collapsed={collapsed}
            label="Sem responsavel"
            count={counts.unassigned}
            active={value.assignment === 'unassigned'}
            onClick={() => setAssignment('unassigned')}
          />
          {!collapsed &&
            users.slice(0, 6).map((u) => {
              const count = conversations.filter((c) => c.assignee_id === u.id).length
              const label = u.name?.trim() || u.email.split('@')[0]
              return (
                <FilterItem
                  key={u.id}
                  collapsed={false}
                  label={label}
                  count={count}
                  active={value.assignment === u.id}
                  onClick={() => setAssignment(u.id)}
                />
              )
            })}
        </FilterSection>
        <FilterDivider collapsed={collapsed} />
        {channels.length > 1 && (
          <>
            <FilterSection label="Canal" collapsed={collapsed}>
              <FilterItem
                collapsed={collapsed}
                label="Todos"
                active={value.channel === 'all'}
                onClick={() => setChannel('all')}
              />
              {channels.map((channel) => (
                <FilterItem
                  key={channel.id}
                  collapsed={collapsed}
                  label={CHANNEL_LABEL[channel.type] ?? channel.type}
                  active={value.channel === channel.type}
                  onClick={() => setChannel(channel.type)}
                />
              ))}
            </FilterSection>
            <FilterDivider collapsed={collapsed} />
          </>
        )}
        <FilterSection label="Prioridade" collapsed={collapsed}>
          {(['all', 'urgent', 'high', 'normal', 'low'] as const).map((p) => (
            <FilterItem
              key={p}
              collapsed={collapsed}
              label={
                p === 'all'
                  ? 'Todas'
                  : p === 'urgent'
                    ? 'Urgente'
                    : p === 'high'
                      ? 'Alta'
                      : p === 'normal'
                        ? 'Normal'
                        : 'Baixa'
              }
              active={value.priority === p}
              onClick={() => {
                onChange({ ...value, priority: p })
              }}
              accent={p === 'urgent' ? 'primary' : p === 'high' ? 'warning' : undefined}
            />
          ))}
        </FilterSection>
        <FilterDivider collapsed={collapsed} />
        <FilterSection label="Periodo" collapsed={collapsed}>
          {(['all', 'today', '7d', '30d', '90d'] as const).map((p) => (
            <FilterItem
              key={p}
              collapsed={collapsed}
              label={
                p === 'all'
                  ? 'Sempre'
                  : p === 'today'
                    ? 'Hoje'
                    : p === '7d'
                      ? '7 dias'
                      : p === '30d'
                        ? '30 dias'
                        : '90 dias'
              }
              active={value.period === p}
              onClick={() => {
                onChange({ ...value, period: p })
              }}
            />
          ))}
        </FilterSection>
        {allTags.length > 0 && (
          <>
            <FilterDivider collapsed={collapsed} />
            <FilterSection label="Tags" collapsed={collapsed}>
              {!collapsed && (
                <div className="flex flex-wrap gap-1 px-3 pt-1 pb-2">
                  {value.tag && (
                    <button
                      onClick={() => setTag(null)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium border border-[var(--border)] text-muted-foreground hover:text-foreground"
                    >
                      Limpar
                    </button>
                  )}
                  {allTags.slice(0, 24).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setTag(tag === value.tag ? null : tag)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                        value.tag === tag
                          ? 'bg-foreground text-bg border-foreground'
                          : 'border-[var(--border)] text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              {collapsed && (
                <div className="flex flex-col items-center py-1">
                  <Tag size={13} strokeWidth={1.75} className="text-muted-foreground" />
                </div>
              )}
            </FilterSection>
          </>
        )}
      </div>
    </aside>
  )
}

function FilterSection({
  label,
  collapsed,
  children,
}: {
  label: string
  collapsed: boolean
  children: React.ReactNode
}) {
  return (
    <div className="px-1">
      {!collapsed && (
        <div className="px-2 pt-2 pb-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
        </div>
      )}
      <div className="space-y-px">{children}</div>
    </div>
  )
}

function FilterDivider({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('my-1 px-3', collapsed && 'px-1')}>
      <div className="border-t border-[var(--border)]" />
    </div>
  )
}

function FilterItem({
  collapsed,
  icon,
  label,
  count,
  active,
  onClick,
  accent,
}: {
  collapsed: boolean
  icon?: React.ReactNode
  label: string
  count?: number
  active: boolean
  onClick: () => void
  accent?: 'primary' | 'warning'
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          'w-full h-7 flex items-center justify-center rounded-md transition-colors',
          active
            ? 'bg-[var(--surface)] text-foreground'
            : 'text-muted-foreground hover:bg-[var(--surface)] hover:text-foreground'
        )}
      >
        {icon ?? <span className="text-[10px] font-medium">{label.charAt(0)}</span>}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 h-7 px-2 rounded-md text-[12px] tracking-tight transition-colors',
        active
          ? 'bg-[var(--surface)] text-foreground'
          : 'text-muted-foreground hover:bg-[var(--surface)] hover:text-foreground',
        accent === 'primary' && active && 'text-primary',
        accent === 'warning' && active && 'text-warning'
      )}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-[10px] font-data text-muted-foreground">{count}</span>
      )}
    </button>
  )
}

function QuickFilterItem({
  collapsed,
  label,
  count,
  icon,
  active,
  onClick,
}: {
  collapsed: boolean
  label: string
  count: number
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          'w-full h-7 flex items-center justify-center rounded-md transition-colors',
          active ? 'bg-foreground text-bg' : 'text-muted-foreground hover:bg-[var(--surface)]'
        )}
      >
        {icon ?? <span className="text-[10px] font-medium">{label.charAt(0)}</span>}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 h-7 px-2 rounded-md text-[12px] tracking-tight transition-colors',
        active
          ? 'bg-foreground text-bg'
          : 'text-muted-foreground hover:bg-[var(--surface)] hover:text-foreground'
      )}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-[10px] font-data opacity-70">{count}</span>
    </button>
  )
}

// =============================================================
// Lista de conversas — virtualizada
// =============================================================

const CHANNEL_SHORT_LABEL: Record<ChannelType, string> = {
  whatsapp_zapi: 'WhatsApp',
  instagram: 'Instagram',
  facebook_messenger: 'Messenger',
  ifood_chat: 'iFood',
  google_reviews: 'Google',
  internal_qr: 'QR',
}

function initials(name?: string | null) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function formatListRelative(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function ContactAvatar({ name, url }: { name?: string | null; url?: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? ''}
        className="w-9 h-9 rounded-full object-cover bg-[var(--surface)] shrink-0"
      />
    )
  }
  return (
    <div className="w-9 h-9 rounded-full bg-[var(--surface)] flex items-center justify-center text-[10px] font-medium text-foreground shrink-0">
      {initials(name)}
    </div>
  )
}

const ConversationRow = React.memo(function ConversationRow({
  conv,
  active,
  bulkMode,
  selected,
  onClick,
  onContextMenu,
  onToggleSelect,
}: {
  conv: InboxConversation
  active: boolean
  bulkMode: boolean
  selected: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleSelect: () => void
}) {
  const hasUnread = conv.unread_count > 0
  const channelLabel = conv.channel
    ? CHANNEL_SHORT_LABEL[conv.channel.type] ?? conv.channel.type
    : null
  const isPinned = conv.is_pinned ?? false
  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[var(--border)]/50',
        active ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]/60',
        selected && 'bg-primary/5'
      )}
      onClick={() => {
        if (bulkMode) onToggleSelect()
        else onClick()
      }}
    >
      {active && !bulkMode && (
        <span className="absolute left-0 top-0 bottom-0 w-px bg-foreground" aria-hidden />
      )}
      {bulkMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={cn(
            'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
            selected
              ? 'bg-foreground border-foreground text-bg'
              : 'border-[var(--border-strong)] hover:border-foreground'
          )}
          aria-label={selected ? 'Desmarcar' : 'Marcar'}
        >
          {selected && <Check size={11} strokeWidth={2.5} />}
        </button>
      )}
      <ContactAvatar name={conv.contact?.display_name} url={conv.contact?.avatar_url} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'flex-1 text-[13px] tracking-tight truncate',
              hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
            )}
          >
            {conv.contact?.display_name ?? 'Contato'}
          </span>
          {isPinned && (
            <Pin size={10} strokeWidth={1.75} className="text-muted-foreground shrink-0" />
          )}
          {conv.ai_paused && (
            <Pause size={10} strokeWidth={1.75} className="text-warning shrink-0" />
          )}
          <span className="text-[10px] font-data text-muted-foreground shrink-0">
            {formatListRelative(conv.last_message_at)}
          </span>
        </div>
        <p
          className={cn(
            'mt-0.5 text-[12px] truncate flex items-center gap-1',
            hasUnread ? 'text-foreground/80' : 'text-muted-foreground'
          )}
        >
          {conv.last_message_at && (
            <CheckCheck
              size={11}
              strokeWidth={1.75}
              className="text-muted-foreground/60 shrink-0"
              aria-hidden
            />
          )}
          <span className="flex-1 truncate">
            {conv.last_message_preview ?? 'Sem mensagem'}
          </span>
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {channelLabel && (
            <span className="text-[10px] text-muted-foreground tracking-tight">
              {channelLabel}
            </span>
          )}
          {conv.priority === 'urgent' && (
            <span className="text-[10px] text-destructive tracking-tight font-semibold">
              Urgente
            </span>
          )}
          {conv.priority === 'high' && (
            <span className="text-[10px] text-warning tracking-tight">Alta</span>
          )}
          {conv.contact?.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] text-muted-foreground tracking-tight">
              &middot; {tag}
            </span>
          ))}
          {hasUnread && (
            <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-data font-medium">
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

function ConversationList({
  conversations,
  selectedId,
  bulkMode,
  selectedIds,
  onSelect,
  onContextMenu,
  onToggleSelect,
}: {
  conversations: InboxConversation[]
  selectedId: string | null
  bulkMode: boolean
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onContextMenu: (id: string, e: React.MouseEvent) => void
  onToggleSelect: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 8,
    getItemKey: (index) => conversations[index]?.id ?? `idx-${index}`,
  })

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
        <p className="text-[13px] text-muted-foreground tracking-tight">
          Nenhuma conversa por aqui
        </p>
      </div>
    )
  }

  const items = virtualizer.getVirtualItems()
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div
        style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
      >
        {items.map((item) => {
          const conv = conversations[item.index]
          return conv ? (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <ConversationRow
                conv={conv}
                active={conv.id === selectedId}
                bulkMode={bulkMode}
                selected={selectedIds.has(conv.id)}
                onClick={() => onSelect(conv.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onContextMenu(conv.id, e)
                }}
                onToggleSelect={() => onToggleSelect(conv.id)}
              />
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

// =============================================================
// Context menu da lista de conversas
// =============================================================

function ConversationContextMenu({
  x,
  y,
  isPinned,
  hasUnread,
  onPin,
  onMarkUnread,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  isPinned: boolean
  hasUnread: boolean
  onPin: () => void
  onMarkUnread: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (rect.right > vw - 8) left = vw - rect.width - 8
    if (rect.bottom > vh - 8) top = vh - rect.height - 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [x, y])

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 w-52 rounded-md border border-[var(--border)] bg-bg shadow-lg py-1 text-[12px]"
    >
      <ContextMenuItem
        icon={
          isPinned ? (
            <PinOff size={13} strokeWidth={1.75} />
          ) : (
            <Pin size={13} strokeWidth={1.75} />
          )
        }
        label={isPinned ? 'Desafixar' : 'Fixar no topo'}
        onClick={() => {
          onPin()
          onClose()
        }}
      />
      <ContextMenuItem
        icon={<MailWarning size={13} strokeWidth={1.75} />}
        label={hasUnread ? 'Marcar como lida' : 'Marcar como nao lida'}
        onClick={() => {
          onMarkUnread()
          onClose()
        }}
      />
      <div className="my-1 border-t border-[var(--border)]" />
      <ContextMenuItem
        icon={<Trash2 size={13} strokeWidth={1.75} />}
        label="Excluir conversa"
        destructive
        onClick={() => {
          if (confirm('Excluir esta conversa? Ela sera arquivada.')) {
            onDelete()
            onClose()
          }
        }}
      />
    </div>
  )
}

function ContextMenuItem({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon?: React.ReactNode
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={
        'w-full flex items-center gap-2 px-3 py-1.5 text-left tracking-tight transition-colors ' +
        (destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-[var(--surface)]')
      }
    >
      {icon && <span className="opacity-80">{icon}</span>}
      <span>{label}</span>
    </button>
  )
}

// =============================================================
// ThreadHeader — cabecalho da conversa aberta
// =============================================================

const HEADER_CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp_zapi: 'WhatsApp',
  instagram: 'Instagram',
  facebook_messenger: 'Messenger',
  ifood_chat: 'iFood',
  google_reviews: 'Google',
  internal_qr: 'QR',
}

const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Aberta',
  pending_customer: 'Aguardando cliente',
  pending_agent: 'Aguardando atendente',
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

function ThreadHeader({
  conv,
  users,
  currentUserId,
  contactPanelOpen,
  onToggleContactPanel,
  onToggleSearch,
  onOpenTransfer,
}: {
  conv: InboxConversation
  users: TeamMember[]
  currentUserId: string | null
  contactPanelOpen: boolean
  onToggleContactPanel: () => void
  onToggleSearch: () => void
  onOpenTransfer: () => void
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false)
  const [, startTransition] = useTransition()
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const assigneeMenuRef = useRef<HTMLDivElement>(null)

  function handleAssign(userId: string | null) {
    setShowAssigneeMenu(false)
    startTransition(async () => {
      const res = await assignConversationToUser({ conversationId: conv.id, userId })
      if ('error' in res && res.error) {
        toast.error('Falha', { description: res.error })
      }
    })
  }

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
      if (assigneeMenuRef.current && !assigneeMenuRef.current.contains(e.target as Node)) {
        setShowAssigneeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const assignee = conv.assignee_id
    ? users.find((u) => u.id === conv.assignee_id)
    : null
  const channelLabel = conv.channel
    ? HEADER_CHANNEL_LABEL[conv.channel.type] ?? conv.channel.type
    : null

  return (
    <div className="h-14 border-b border-[var(--border)] flex items-center gap-3 px-4 sm:px-6">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {conv.contact?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={conv.contact.avatar_url}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-[var(--surface)]"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-[var(--surface)] flex items-center justify-center text-[11px] font-medium text-foreground">
            {initials(conv.contact?.display_name)}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-[14px] font-medium text-foreground tracking-tight truncate leading-tight">
            {conv.contact?.display_name ?? 'Contato'}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground tracking-tight">
            {channelLabel && <span>{channelLabel}</span>}
            <span>&middot;</span>
            <span>{STATUS_LABEL[conv.status]}</span>
            {conv.priority !== 'normal' && (
              <>
                <span>&middot;</span>
                <span
                  className={
                    conv.priority === 'urgent' ? 'text-destructive font-semibold' : ''
                  }
                >
                  {PRIORITY_LABEL[conv.priority]}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSearch}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] transition-colors"
          title="Buscar (Cmd+F)"
        >
          <Search size={14} strokeWidth={1.75} />
        </button>

        <div className="relative" ref={assigneeMenuRef}>
          <button
            onClick={() => setShowAssigneeMenu((v) => !v)}
            className={cn(
              'h-8 px-2 rounded-md inline-flex items-center gap-1.5 text-[11px] tracking-tight transition-colors',
              assignee
                ? 'bg-[var(--surface)] text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface)]'
            )}
            title="Responsavel"
          >
            <UserCheck size={13} strokeWidth={1.75} />
            <span className="max-w-[100px] truncate">
              {assignee
                ? assignee.name?.trim() || assignee.email.split('@')[0]
                : 'Sem responsavel'}
            </span>
          </button>
          {showAssigneeMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-md border border-[var(--border)] bg-bg shadow-lg py-1 text-[12px] z-30">
              {currentUserId && (
                <button
                  onClick={() => {
                    setShowAssigneeMenu(false)
                    startTransition(async () => {
                      const res = await assignConversationToMe(conv.id)
                      if ('error' in res && res.error) {
                        toast.error('Falha', { description: res.error })
                      }
                    })
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] text-foreground tracking-tight"
                >
                  Atribuir a mim
                </button>
              )}
              <button
                onClick={() => handleAssign(null)}
                className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] text-muted-foreground tracking-tight"
              >
                Remover responsavel
              </button>
              <div className="border-t border-[var(--border)] my-1" />
              <div className="max-h-48 overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAssign(u.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] text-foreground tracking-tight truncate"
                  >
                    {u.name?.trim() || u.email}
                  </button>
                ))}
              </div>
              <div className="border-t border-[var(--border)] my-1" />
              <button
                onClick={() => {
                  setShowAssigneeMenu(false)
                  onOpenTransfer()
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] text-foreground tracking-tight inline-flex items-center gap-2"
              >
                <ArrowRightLeft size={12} strokeWidth={1.75} />
                Transferir conversa...
              </button>
            </div>
          )}
        </div>

        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] transition-colors"
            title="Mais"
          >
            <MoreHorizontal size={14} strokeWidth={1.75} />
          </button>
          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-md border border-[var(--border)] bg-bg shadow-lg py-1 text-[12px] z-30">
              <MenuLabel>Status</MenuLabel>
              {(['open', 'pending_agent', 'resolved', 'closed'] as const).map((status) => (
                <MenuItem
                  key={status}
                  active={conv.status === status}
                  onClick={() => {
                    setShowMoreMenu(false)
                    startTransition(async () => {
                      const res = await updateConversationStatus({
                        conversationId: conv.id,
                        status,
                      })
                      if ('error' in res && res.error) {
                        toast.error('Falha', { description: res.error })
                      }
                    })
                  }}
                >
                  {STATUS_LABEL[status]}
                </MenuItem>
              ))}
              <MenuDivider />
              <MenuLabel>Prioridade</MenuLabel>
              {(['low', 'normal', 'high', 'urgent'] as const).map((priority) => (
                <MenuItem
                  key={priority}
                  active={conv.priority === priority}
                  onClick={() => {
                    setShowMoreMenu(false)
                    startTransition(async () => {
                      const res = await updateConversationPriority({
                        conversationId: conv.id,
                        priority,
                      })
                      if ('error' in res && res.error) {
                        toast.error('Falha', { description: res.error })
                      }
                    })
                  }}
                >
                  {PRIORITY_LABEL[priority]}
                </MenuItem>
              ))}
              <MenuDivider />
              <MenuItem
                icon={<Sparkles size={12} strokeWidth={1.75} />}
                onClick={() => {
                  setShowMoreMenu(false)
                  startTransition(async () => {
                    const res = await classifyConversation(conv.id)
                    if ('error' in res && res.error) {
                      toast.error('Falha', { description: res.error })
                    } else {
                      toast.success('IA classificou a conversa')
                    }
                  })
                }}
              >
                Classificar com IA
              </MenuItem>
              <MenuItem
                icon={<Tag size={12} strokeWidth={1.75} />}
                onClick={() => setShowMoreMenu(false)}
              >
                Editar tags
              </MenuItem>
            </div>
          )}
        </div>

        <button
          onClick={onToggleContactPanel}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-md transition-colors',
            contactPanelOpen
              ? 'bg-[var(--surface)] text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface)]'
          )}
          title={contactPanelOpen ? 'Ocultar painel' : 'Mostrar painel do contato'}
        >
          {contactPanelOpen ? (
            <PanelRightClose size={14} strokeWidth={1.75} />
          ) : (
            <PanelRightOpen size={14} strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  )
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </p>
  )
}

function MenuDivider() {
  return <div className="my-1 border-t border-[var(--border)]" />
}

function MenuItem({
  children,
  icon,
  active,
  onClick,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left tracking-tight transition-colors',
        active
          ? 'bg-[var(--surface)] text-foreground'
          : 'text-foreground hover:bg-[var(--surface)]'
      )}
    >
      {icon && <span className="opacity-80">{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  )
}

// =============================================================
// Mensagens — bolha, anexos, lista virtualizada
// =============================================================

type MessageAttachment = {
  type?: string
  url?: string
  caption?: string | null
  fileName?: string | null
  extension?: string | null
  title?: string | null
  address?: string | null
  latitude?: number
  longitude?: number
  contactName?: string | null
  contactPhone?: string | null
  [key: string]: unknown
}

type MessageMetadata = {
  deleted?: boolean
  edited?: boolean
  transcript?: string
  reactions?: Array<{ emoji: string }>
  [key: string]: unknown
}

type ReplyInfo = { senderLabel: string; body: string | null }

function MessageStatusTicks({ status }: { status: Message['status'] }) {
  if (status === 'pending') return <Clock size={11} strokeWidth={1.75} />
  if (status === 'sent') return <Check size={11} strokeWidth={1.75} />
  if (status === 'delivered') return <CheckCheck size={11} strokeWidth={1.75} />
  if (status === 'read') {
    return <CheckCheck size={11} strokeWidth={1.75} className="text-[var(--accent)]" />
  }
  if (status === 'failed') {
    return <AlertCircle size={11} strokeWidth={1.75} className="text-destructive" />
  }
  return null
}

function AttachmentView({ att, outbound }: { att: MessageAttachment; outbound: boolean }) {
  const kind = att.type ?? 'file'
  if (kind === 'image' && att.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={att.url}
        alt={att.caption ?? 'imagem'}
        className="rounded-md max-h-72 w-auto object-cover bg-[var(--bg-elevated)]"
      />
    )
  }
  if (kind === 'video' && att.url) {
    return <video src={att.url} controls className="rounded-md max-h-72" />
  }
  if (kind === 'audio' && att.url) {
    return (
      <div className="flex items-center gap-2 p-2 min-w-[200px]">
        <Music
          size={16}
          strokeWidth={1.75}
          className={outbound ? 'text-bg/80' : 'text-muted-foreground'}
        />
        <audio src={att.url} controls className="flex-1 h-8" />
      </div>
    )
  }
  if (kind === 'document' && att.url) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'flex items-center gap-2 p-2 rounded-md',
          outbound ? 'bg-bg/10 hover:bg-bg/20' : 'bg-bg/40 hover:bg-bg/60'
        )}
      >
        <FileText size={16} strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-tight truncate">
            {att.fileName ?? 'documento'}
          </p>
          {att.extension && (
            <p className="text-[10px] uppercase opacity-70 tracking-tight">
              {att.extension}
            </p>
          )}
        </div>
      </a>
    )
  }
  if (kind === 'location') {
    return (
      <div className="flex items-start gap-2 p-2">
        <MapPin size={16} strokeWidth={1.75} />
        <div className="text-[12px] tracking-tight min-w-0">
          {att.title && <p className="font-medium truncate">{att.title}</p>}
          {att.address && <p className="opacity-80 line-clamp-2">{att.address}</p>}
          {!att.title && !att.address && (
            <p className="font-data text-[11px] opacity-80">
              {att.latitude?.toFixed(5)}, {att.longitude?.toFixed(5)}
            </p>
          )}
        </div>
      </div>
    )
  }
  if (kind === 'contact') {
    return (
      <div className="flex items-center gap-2 p-2">
        <SquareUserRound size={16} strokeWidth={1.75} />
        <div className="text-[12px] tracking-tight">
          <p className="font-medium">{att.contactName}</p>
          {att.contactPhone && <p className="opacity-80 font-data">{att.contactPhone}</p>}
        </div>
      </div>
    )
  }
  return null
}

function isSameDay(a: string, b: string | null) {
  if (!b) return false
  const da = new Date(a)
  const db = new Date(b)
  return da.toDateString() === db.toDateString()
}

const MessageBubble = React.memo(function MessageBubble({
  msg,
  prevMsg,
  highlightQuery,
  isCurrentMatch,
  onContextMenu,
  onClickReply,
  resolveReply,
}: {
  msg: Message
  prevMsg: Message | null
  highlightQuery: string
  isCurrentMatch: boolean
  onContextMenu?: (e: React.MouseEvent) => void
  onClickReply?: (id: string) => void
  resolveReply?: (id: string) => ReplyInfo | null
}) {
  const outbound = msg.direction === 'outbound'
  const showDateSeparator = !isSameDay(msg.created_at, prevMsg?.created_at ?? null)
  const metadata = (msg.metadata ?? {}) as MessageMetadata
  const deleted = metadata.deleted === true
  const edited = metadata.edited === true
  const reactions = Array.isArray(metadata.reactions) ? metadata.reactions : []
  const attachments = Array.isArray(msg.attachments)
    ? (msg.attachments as MessageAttachment[])
    : []
  const replyInfo = msg.reply_to_id && resolveReply ? resolveReply(msg.reply_to_id) : null

  const bodyContent = useMemo(() => {
    if (deleted) {
      return (
        <span className="italic text-muted-foreground inline-flex items-center gap-1">
          <Trash2 size={11} strokeWidth={1.75} />
          Mensagem apagada
        </span>
      )
    }
    if (!msg.body) return null
    if (!highlightQuery || highlightQuery.trim().length === 0) return msg.body
    const query = highlightQuery.trim()
    const lowerBody = msg.body.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const parts: React.ReactNode[] = []
    let cursor = 0
    let key = 0
    while (cursor < msg.body.length) {
      const idx = lowerBody.indexOf(lowerQuery, cursor)
      if (idx < 0) {
        parts.push(<span key={key++}>{msg.body.slice(cursor)}</span>)
        break
      }
      if (idx > cursor) {
        parts.push(<span key={key++}>{msg.body.slice(cursor, idx)}</span>)
      }
      parts.push(
        <mark
          key={key++}
          className={cn(
            'rounded px-0.5',
            isCurrentMatch
              ? 'bg-primary/30 text-foreground'
              : 'bg-warning/30 text-foreground'
          )}
        >
          {msg.body.slice(idx, idx + query.length)}
        </mark>
      )
      cursor = idx + query.length
    }
    return parts
  }, [msg.body, highlightQuery, isCurrentMatch, deleted])

  return (
    <div className="px-6">
      {showDateSeparator && (
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {new Date(msg.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>
      )}
      <div className={cn('flex mb-2', outbound ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'group/bubble max-w-[78%] rounded-lg overflow-hidden',
            outbound ? 'bg-foreground text-bg' : 'bg-[var(--surface)] text-foreground'
          )}
          onContextMenu={(e) => {
            e.preventDefault()
            onContextMenu?.(e)
          }}
        >
          {replyInfo && (
            <button
              onClick={() => msg.reply_to_id && onClickReply?.(msg.reply_to_id)}
              className={cn(
                'block w-full text-left px-3 pt-2 pb-1 border-l-2',
                outbound ? 'border-bg/50 bg-bg/10' : 'border-foreground/30 bg-bg/40'
              )}
            >
              <p className="text-[10px] uppercase tracking-[0.06em] opacity-70">
                {replyInfo.senderLabel}
              </p>
              <p className="text-[12px] line-clamp-2 opacity-80 tracking-tight">
                {replyInfo.body && replyInfo.body.trim().length > 0
                  ? replyInfo.body
                  : 'Anexo'}
              </p>
            </button>
          )}
          {!deleted && attachments.length > 0 && (
            <div className={cn('p-1', msg.body ? 'pb-0' : '')}>
              {attachments.map((att, i) => (
                <AttachmentView key={i} att={att} outbound={outbound} />
              ))}
            </div>
          )}
          {(bodyContent || metadata.transcript) && (
            <div className="px-3 py-2">
              {bodyContent && (
                <p className="text-[13px] tracking-tight whitespace-pre-wrap break-words">
                  {bodyContent}
                </p>
              )}
              {metadata.transcript && !deleted && (
                <p
                  className={cn(
                    'text-[11px] mt-1.5 italic tracking-tight',
                    outbound ? 'text-bg/70' : 'text-muted-foreground'
                  )}
                >
                  &ldquo;{metadata.transcript}&rdquo;
                </p>
              )}
            </div>
          )}
          <div
            className={cn(
              'flex items-center gap-1 px-3 pb-1.5 text-[10px] font-data tabular-nums',
              outbound ? 'text-bg/60 justify-end' : 'text-muted-foreground'
            )}
          >
            {edited && (
              <span className="inline-flex items-center gap-0.5">
                <Pencil size={9} strokeWidth={1.75} />
                editada
              </span>
            )}
            <span>
              {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {outbound && <MessageStatusTicks status={msg.status} />}
          </div>
        </div>
      </div>
      {reactions.length > 0 && (
        <div className={cn('flex gap-1 mb-3 -mt-1', outbound ? 'justify-end pr-2' : 'pl-2')}>
          {Object.entries(
            reactions.reduce<Record<string, number>>((acc, r) => {
              acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
              return acc
            }, {})
          ).map(([emoji, count]) => (
            <span
              key={emoji}
              className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[11px] bg-bg border border-[var(--border)]"
            >
              <span>{emoji}</span>
              {count > 1 && (
                <span className="font-data text-muted-foreground">{count}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

function MessageList({
  messages,
  highlightQuery,
  currentMatchId,
  onContextMenu,
  onClickReply,
  resolveReply,
}: {
  messages: Message[]
  highlightQuery: string
  currentMatchId: string | null
  onContextMenu?: (msg: Message, e: React.MouseEvent) => void
  onClickReply?: (id: string) => void
  resolveReply?: (id: string) => ReplyInfo | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const isAtBottomRef = useRef(true)
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 12,
    getItemKey: (index) => messages[index]?.id ?? `idx-${index}`,
  })

  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.id !== lastMessageIdRef.current) {
      const hadPrevious = lastMessageIdRef.current !== null
      lastMessageIdRef.current = last.id
      if (!hadPrevious) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
        return
      }
      if (isAtBottomRef.current) {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: 'end',
          behavior: 'smooth',
        })
      }
    }
  }, [messages, virtualizer])

  useEffect(() => {
    if (!currentMatchId) return
    const index = messages.findIndex((m) => m.id === currentMatchId)
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
    }
  }, [currentMatchId, messages, virtualizer])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12 text-center">
        <p className="text-[13px] text-muted-foreground tracking-tight">
          Nenhuma mensagem ainda
        </p>
      </div>
    )
  }

  const items = virtualizer.getVirtualItems()
  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 200
      }}
      className="flex-1 overflow-y-auto py-4"
    >
      <div
        style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
      >
        {items.map((item) => {
          const msg = messages[item.index]
          if (!msg) return null
          const prevMsg = item.index > 0 ? messages[item.index - 1] ?? null : null
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <MessageBubble
                msg={msg}
                prevMsg={prevMsg}
                highlightQuery={highlightQuery}
                isCurrentMatch={msg.id === currentMatchId}
                onContextMenu={(e) => onContextMenu?.(msg, e)}
                onClickReply={onClickReply}
                resolveReply={resolveReply}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================
// Context menu de mensagem + reacoes
// =============================================================

function MessageContextMenu({
  x,
  y,
  canDelete,
  hasBody,
  onReply,
  onReact,
  onCopy,
  onDeleteForMe,
  onDeleteForAll,
  onForward,
  onClose,
}: {
  x: number
  y: number
  canDelete: boolean
  hasBody: boolean
  onReply: () => void
  onReact: () => void
  onCopy: () => void
  onDeleteForMe: () => void
  onDeleteForAll: () => void
  onForward: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (rect.right > vw - 8) left = vw - rect.width - 8
    if (rect.bottom > vh - 8) top = vh - rect.height - 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [x, y])

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 w-48 rounded-md border border-[var(--border)] bg-bg shadow-lg py-1 text-[12px]"
    >
      <MessageMenuItem
        icon={<Reply size={13} strokeWidth={1.75} />}
        label="Responder"
        onClick={() => {
          onReply()
          onClose()
        }}
      />
      <MessageMenuItem
        icon={<Smile size={13} strokeWidth={1.75} />}
        label="Reagir"
        onClick={() => {
          onReact()
          onClose()
        }}
      />
      {hasBody && (
        <MessageMenuItem
          icon={<Copy size={13} strokeWidth={1.75} />}
          label="Copiar texto"
          onClick={() => {
            onCopy()
            onClose()
          }}
        />
      )}
      <MessageMenuItem
        icon={<ArrowRight size={13} strokeWidth={1.75} />}
        label="Encaminhar"
        onClick={() => {
          onForward()
          onClose()
        }}
      />
      {canDelete && (
        <>
          <div className="my-1 border-t border-[var(--border)]" />
          <MessageMenuItem
            icon={<Trash2 size={13} strokeWidth={1.75} />}
            label="Apagar para mim"
            onClick={() => {
              onDeleteForMe()
              onClose()
            }}
          />
          <MessageMenuItem
            icon={<Trash2 size={13} strokeWidth={1.75} />}
            label="Apagar para todos"
            destructive
            onClick={() => {
              if (
                confirm(
                  'Apagar mensagem para todos? Esta acao remove no WhatsApp do destinatario.'
                )
              ) {
                onDeleteForAll()
                onClose()
              }
            }}
          />
        </>
      )}
    </div>
  )
}

function MessageMenuItem({
  icon,
  label,
  destructive,
  onClick,
}: {
  icon?: React.ReactNode
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={
        'w-full flex items-center gap-2 px-3 py-1.5 text-left tracking-tight transition-colors ' +
        (destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-[var(--surface)]')
      }
    >
      {icon && <span className="opacity-80">{icon}</span>}
      <span>{label}</span>
    </button>
  )
}

const QUICK_REACTIONS = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}']
const MORE_REACTIONS = [
  '\u{1F600}', '\u{1F605}', '\u{1F923}', '\u{1F60A}', '\u{1F60D}', '\u{1F914}', '\u{1F929}', '\u{1F928}',
  '\u{1F610}', '\u{1F611}', '\u{1F62C}', '\u{1F644}', '\u{1F60F}', '\u{1F634}', '\u{1F924}', '\u{1F910}',
  '\u{1F92F}', '\u{1F631}', '\u{1F975}', '\u{1F976}', '\u{1F921}', '\u{1F4A9}', '\u{1F47B}', '\u{1F480}',
  '\u{1F916}', '\u{1F389}', '\u{1F38A}', '\u{1F525}', '\u{1F4AF}', '✨', '⭐', '\u{1F49A}',
  '\u{1F44F}', '\u{1F64C}', '\u{1F44C}', '\u{1F91D}', '\u{1FAF6}', '\u{1F4AA}', '\u{1F9BE}', '\u{1F440}',
  '\u{1F9E0}', '❤️‍\u{1F525}', '\u{1F973}', '\u{1F60E}', '\u{1F91E}', '✌️',
  '\u{1F91F}', '\u{1F919}',
]

function ReactionPicker({
  onPick,
  onClose,
  anchorX,
  anchorY,
}: {
  onPick: (emoji: string) => void
  onClose: () => void
  anchorX: number
  anchorY: number
}) {
  const [showMore, setShowMore] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const el = pickerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = anchorX
    let top = anchorY
    if (rect.right > vw - 8) left = vw - rect.width - 8
    if (rect.bottom > vh - 8) top = vh - rect.height - 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [anchorX, anchorY, showMore])

  return (
    <div
      ref={pickerRef}
      style={{ left: anchorX, top: anchorY }}
      className="fixed z-50 rounded-full border border-[var(--border)] bg-bg shadow-lg flex items-center gap-1 p-1.5"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onPick(emoji)
            onClose()
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface)] text-lg transition-transform hover:scale-110"
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={() => setShowMore((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface)] text-muted-foreground"
        title="Mais"
      >
        <span className="text-[13px]">{'＋'}</span>
      </button>
      {showMore && (
        <div className="absolute top-full mt-1 right-0 w-72 max-h-60 overflow-y-auto bg-bg border border-[var(--border)] rounded-md p-2 grid grid-cols-8 gap-1 shadow-lg">
          {MORE_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onPick(emoji)
                onClose()
              }}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--surface)] text-base"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================
// Rascunhos persistidos em localStorage
// =============================================================

const DRAFTS_KEY = 'txoko_inbox_drafts_v1'
const DRAFT_MAX_AGE_MS = 6048e5 // 7 dias

type DraftEntry = { body: string; replyToId: string | null; updatedAt: number }

function hasLocalStorage() {
  return typeof localStorage !== 'undefined'
}

function readDrafts(): Record<string, DraftEntry> {
  if (!hasLocalStorage()) return {}
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, DraftEntry>
  } catch {
    return {}
  }
}

function writeDrafts(drafts: Record<string, DraftEntry>) {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // quota cheia — ignora
  }
}

function pruneDrafts(drafts: Record<string, DraftEntry>): Record<string, DraftEntry> {
  const now = Date.now()
  const pruned: Record<string, DraftEntry> = {}
  for (const [id, entry] of Object.entries(drafts)) {
    if (now - entry.updatedAt < DRAFT_MAX_AGE_MS) pruned[id] = entry
  }
  return pruned
}

function loadDraft(conversationId: string | null): DraftEntry | null {
  if (!conversationId) return null
  const pruned = pruneDrafts(readDrafts())
  writeDrafts(pruned)
  return pruned[conversationId] ?? null
}

function saveDraft(
  conversationId: string | null,
  body: string,
  replyToId: string | null = null
) {
  if (!conversationId) return
  const drafts = readDrafts()
  if (body.trim().length !== 0 || replyToId) {
    drafts[conversationId] = { body, replyToId, updatedAt: Date.now() }
  } else {
    delete drafts[conversationId]
  }
  writeDrafts(drafts)
}

function clearDraft(conversationId: string | null) {
  if (!conversationId) return
  const drafts = readDrafts()
  if (conversationId in drafts) {
    delete drafts[conversationId]
    writeDrafts(drafts)
  }
}

// =============================================================
// Deteccao de tipo de arquivo + formatacao
// =============================================================

const IMAGE_MIME_PREFIXES = ['image/']
const VIDEO_MIME_PREFIXES = ['video/']
const AUDIO_MIME_PREFIXES = ['audio/']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.mkv', '.avi']
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.ogg', '.opus', '.wav', '.aac']

type FileKind = 'image' | 'video' | 'audio' | 'document'

function detectFileKind(file: File): FileKind {
  const mime = file.type.toLowerCase()
  if (IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p))) return 'image'
  if (VIDEO_MIME_PREFIXES.some((p) => mime.startsWith(p))) return 'video'
  if (AUDIO_MIME_PREFIXES.some((p) => mime.startsWith(p))) return 'audio'
  const name = file.name.toLowerCase()
  if (IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'image'
  if (VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'video'
  if (AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'audio'
  return 'document'
}

function fileExtension(file: File): string {
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1)
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(units.length - 1, Math.floor(Math.log10(size) / 3))
  const value = size / 10 ** (3 * idx)
  return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

// =============================================================
// Composer — preview de resposta, anexos, gravacao, envio
// =============================================================

function ReplyPreview({
  senderLabel,
  body,
  onCancel,
}: {
  senderLabel: string
  body: string | null
  onCancel: () => void
}) {
  return (
    <div className="flex items-stretch gap-2 mb-2 rounded-md border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="w-1 bg-foreground" aria-hidden />
      <div className="flex-1 py-1.5 pl-1 pr-2 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          Respondendo a {senderLabel}
        </p>
        <p className="text-[12px] text-foreground line-clamp-2 mt-0.5 tracking-tight">
          {body && body.trim().length > 0 ? (
            body
          ) : (
            <span className="italic text-muted-foreground">Anexo</span>
          )}
        </p>
      </div>
      <button
        onClick={onCancel}
        className="px-2 text-muted-foreground hover:text-foreground"
        aria-label="Cancelar resposta"
      >
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  )
}

function AttachMenu({
  open,
  onClose,
  onPickImage,
  onPickDocument,
  onRecordAudio,
  onPickLocation,
  onPickContact,
}: {
  open: boolean
  onClose: () => void
  onPickImage: () => void
  onPickDocument: () => void
  onRecordAudio: () => void
  onPickLocation: () => void
  onPickContact: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      ref={menuRef}
      className="absolute bottom-full mb-2 left-0 z-30 w-56 rounded-md border border-[var(--border)] bg-bg shadow-lg py-1 text-[12px]"
    >
      <AttachMenuItem
        icon={<ImageIcon size={14} strokeWidth={1.75} />}
        label="Imagem ou video"
        onClick={() => {
          onPickImage()
          onClose()
        }}
      />
      <AttachMenuItem
        icon={<FileText size={14} strokeWidth={1.75} />}
        label="Documento"
        onClick={() => {
          onPickDocument()
          onClose()
        }}
      />
      <AttachMenuItem
        icon={<Mic size={14} strokeWidth={1.75} />}
        label="Gravar audio"
        onClick={() => {
          onRecordAudio()
          onClose()
        }}
      />
      <AttachMenuItem
        icon={<MapPin size={14} strokeWidth={1.75} />}
        label="Localizacao"
        onClick={() => {
          onPickLocation()
          onClose()
        }}
      />
      <AttachMenuItem
        icon={<SquareUserRound size={14} strokeWidth={1.75} />}
        label="Contato"
        onClick={() => {
          onPickContact()
          onClose()
        }}
      />
    </div>
  )
}

function AttachButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        'w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] transition-colors ' +
        (open ? 'bg-[var(--surface)] text-foreground' : '')
      }
      title="Anexar"
    >
      <Paperclip size={15} strokeWidth={1.75} />
    </button>
  )
}

function AttachMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-foreground hover:bg-[var(--surface)] transition-colors text-left"
    >
      <span className="opacity-80">{icon}</span>
      <span className="tracking-tight">{label}</span>
    </button>
  )
}

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
]

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function AudioRecorderBar({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (blob: Blob, mime: string, seconds: number) => Promise<void>
}) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [mime, setMime] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)

  async function handleSubmit() {
    if (blob) {
      setSending(true)
      try {
        await onSubmit(blob, mime || 'audio/webm', elapsed)
      } finally {
        setSending(false)
      }
    }
  }

  function handleDiscard() {
    setBlob(null)
    setElapsed(0)
    chunksRef.current = []
    onCancel()
  }

  useEffect(() => {
    let active = true
    async function start() {
      setError(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const supportedMime = AUDIO_MIME_CANDIDATES.find((m) =>
          MediaRecorder.isTypeSupported(m)
        )
        if (!supportedMime) {
          setError('Navegador nao suporta gravacao de audio')
          return
        }
        setMime(supportedMime)
        const recorder = new MediaRecorder(stream, { mimeType: supportedMime })
        chunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.onstop = () => {
          const recorded = new Blob(chunksRef.current, { type: supportedMime })
          setBlob(recorded)
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        recorderRef.current = recorder
        recorder.start(250)
        startedAtRef.current = Date.now()
        setRecording(true)
        timerRef.current = setInterval(() => {
          setElapsed((Date.now() - startedAtRef.current) / 1000)
        }, 200)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha no microfone')
      }
    }
    start()
    return () => {
      active = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (error) {
    return (
      <div className="border-y border-[var(--border)] bg-destructive/5 px-4 py-2 flex items-center gap-2 text-[12px] text-destructive">
        <AlertTriangle size={13} strokeWidth={1.75} />
        <span className="flex-1 tracking-tight">{error}</span>
        <button onClick={onCancel} className="text-destructive">
          Fechar
        </button>
      </div>
    )
  }

  return (
    <div className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-2 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" aria-hidden />
      <span className="text-[12px] text-foreground tracking-tight">
        {recording ? 'Gravando' : blob ? 'Pronto para enviar' : 'Iniciando...'}
      </span>
      <span className="text-[12px] font-data text-muted-foreground tabular-nums">
        {formatRecordingTime(elapsed)}
      </span>
      <div className="flex-1" />
      {recording && (
        <button
          onClick={() => {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              recorderRef.current.stop()
            }
            if (timerRef.current) clearInterval(timerRef.current)
            setRecording(false)
          }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border)] bg-bg hover:bg-[var(--surface)] text-[12px] text-foreground tracking-tight"
        >
          <Square size={12} strokeWidth={1.75} />
          Parar
        </button>
      )}
      {!recording && blob && (
        <>
          <button
            onClick={handleDiscard}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-[12px] tracking-tight"
          >
            <Trash2 size={12} strokeWidth={1.75} />
            Descartar
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-foreground text-bg text-[12px] font-medium tracking-tight disabled:opacity-50"
          >
            <Send size={12} strokeWidth={2} />
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </>
      )}
      {recording && (
        <button
          onClick={handleDiscard}
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Cancelar"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

function RecordAudioButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Gravar audio"
      className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] transition-colors"
    >
      <Mic size={15} strokeWidth={1.75} />
    </button>
  )
}

type ShareableContact = { id: string; display_name: string; phone: string | null }

function ShareContactModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (contact: { name: string; phone: string }) => void
}) {
  const [contacts, setContacts] = useState<ShareableContact[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('id, display_name, phone:contact_identities(external_id)')
        .limit(200)
      if (cancelled) return
      setContacts(
        (data ?? []).map((row) => ({
          id: row.id,
          display_name: row.display_name,
          phone:
            Array.isArray(row.phone) && row.phone[0]?.external_id
              ? row.phone[0].external_id
              : null,
        }))
      )
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const filtered = contacts.filter((c) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return c.display_name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-bg border border-[var(--border)] rounded-t-xl sm:rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-[13px] font-medium text-foreground tracking-tight flex items-center gap-2">
            <SquareUserRound size={14} strokeWidth={1.75} />
            Compartilhar contato
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="p-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 px-2 py-1.5 border border-[var(--border)] rounded-md">
            <Search size={13} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contato"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <p className="p-4 text-[12px] text-muted-foreground text-center">
              Carregando...
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="p-4 text-[12px] text-muted-foreground text-center">
              Nenhum contato
            </p>
          )}
          {!loading &&
            filtered.map((contact) => (
              <button
                key={contact.id}
                onClick={() => {
                  if (contact.phone) {
                    onPick({ name: contact.display_name, phone: contact.phone })
                    onClose()
                  }
                }}
                disabled={!contact.phone}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface)] text-left disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--surface)] flex items-center justify-center text-[10px] font-medium text-foreground">
                  {contact.display_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0] ?? '')
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-foreground tracking-tight truncate">
                    {contact.display_name}
                  </p>
                  {contact.phone && (
                    <p className="text-[11px] text-muted-foreground font-data">
                      {contact.phone}
                    </p>
                  )}
                </div>
              </button>
            ))}
        </div>
        <div className="border-t border-[var(--border)] p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            Manual
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Nome"
              className="h-9 px-2.5 border border-[var(--border)] rounded-md bg-bg text-[13px] focus:outline-none focus:border-[var(--border-strong)]"
            />
            <input
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              placeholder="Telefone"
              className="h-9 px-2.5 border border-[var(--border)] rounded-md bg-bg text-[13px] font-data focus:outline-none focus:border-[var(--border-strong)]"
            />
          </div>
          <button
            onClick={() => {
              if (manualName.trim() && manualPhone.trim()) {
                onPick({ name: manualName.trim(), phone: manualPhone.replace(/\D/g, '') })
                onClose()
              }
            }}
            disabled={!manualName.trim() || !manualPhone.trim()}
            className="w-full h-9 bg-foreground text-bg rounded-md text-[12px] font-medium tracking-tight disabled:opacity-50"
          >
            Compartilhar
          </button>
        </div>
      </div>
    </div>
  )
}

type LocationPayload = {
  latitude: number
  longitude: number
  title?: string
  address?: string
}

function ShareLocationModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (loc: LocationPayload) => void
}) {
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-bg border border-[var(--border)] rounded-t-xl sm:rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-[13px] font-medium text-foreground tracking-tight flex items-center gap-2">
            <MapPin size={14} strokeWidth={1.75} />
            Compartilhar localizacao
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <button
            onClick={() => {
              setError(null)
              setLocating(true)
              if (typeof navigator === 'undefined' || !navigator.geolocation) {
                setError('Geolocalizacao nao disponivel')
                setLocating(false)
                return
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setLatitude(pos.coords.latitude.toFixed(7))
                  setLongitude(pos.coords.longitude.toFixed(7))
                  setLocating(false)
                },
                (err) => {
                  setError(err.message ?? 'Falha ao obter localizacao')
                  setLocating(false)
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
              )
            }}
            disabled={locating}
            className="w-full inline-flex items-center justify-center gap-2 h-10 border border-[var(--border)] rounded-md text-[12px] text-foreground hover:bg-[var(--surface)] tracking-tight disabled:opacity-50"
          >
            <Crosshair size={13} strokeWidth={1.75} />
            {locating ? 'Obtendo...' : 'Usar minha localizacao'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <LabeledField
              label="Latitude"
              value={latitude}
              onChange={setLatitude}
              placeholder="-23.5505"
              mono
            />
            <LabeledField
              label="Longitude"
              value={longitude}
              onChange={setLongitude}
              placeholder="-46.6333"
              mono
            />
          </div>
          <LabeledField
            label="Titulo (opcional)"
            value={title}
            onChange={setTitle}
            placeholder="Restaurante"
          />
          <LabeledField
            label="Endereco (opcional)"
            value={address}
            onChange={setAddress}
            placeholder="Rua X, 123"
          />
          {error && (
            <p className="text-[12px] text-destructive tracking-tight">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="h-9 px-3 text-[12px] text-muted-foreground hover:text-foreground tracking-tight"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const lat = Number(latitude)
                const lng = Number(longitude)
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                  setError('Coordenadas invalidas')
                  return
                }
                if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                  setError('Coordenadas fora do intervalo')
                  return
                }
                onPick({
                  latitude: lat,
                  longitude: lng,
                  title: title.trim() || undefined,
                  address: address.trim() || undefined,
                })
                onClose()
              }}
              className="h-9 px-3 bg-foreground text-bg rounded-md text-[12px] font-medium tracking-tight"
            >
              Compartilhar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          'w-full h-9 px-2.5 border border-[var(--border)] rounded-md bg-bg text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--border-strong)] ' +
          (mono ? 'font-data' : '')
        }
      />
    </label>
  )
}

function SendFilesPreview({
  open,
  files,
  onCancel,
  onSubmit,
}: {
  open: boolean
  files: File[]
  onCancel: () => void
  onSubmit: (files: File[], caption: string) => Promise<void>
}) {
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCaption('')
      setError(null)
    }
  }, [open, files])

  if (!open || files.length === 0) return null

  const first = files[0]!
  const kind = detectFileKind(first)
  const previewUrl =
    kind === 'image' || kind === 'video' ? URL.createObjectURL(first) : null

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      await onSubmit(files, caption)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg bg-bg border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-[13px] font-medium text-foreground tracking-tight">
            Enviar {files.length === 1 ? '1 arquivo' : `${files.length} arquivos`}
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="p-6 bg-[var(--surface)] flex items-center justify-center min-h-[220px] max-h-[420px]">
          {kind === 'image' && previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={first.name}
              className="max-h-[400px] rounded-md object-contain"
            />
          )}
          {kind === 'video' && previewUrl && (
            <video src={previewUrl} controls className="max-h-[400px] rounded-md" />
          )}
          {kind === 'audio' && (
            <div className="flex flex-col items-center gap-3">
              <Music size={36} strokeWidth={1.25} className="text-muted-foreground" />
              <p className="text-[13px] text-foreground tracking-tight">{first.name}</p>
            </div>
          )}
          {kind === 'document' && (
            <div className="flex flex-col items-center gap-3">
              <FileText size={36} strokeWidth={1.25} className="text-muted-foreground" />
              <p className="text-[13px] text-foreground tracking-tight">{first.name}</p>
            </div>
          )}
        </div>
        {files.length > 1 && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-bg max-h-32 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-2 py-1 text-[12px] text-foreground tracking-tight"
              >
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-muted-foreground font-data">
                  {formatBytes(file.size)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 space-y-3">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Adicionar legenda (opcional)"
            disabled={kind === 'audio'}
            className="w-full h-10 px-3 border border-[var(--border)] rounded-md bg-bg text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--border-strong)] disabled:bg-[var(--surface)]"
          />
          {error && <p className="text-[12px] text-destructive tracking-tight">{error}</p>}
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground font-data tracking-tight">
              {formatBytes(first.size)} &middot; {kind}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={sending}
                className="h-9 px-3 text-[12px] text-muted-foreground hover:text-foreground tracking-tight disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="inline-flex items-center gap-1.5 h-9 px-3 bg-foreground text-bg rounded-md text-[12px] font-medium tracking-tight disabled:opacity-50"
              >
                <Send size={12} strokeWidth={2} />
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read fail'))
    reader.readAsDataURL(file)
  })
}

const MAX_FILE_SIZE_BYTES = 0x1900000 // 25MB

function Composer({
  conversationId,
  templates,
  replyTo,
  resolveSender,
  onClearReply,
  pendingFiles = [],
  onFilesConsumed,
  lastIncomingMsgId,
  isGroup,
}: {
  conversationId: string
  templates: MessageTemplate[]
  replyTo: Message | null
  resolveSender: (msg: Message) => string
  onClearReply: () => void
  pendingFiles?: File[]
  onFilesConsumed?: () => void
  lastIncomingMsgId: string | null
  isGroup: boolean
}) {
  const [body, setBody] = useState('')
  const [sending, startSendTransition] = useTransition()
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [filesToSend, setFilesToSend] = useState<File[]>([])
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [suggestions, setSuggestions] = useState<AiSuggestedReply[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [sendingMenu, setSendingMenu] = useState(false)
  const suggestionsForMsgIdRef = useRef<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const draft = loadDraft(conversationId)
    setBody(draft?.body ?? '')
    setSuggestions([])
    suggestionsForMsgIdRef.current = null
    setShowShortcuts(false)
  }, [conversationId])

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      saveDraft(conversationId, body, replyTo?.id ?? null)
    }, 350)
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [body, replyTo, conversationId])

  useEffect(() => {
    if (pendingFiles.length > 0) {
      setFilesToSend(pendingFiles)
      onFilesConsumed?.()
    }
  }, [pendingFiles, onFilesConsumed])

  const handleSend = useCallback(() => {
    const trimmed = body.trim()
    if (trimmed.length === 0) return
    const replyToId = replyTo?.id ?? null
    startSendTransition(async () => {
      const res = await sendMessage({ conversationId, body: trimmed, replyToId })
      if ('error' in res && res.error) {
        toast.error('Falha ao enviar', { description: res.error })
        return
      }
      setBody('')
      clearDraft(conversationId)
      onClearReply()
      setSuggestions([])
    })
  }, [body, conversationId, replyTo, onClearReply])

  async function handleSuggest() {
    setLoadingSuggestions(true)
    setSuggestions([])
    const res = await generateSuggestedRepliesAction(conversationId)
    setLoadingSuggestions(false)
    if ('error' in res && res.error) {
      toast.error('Sugestoes indisponiveis', { description: res.error })
      return
    }
    if ('suggestions' in res && Array.isArray(res.suggestions)) {
      setSuggestions(res.suggestions)
      suggestionsForMsgIdRef.current = lastIncomingMsgId
    }
  }

  async function handleSendMenu() {
    if (sendingMenu) return
    setSendingMenu(true)
    const trimmed = body.trim()
    const res = await enviarCardapio({
      conversationId,
      caption: trimmed.length > 0 ? trimmed : undefined,
    })
    setSendingMenu(false)
    if ('error' in res && res.error) {
      toast.error('Nao consegui enviar o cardapio', { description: res.error })
      return
    }
    setBody('')
    clearDraft(conversationId)
    toast.success('Cardapio enviado', {
      description: 'O link curto trackeavel foi enviado pro cliente.',
    })
  }

  async function uploadAndSendFiles(files: File[], caption: string) {
    const tasks = files.map(async (file) => {
      if (file.size > MAX_FILE_SIZE_BYTES) throw new Error(`${file.name} excede 25MB`)
      const kind = detectFileKind(file)
      const base64 = await fileToDataUrl(file)
      const uploaded = await uploadInboxMedia({
        fileName: file.name,
        base64,
        mime: file.type || undefined,
      })
      if ('error' in uploaded && uploaded.error) throw new Error(uploaded.error)
      const url = uploaded.url
      if (!url) throw new Error('Upload sem URL')
      if (kind === 'image' || kind === 'video') {
        const res = await sendImageMessage({
          conversationId,
          imageUrl: url,
          caption: caption || undefined,
          replyToId: replyTo?.id,
          fileName: file.name,
        })
        if ('error' in res && res.error) throw new Error(res.error)
      } else if (kind === 'audio') {
        const res = await sendAudioMessage({
          conversationId,
          audioUrl: url,
          ptt: true,
        })
        if ('error' in res && res.error) throw new Error(res.error)
      } else {
        const extension = fileExtension(file) || 'bin'
        const res = await sendDocumentMessage({
          conversationId,
          documentUrl: url,
          fileName: file.name,
          extension,
          caption: caption || undefined,
          replyToId: replyTo?.id,
        })
        if ('error' in res && res.error) throw new Error(res.error)
      }
    })
    await Promise.all(tasks)
  }

  async function handleSendFiles(files: File[], caption: string) {
    try {
      await uploadAndSendFiles(files, caption)
      setFilesToSend([])
      onClearReply()
      toast.success(
        `${files.length === 1 ? 'Arquivo enviado' : `${files.length} arquivos enviados`}`
      )
    } catch (err) {
      toast.error('Falha no envio', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleSendAudio(blob: Blob, mime: string) {
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: mime })
    try {
      await uploadAndSendFiles([file], '')
      toast.success('Audio enviado')
      setShowRecorder(false)
    } catch (err) {
      toast.error('Falha ao enviar audio', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleSendContact({ name, phone }: { name: string; phone: string }) {
    const res = await sendContactMessage({
      conversationId,
      contactName: name,
      contactPhone: phone,
    })
    if ('error' in res && res.error) {
      toast.error('Falha ao enviar contato', { description: res.error })
      return
    }
    toast.success('Contato enviado')
  }

  async function handleSendLocation(loc: LocationPayload) {
    const res = await sendLocationMessage({ conversationId, ...loc })
    if ('error' in res && res.error) {
      toast.error('Falha ao enviar localizacao', { description: res.error })
      return
    }
    toast.success('Localizacao enviada')
  }

  useEffect(() => {
    if (
      lastIncomingMsgId &&
      suggestionsForMsgIdRef.current &&
      suggestionsForMsgIdRef.current !== lastIncomingMsgId
    ) {
      setSuggestions([])
      suggestionsForMsgIdRef.current = null
    }
  }, [lastIncomingMsgId])

  return (
    <div className="border-t border-[var(--border)] bg-bg">
      {(loadingSuggestions || suggestions.length > 0) && !isGroup && (
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-start gap-2 overflow-x-auto">
          {loadingSuggestions ? (
            <span className="text-[12px] text-muted-foreground inline-flex items-center gap-2 tracking-tight">
              <Loader2 size={13} className="animate-spin" />
              Gerando sugestoes...
            </span>
          ) : (
            suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => {
                  setBody(suggestion.text)
                  setSuggestions([])
                  textareaRef.current?.focus()
                }}
                className="shrink-0 px-3 py-1.5 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[12px] text-foreground tracking-tight max-w-xs truncate"
                title={suggestion.text}
              >
                {suggestion.text}
              </button>
            ))
          )}
        </div>
      )}
      {showShortcuts && templates.length > 0 && (
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-2 overflow-x-auto">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setBody(template.body)
                setShowShortcuts(false)
                textareaRef.current?.focus()
              }}
              className="shrink-0 px-2.5 py-1 rounded-md border border-[var(--border)] hover:border-[var(--border-strong)] text-[11px] text-foreground tracking-tight"
              title={template.body}
            >
              <span className="font-medium">
                {template.shortcut ? `/${template.shortcut}` : template.name}
              </span>
            </button>
          ))}
        </div>
      )}
      {showRecorder && (
        <AudioRecorderBar
          onCancel={() => setShowRecorder(false)}
          onSubmit={async (blob, mime) => handleSendAudio(blob, mime)}
        />
      )}
      <div className="p-3">
        {replyTo && (
          <ReplyPreview
            senderLabel={resolveSender(replyTo)}
            body={replyTo.body ?? null}
            onCancel={onClearReply}
          />
        )}
        <div className="flex items-end gap-1.5">
          <div className="relative">
            <AttachButton
              open={attachMenuOpen}
              onToggle={() => setAttachMenuOpen((v) => !v)}
            />
            <AttachMenu
              open={attachMenuOpen}
              onClose={() => setAttachMenuOpen(false)}
              onPickImage={() => {
                imageInputRef.current?.click()
              }}
              onPickDocument={() => {
                documentInputRef.current?.click()
              }}
              onRecordAudio={() => setShowRecorder(true)}
              onPickLocation={() => setShowLocationModal(true)}
              onPickContact={() => setShowContactModal(true)}
            />
          </div>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Mensagem..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none px-2 py-2.5 max-h-40"
            style={{ lineHeight: '1.5' }}
          />
          {templates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowShortcuts((v) => !v)}
              className={cn(
                'h-9 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] tracking-tight',
                showShortcuts && 'bg-[var(--surface)] text-foreground'
              )}
              title="Atalhos"
            >
              /
            </button>
          )}
          {!isGroup && (
            <button
              type="button"
              onClick={handleSuggest}
              disabled={loadingSuggestions || !lastIncomingMsgId}
              className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
              title="Sugerir resposta com IA"
            >
              <Sparkles size={15} strokeWidth={1.75} />
            </button>
          )}
          {!isGroup && (
            <button
              type="button"
              onClick={handleSendMenu}
              disabled={sendingMenu}
              className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--surface)] disabled:opacity-30 transition-colors"
              title="Enviar cardapio (link curto trackeavel)"
            >
              {sendingMenu ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <BookOpen size={15} strokeWidth={1.75} />
              )}
            </button>
          )}
          <RecordAudioButton onClick={() => setShowRecorder(true)} />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || body.trim().length === 0}
            className="h-9 w-9 flex items-center justify-center rounded-md bg-foreground text-bg disabled:opacity-30 hover:opacity-90 transition-opacity"
            title="Enviar"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 0) setFilesToSend(files)
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 0) setFilesToSend(files)
        }}
      />
      <SendFilesPreview
        open={filesToSend.length > 0}
        files={filesToSend}
        onCancel={() => setFilesToSend([])}
        onSubmit={handleSendFiles}
      />
      <ShareContactModal
        open={showContactModal}
        onClose={() => setShowContactModal(false)}
        onPick={handleSendContact}
      />
      <ShareLocationModal
        open={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onPick={handleSendLocation}
      />
    </div>
  )
}

// =============================================================
// Busca na conversa
// =============================================================

function ThreadSearchBar({
  query,
  onQueryChange,
  matches,
  currentIndex,
  onPrev,
  onNext,
  onClose,
}: {
  query: string
  onQueryChange: (value: string) => void
  matches: number
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 flex items-center gap-2">
      <Search size={14} strokeWidth={1.75} className="text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') {
            if (e.shiftKey) onPrev()
            else onNext()
          }
        }}
        placeholder="Buscar na conversa"
        className="flex-1 h-7 bg-transparent border-0 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <span className="text-[11px] font-data text-muted-foreground tabular-nums">
        {matches > 0 ? `${currentIndex + 1} de ${matches}` : '0 de 0'}
      </span>
      <button
        onClick={onPrev}
        disabled={matches === 0}
        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-bg disabled:opacity-30"
        title="Anterior (Shift+Enter)"
      >
        <ArrowUp size={13} strokeWidth={1.75} />
      </button>
      <button
        onClick={onNext}
        disabled={matches === 0}
        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-bg disabled:opacity-30"
        title="Proximo (Enter)"
      >
        <ArrowDown size={13} strokeWidth={1.75} />
      </button>
      <button
        onClick={onClose}
        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-bg"
        title="Fechar (Esc)"
      >
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  )
}

// =============================================================
// Barra de acoes em massa
// =============================================================

function BulkActionsBar({
  selectedConversationIds,
  selectedContactIds,
  totalVisible,
  onSelectAll,
  onClear,
}: {
  selectedConversationIds: string[]
  selectedContactIds: string[]
  totalVisible: number
  onSelectAll: () => void
  onClear: () => void
}) {
  const [tagName, setTagName] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [pending, startTransition] = useTransition()

  if (selectedConversationIds.length === 0) return null

  function handleApplyTag() {
    const tag = tagName.trim()
    if (!tag) return
    startTransition(async () => {
      const res = await bulkApplyContactTag({ contactIds: selectedContactIds, tag })
      if ('error' in res && res.error) {
        toast.error('Falha ao aplicar tag', { description: res.error })
        return
      }
      toast.success(`Tag "${tag}" aplicada em ${res.count ?? 0} contatos`)
      setTagName('')
      setShowTagInput(false)
      onClear()
    })
  }

  return (
    <div className="border-y border-[var(--border)] bg-[var(--surface)] px-3 py-2 flex items-center gap-2 text-[12px]">
      <span className="font-medium text-foreground tracking-tight">
        {selectedConversationIds.length} selecionada
        {selectedConversationIds.length === 1 ? '' : 's'}
      </span>
      {selectedConversationIds.length < totalVisible && (
        <button
          onClick={onSelectAll}
          className="text-muted-foreground hover:text-foreground tracking-tight inline-flex items-center gap-1"
        >
          <ListChecks size={12} strokeWidth={1.75} />
          Selecionar todas ({totalVisible})
        </button>
      )}
      <div className="flex-1" />
      <button
        onClick={() => {
          startTransition(async () => {
            const res = await bulkMarkRead({ conversationIds: selectedConversationIds })
            if ('error' in res && res.error) {
              toast.error('Falha ao marcar como lidas', { description: res.error })
              return
            }
            toast.success(`${selectedConversationIds.length} marcadas como lidas`)
            onClear()
          })
        }}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-foreground hover:bg-bg transition-colors disabled:opacity-50"
      >
        <CheckCheck size={13} strokeWidth={1.75} />
        Marcar lidas
      </button>
      {showTagInput ? (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyTag()
              if (e.key === 'Escape') {
                setShowTagInput(false)
                setTagName('')
              }
            }}
            placeholder="Nome da tag"
            className="h-7 px-2 rounded-md border border-[var(--border)] bg-bg text-[12px] focus:outline-none focus:border-[var(--border-strong)]"
          />
          <button
            onClick={handleApplyTag}
            disabled={pending || !tagName.trim()}
            className="h-7 px-2.5 bg-foreground text-bg rounded-md tracking-tight disabled:opacity-50"
          >
            Aplicar
          </button>
          <button
            onClick={() => {
              setShowTagInput(false)
              setTagName('')
            }}
            className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowTagInput(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-foreground hover:bg-bg transition-colors"
        >
          <Tag size={13} strokeWidth={1.75} />
          Aplicar tag
        </button>
      )}
      <button
        onClick={onClear}
        className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Limpar selecao"
      >
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  )
}

// =============================================================
// DropZone — arrastar arquivos para enviar
// =============================================================

function DropZone({
  onFiles,
  children,
  disabled,
}: {
  onFiles: (files: File[]) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)

  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files')
  }

  useEffect(() => {
    if (disabled) {
      setDragging(false)
      dragDepthRef.current = 0
    }
  }, [disabled])

  return (
    <div
      onDragEnter={(e) => {
        if (!disabled && hasFiles(e)) {
          e.preventDefault()
          dragDepthRef.current += 1
          setDragging(true)
        }
      }}
      onDragOver={(e) => {
        if (!disabled && hasFiles(e)) {
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={(e) => {
        if (!disabled && hasFiles(e)) {
          e.preventDefault()
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragging(false)
        }
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return
        e.preventDefault()
        dragDepthRef.current = 0
        setDragging(false)
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length > 0) onFiles(files)
      }}
      className="relative h-full"
    >
      {children}
      {dragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/85 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-foreground/40 rounded-xl py-16 px-12 text-center">
            <Upload size={28} strokeWidth={1.5} className="mx-auto text-foreground/70" />
            <p className="mt-3 text-[14px] font-medium text-foreground tracking-tight">
              Solte arquivos para enviar
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground tracking-tight">
              Imagens, documentos ou audio
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================
// Transferencia de conversa
// =============================================================

function TransferModal({
  open,
  onClose,
  conversationId,
  users,
  currentUserId,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
  users: TeamMember[]
  currentUserId: string | null
}) {
  const [query, setQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) return null

  const candidates = users
    .filter((u) => u.id !== currentUserId)
    .filter((u) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        (u.name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      )
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-bg border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-[13px] font-medium text-foreground tracking-tight inline-flex items-center gap-2">
            <ArrowRightLeft size={14} strokeWidth={1.75} />
            Transferir conversa
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="p-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 px-2 py-1.5 border border-[var(--border)] rounded-md">
            <Search size={13} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pessoa do time"
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {candidates.length === 0 && (
            <p className="p-4 text-center text-[12px] text-muted-foreground">
              Ninguem disponivel.
            </p>
          )}
          {candidates.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              className={
                'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface)] transition-colors ' +
                (selectedUserId === u.id ? 'bg-[var(--surface)]' : '')
              }
            >
              <div className="w-8 h-8 rounded-full bg-[var(--surface-hover)] flex items-center justify-center text-[10px] font-medium text-foreground">
                {(u.name ?? u.email)
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0] ?? '')
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-foreground tracking-tight truncate">
                  {u.name?.trim() || u.email}
                </p>
                <p className="text-[11px] text-muted-foreground tracking-tight truncate">
                  {u.email}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--border)] space-y-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Motivo (opcional)"
            className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-bg text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[var(--border-strong)] resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="h-9 px-3 text-[12px] text-muted-foreground hover:text-foreground tracking-tight"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (!selectedUserId) return
                startTransition(async () => {
                  const res = await transferConversation({
                    conversationId,
                    toUserId: selectedUserId,
                    reason: reason.trim() || undefined,
                  })
                  if ('error' in res && res.error) {
                    toast.error('Falha ao transferir', { description: res.error })
                    return
                  }
                  toast.success('Transferencia enviada')
                  onClose()
                })
              }}
              disabled={!selectedUserId || pending}
              className="h-9 px-3 bg-foreground text-bg rounded-md text-[12px] font-medium tracking-tight disabled:opacity-50"
            >
              {pending ? 'Enviando...' : 'Transferir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type PendingTransfer = {
  id: string
  conversation_id: string
  from_user_id: string
  to_user_id: string
  status: string
  reason: string | null
  created_at: string
  from_user: { name: string | null; email: string | null } | null
}

function TransferBanner({
  conversationId,
  currentUserId,
  onAccepted,
}: {
  conversationId: string
  currentUserId: string | null
  onAccepted?: () => void
}) {
  const [transfer, setTransfer] = useState<PendingTransfer | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('conversation_transfers')
        .select(
          'id, conversation_id, from_user_id, to_user_id, status, reason, created_at, from_user:users!conversation_transfers_from_user_id_fkey(name, email)'
        )
        .eq('conversation_id', conversationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const row = data ?? null
      if (!row) {
        setTransfer(null)
        return
      }
      const fromUser = Array.isArray(row.from_user)
        ? row.from_user[0] ?? null
        : row.from_user ?? null
      setTransfer({
        id: row.id,
        conversation_id: row.conversation_id,
        from_user_id: row.from_user_id,
        to_user_id: row.to_user_id,
        status: row.status,
        reason: row.reason,
        created_at: row.created_at,
        from_user: fromUser,
      })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  if (!transfer) return null
  const isRecipient = transfer.to_user_id === currentUserId
  const isSender = transfer.from_user_id === currentUserId
  if (!isRecipient && !isSender) return null

  function handleDecision(decision: 'accept' | 'reject' | 'revert') {
    startTransition(async () => {
      const res = await respondConversationTransfer({
        transferId: transfer!.id,
        decision,
      })
      if ('error' in res && res.error) {
        toast.error('Falha', { description: res.error })
        return
      }
      if (decision === 'accept') {
        toast.success('Transferencia aceita')
        onAccepted?.()
      } else if (decision === 'reject') {
        toast.message('Transferencia recusada')
      } else {
        toast.message('Transferencia revertida')
      }
      setTransfer(null)
    })
  }

  const fromLabel =
    transfer.from_user?.name?.trim() ||
    transfer.from_user?.email?.split('@')[0] ||
    'colega'

  return (
    <div className="border-b border-warning/20 bg-warning/5 px-4 py-2 flex items-center gap-3">
      <ArrowRightLeft size={13} strokeWidth={1.75} className="text-warning shrink-0" />
      <div className="flex-1 min-w-0 text-[12px] tracking-tight">
        {isRecipient ? (
          <>
            <span className="text-foreground font-medium">{fromLabel}</span>
            <span className="text-muted-foreground">
              {' '}
              transferiu esta conversa para voce
            </span>
            {transfer.reason && (
              <span className="block text-[11px] text-muted-foreground italic">
                &ldquo;{transfer.reason}&rdquo;
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            Aguardando aceite da transferencia
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isRecipient && (
          <>
            <button
              onClick={() => handleDecision('accept')}
              disabled={pending}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-foreground text-bg text-[11px] font-medium tracking-tight disabled:opacity-50"
            >
              <Check size={11} strokeWidth={2} />
              Aceitar
            </button>
            <button
              onClick={() => handleDecision('reject')}
              disabled={pending}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-bg text-[11px] tracking-tight disabled:opacity-50"
            >
              <X size={11} strokeWidth={1.75} />
              Recusar
            </button>
          </>
        )}
        {isSender && (
          <button
            onClick={() => handleDecision('revert')}
            disabled={pending}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-bg text-[11px] tracking-tight disabled:opacity-50"
          >
            <Undo2 size={11} strokeWidth={1.75} />
            Reverter
          </button>
        )}
      </div>
    </div>
  )
}

// =============================================================
// Engajamento do contato
// =============================================================

type EngagementScore = {
  total: number
  recency: number
  frequency: number
  volume: number
  responseRate: number
  label: string
  daysSinceLast: number
  totalMessages: number
}

const ENGAGEMENT_CONFIG = {
  hot: { label: 'Quente', icon: Flame, color: 'text-destructive' },
  warm: { label: 'Morno', icon: Thermometer, color: 'text-warning' },
  cold: { label: 'Frio', icon: Snowflake, color: 'text-muted-foreground' },
  new: { label: 'Novo', icon: Sparkle, color: 'text-success' },
}

function EngagementCard({
  conversationId,
  contactId,
}: {
  conversationId: string
  contactId: string
}) {
  const [score, setScore] = useState<EngagementScore | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      const oneYearAgo = new Date(Date.now() - 31536e6).toISOString()
      const { data, error } = await supabase
        .from('messages')
        .select('id, direction, created_at')
        .eq('conversation_id', conversationId)
        .gte('created_at', oneYearAgo)
        .order('created_at', { ascending: false })
        .limit(500)
      if (cancelled || error) {
        if (!cancelled) {
          setScore(null)
          setLoading(false)
        }
        return
      }
      const rows = data ?? []
      if (rows.length === 0) {
        setScore({
          total: 5,
          recency: 0,
          frequency: 0,
          volume: 0,
          responseRate: 0,
          label: 'Novo',
          daysSinceLast: 999,
          totalMessages: 0,
        })
        setLoading(false)
        return
      }
      const newest = new Date(rows[0]!.created_at).getTime()
      const daysSinceLast = Math.floor((Date.now() - newest) / 864e5)
      const recency = Math.max(0, 40 - Math.min(40, (daysSinceLast / 60) * 40))
      const sixtyDaysAgo = Date.now() - 5184e6
      const activeDays = new Set<string>()
      for (const row of rows) {
        if (new Date(row.created_at).getTime() < sixtyDaysAgo) continue
        activeDays.add(new Date(row.created_at).toDateString())
      }
      const frequency = Math.min(30, activeDays.size)
      const volume = Math.min(20, rows.length / 5)
      const inboundCount = rows.filter((r) => r.direction === 'inbound').length
      const outboundCount = rows.filter((r) => r.direction === 'outbound').length
      const responseRate =
        inboundCount > 0 ? Math.min(10, (outboundCount / inboundCount) * 10) : 0
      const total = Math.round(recency + frequency + volume + responseRate)
      const label =
        rows.length <= 3 ? 'Novo' : total >= 70 ? 'Quente' : total >= 40 ? 'Morno' : 'Frio'
      if (!cancelled) {
        setScore({
          total,
          recency: Math.round(recency),
          frequency: Math.round(frequency),
          volume: Math.round(volume),
          responseRate: Math.round(responseRate),
          label,
          daysSinceLast,
          totalMessages: rows.length,
        })
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [conversationId, contactId])

  if (loading) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="text-[11px] text-muted-foreground tracking-tight">
          Calculando engajamento...
        </p>
      </div>
    )
  }
  if (!score) return null

  const config =
    score.label === 'Quente'
      ? ENGAGEMENT_CONFIG.hot
      : score.label === 'Morno'
        ? ENGAGEMENT_CONFIG.warm
        : score.label === 'Frio'
          ? ENGAGEMENT_CONFIG.cold
          : ENGAGEMENT_CONFIG.new
  const Icon = config.icon

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div
          className={cn(
            'w-7 h-7 rounded-md bg-bg flex items-center justify-center',
            config.color
          )}
        >
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-medium text-foreground tracking-tight">
            {config.label}
          </p>
          <p className="text-[10px] text-muted-foreground tracking-tight">
            {score.totalMessages} mensagens &middot; ultima ha{' '}
            {score.daysSinceLast === 0 ? 'hoje' : `${score.daysSinceLast}d`}
          </p>
        </div>
        <span className="text-[18px] font-data font-medium text-foreground tabular-nums">
          {score.total}
        </span>
      </div>
      <div className="px-3 py-2 border-t border-[var(--border)] grid grid-cols-4 gap-2 text-center">
        <ScoreBar label="Recencia" value={score.recency} max={40} />
        <ScoreBar label="Frequencia" value={score.frequency} max={30} />
        <ScoreBar label="Volume" value={score.volume} max={20} />
        <ScoreBar label="Resposta" value={score.responseRate} max={10} />
      </div>
    </div>
  )
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="h-1 rounded-full bg-bg overflow-hidden">
        <div
          className="h-full bg-foreground/70 rounded-full"
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p className="text-[10px] font-data text-foreground">
        {value}/{max}
      </p>
    </div>
  )
}

// =============================================================
// Midia compartilhada — galeria + lightbox
// =============================================================

type MediaItem = {
  id: string
  url: string
  caption: string | null
  fileName: string | null
  type: string
  createdAt: string
}

function MediaLightbox({
  open,
  items,
  startIndex,
  onClose,
}: {
  open: boolean
  items: MediaItem[]
  startIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(startIndex)

  useEffect(() => {
    setIndex(startIndex)
  }, [startIndex])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(items.length - 1, i + 1))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, items.length, onClose])

  if (!open || items.length === 0) return null
  const current = items[index]
  if (!current) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        title="Fechar (Esc)"
      >
        <X size={16} />
      </button>
      <a
        href={current.url}
        download={current.fileName ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="absolute top-4 right-16 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        title="Baixar"
      >
        <Download size={16} />
      </a>
      {index > 0 && (
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {index < items.length - 1 && (
        <button
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronRight size={18} />
        </button>
      )}
      <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center">
        {current.type === 'video' ? (
          <video src={current.url} controls className="max-h-[85vh] max-w-[90vw] rounded-md" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.caption ?? ''}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-md"
          />
        )}
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-[12px] font-data tabular-nums">
        {index + 1} / {items.length}
      </div>
    </div>
  )
}

const MEDIA_TABS = [
  { id: 'image', label: 'Imagens', icon: ImageIcon },
  { id: 'document', label: 'Documentos', icon: FileText },
  { id: 'audio', label: 'Audios', icon: Music },
] as const

type MediaTabId = (typeof MEDIA_TABS)[number]['id']

function MediaGallery({ conversationId }: { conversationId: string }) {
  const [tab, setTab] = useState<MediaTabId>('image')
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  })

  async function load(reset: boolean) {
    setLoading(true)
    const res = await getConversationMedia({
      conversationId,
      type: tab,
      cursor: reset ? null : cursor,
      limit: 30,
    })
    if ('error' in res && res.error) {
      setLoading(false)
      return
    }
    const nextItems: MediaItem[] = (res.items ?? []).flatMap(
      (msg: { id: string; attachments: unknown; created_at: string }) =>
        (Array.isArray(msg.attachments) ? (msg.attachments as MessageAttachment[]) : [])
          .filter((att) => att.type === tab && typeof att.url === 'string' && att.url)
          .map((att) => ({
            id: `${msg.id}-${att.url}`,
            url: att.url as string,
            caption: att.caption ?? null,
            fileName: att.fileName ?? null,
            type: att.type as string,
            createdAt: msg.created_at,
          }))
    )
    setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]))
    setHasMore(!!res.nextCursor)
    setCursor(res.nextCursor ?? null)
    setLoading(false)
  }

  useEffect(() => {
    setItems([])
    setCursor(null)
    setHasMore(false)
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, conversationId])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        {MEDIA_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 -mb-px border-b text-[11px] font-medium tracking-tight transition-colors',
              tab === id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon size={12} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>
      <div>
        {tab === 'image' && (
          <MediaImageGrid
            items={items}
            onOpen={(index) => setLightbox({ open: true, index })}
          />
        )}
        {tab === 'document' && <MediaDocumentList items={items} />}
        {tab === 'audio' && <MediaAudioList items={items} />}
        {!loading && items.length === 0 && (
          <p className="py-8 text-center text-[12px] text-muted-foreground tracking-tight">
            Nenhum{' '}
            {tab === 'image'
              ? 'arquivo de imagem'
              : tab === 'document'
                ? 'documento'
                : 'audio'}{' '}
            ainda.
          </p>
        )}
        {loading && (
          <div className="py-4 text-center">
            <Loader2 size={14} className="animate-spin inline text-muted-foreground" />
          </div>
        )}
        {hasMore && !loading && (
          <button
            onClick={() => load(false)}
            className="w-full mt-2 h-8 text-[11px] text-muted-foreground hover:text-foreground border border-[var(--border)] rounded-md tracking-tight"
          >
            Carregar mais
          </button>
        )}
      </div>
      <MediaLightbox
        open={lightbox.open}
        items={items}
        startIndex={lightbox.index}
        onClose={() => setLightbox({ open: false, index: 0 })}
      />
    </div>
  )
}

function MediaImageGrid({
  items,
  onOpen,
}: {
  items: MediaItem[]
  onOpen: (index: number) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => onOpen(index)}
          className="relative aspect-square rounded-md overflow-hidden bg-[var(--surface)] hover:opacity-90 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.caption ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}

function MediaDocumentList({ items }: { items: MediaItem[] }) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-[var(--surface)]"
        >
          <div className="w-9 h-9 rounded-md bg-[var(--surface)] flex items-center justify-center text-muted-foreground">
            <FileText size={14} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-foreground tracking-tight truncate">
              {item.fileName ?? 'documento'}
            </p>
            <p className="text-[10px] text-muted-foreground tracking-tight font-data">
              {new Date(item.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </a>
      ))}
    </div>
  )
}

function MediaAudioList({ items }: { items: MediaItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 px-2 py-2 rounded-md bg-[var(--surface)]"
        >
          <Music size={14} strokeWidth={1.75} className="text-muted-foreground" />
          <audio src={item.url} controls className="flex-1 h-7" />
        </div>
      ))}
    </div>
  )
}

// =============================================================
// Controle de pausa da IA
// =============================================================

const AI_PAUSE_OPTIONS = [
  { id: 'default', label: 'Pausar 30 minutos', icon: Clock, desc: 'IA volta automaticamente' },
  { id: 'manual', label: 'Pausar 1 hora', icon: Clock, desc: 'IA volta automaticamente' },
  {
    id: 'indefinite',
    label: 'Pausar indefinidamente',
    icon: InfinityIcon,
    desc: 'Voce reativa quando quiser',
  },
  {
    id: 'ended',
    label: 'Encerrar atendimento IA',
    icon: Square,
    desc: 'Reativa na proxima mensagem do cliente',
  },
] as const

function formatPauseRemaining(pausedUntil: string): string | null {
  const remaining = new Date(pausedUntil).getTime() - Date.now()
  if (remaining <= 0) return null
  const minutes = Math.ceil(remaining / 6e4)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h${rest}m`
}

function AiPauseControl({
  conversationId,
  paused,
  pausedUntil,
  pauseMode,
  compact,
}: {
  conversationId: string
  paused: boolean
  pausedUntil: string | null
  pauseMode: string | null
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  function handleMode(mode: string) {
    setOpen(false)
    startTransition(async () => {
      const res = await setConversationAiPauseMode({ conversationId, mode })
      if ('error' in res && res.error) {
        toast.error('Falha', { description: res.error })
      } else {
        toast.success(mode === 'resume' ? 'IA retomada' : 'IA pausada')
      }
    })
  }

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const remaining = pausedUntil ? formatPauseRemaining(pausedUntil) : null

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md tracking-tight transition-colors',
          compact ? 'h-7 px-2 text-[11px]' : 'h-8 px-2.5 text-[12px]',
          paused
            ? 'bg-warning/10 text-warning'
            : 'border border-[var(--border)] text-foreground hover:bg-[var(--surface)]',
          pending && 'opacity-60'
        )}
      >
        {paused ? (
          <Pause size={12} strokeWidth={1.75} />
        ) : (
          <Play size={12} strokeWidth={1.75} />
        )}
        <span>
          {paused
            ? pauseMode === 'ended'
              ? 'IA encerrada'
              : pauseMode === 'indefinite'
                ? 'IA pausada'
                : remaining
                  ? `IA pausada · ${remaining}`
                  : 'IA pausada'
            : 'IA ativa'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 rounded-md border border-[var(--border)] bg-bg shadow-lg py-1 z-30">
          {paused && (
            <>
              <button
                onClick={() => handleMode('resume')}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface)] text-foreground tracking-tight"
              >
                <Play size={13} strokeWidth={1.75} className="text-success" />
                <div>
                  <p className="text-[12px] font-medium">Retomar IA</p>
                  <p className="text-[10px] text-muted-foreground">
                    Volta a responder agora
                  </p>
                </div>
              </button>
              <div className="border-t border-[var(--border)] my-1" />
            </>
          )}
          {AI_PAUSE_OPTIONS.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => handleMode(id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface)] text-foreground tracking-tight"
            >
              <Icon size={13} strokeWidth={1.75} className="text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================
// Metadata de grupo WhatsApp
// =============================================================

type GroupMetadata = {
  subject?: string | null
  description?: string | null
  invitationLink?: string | null
  participants?: Array<{ phone: string; isAdmin?: boolean; isSuperAdmin?: boolean }>
}

function GroupMetadataCard({
  channelId,
  groupId,
}: {
  channelId: string
  groupId: string | null
}) {
  const [meta, setMeta] = useState<GroupMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const url = `/api/inbox/group-metadata?channelId=${encodeURIComponent(
          channelId
        )}&groupId=${encodeURIComponent(groupId!)}`
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error(`Falha ${res.status}`)
        const json = (await res.json()) as GroupMetadata
        if (!cancelled) setMeta(json)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [channelId, groupId])

  if (!groupId) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-[var(--surface)] flex items-center justify-center text-muted-foreground">
          <Users size={14} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-foreground tracking-tight truncate">
            {loading ? 'Carregando grupo...' : meta?.subject ?? 'Grupo'}
          </p>
          {meta?.participants && (
            <p className="text-[10px] text-muted-foreground tracking-tight">
              {meta.participants.length} participantes
            </p>
          )}
        </div>
      </div>
      {meta?.description && (
        <p className="text-[12px] text-foreground/80 tracking-tight">{meta.description}</p>
      )}
      {error && <p className="text-[11px] text-destructive tracking-tight">{error}</p>}
      {meta?.invitationLink && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <button
            onClick={() => {
              navigator.clipboard.writeText(meta.invitationLink ?? '').catch(() => {})
              toast.success('Link copiado')
            }}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface)] tracking-tight"
          >
            <Copy size={11} strokeWidth={1.75} />
            Copiar convite
          </button>
          <a
            href={meta.invitationLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md hover:bg-[var(--surface)] tracking-tight"
          >
            <ExternalLink size={11} strokeWidth={1.75} />
            Abrir
          </a>
        </div>
      )}
      {meta?.participants && meta.participants.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-2">
            Participantes
          </p>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {meta.participants.slice(0, 100).map((p) => (
              <div
                key={p.phone}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--surface)]"
              >
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-medium',
                    p.isAdmin || p.isSuperAdmin
                      ? 'bg-warning/15 text-warning'
                      : 'bg-[var(--surface-hover)] text-foreground'
                  )}
                >
                  {p.isAdmin || p.isSuperAdmin ? (
                    <Crown size={11} strokeWidth={1.75} />
                  ) : (
                    p.phone.slice(-2)
                  )}
                </div>
                <span className="text-[12px] text-foreground font-data tracking-tight truncate">
                  {p.phone}
                </span>
                {(p.isAdmin || p.isSuperAdmin) && (
                  <span className="text-[10px] text-warning tracking-tight ml-auto">
                    {p.isSuperAdmin ? 'Criador' : 'Admin'}
                  </span>
                )}
              </div>
            ))}
            {meta.participants.length > 100 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">
                + {meta.participants.length - 100} participantes
              </p>
            )}
          </div>
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// =============================================================
// Coluna direita — engajamento + grupo + painel do contato + midia
// =============================================================

// Campos extras retornados pelo getContactDetails de prod
type ContactDetailsWithSummary = ContactDetails & {
  aiSummary?: string | null
  aiSummaryGeneratedAt?: string | null
  channelType?: string | null
}

function ContactPanelColumn({
  conversationId,
  paused,
  pausedUntil,
  pauseMode,
  isGroup,
  channelId,
  externalThreadId,
}: {
  conversationId: string
  paused: boolean
  pausedUntil: string | null
  pauseMode: string | null
  isGroup: boolean
  channelId: string
  externalThreadId: string | null
}) {
  const [details, setDetails] = useState<ContactDetailsWithSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDetails(null)
    getContactDetails(conversationId).then((res) => {
      if (cancelled) return
      if ('ok' in res && res.ok) setDetails(res.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  if (loading) {
    return (
      <aside className="border-l border-[var(--border)] bg-bg flex items-center justify-center min-h-0">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </aside>
    )
  }
  if (!details) {
    return (
      <aside className="border-l border-[var(--border)] bg-bg p-6">
        <p className="text-[12px] text-muted-foreground tracking-tight">
          Nao foi possivel carregar o painel.
        </p>
      </aside>
    )
  }
  return (
    <aside className="border-l border-[var(--border)] bg-bg flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {isGroup ? 'Grupo' : 'Contato'}
        </span>
        <AiPauseControl
          conversationId={conversationId}
          paused={paused}
          pausedUntil={pausedUntil}
          pauseMode={pauseMode}
          compact
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {!isGroup && (
          <div className="p-4 border-b border-[var(--border)]">
            <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-2">
              Engajamento
            </p>
            <EngagementCard
              conversationId={conversationId}
              contactId={details.contact.id}
            />
          </div>
        )}
        {isGroup && externalThreadId && (
          <div className="p-4 border-b border-[var(--border)]">
            <GroupMetadataCard channelId={channelId} groupId={externalThreadId} />
          </div>
        )}
        <div className="border-b border-[var(--border)]">
          <ContactPanel
            conversationId={conversationId}
            contact={details.contact}
            customer={details.customer}
            stats={details.stats}
            aiSummary={details.aiSummary ?? null}
            aiSummaryGeneratedAt={details.aiSummaryGeneratedAt ?? null}
            aiPaused={paused}
            channelType={details.channelType ?? null}
          />
        </div>
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-2">
            Midia compartilhada
          </p>
          <MediaGallery conversationId={conversationId} />
        </div>
      </div>
    </aside>
  )
}

// =============================================================
// Som de notificacao
// =============================================================

const SOUND_PREFS_KEY = 'txoko_inbox_notification_sound_v1'

type SoundChoice = 'soft' | 'pop' | 'chime' | 'mute'
type SoundPrefs = { enabled: boolean; choice: SoundChoice; volume: number }
type ToneStep = { freq: number; duration: number; type?: OscillatorType }

const DEFAULT_SOUND_PREFS: SoundPrefs = { enabled: true, choice: 'soft', volume: 0.4 }

function hasWindowStorage() {
  return typeof localStorage !== 'undefined'
}

let sharedAudioContext: AudioContext | null = null

const SOUND_PATTERNS: Record<Exclude<SoundChoice, 'mute'>, ToneStep[]> = {
  soft: [
    { freq: 880, duration: 0.08, type: 'sine' },
    { freq: 0, duration: 0.05 },
    { freq: 660, duration: 0.12, type: 'sine' },
  ],
  pop: [
    { freq: 1200, duration: 0.04, type: 'square' },
    { freq: 0, duration: 0.03 },
    { freq: 800, duration: 0.05, type: 'square' },
  ],
  chime: [
    { freq: 660, duration: 0.06, type: 'triangle' },
    { freq: 0, duration: 0.04 },
    { freq: 990, duration: 0.06, type: 'triangle' },
    { freq: 0, duration: 0.03 },
    { freq: 1320, duration: 0.18, type: 'triangle' },
  ],
}

let lastSoundPlayedAt = 0

function readSoundPrefs(): SoundPrefs {
  if (!hasWindowStorage()) return DEFAULT_SOUND_PREFS
  try {
    const raw = localStorage.getItem(SOUND_PREFS_KEY)
    if (!raw) return DEFAULT_SOUND_PREFS
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>
    return {
      enabled: parsed.enabled ?? DEFAULT_SOUND_PREFS.enabled,
      choice: parsed.choice ?? DEFAULT_SOUND_PREFS.choice,
      volume:
        typeof parsed.volume === 'number'
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SOUND_PREFS.volume,
    }
  } catch {
    return DEFAULT_SOUND_PREFS
  }
}

function getAudioContext(): AudioContext | null {
  if (!hasWindowStorage()) return null
  if (sharedAudioContext) return sharedAudioContext
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return null
    sharedAudioContext = new Ctor()
    return sharedAudioContext
  } catch {
    return null
  }
}

function playTonePattern(ctx: AudioContext, pattern: ToneStep[], volume: number) {
  let time = ctx.currentTime
  for (const step of pattern) {
    if (step.freq === 0) {
      time += step.duration
      continue
    }
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = step.type ?? 'sine'
    oscillator.frequency.value = step.freq
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(volume, time + 0.01)
    gain.gain.linearRampToValueAtTime(0, time + step.duration)
    oscillator.start(time)
    oscillator.stop(time + step.duration)
    time += step.duration
  }
}

function playNotificationSound() {
  const prefs = readSoundPrefs()
  if (!prefs.enabled || prefs.choice === 'mute') return
  const now = Date.now()
  if (now - lastSoundPlayedAt < 250) return
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const pattern = SOUND_PATTERNS[prefs.choice]
  if (!pattern) return
  try {
    playTonePattern(ctx, pattern, prefs.volume)
    lastSoundPlayedAt = now
  } catch {
    // audio bloqueado — ignora
  }
}

// =============================================================
// InboxViewInner — orquestra tudo
// =============================================================

type Props = {
  conversations: ConversationWithRelations[]
  channels: Channel[]
  templates: MessageTemplate[]
  restaurantId: string
  users: TeamMember[]
}

function InboxViewInner({
  initialConversations,
  channels,
  templates,
  restaurantId,
  users,
  currentUserId,
}: {
  initialConversations: InboxConversation[]
  channels: Channel[]
  templates: MessageTemplate[]
  restaurantId: string
  users: TeamMember[]
  currentUserId: string | null
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  )
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [searchQuery, setSearchQuery] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [listContextMenu, setListContextMenu] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [, setLoadingMessages] = useState(false)
  const [, startTransition] = useTransition()
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [contactPanelOpen, setContactPanelOpen] = useState(true)
  const [showThreadSearch, setShowThreadSearch] = useState(false)
  const [threadSearchQuery, setThreadSearchQuery] = useState('')
  const [threadSearchIndex, setThreadSearchIndex] = useState(0)
  const [msgContextMenu, setMsgContextMenu] = useState<{
    msg: Message
    x: number
    y: number
  } | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<{
    msg: Message
    x: number
    y: number
  } | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

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
                { ...row, contact: null, channel: null } as InboxConversation,
                ...prev,
              ]
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Conversation
              return prev.map((c) =>
                c.id === row.id ? ({ ...c, ...row } as InboxConversation) : c
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
              return [...prev, row].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
            }
            return prev
          })
          if (row.direction === 'inbound') {
            const viewingThisThread =
              selectedId === row.conversation_id && document.hasFocus()
            if (!viewingThisThread) playNotificationSound()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Message
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(msgChannel)
    }
  }, [restaurantId, selectedId])

  const loadThread = useCallback(async (conversationId: string) => {
    setLoadingMessages(true)
    const res = await getMessages(conversationId)
    if ('messages' in res && res.messages) {
      setMessages(res.messages)
    } else {
      setMessages([])
    }
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setReplyTo(null)
      return
    }
    setReplyTo(null)
    setShowThreadSearch(false)
    setThreadSearchQuery('')
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
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && selectedId) {
        e.preventDefault()
        setShowThreadSearch(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId])

  const filtered = useMemo(
    () =>
      conversations
        .filter((conv) => {
          const metadata = conv.metadata as { deleted_at?: unknown } | null
          if (metadata && metadata.deleted_at) return false
          if (
            filters.status !== 'all' &&
            conv.status !== filters.status &&
            (filters.status !== 'pending_agent' ||
              (conv.status !== 'pending_agent' && conv.status !== 'pending_customer'))
          ) {
            return false
          }
          if (filters.channel !== 'all' && conv.channel?.type !== filters.channel) {
            return false
          }
          if (filters.priority !== 'all' && conv.priority !== filters.priority) {
            return false
          }
          if (filters.unreadOnly && conv.unread_count <= 0) return false
          if (filters.pausedOnly && !conv.ai_paused) return false
          if (filters.assignment === 'mine' && conv.assignee_id !== currentUserId) {
            return false
          }
          if (filters.assignment === 'unassigned' && conv.assignee_id) return false
          if (
            filters.assignment !== 'all' &&
            filters.assignment !== 'mine' &&
            filters.assignment !== 'unassigned' &&
            conv.assignee_id !== filters.assignment
          ) {
            return false
          }
          if (filters.tag && !(conv.contact?.tags ?? []).includes(filters.tag)) {
            return false
          }
          if (filters.period !== 'all') {
            const days =
              filters.period === 'today'
                ? 1
                : filters.period === '7d'
                  ? 7
                  : filters.period === '30d'
                    ? 30
                    : 90
            const cutoff = Date.now() - 864e5 * days
            if (new Date(conv.last_message_at).getTime() < cutoff) return false
          }
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            const name = conv.contact?.display_name?.toLowerCase() ?? ''
            const preview = conv.last_message_preview?.toLowerCase() ?? ''
            if (!name.includes(q) && !preview.includes(q)) return false
          }
          return true
        })
        .sort((a, b) => {
          const aPinned = +!!a.is_pinned
          const bPinned = +!!b.is_pinned
          if (aPinned !== bPinned) return bPinned - aPinned
          return (
            new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          )
        }),
    [conversations, filters, searchQuery, currentUserId]
  )

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  function clearSelection() {
    setSelectedIds(new Set())
    setBulkMode(false)
  }

  const selectedConversationIds = Array.from(selectedIds)
  const selectedContactIds = filtered
    .filter((c) => selectedIds.has(c.id) && c.contact?.id)
    .map((c) => c.contact!.id)

  const searchMatches = useMemo(() => {
    if (!threadSearchQuery.trim()) return []
    const q = threadSearchQuery.toLowerCase()
    return messages.filter((m) => m.body?.toLowerCase().includes(q))
  }, [messages, threadSearchQuery])
  const currentMatchId = searchMatches[threadSearchIndex]?.id ?? null

  function resolveSenderLabel(msg: Message): string {
    if (msg.direction === 'outbound') {
      const user = users.find((u) => u.id === msg.sender_user_id)
      return user?.name?.trim() || user?.email?.split('@')[0] || 'Voce'
    }
    return selected?.contact?.display_name ?? 'Cliente'
  }

  async function handleReact(msg: Message, reaction: string) {
    const res = await sendMessageReaction({ messageId: msg.id, reaction })
    if ('error' in res && res.error) {
      toast.error('Reacao falhou', { description: res.error })
    }
  }

  async function handleDeleteForMe(msg: Message) {
    const res = await deleteOutboundMessage({ messageId: msg.id, scope: 'me' })
    if ('error' in res && res.error) {
      toast.error('Falha', { description: res.error })
    }
  }

  async function handleDeleteForAll(msg: Message) {
    const res = await deleteOutboundMessage({ messageId: msg.id, scope: 'all' })
    if ('error' in res && res.error) {
      toast.error('Falha', { description: res.error })
    }
  }

  useEffect(() => {
    setThreadSearchIndex(0)
  }, [threadSearchQuery])

  const lastIncomingMsgId =
    [...messages].reverse().find((m) => m.direction === 'inbound')?.id ?? null

  const isGroup = useMemo(() => {
    if (!selected) return false
    const threadId = selected.external_thread_id
    return !!(threadId && (threadId.includes('@g.us') || /^\d{8,}-\d{8,}$/.test(threadId)))
  }, [selected])

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -mx-8 -mt-6 -mb-6 bg-bg">
      <div
        className={cn(
          'flex-1 grid min-h-0',
          contactPanelOpen && selected
            ? 'grid-cols-[auto_300px_1fr_320px]'
            : 'grid-cols-[auto_300px_1fr]'
        )}
      >
        <FiltersSidebar
          conversations={conversations}
          channels={channels.map((c) => ({ id: c.id, type: c.type, name: c.name }))}
          users={users}
          currentUserId={currentUserId}
          value={filters}
          onChange={setFilters}
        />

        {/* LIST COLUMN */}
        <aside className="border-r border-[var(--border)] flex flex-col min-h-0">
          <div className="h-12 px-3 border-b border-[var(--border)] flex items-center gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome ou texto"
              className="flex-1 h-8 px-2 bg-transparent border-0 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={() => {
                setBulkMode((v) => !v)
                if (bulkMode) clearSelection()
              }}
              className={cn(
                'h-7 px-2 rounded-md text-[11px] tracking-tight transition-colors',
                bulkMode
                  ? 'bg-foreground text-bg'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface)]'
              )}
            >
              {bulkMode ? 'Sair' : 'Selecionar varias'}
            </button>
          </div>
          {bulkMode && (
            <BulkActionsBar
              selectedConversationIds={selectedConversationIds}
              selectedContactIds={selectedContactIds}
              totalVisible={filtered.length}
              onSelectAll={() => {
                setSelectedIds(new Set(filtered.map((c) => c.id)))
              }}
              onClear={clearSelection}
            />
          )}
          <ConversationList
            conversations={filtered}
            selectedId={selectedId}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            onSelect={(id) => setSelectedId(id)}
            onContextMenu={(id, e) => {
              setListContextMenu({ id, x: e.clientX, y: e.clientY })
            }}
            onToggleSelect={(id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }}
          />
        </aside>

        {/* THREAD COLUMN */}
        <section className="flex flex-col min-h-0 bg-bg">
          {selected ? (
            <DropZone onFiles={(files) => setDroppedFiles(files)} disabled={false}>
              <div className="flex flex-col h-full">
                <ThreadHeader
                  conv={selected}
                  users={users}
                  currentUserId={currentUserId}
                  contactPanelOpen={contactPanelOpen}
                  onToggleContactPanel={() => setContactPanelOpen((v) => !v)}
                  onToggleSearch={() => setShowThreadSearch((v) => !v)}
                  onOpenTransfer={() => setShowTransferModal(true)}
                />
                <TransferBanner
                  conversationId={selected.id}
                  currentUserId={currentUserId}
                  onAccepted={() => loadThread(selected.id)}
                />
                {showThreadSearch && (
                  <ThreadSearchBar
                    query={threadSearchQuery}
                    onQueryChange={setThreadSearchQuery}
                    matches={searchMatches.length}
                    currentIndex={threadSearchIndex}
                    onNext={() => {
                      if (searchMatches.length !== 0) {
                        setThreadSearchIndex((i) => (i + 1) % searchMatches.length)
                      }
                    }}
                    onPrev={() => {
                      if (searchMatches.length !== 0) {
                        setThreadSearchIndex(
                          (i) => (i - 1 + searchMatches.length) % searchMatches.length
                        )
                      }
                    }}
                    onClose={() => {
                      setShowThreadSearch(false)
                      setThreadSearchQuery('')
                    }}
                  />
                )}
                <MessageList
                  messages={messages}
                  highlightQuery={threadSearchQuery}
                  currentMatchId={currentMatchId}
                  onContextMenu={(msg, e) =>
                    setMsgContextMenu({ msg, x: e.clientX, y: e.clientY })
                  }
                  onClickReply={(id) => {
                    const target = messages.find((m) => m.id === id)
                    if (target) setReplyTo(target)
                  }}
                  resolveReply={(id) => {
                    const target = messages.find((m) => m.id === id)
                    return target
                      ? { senderLabel: resolveSenderLabel(target), body: target.body ?? null }
                      : null
                  }}
                />
                <Composer
                  conversationId={selected.id}
                  templates={templates}
                  replyTo={replyTo}
                  resolveSender={resolveSenderLabel}
                  onClearReply={() => setReplyTo(null)}
                  pendingFiles={droppedFiles}
                  onFilesConsumed={() => setDroppedFiles([])}
                  lastIncomingMsgId={lastIncomingMsgId}
                  isGroup={isGroup}
                />
              </div>
            </DropZone>
          ) : (
            <EmptyThread />
          )}
        </section>

        {/* CONTACT PANEL COLUMN */}
        {contactPanelOpen && selected && (
          <ContactPanelColumn
            conversationId={selected.id}
            paused={selected.ai_paused}
            pausedUntil={selected.ai_paused_until ?? null}
            pauseMode={selected.ai_pause_mode ?? null}
            isGroup={isGroup}
            channelId={selected.channel_id}
            externalThreadId={selected.external_thread_id ?? null}
          />
        )}
      </div>

      {listContextMenu && (
        <ConversationContextMenu
          x={listContextMenu.x}
          y={listContextMenu.y}
          isPinned={
            conversations.find((c) => c.id === listContextMenu.id)?.is_pinned ?? false
          }
          hasUnread={
            (conversations.find((c) => c.id === listContextMenu.id)?.unread_count ?? 0) > 0
          }
          onPin={() => {
            const id = listContextMenu.id
            startTransition(async () => {
              const res = await toggleConversationPin(id)
              if ('error' in res && res.error) {
                toast.error('Falha', { description: res.error })
              }
            })
          }}
          onMarkUnread={() => {
            const id = listContextMenu.id
            startTransition(async () => {
              const res = await markConversationUnread(id)
              if ('error' in res && res.error) {
                toast.error('Falha', { description: res.error })
              }
            })
          }}
          onDelete={() => {
            const id = listContextMenu.id
            startTransition(async () => {
              const res = await deleteConversation(id)
              if ('error' in res && res.error) {
                toast.error('Falha', { description: res.error })
              }
              if (selectedId === id) setSelectedId(null)
            })
          }}
          onClose={() => setListContextMenu(null)}
        />
      )}
      {msgContextMenu && (
        <MessageContextMenu
          x={msgContextMenu.x}
          y={msgContextMenu.y}
          canDelete={msgContextMenu.msg.direction === 'outbound'}
          hasBody={!!(msgContextMenu.msg.body && msgContextMenu.msg.body.trim().length > 0)}
          onReply={() => setReplyTo(msgContextMenu.msg)}
          onReact={() =>
            setReactionPickerFor({
              msg: msgContextMenu.msg,
              x: msgContextMenu.x,
              y: msgContextMenu.y,
            })
          }
          onCopy={() => {
            navigator.clipboard.writeText(msgContextMenu.msg.body ?? '').catch(() => {})
            toast.success('Texto copiado')
          }}
          onForward={() => {
            toast.message('Encaminhar — em breve')
          }}
          onDeleteForMe={() => handleDeleteForMe(msgContextMenu.msg)}
          onDeleteForAll={() => handleDeleteForAll(msgContextMenu.msg)}
          onClose={() => setMsgContextMenu(null)}
        />
      )}
      {reactionPickerFor && (
        <ReactionPicker
          anchorX={reactionPickerFor.x}
          anchorY={reactionPickerFor.y}
          onPick={(emoji) => {
            handleReact(reactionPickerFor.msg, emoji).catch(() => {})
          }}
          onClose={() => setReactionPickerFor(null)}
        />
      )}
      {selected && (
        <TransferModal
          open={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          conversationId={selected.id}
          users={users}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}

function EmptyThread() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-12 h-12 rounded-md bg-[var(--surface)] flex items-center justify-center text-muted-foreground mb-4">
        <InboxIcon size={20} strokeWidth={1.5} />
      </div>
      <h3 className="text-[15px] font-medium text-foreground tracking-tight">
        Selecione uma conversa
      </h3>
      <p className="mt-1 text-[12px] text-muted-foreground tracking-tight max-w-[280px]">
        Use os filtros a esquerda para encontrar a conversa que voce procura, ou inicie
        uma nova.
      </p>
      <button className="mt-5 inline-flex items-center gap-2 h-9 px-3.5 bg-foreground text-bg text-[12px] font-medium rounded-md tracking-tight">
        <Plus size={13} strokeWidth={2} />
        Nova conversa
      </button>
    </div>
  )
}

export function InboxView({
  conversations,
  channels,
  templates,
  restaurantId,
  users,
}: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null)
      })
  }, [])

  return (
    <>
      <InboxViewInner
        initialConversations={conversations}
        channels={channels}
        templates={templates}
        restaurantId={restaurantId}
        users={users}
        currentUserId={currentUserId}
      />
      <Toaster />
    </>
  )
}
