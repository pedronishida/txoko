'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { StoreProvider } from '@/lib/store'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <StoreProvider>
      <div className="min-h-screen bg-night">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <div
          className="transition-all duration-200"
          style={{ paddingLeft: collapsed ? '4rem' : '14rem' }}
        >
          <Header />
          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </StoreProvider>
  )
}
