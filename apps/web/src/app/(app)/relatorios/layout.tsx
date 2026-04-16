'use client'

import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/relatorios/financeiro', label: 'Financeiro (DRE)' },
  { key: '/relatorios/vendas', label: 'Vendas' },
  { key: '/relatorios/produtos', label: 'Produtos (ABC)' },
  { key: '/relatorios/clientes', label: 'Clientes (RFM)' },
]

export default function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = TABS.find((t) => pathname.startsWith(t.key))?.key ?? '/relatorios/financeiro'

  return (
    <div className="-mx-8 -mt-6 print:m-0">
      <div className="px-8 pt-6 print:px-0 print:pt-0">
        <PageHeader
          title="Relatorios"
          subtitle="Analise financeira, vendas, produtos e clientes"
          border={false}
          action={
            <button
              type="button"
              onClick={() => window.print()}
              className="text-[12px] tracking-tight px-4 h-8 rounded border border-night-lighter text-stone hover:text-cloud hover:border-stone-dark transition-colors print:hidden"
            >
              Exportar PDF
            </button>
          }
        />
        <TabBar
          tabs={TABS}
          active={activeTab}
          onChange={(key) => router.push(key)}
          className="print:hidden"
        />
      </div>
      <div className="px-8 py-8 print:px-0 print:py-4">{children}</div>
    </div>
  )
}
