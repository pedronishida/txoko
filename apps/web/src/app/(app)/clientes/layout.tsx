'use client'

import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/clientes', label: 'Clientes' },
  { key: '/clientes/fidelidade', label: 'Fidelidade' },
]

export default function ClientesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = TABS.find((t) => t.key === pathname)?.key ?? '/clientes'

  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6">
        <PageHeader
          title="Clientes"
          subtitle="CRM, fidelidade e campanhas de marketing"
          border={false}
        />
        <TabBar
          tabs={TABS}
          active={activeTab}
          onChange={(key) => router.push(key)}
        />
      </div>
      <div className="px-8 py-8">{children}</div>
    </div>
  )
}
