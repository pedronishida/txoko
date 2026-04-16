'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { name: 'Clientes', href: '/clientes' },
  { name: 'Fidelidade', href: '/clientes/fidelidade' },
]

export default function ClientesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="-mx-8 -mt-6">
      <header className="px-8 pt-6 pb-5 border-b border-night-lighter">
        <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
          Clientes
        </h1>
        <p className="text-[13px] text-stone mt-2 tracking-tight">
          CRM, fidelidade e campanhas de marketing
        </p>
        <div className="mt-6 flex items-center gap-6">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'relative text-[12px] font-medium tracking-tight transition-colors pb-2 -mb-2',
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
      </header>
      <div className="px-8 py-8">{children}</div>
    </div>
  )
}
