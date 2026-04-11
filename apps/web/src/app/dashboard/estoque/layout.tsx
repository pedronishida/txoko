'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { name: 'Insumos', href: '/dashboard/estoque' },
  { name: 'Fornecedores', href: '/dashboard/estoque/fornecedores' },
  { name: 'Fichas Tecnicas', href: '/dashboard/estoque/fichas' },
]

export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-cloud">Estoque</h1>
        <p className="text-sm text-stone mt-1">Insumos, fornecedores e fichas tecnicas</p>
      </div>

      <div className="flex items-center gap-1 border-b border-night-lighter">
        {tabs.map(tab => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive ? 'border-leaf text-leaf' : 'border-transparent text-stone hover:text-cloud'
              )}
            >
              {tab.name}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
