'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pdv: 'PDV',
  pedidos: 'Pedidos',
  kds: 'KDS',
  cardapio: 'Cardapio',
  mesas: 'Mesas',
  financeiro: 'Financeiro',
  caixa: 'Caixa',
  contas: 'Contas',
  notas: 'Notas Fiscais',
  estoque: 'Estoque',
  fornecedores: 'Fornecedores',
  fichas: 'Fichas Tecnicas',
  clientes: 'Clientes',
  fidelidade: 'Fidelidade',
  avaliacoes: 'Avaliacoes',
  assistente: 'Assistente IA',
  automacoes: 'Automacoes',
  configuracoes: 'Configuracoes',
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  // Nao mostra em / ou em /dashboard puro
  if (segments.length <= 1) return null

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = LABELS[segment] ?? segment
    const isLast = index === segments.length - 1
    return { href, label, isLast }
  })

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs">
      {crumbs.map((crumb, i) => (
        <div key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="text-muted" />}
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
