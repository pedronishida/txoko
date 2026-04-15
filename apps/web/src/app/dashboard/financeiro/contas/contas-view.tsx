'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  cancelTransaction,
  deleteTransaction,
  markPaid,
  saveTransaction,
} from './actions'

export type TransactionRow = {
  id: string
  type: 'income' | 'expense' | 'transfer'
  category: string
  description: string | null
  amount: number
  due_date: string | null
  paid_at: string | null
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  created_at: string
}

type Tab = 'expense' | 'income'
type StatusFilter = 'all' | 'pending' | 'paid' | 'overdue'

const STATUS_CONFIG: Record<
  'pending' | 'paid' | 'overdue' | 'cancelled',
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Pendente', color: 'text-warm', bg: 'bg-warm/10' },
  paid: { label: 'Pago', color: 'text-leaf', bg: 'bg-leaf/10' },
  overdue: { label: 'Vencido', color: 'text-coral', bg: 'bg-coral/10' },
  cancelled: { label: 'Cancelado', color: 'text-stone', bg: 'bg-stone/10' },
}

const CATEGORIES_EXPENSE = [
  'fornecedor',
  'aluguel',
  'pessoal',
  'utilidades',
  'marketing',
  'manutencao',
  'impostos',
  'outros',
]
const CATEGORIES_INCOME = ['cartao', 'delivery', 'evento', 'investimento', 'outros']

export function ContasView({ transactions }: { transactions: TransactionRow[] }) {
  const [tab, setTab] = useState<Tab>('expense')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [formDesc, setFormDesc] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formDueDate, setFormDueDate] = useState('')

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => {
        if (t.type !== tab) return false
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        return true
      })
      .sort((a, b) => {
        if (!a.due_date || !b.due_date) return 0
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      })
  }, [transactions, tab, statusFilter])

  const summary = useMemo(() => {
    const tabTx = transactions.filter((t) => t.type === tab)
    return {
      pending: tabTx
        .filter((t) => t.status === 'pending')
        .reduce((s, t) => s + Number(t.amount), 0),
      overdue: tabTx
        .filter((t) => t.status === 'overdue')
        .reduce((s, t) => s + Number(t.amount), 0),
      paid: tabTx.filter((t) => t.status === 'paid').reduce((s, t) => s + Number(t.amount), 0),
    }
  }, [transactions, tab])

  function openForm(tx: TransactionRow | null) {
    setError(null)
    if (tx) {
      setEditing(tx)
      setFormDesc(tx.description ?? '')
      setFormAmount(String(tx.amount))
      setFormCategory(tx.category)
      setFormDueDate(tx.due_date ?? '')
    } else {
      setEditing(null)
      setFormDesc('')
      setFormAmount('')
      setFormCategory('')
      setFormDueDate('')
    }
    setShowForm(true)
  }

  function handleSave() {
    if (!formDesc || !formAmount || !formCategory) return
    startTransition(async () => {
      const res = await saveTransaction({
        id: editing?.id,
        type: tab,
        description: formDesc,
        amount: parseFloat(formAmount),
        category: formCategory,
        due_date: formDueDate || null,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
    })
  }

  function handleMarkPaid(id: string) {
    startTransition(() => {
      void markPaid(id)
    })
  }

  function handleCancel(id: string) {
    startTransition(() => {
      void cancelTransaction(id)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Excluir esta transacao?')) return
    startTransition(() => {
      void deleteTransaction(id)
    })
  }

  const formatDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('expense')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            tab === 'expense'
              ? 'bg-coral/10 text-coral border border-coral/30'
              : 'bg-night-light text-stone-light border border-night-lighter'
          )}
        >
          <ArrowDownCircle size={16} />
          Contas a Pagar
        </button>
        <button
          onClick={() => setTab('income')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            tab === 'income'
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'bg-night-light text-stone-light border border-night-lighter'
          )}
        >
          <ArrowUpCircle size={16} />
          Contas a Receber
        </button>
        <div className="flex-1" />
        <button
          onClick={() => openForm(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} /> Nova{' '}
          {tab === 'expense' ? 'Despesa' : 'Entrada'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-night-light border border-warm/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-warm" />
            <span className="text-xs text-stone">Pendentes</span>
          </div>
          <p className="text-2xl font-bold font-data text-warm">
            {formatCurrency(summary.pending)}
          </p>
        </div>
        <div className="bg-night-light border border-coral/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-coral" />
            <span className="text-xs text-stone">Vencidos</span>
          </div>
          <p className="text-2xl font-bold font-data text-coral">
            {formatCurrency(summary.overdue)}
          </p>
        </div>
        <div className="bg-night-light border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-leaf" />
            <span className="text-xs text-stone">Pagos</span>
          </div>
          <p className="text-2xl font-bold font-data text-leaf">
            {formatCurrency(summary.paid)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(['all', 'pending', 'overdue', 'paid'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary/10 text-primary'
                : 'bg-night-light text-stone-light border border-night-lighter'
            )}
          >
            {s === 'all'
              ? 'Todos'
              : s === 'pending'
              ? 'Pendentes'
              : s === 'overdue'
              ? 'Vencidos'
              : 'Pagos'}
          </button>
        ))}
      </div>

      <div className="bg-night-light border border-night-lighter rounded-xl">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 px-5 py-2.5 border-b border-night-lighter text-xs text-stone font-medium">
          <span>Descricao</span>
          <span>Categoria</span>
          <span>Valor</span>
          <span>Vencimento</span>
          <span>Status</span>
          <span></span>
        </div>
        <div className="divide-y divide-night-lighter max-h-[55vh] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-5 py-8 text-sm text-stone text-center">
              Nenhuma transacao encontrada
            </p>
          )}
          {filtered.map((tx) => {
            const cfg = STATUS_CONFIG[tx.status]
            return (
              <div
                key={tx.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 px-5 py-2.5 items-center text-sm"
              >
                <span className="text-cloud truncate">{tx.description ?? '—'}</span>
                <span className="text-xs text-stone capitalize">{tx.category}</span>
                <span className="font-data text-cloud">
                  {formatCurrency(Number(tx.amount))}
                </span>
                <span className="text-xs text-stone font-data">{formatDate(tx.due_date)}</span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium text-center',
                    cfg.bg,
                    cfg.color
                  )}
                >
                  {cfg.label}
                </span>
                <div className="flex items-center gap-0.5">
                  {tx.status !== 'paid' && tx.status !== 'cancelled' && (
                    <button
                      onClick={() => handleMarkPaid(tx.id)}
                      className="p-1 text-stone hover:text-leaf"
                      title="Marcar como pago"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => openForm(tx)}
                    className="p-1 text-stone hover:text-cloud"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  {tx.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancel(tx.id)}
                      className="p-1 text-stone hover:text-warm"
                      title="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(tx.id)}
                    className="p-1 text-stone hover:text-coral"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">
                {editing ? 'Editar' : 'Nova'}{' '}
                {tab === 'expense' ? 'Despesa' : 'Entrada'}
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
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Vencimento</label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">Categoria *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">Selecionar...</option>
                  {(tab === 'expense' ? CATEGORIES_EXPENSE : CATEGORIES_INCOME).map((c) => (
                    <option key={c} value={c} className="capitalize">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {pending ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
