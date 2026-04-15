'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export function CloseRegisterButton({ balance }: { balance: number }) {
  const [closed, setClosed] = useState(false)

  if (closed) {
    return (
      <div className="bg-leaf/5 border border-leaf/20 rounded-xl p-5 text-center">
        <CheckCircle2 size={32} className="text-leaf mx-auto mb-2" />
        <p className="font-semibold text-cloud">Caixa Fechado</p>
        <p className="text-sm text-stone mt-1">
          Saldo final:{' '}
          <span className="font-data font-semibold text-leaf">{formatCurrency(balance)}</span>
        </p>
        <p className="text-xs text-stone mt-2">
          Snapshot local. Persistencia de sessoes de caixa sera adicionada quando a tabela
          cash_sessions for criada.
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={() => setClosed(true)}
      className="w-full py-3 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-primary-hover transition-colors"
    >
      Fechar Caixa do Dia
    </button>
  )
}
