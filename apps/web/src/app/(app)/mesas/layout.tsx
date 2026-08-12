'use client'

import { usePathname, useRouter } from 'next/navigation'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/mesas', label: 'Salao' },
  { key: '/mesas/qrs', label: 'QR Codes' },
  { key: '/mesas/configuracao', label: 'Configuracao' },
]

export default function MesasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab =
    TABS.find(
      (t) => pathname === t.key || (t.key !== '/mesas' && pathname.startsWith(t.key))
    )?.key ?? '/mesas'

  return (
    <div>
      <header className="mb-2">
        <h1 className="text-[20px] font-medium tracking-[-0.02em] text-foreground leading-none">
          Mesas
        </h1>
        <p className="text-[12px] text-muted tracking-tight mt-2">
          Salao, QR codes e regras de comanda
        </p>
      </header>
      <TabBar
        tabs={TABS}
        active={activeTab}
        onChange={(key) => router.push(key)}
        className="mb-8"
      />
      <div>{children}</div>
    </div>
  )
}
