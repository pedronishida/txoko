'use client'

import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/financeiro', label: 'Visao geral' },
  { key: '/financeiro/caixa', label: 'Caixa' },
  { key: '/financeiro/contas', label: 'Contas' },
  { key: '/financeiro/notas', label: 'Notas fiscais' },
]

export default function FinanceiroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = TABS.find((t) => t.key === pathname)?.key ?? '/financeiro'

  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6">
        <PageHeader
          title="Financeiro"
          subtitle="Gestao financeira completa do restaurante"
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
