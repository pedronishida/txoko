'use client'

import { PageHeader } from '@/components/page-header'

export default function EstacaoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="-mx-8 -mt-6">
      <div className="px-8 pt-6">
        <PageHeader
          title="Estacao"
          subtitle="Self-service por peso e unidade — cartoes, cadastros e operacao"
        />
      </div>
      <div className="px-8 py-8">{children}</div>
    </div>
  )
}
