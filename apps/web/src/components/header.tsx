'use client'

import { useState, useTransition } from 'react'
import { Building2, Check, ChevronDown, LogOut, Search } from 'lucide-react'
import { logoutAction } from '@/app/(auth)/actions'
import { switchRestaurant, type Membership } from '@/lib/server/restaurant'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationsBell } from '@/components/notifications-bell'

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

  return (
    <header className="h-14 border-b border-night-lighter bg-night-light/50 backdrop-blur-sm flex items-center justify-between px-6">
      <div className="flex items-center gap-3 flex-1">
        {active && (
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              disabled={memberships.length < 2}
              className="flex items-center gap-2 px-3 py-1.5 bg-night border border-night-lighter rounded-lg text-sm text-cloud hover:border-primary/30 transition-colors disabled:opacity-60 disabled:cursor-default"
            >
              <Building2 size={14} className="text-leaf" />
              <span className="font-medium max-w-[160px] truncate">{active.name}</span>
              {memberships.length > 1 && (
                <ChevronDown
                  size={12}
                  className={`text-stone transition-transform ${open ? 'rotate-180' : ''}`}
                />
              )}
            </button>
            {open && memberships.length > 1 && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-64 bg-night-light border border-night-lighter rounded-lg shadow-xl z-40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-night-lighter">
                    <p className="text-[10px] text-stone uppercase tracking-wider">
                      Seus restaurantes
                    </p>
                  </div>
                  {memberships.map((m) => (
                    <button
                      key={m.restaurant_id}
                      onClick={() => handleSwitch(m.restaurant_id)}
                      disabled={pending}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-night transition-colors disabled:opacity-50"
                    >
                      <div className="text-left min-w-0">
                        <p className="text-sm text-cloud truncate">{m.name}</p>
                        <p className="text-[10px] text-stone capitalize">{m.role}</p>
                      </div>
                      {m.restaurant_id === activeRestaurantId && (
                        <Check size={14} className="text-leaf shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <button
          onClick={() => {
            const ev = new KeyboardEvent('keydown', {
              key: 'k',
              metaKey: true,
              ctrlKey: true,
              bubbles: true,
            })
            window.dispatchEvent(ev)
          }}
          className="relative flex items-center gap-2 w-full max-w-sm px-3 py-1.5 bg-night border border-night-lighter rounded-lg text-sm text-stone hover:border-primary/30 hover:text-cloud transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Buscar produtos, clientes...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-data border bg-night-light">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        {activeRestaurantId && (
          <NotificationsBell restaurantId={activeRestaurantId} />
        )}

        <div className="flex items-center gap-2 pl-3 border-l border-night-lighter">
          <div className="w-8 h-8 rounded-full bg-leaf/20 flex items-center justify-center text-leaf text-sm font-bold">
            {initial}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-cloud leading-tight">{shortEmail}</p>
            <p className="text-xs text-stone leading-tight capitalize">
              {active?.role ?? 'Membro'}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="p-2 rounded-lg text-stone hover:text-coral hover:bg-night-lighter transition-colors"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
