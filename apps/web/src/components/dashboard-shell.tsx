'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { CommandPalette } from '@/components/command-palette'
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

  return (
    <div className="min-h-screen bg-night">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        restaurantId={activeRestaurantId}
      />
      <div
        className="transition-[padding] duration-200 ease-out"
        style={{ paddingLeft: collapsed ? '60px' : '220px' }}
      >
        <Header
          user={user}
          memberships={memberships}
          activeRestaurantId={activeRestaurantId}
        />
        <div className="px-6 pt-4">
          <Breadcrumbs />
        </div>
        <main className="p-6 pt-4 animate-fade-in">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}
