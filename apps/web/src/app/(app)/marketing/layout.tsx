'use client'

import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/marketing', label: 'Campanhas' },
  { key: '/marketing/templates', label: 'Templates' },
  { key: '/marketing/audiences', label: 'Audiencias' },
]

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  // Sub-rotas de campanhas usam o tab "Campanhas"
  const activeTab =
    TABS.find(
      (t) =>
        pathname === t.key ||
        (t.key !== '/marketing' && pathname.startsWith(t.key))
    )?.key ?? '/marketing'

  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6">
        <PageHeader
          title="Marketing"
          subtitle="Campanhas, templates e audiencias"
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
