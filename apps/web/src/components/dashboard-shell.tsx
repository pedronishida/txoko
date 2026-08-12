'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { CommandPalette } from '@/components/command-palette'
import { OfflineBanner } from '@/components/offline-banner'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'
import type { Membership } from '@/lib/server/restaurant'

type Props = {
  user: { id: string; email: string }
  memberships: Membership[]
  activeRestaurantId: string | null
  children: React.ReactNode
}

export function DashboardShell({
  user,
  memberships,
  activeRestaurantId,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  // Recolhe o sidebar automaticamente em telas menores
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const sync = () => setCollapsed(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener('change', sync)
    return () => mediaQuery.removeEventListener('change', sync)
  }, [])

  const sidebarWidth = collapsed ? 56 : 232

  return (
    <div
      className="h-screen grid gap-3 px-3 pb-3 overflow-hidden bg-bg"
      style={{
        gridTemplateColumns: `${sidebarWidth}px 1fr`,
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <div className="col-span-2 -mx-3">
        <OfflineBanner />
        <Header
          user={user}
          memberships={memberships}
          activeRestaurantId={activeRestaurantId}
        />
      </div>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        restaurantId={activeRestaurantId}
      />
      <main className="island flex flex-col overflow-hidden min-w-0 animate-fade-in">
        <div className="flex-1 overflow-y-auto thin-scroll px-8 py-6">
          {children}
        </div>
      </main>
      <CommandPalette />
      <PwaInstallPrompt />
    </div>
  )
}
