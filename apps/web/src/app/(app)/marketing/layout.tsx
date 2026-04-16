'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { name: 'Campanhas', href: '/marketing' },
  { name: 'Templates', href: '/marketing/templates' },
  { name: 'Audiencias', href: '/marketing/audiences' },
]

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Sub-rotas de campanhas usam o tab "Campanhas"
  const activeTab = tabs.find(
    (t) =>
      pathname === t.href ||
      (t.href !== '/marketing' && pathname.startsWith(t.href))
  )?.href ?? '/marketing'

  return (
    <div>
      <div className="flex items-center gap-6 mb-6 -mt-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative text-[12px] font-medium tracking-tight transition-colors pb-2',
                isActive ? 'text-cloud' : 'text-stone hover:text-stone-light'
              )}
            >
              {tab.name}
              {isActive && (
                <span className="absolute left-0 right-0 -bottom-px h-px bg-cloud" />
              )}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
