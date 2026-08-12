'use client'

import { useState, useTransition } from 'react'
import { Check, ChevronDown, CircleHelp, LogOut, Search, Sparkles } from 'lucide-react'
import { logoutAction } from '@/app/(auth)/actions'
import { switchRestaurant, type Membership } from '@/lib/server/restaurant'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationsBell } from '@/components/notifications-bell'
import { cn } from '@/lib/utils'

type Props = {
  user: { id: string; email: string }
  memberships: Membership[]
  activeRestaurantId: string | null
}

export function Header({ user, memberships, activeRestaurantId }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const initial = (user.email?.[0] ?? 'U').toUpperCase()
  const shortEmail = user.email.split('@')[0]

  const active =
    memberships.find((m) => m.restaurant_id === activeRestaurantId) ??
    memberships[0]

  function handleSwitch(id: string) {
    if (id === activeRestaurantId) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      await switchRestaurant(id)
      setOpen(false)
    })
  }

  function openCommandPalette() {
    const ev = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    })
    window.dispatchEvent(ev)
  }

  return (
    <header className="bg-bg-elevated border-b border-border flex items-center px-4 gap-3 h-12 relative z-30">
      {/* Brand */}
      <div className="flex items-center gap-2.5 h-full pr-3 border-r border-border">
        <Logo size={20} />
        <span className="text-[14px] font-semibold tracking-tight hidden sm:inline">
          Txoko
        </span>
      </div>

      {active && (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            disabled={memberships.length < 2}
            className={cn(
              'flex items-center gap-1.5 h-7 text-[12.5px] font-semibold rounded-md transition-colors',
              memberships.length < 2
                ? 'text-foreground cursor-default'
                : 'text-foreground hover:text-primary px-2 -ml-2 hover:bg-surface-hover'
            )}
          >
            <span className="truncate max-w-[200px]">
              {active.name}
            </span>
            {memberships.length > 1 && (
              <ChevronDown
                size={11}
                strokeWidth={1.6}
                className={cn(
                  'text-muted transition-transform duration-200',
                  open && 'rotate-180'
                )}
              />
            )}
          </button>
          {open && memberships.length > 1 && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setOpen(false)}
              />
              <div className="island-popup absolute top-full left-0 mt-1.5 w-64 overflow-hidden z-40">
                <div className="px-3.5 py-2 border-b border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Restaurantes
                  </p>
                </div>
                {memberships.map((m) => (
                  <button
                    key={m.restaurant_id}
                    onClick={() => handleSwitch(m.restaurant_id)}
                    disabled={pending}
                    className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-surface-hover transition-colors disabled:opacity-50"
                  >
                    <div className="text-left min-w-0">
                      <p className="text-[12px] text-foreground truncate font-medium">
                        {m.name}
                      </p>
                      <p className="text-[10px] text-muted capitalize">
                        {m.role}
                      </p>
                    </div>
                    {m.restaurant_id === activeRestaurantId && (
                      <Check
                        size={12}
                        strokeWidth={2}
                        className="text-primary shrink-0"
                      />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Busca global */}
      <button
        onClick={openCommandPalette}
        className="flex items-center gap-2 h-7 flex-1 max-w-[400px] px-2.5 rounded-md text-muted bg-muted-subtle border border-border hover:bg-surface-hover transition-colors"
      >
        <Search size={11} strokeWidth={1.6} className="flex-shrink-0" />
        <span className="flex-1 text-[12.5px] truncate text-left">
          Pesquisar pedido, mesa, cliente…
        </span>
        <kbd className="text-[10px] font-data px-1.5 py-0.5 rounded bg-bg-elevated border border-border">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-medium hover:bg-surface-hover transition-colors"
          aria-label="Agente IA"
        >
          <Sparkles size={13} strokeWidth={1.8} className="text-primary" />
          <span className="text-primary font-semibold">Agente IA</span>
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-hover transition-colors"
          aria-label="Ajuda"
        >
          <CircleHelp size={14} strokeWidth={1.6} className="text-foreground/75" />
        </button>
        <ThemeToggle />
        {activeRestaurantId && (
          <NotificationsBell restaurantId={activeRestaurantId} />
        )}
        <div className="w-px h-[18px] bg-border mx-1" />
        <div className="flex items-center gap-2.5 h-8">
          <div className="w-7 h-7 rounded-full bg-primary-soft border border-border flex items-center justify-center text-[11px] font-semibold text-primary">
            {initial}
          </div>
          <div className="hidden sm:flex flex-col justify-center leading-none">
            <p className="text-[12px] font-semibold text-foreground">
              {shortEmail}
            </p>
            <p className="text-[10px] text-muted capitalize mt-0.5">
              {active?.role ?? 'membro'}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-destructive hover:bg-surface-hover transition-colors"
              aria-label="Sair"
            >
              <LogOut size={13} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
