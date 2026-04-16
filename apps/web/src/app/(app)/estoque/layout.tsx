'use client'

import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/estoque', label: 'Insumos' },
  { key: '/estoque/fornecedores', label: 'Fornecedores' },
  { key: '/estoque/fichas', label: 'Fichas tecnicas' },
]

export default function EstoqueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = TABS.find((t) => t.key === pathname)?.key ?? '/estoque'

  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6">
        <PageHeader
          title="Estoque"
          subtitle="Insumos, fornecedores e fichas tecnicas"
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
