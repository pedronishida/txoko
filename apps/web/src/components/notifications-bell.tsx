'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Check, Package, Receipt, ShoppingBag, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/lib/server/notifications'

const TYPE_ICONS: Record<NotificationRow['type'], typeof Bell> = {
  stock_low: Package,
  negative_review: Star,
  sale_finalized: Receipt,
  new_order: ShoppingBag,
  system: Bell,
}

const TYPE_COLORS: Record<NotificationRow['type'], string> = {
  stock_low: 'text-coral bg-coral/10',
  negative_review: 'text-warm bg-warm/10',
  sale_finalized: 'text-leaf bg-leaf/10',
  new_order: 'text-primary bg-primary/10',
  system: 'text-stone bg-stone/10',
}

type Props = {
  restaurantId: string
}

export function NotificationsBell({ restaurantId }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [, startTransition] = useTransition()

  // Carrega lista inicial
  useEffect(() => {
    listNotifications().then(setItems)
  }, [restaurantId])

  // Realtime — escuta inserts na tabela notifications
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow
          setItems((prev) =>
            prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, 20)
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId])

  const unreadCount = items.filter((n) => !n.read_at).length

  function handleClickItem(n: NotificationRow) {
    if (!n.read_at) {
      // Optimistic update
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
        )
      )
      startTransition(() => {
        void markNotificationRead(n.id)
      })
    }
    setOpen(false)
  }

  function handleMarkAll() {
    const now = new Date().toISOString()
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    )
    startTransition(() => {
      void markAllNotificationsRead()
    })
  }

  function relativeTime(iso: string) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}m`
    if (mins < 1440) return `${Math.floor(mins / 60)}h`
    return `${Math.floor(mins / 1440)}d`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
        title="Notificacoes"
        aria-label="Notificacoes"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center animate-scale-in">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 mt-2 w-96 bg-surface border rounded-2xl shadow-2xl z-40 overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-foreground">
                Notificacoes
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] text-primary font-medium hover:underline"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {items.length === 0 && (
                <p className="px-4 py-12 text-sm text-muted text-center">
                  Nenhuma notificacao ainda
                </p>
              )}
              {items.map((n) => {
                const Icon = TYPE_ICONS[n.type]
                const color = TYPE_COLORS[n.type]
                const isUnread = !n.read_at
                const content = (
                  <>
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        color
                      )}
                    >
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <p className="text-sm font-medium text-foreground flex-1">
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted font-data shrink-0">
                          {relativeTime(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </>
                )

                if (n.href) {
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => handleClickItem(n)}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 hover:bg-surface-hover transition-colors border-b last:border-b-0',
                        isUnread && 'bg-primary/5'
                      )}
                    >
                      {content}
                    </Link>
                  )
                }
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-hover transition-colors border-b last:border-b-0 text-left',
                      isUnread && 'bg-primary/5'
                    )}
                  >
                    {content}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
