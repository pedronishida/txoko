'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/lib/server/notifications'

const TYPE_LABEL: Record<NotificationRow['type'], string> = {
  stock_low: 'Estoque',
  negative_review: 'Avaliacao',
  sale_finalized: 'Venda',
  new_order: 'Pedido',
  system: 'Sistema',
}

type Props = {
  restaurantId: string
}

export function NotificationsBell({ restaurantId }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [, startTransition] = useTransition()

  useEffect(() => {
    listNotifications().then(setItems)
  }, [restaurantId])

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
        className="relative w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
        title="Notificacoes"
        aria-label="Notificacoes"
      >
        <Bell size={14} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 mt-1.5 w-96 bg-night-light border border-night-lighter rounded-lg overflow-hidden z-40">
            <div className="flex items-center justify-between px-4 py-3 border-b border-night-lighter">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                Notificacoes
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[11px] text-stone-light hover:text-cloud tracking-tight transition-colors"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {items.length === 0 && (
                <p className="px-4 py-12 text-[12px] text-stone text-center tracking-tight">
                  Nenhuma notificacao ainda
                </p>
              )}
              {items.map((n) => {
                const isUnread = !n.read_at
                const content = (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 mb-0.5">
                      <span className="text-[10px] uppercase tracking-[0.06em] text-stone-dark font-medium">
                        {TYPE_LABEL[n.type]}
                      </span>
                      <span className="text-[10px] font-data text-stone-dark shrink-0">
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        'text-[13px] tracking-tight leading-snug',
                        isUnread ? 'text-cloud font-medium' : 'text-stone-light'
                      )}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[11px] text-stone mt-0.5 line-clamp-2 tracking-tight">
                        {n.body}
                      </p>
                    )}
                  </div>
                )

                const itemClasses = cn(
                  'relative flex items-start gap-3 px-4 py-3 hover:bg-night-lighter transition-colors border-b border-night-lighter/50 last:border-b-0 text-left w-full'
                )
                const unreadDot = isUnread && (
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary" />
                )

                if (n.href) {
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => handleClickItem(n)}
                      className={itemClasses}
                    >
                      {unreadDot}
                      {content}
                    </Link>
                  )
                }
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    className={itemClasses}
                  >
                    {unreadDot}
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
