'use client'

import { useState, useTransition } from 'react'
import {
  Check,
  ChevronDown,
  CircleHelp,
  LogOut,
  PanelTopClose,
  PanelTopOpen,
  Search,
  Sparkles,
} from 'lucide-react'
import { logoutAction } from '@/app/(auth)/actions'
import { switchRestaurant, type Membership } from '@/lib/server/restaurant'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationsBell } from '@/components/notifications-bell'
import { ConnectionStatus } from '@/components/connection-status'
import { cn } from '@/lib/utils'

type Props = {
  user: { id: string; email: string }
  memberships: Membership[]
  activeRestaurantId: string | null
  /** Cabecalho recolhido (modo foco) — o shell e quem guarda o estado. */
  headerHidden?: boolean
  onToggleHeaderHidden?: () => void
}

export function Header({
  user,
  memberships,
  activeRestaurantId,
  headerHidden = false,
  onToggleHeaderHidden,
}: Props) {
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
    <header className="island relative z-30 flex h-[60px] items-center gap-3.5 rounded-[18px] px-[18px]">
      {/* Brand */}
      <div
        data-brand
        className="flex items-center gap-2.5 border-r border-rule pr-3.5"
      >
        <Logo size={26} />
        <span
          data-wordmark
          className="text-[15px] font-semibold tracking-tight"
        >
          txoko
        </span>
      </div>

      {active && (
        <div data-org-switch className="relative">
          <button
            onClick={() => setOpen(!open)}
            disabled={memberships.length < 2}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[9px] text-[13px] font-semibold transition-colors',
              memberships.length < 2
                ? 'cursor-default text-ink'
                : '-ml-2.5 px-2.5 text-ink hover:bg-sunken'
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

      {/* Conexao: pilula, nao faixa. Aparece sem empurrar o layout. */}
      <ConnectionStatus />

      {/* Busca global */}
      <button
        data-header-search
        onClick={openCommandPalette}
        className="flex h-[34px] min-w-0 max-w-[420px] flex-1 items-center gap-2 rounded-[10px] border border-rule bg-field px-3 text-ink-muted transition-colors hover:bg-sunken"
      >
        <Search size={13} strokeWidth={2} className="flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left text-[12.5px]">
          Pesquisar pedido, mesa, cliente…
        </span>
        <kbd className="shrink-0 rounded-[5px] bg-sunken px-1.5 py-0.5 font-data text-[10px]">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <button
          className="flex h-8 items-center gap-1.5 rounded-[9px] bg-teal-soft px-3 transition-colors hover:bg-teal-soft-hover"
          aria-label="Agente IA"
        >
          <Sparkles size={13} strokeWidth={2} className="text-teal-deep" />
          <span className="text-[12.5px] font-semibold text-teal-deep">
            Agente IA
          </span>
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-[9px] transition-colors hover:bg-sunken"
          aria-label="Ajuda"
        >
          <CircleHelp size={14} strokeWidth={1.8} className="text-ink-soft" />
        </button>
        {onToggleHeaderHidden && (
          <button
            onClick={onToggleHeaderHidden}
            aria-pressed={headerHidden}
            aria-label={
              headerHidden ? 'Fixar cabecalho' : 'Recolher cabecalho'
            }
            title={
              headerHidden
                ? 'Fixar o cabecalho de volta'
                : 'Recolher o cabecalho — encoste o mouse no topo da tela pra revelar'
            }
            className="flex h-8 w-8 items-center justify-center rounded-[9px] transition-colors hover:bg-sunken"
          >
            {headerHidden ? (
              <PanelTopOpen size={14} strokeWidth={1.8} className="text-ink-soft" />
            ) : (
              <PanelTopClose size={14} strokeWidth={1.8} className="text-ink-soft" />
            )}
          </button>
        )}
        <ThemeToggle />
        {activeRestaurantId && (
          <NotificationsBell restaurantId={activeRestaurantId} />
        )}
        <div className="mx-0.5 h-5 w-px bg-rule" />
        <div className="flex h-8 items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-teal-soft text-xs font-bold text-teal-deep">
            {initial}
          </div>
          <div data-user-meta className="flex flex-col justify-center leading-[1.3]">
            <p className="text-[12.5px] font-semibold text-ink">{shortEmail}</p>
            <p className="text-[10.5px] capitalize text-ink-muted">
              {active?.role ?? 'membro'}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-ink-soft transition-colors hover:bg-sunken hover:text-red"
              aria-label="Sair"
            >
              <LogOut size={13} strokeWidth={1.8} />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
