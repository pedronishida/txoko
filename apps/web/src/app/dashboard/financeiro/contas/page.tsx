'use client'

import { useState, useMemo } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { MOCK_TRANSACTIONS } from '@/lib/mock-financial'
import type { FinancialTransaction } from '@txoko/shared'
import { Plus, X, AlertTriangle, CheckCircle2, Clock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'

type Tab = 'expense' | 'income'
type StatusFilter = 'all' | 'pending' | 'paid' | 'overdue'

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: 'text-warm', bg: 'bg-warm/10' },
  paid: { label: 'Pago', color: 'text-leaf', bg: 'bg-leaf/10' },
  overdue: { label: 'Vencido', color: 'text-coral', bg: 'bg-coral/10' },
  cancelled: { label: 'Cancelado', color: 'text-stone', bg: 'bg-stone/10' },
}

const CATEGORIES_EXPENSE = ['fornecedor', 'aluguel', 'pessoal', 'utilidades', 'marketing', 'manutencao', 'impostos', 'outros']
const CATEGORIES_INCOME = ['cartao', 'delivery', 'evento', 'outros']

export default function ContasPage() {
  const [tab, setTab] = useState<Tab>('expense')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [transactions, setTransactions] = useState(MOCK_TRANSACTIONS)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formDesc, setFormDesc] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formDueDate, setFormDueDate] = useState('')

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (t.type !== tab) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      return true
    }).sort((a, b) => {
      if (!a.due_date || !b.due_date) return 0
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
  }, [transactions, tab, statusFilter])

  const summary = useMemo(() => {
    const tabTx = transactions.filter(t => t.type === tab)
    return {
      pending: tabTx.filter(t => t.status === 'pending').reduce((s, t) => s + t.amount, 0),
      overdue: tabTx.filter(t => t.status === 'overdue').reduce((s, t) => s + t.amount, 0),
      paid: tabTx.filter(t => t.status === 'paid').reduce((s, t) => s + t.amount, 0),
    }
  }, [transactions, tab])

  function handleAdd() {
    if (!formDesc || !formAmount || !formDueDate) return
    const newTx: FinancialTransaction = {
      id: `ft-${Date.now()}`,
      restaurant_id: 'rest-1',
      type: tab,
      category: formCategory || 'outros',
      description: formDesc,
      amount: parseFloat(formAmount),
      due_date: formDueDate,
      paid_at: null,
      status: 'pending',
      recurrence: null,
      payment_method: null,
      document_url: null,
      created_at: new Date().toISOString(),
    }
    setTransactions(prev => [...prev, newTx])
    setFormDesc('')
    setFormAmount('')
    setFormCategory('')
    setFormDueDate('')
    setShowForm(false)
  }

  function markPaid(id: string) {
    setTransactions(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'paid', paid_at: new Date().toISOString() } : t
    ))
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('pt-BR')
  }

  return (
    <div className="space-y-5">
      {/* Tab Selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setTab('expense'); setStatusFilter('all') }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            tab === 'expense' ? 'bg-coral/10 text-coral' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
          )}
        >
          <ArrowDownCircle size={16} />
          A Pagar
        </button>
        <button
          onClick={() => { setTab('income'); setStatusFilter('all') }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            tab === 'income' ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
          )}
        >
          <ArrowUpCircle size={16} />
          A Receber
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors"
        >
          <Plus size={16} />
          Nova Conta
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={14} className="text-warm" />
            <p className="text-xs text-stone">Pendente</p>
          </div>
          <p className="text-lg font-bold font-data text-warm">{formatCurrency(summary.pending)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={14} className="text-coral" />
            <p className="text-xs text-stone">Vencido</p>
          </div>
          <p className="text-lg font-bold font-data text-coral">{formatCurrency(summary.overdue)}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={14} className="text-leaf" />
            <p className="text-xs text-stone">Pago no Mes</p>
          </div>
          <p className="text-lg font-bold font-data text-leaf">{formatCurrency(summary.paid)}</p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2">
        {(['all', 'pending', 'overdue', 'paid'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === s ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
            )}
          >
            {s === 'all' ? 'Todos' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="divide-y divide-night-lighter">
          {filtered.map(tx => {
            const cfg = STATUS_CONFIG[tx.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
            return (
              <div key={tx.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cloud truncate">{tx.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-stone capitalize px-1.5 py-0.5 rounded bg-night-lighter">{tx.category}</span>
                    {tx.recurrence && (
                      <span className="text-[10px] text-stone">Recorrente ({tx.recurrence})</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-data font-semibold text-cloud">{formatCurrency(tx.amount)}</p>
                  <p className="text-[10px] text-stone font-data">Venc: {formatDate(tx.due_date)}</p>
                </div>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', cfg.bg, cfg.color)}>
                  {cfg.label}
                </span>
                {(tx.status === 'pending' || tx.status === 'overdue') && (
                  <button
                    onClick={() => markPaid(tx.id)}
                    className="px-2 py-1 text-[10px] font-medium bg-leaf/10 text-leaf rounded-lg hover:bg-leaf/20 transition-colors"
                  >
                    Pagar
                  </button>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-stone text-sm">Nenhuma conta encontrada</div>
          )}
        </div>
      </div>

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">
                Nova Conta {tab === 'expense' ? 'a Pagar' : 'a Receber'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-stone hover:text-cloud">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm text-stone-light mb-1">Descricao *</label>
                <input
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50"
                  placeholder="Ex: Fornecedor de carnes"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-leaf/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Vencimento *</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-leaf/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">Categoria</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50"
                >
                  <option value="">Selecione...</option>
                  {(tab === 'expense' ? CATEGORIES_EXPENSE : CATEGORIES_INCOME).map(c => (
                    <option key={c} value={c} className="capitalize">{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors">
                  Cancelar
                </button>
                <button onClick={handleAdd} className="flex-1 py-2.5 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors">
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
