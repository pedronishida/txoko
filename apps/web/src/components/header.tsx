'use client'

import { useState, useTransition } from 'react'
import { Check, ChevronDown, LogOut } from 'lucide-react'
import { logoutAction } from '@/app/(auth)/actions'
import { switchRestaurant, type Membership } from '@/lib/server/restaurant'
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
    <header className="h-14 border-b border-night-lighter flex items-center justify-between px-6 bg-bg/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {active && (
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              disabled={memberships.length < 2}
              className={cn(
                'flex items-center gap-2 h-8 text-[12px] tracking-tight rounded-md transition-colors',
                memberships.length < 2
                  ? 'text-cloud cursor-default'
                  : 'text-stone-light hover:text-cloud hover:bg-night-light px-2 -ml-2'
              )}
            >
              <span className="font-medium text-cloud truncate max-w-[200px]">
                {active.name}
              </span>
              {memberships.length > 1 && (
                <ChevronDown
                  size={12}
                  strokeWidth={1.75}
                  className={cn(
                    'text-stone-dark transition-transform duration-200',
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
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-night-light border border-night-lighter rounded-lg overflow-hidden z-40">
                  <div className="px-3.5 py-2 border-b border-night-lighter">
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                      Restaurantes
                    </p>
                  </div>
                  {memberships.map((m) => (
                    <button
                      key={m.restaurant_id}
                      onClick={() => handleSwitch(m.restaurant_id)}
                      disabled={pending}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-night-lighter transition-colors disabled:opacity-50"
                    >
                      <div className="text-left min-w-0">
                        <p className="text-[12px] text-cloud truncate tracking-tight">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-stone-dark capitalize tracking-tight">
                          {m.role}
                        </p>
                      </div>
                      {m.restaurant_id === activeRestaurantId && (
                        <Check
                          size={12}
                          strokeWidth={2}
                          className="text-cloud shrink-0"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={openCommandPalette}
          className="group flex items-center gap-2.5 h-8 px-0 text-[12px] text-stone-dark hover:text-stone-light transition-colors tracking-tight"
        >
          <span>Buscar</span>
          <kbd className="inline-flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[10px] font-data text-stone-dark border border-night-lighter">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        {activeRestaurantId && (
          <NotificationsBell restaurantId={activeRestaurantId} />
        )}
        <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-night-lighter h-8">
          <div className="w-6 h-6 rounded-full bg-night-lighter flex items-center justify-center text-[10px] font-medium text-cloud">
            {initial}
          </div>
          <div className="hidden sm:flex flex-col justify-center leading-none">
            <p className="text-[12px] font-medium text-cloud tracking-tight">
              {shortEmail}
            </p>
            <p className="text-[10px] text-stone-dark tracking-tight capitalize mt-0.5">
              {active?.role ?? 'membro'}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors ml-1"
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
