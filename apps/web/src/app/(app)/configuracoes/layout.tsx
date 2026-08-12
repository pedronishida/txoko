'use client'

import { usePathname, useRouter } from 'next/navigation'
import { TabBar } from '@/components/tab-bar'

const TABS = [
  { key: '/configuracoes', label: 'Geral' },
  { key: '/configuracoes/operacao', label: 'Operacao' },
  { key: '/configuracoes/canais', label: 'Canais' },
  { key: '/configuracoes/assistente', label: 'Assistente IA' },
  { key: '/configuracoes/agente-admin', label: 'Agente admin' },
  { key: '/configuracoes/conhecimento', label: 'Base de conhecimento' },
  { key: '/configuracoes/marketing', label: 'Marketing' },
  { key: '/configuracoes/faturamento', label: 'Faturamento' },
]

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab =
    TABS.find(
      (t) =>
        pathname === t.key ||
        (t.key !== '/configuracoes' && pathname.startsWith(t.key))
    )?.key ?? '/configuracoes'

  return (
    <div>
      <header className="mb-2">
        <h1 className="text-[20px] font-medium tracking-[-0.02em] text-foreground leading-none">
          Configuracoes
        </h1>
        <p className="text-[12px] text-muted tracking-tight mt-2">
          Restaurante, operacao, canais e faturamento
        </p>
      </header>
      <TabBar
        tabs={TABS}
        active={activeTab}
        onChange={(key) => router.push(key)}
        className="mb-8"
      />
      <div>{children}</div>
    </div>
  )
}
