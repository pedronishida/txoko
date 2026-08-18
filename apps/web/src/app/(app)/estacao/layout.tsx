'use client'

import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/estacao/cartoes', label: 'Cartoes' },
  { key: '/estacao/qr', label: 'QR da comanda' },
]

export default function EstacaoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = TABS.find((t) => t.key === pathname)?.key ?? '/estacao/cartoes'

  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6">
        <PageHeader
          title="Estacao"
          subtitle="Self-service por peso e unidade — cartoes, cadastros e operacao"
          border={false}
        />
        <TabBar tabs={TABS} active={activeTab} onChange={(key) => router.push(key)} />
      </div>
      <div className="px-8 py-8">{children}</div>
    </div>
  )
}
