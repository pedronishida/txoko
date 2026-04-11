'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { MOCK_CASH_MOVEMENTS, type CashMovement } from '@/lib/mock-financial'
import { cn } from '@/lib/utils'
import { DollarSign, ArrowUpCircle, ArrowDownCircle, CheckCircle2, Clock, Banknote, CreditCard, QrCode, Globe } from 'lucide-react'

const METHOD_ICON: Record<string, typeof DollarSign> = {
  cash: Banknote,
  credit: CreditCard,
  debit: CreditCard,
  pix: QrCode,
  online: Globe,
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
  online: 'Online',
}

export default function CaixaPage() {
  const [movements] = useState<CashMovement[]>(MOCK_CASH_MOVEMENTS)
  const [closed, setClosed] = useState(false)

  const totalSales = movements.filter(m => m.type === 'sale').reduce((s, m) => s + m.amount, 0)
  const totalSupply = movements.filter(m => m.type === 'supply').reduce((s, m) => s + m.amount, 0)
  const totalWithdrawals = movements.filter(m => m.type === 'withdrawal').reduce((s, m) => s + Math.abs(m.amount), 0)
  const totalExpenses = movements.filter(m => m.type === 'expense').reduce((s, m) => s + Math.abs(m.amount), 0)
  const cashBalance = totalSupply + totalSales - totalWithdrawals - totalExpenses

  const salesByMethod: Record<string, number> = {}
  movements.filter(m => m.type === 'sale').forEach(m => {
    salesByMethod[m.method] = (salesByMethod[m.method] || 0) + m.amount
  })

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Vendas do Dia</p>
          <p className="text-xl font-bold font-data text-leaf">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Suprimento</p>
          <p className="text-xl font-bold font-data text-cloud">{formatCurrency(totalSupply)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Sangrias</p>
          <p className="text-xl font-bold font-data text-warm">{formatCurrency(totalWithdrawals)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Despesas</p>
          <p className="text-xl font-bold font-data text-coral">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="bg-night-light border border-leaf/20 rounded-xl p-4">
          <p className="text-xs text-stone mb-1">Saldo em Caixa</p>
          <p className="text-xl font-bold font-data text-leaf">{formatCurrency(cashBalance)}</p>
        </div>
      </div>

      {/* Sales by Payment Method */}
      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter">
          <h2 className="text-sm font-semibold text-cloud">Vendas por Forma de Pagamento</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-night-lighter">
          {Object.entries(salesByMethod).map(([method, amount]) => {
            const Icon = METHOD_ICON[method] || DollarSign
            return (
              <div key={method} className="px-4 py-3 flex items-center gap-3">
                <Icon size={18} className="text-stone-light" />
                <div>
                  <p className="text-xs text-stone">{METHOD_LABEL[method] || method}</p>
                  <p className="text-sm font-bold font-data text-cloud">{formatCurrency(amount)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Movement List */}
      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="px-5 py-3 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-sm font-semibold text-cloud">Movimentacoes do Dia</h2>
          <span className="text-xs text-stone font-data">{movements.length} registros</span>
        </div>
        <div className="divide-y divide-night-lighter max-h-96 overflow-y-auto">
          {movements.map(m => {
            const isPositive = m.amount > 0
            return (
              <div key={m.id} className="px-5 py-2.5 flex items-center gap-3">
                <div className={cn(
                  'p-1.5 rounded-lg',
                  m.type === 'sale' ? 'bg-leaf/10' :
                  m.type === 'supply' ? 'bg-cloud/10' :
                  m.type === 'withdrawal' ? 'bg-warm/10' :
                  'bg-coral/10'
                )}>
                  {isPositive ? (
                    <ArrowUpCircle size={16} className={m.type === 'sale' ? 'text-leaf' : 'text-cloud'} />
                  ) : (
                    <ArrowDownCircle size={16} className={m.type === 'withdrawal' ? 'text-warm' : 'text-coral'} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cloud truncate">{m.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-stone font-data flex items-center gap-1">
                      <Clock size={10} />
                      {m.time}
                    </span>
                    <span className="text-[10px] text-stone capitalize">{METHOD_LABEL[m.method] || m.method}</span>
                  </div>
                </div>
                <span className={cn(
                  'text-sm font-data font-semibold',
                  isPositive ? 'text-leaf' : 'text-coral'
                )}>
                  {isPositive ? '+' : ''}{formatCurrency(m.amount)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Close Register */}
      {!closed ? (
        <button
          onClick={() => setClosed(true)}
          className="w-full py-3 bg-leaf text-night font-semibold rounded-xl text-sm hover:bg-leaf-dark transition-colors"
        >
          Fechar Caixa do Dia
        </button>
      ) : (
        <div className="bg-leaf/5 border border-leaf/20 rounded-xl p-5 text-center">
          <CheckCircle2 size={32} className="text-leaf mx-auto mb-2" />
          <p className="font-semibold text-cloud">Caixa Fechado</p>
          <p className="text-sm text-stone mt-1">
            Saldo final: <span className="font-data font-semibold text-leaf">{formatCurrency(cashBalance)}</span>
          </p>
          <p className="text-xs text-stone mt-2">Relatorio enviado por e-mail ao proprietario</p>
        </div>
      )}
    </div>
  )
}
