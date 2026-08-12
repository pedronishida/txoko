'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { Plus, X } from 'lucide-react'
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

const STATUS_LABEL: Record<
  'pending' | 'paid' | 'overdue' | 'cancelled',
  string
> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
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
const CATEGORIES_INCOME = [
  'cartao',
  'delivery',
  'evento',
  'investimento',
  'outros',
]

export function ContasView({
  transactions,
}: {
  transactions: TransactionRow[]
}) {
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
      paid: tabTx
        .filter((t) => t.status === 'paid')
        .reduce((s, t) => s + Number(t.amount), 0),
    }
  }, [transactions, tab])

  const counts = useMemo(() => {
    const tabTx = transactions.filter((t) => t.type === tab)
    return {
      all: tabTx.length,
      pending: tabTx.filter((t) => t.status === 'pending').length,
      overdue: tabTx.filter((t) => t.status === 'overdue').length,
      paid: tabTx.filter((t) => t.status === 'paid').length,
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
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setTab('expense')}
            className={cn(
              'relative text-[12px] font-medium tracking-tight transition-colors pb-2 -mb-2',
              tab === 'expense'
                ? 'text-foreground'
                : 'text-muted hover:text-foreground/75'
            )}
          >
            Contas a pagar
            {tab === 'expense' && (
              <span className="absolute left-0 right-0 -bottom-px h-px bg-primary" />
            )}
          </button>
          <button
            onClick={() => setTab('income')}
            className={cn(
              'relative text-[12px] font-medium tracking-tight transition-colors pb-2 -mb-2',
              tab === 'income'
                ? 'text-foreground'
                : 'text-muted hover:text-foreground/75'
            )}
          >
            Contas a receber
            {tab === 'income' && (
              <span className="absolute left-0 right-0 -bottom-px h-px bg-primary" />
            )}
          </button>
        </div>
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-primary text-primary-foreground text-[13px] font-semibold rounded-md hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Nova {tab === 'expense' ? 'despesa' : 'entrada'}
        </button>
      </div>

      {error && (
        <div className="mb-6 px-3.5 py-2.5 bg-destructive/5 border border-destructive/20 rounded-md text-[12px] text-destructive font-medium tracking-tight">
          {error}
        </div>
      )}

      {/* KPI band */}
      <section className="grid grid-cols-3 gap-x-10 pb-8 mb-8 border-b border-border">
        <Metric label="Pendentes" value={formatCurrency(summary.pending)} tone="warm" />
        <Metric label="Vencidos" value={formatCurrency(summary.overdue)} tone="destructive" />
        <Metric label="Pagos" value={formatCurrency(summary.paid)} tone="success" />
      </section>

      {/* Status filter */}
      <div className="flex items-center gap-6 mb-6 pb-4 border-b border-border">
        {(['all', 'pending', 'overdue', 'paid'] as const).map((s) => {
          const label =
            s === 'all'
              ? 'Todos'
              : s === 'pending'
                ? 'Pendentes'
                : s === 'overdue'
                  ? 'Vencidos'
                  : 'Pagos'
          const active = statusFilter === s
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'relative text-[12px] font-medium tracking-tight transition-colors pb-4 -mb-4',
                active ? 'text-foreground' : 'text-muted hover:text-foreground/75'
              )}
            >
              {label}
              <span className="ml-1.5 text-[10px] font-data text-muted">
                {counts[s as keyof typeof counts]}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-px bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_auto] gap-4 pb-3 border-b border-border text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
          <span>Descricao</span>
          <span>Categoria</span>
          <span className="text-right">Valor</span>
          <span>Vencimento</span>
          <span>Status</span>
          <span></span>
        </div>
        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-muted tracking-tight">
              Nenhuma transacao encontrada
            </p>
          ) : (
            filtered.map((tx) => (
              <div
                key={tx.id}
                className="group grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_auto] gap-4 py-3 items-center"
              >
                <span className="text-[13px] text-foreground tracking-tight truncate">
                  {tx.description ?? '—'}
                </span>
                <span className="text-[11px] text-muted tracking-tight capitalize">
                  {tx.category}
                </span>
                <span className="text-[12px] font-data text-foreground text-right">
                  {formatCurrency(Number(tx.amount))}
                </span>
                <span className="text-[11px] text-muted font-data">
                  {formatDate(tx.due_date)}
                </span>
                <span
                  className={cn(
                    'text-[11px] tracking-tight font-medium',
                    tx.status === 'paid' && 'text-success',
                    tx.status === 'pending' && 'text-accent-foreground',
                    tx.status === 'overdue' && 'text-destructive',
                    tx.status === 'cancelled' && 'text-muted'
                  )}
                >
                  {STATUS_LABEL[tx.status]}
                </span>
                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  {tx.status !== 'paid' && tx.status !== 'cancelled' && (
                    <button
                      onClick={() => handleMarkPaid(tx.id)}
                      className="text-[10px] text-muted hover:text-success tracking-tight"
                    >
                      pagar
                    </button>
                  )}
                  <button
                    onClick={() => openForm(tx)}
                    className="text-[10px] text-foreground/75 hover:text-foreground tracking-tight"
                  >
                    editar
                  </button>
                  {tx.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancel(tx.id)}
                      className="text-[10px] text-muted hover:text-accent-foreground tracking-tight"
                    >
                      cancelar
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(tx.id)}
                    className="text-[10px] text-muted hover:text-primary tracking-tight"
                  >
                    remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-foreground tracking-tight">
                {editing ? 'Editar' : 'Nova'}{' '}
                {tab === 'expense' ? 'despesa' : 'entrada'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-muted-subtle transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <Field label="Descricao *">
                <input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark transition-colors"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Valor *">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="R$"
                    className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground placeholder:text-muted font-data focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>
                <Field label="Vencimento">
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full h-10 px-3.5 bg-night border border-border rounded-md text-[13px] text-foreground font-data focus:outline-none focus:border-stone-dark transition-colors"
                  />
                </Field>
              </div>
              <Field label="Categoria *">
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full h-10 px-3 bg-night border border-border rounded-md text-[13px] text-foreground focus:outline-none focus:border-stone-dark transition-colors capitalize"
                >
                  <option value="">Selecionar</option>
                  {(tab === 'expense'
                    ? CATEGORIES_EXPENSE
                    : CATEGORIES_INCOME
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-10 border border-border rounded-md text-[13px] text-foreground/75 hover:text-foreground hover:border-stone-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 h-10 bg-primary text-primary-foreground rounded-md text-[13px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-40"
                >
                  {pending ? 'Salvando' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'warm' | 'primary' | 'destructive' | 'success'
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          'text-[28px] font-medium tracking-[-0.03em] leading-none font-data mt-3',
          tone === 'neutral' && 'text-foreground',
          tone === 'warm' && 'text-accent-foreground',
          tone === 'primary' && 'text-primary',
          tone === 'destructive' && 'text-destructive',
          tone === 'success' && 'text-success'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
