'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

export function CloseRegisterButton({ balance }: { balance: number }) {
  const [closed, setClosed] = useState(false)

  if (closed) {
    return (
      <div className="pt-8 border-t border-night-lighter">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
          Caixa fechado
        </p>
        <p className="text-[22px] font-medium text-cloud font-data tracking-[-0.03em] leading-none mt-3">
          {formatCurrency(balance)}
        </p>
        <p className="text-[11px] text-stone-dark tracking-tight mt-2">
          Snapshot local. Persistencia de sessoes de caixa sera adicionada
          quando a tabela cash_sessions for criada.
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={() => setClosed(true)}
      className="h-10 px-5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
    >
      Fechar caixa do dia
    </button>
  )
}
