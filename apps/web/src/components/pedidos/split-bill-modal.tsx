'use client'

import { useEffect, useState, useTransition } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Order, OrderItem, Product, PaymentMethod } from '@txoko/shared'
import { splitOrderPayments } from '@/app/(app)/pedidos/actions'

type SplitMode = 'igual' | 'por_item' | 'customizado'

type Person = {
  label: string
  method: PaymentMethod
  amount: number
  itemIds?: string[]
}

type Props = {
  order: Order
  items: OrderItem[]
  products: Pick<Product, 'id' | 'name'>[]
  onClose: () => void
  onDone?: () => void
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  credit: 'Credito',
  debit: 'Debito',
  pix: 'Pix',
  voucher: 'Voucher',
  online: 'Online',
}

const PAYMENT_METHODS: PaymentMethod[] = ['pix', 'credit', 'debit', 'cash']

export function SplitBillModal({ order, items, products, onClose, onDone }: Props) {
  const [mode, setMode] = useState<SplitMode>('igual')
  const [numPeople, setNumPeople] = useState(2)
  const [persons, setPersons] = useState<Person[]>(() => buildEqual(order.total, 2))
  const [itemAssignment, setItemAssignment] = useState<Record<string, number>>({}) // itemId -> personIndex
  const [customAmounts, setCustomAmounts] = useState<{ label: string; amount: string; method: PaymentMethod }[]>(() => [
    { label: 'Pessoa 1', amount: (order.total / 2).toFixed(2), method: 'pix' },
    { label: 'Pessoa 2', amount: (order.total / 2).toFixed(2), method: 'pix' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function buildEqual(total: number, n: number): Person[] {
    const share = Math.floor((total / n) * 100) / 100
    const remainder = Math.round((total - share * n) * 100) / 100
    return Array.from({ length: n }, (_, i) => ({
      label: `Pessoa ${i + 1}`,
      method: 'pix' as PaymentMethod,
      amount: i === n - 1 ? share + remainder : share,
    }))
  }

  // Rebuild equal splits when numPeople changes
  useEffect(() => {
    if (mode === 'igual') {
      setPersons(buildEqual(order.total, numPeople))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPeople, mode, order.total])

  // Rebuild item-based splits when assignments change
  useEffect(() => {
    if (mode !== 'por_item') return
    const totals: number[] = Array.from({ length: numPeople }, () => 0)
    for (const item of items) {
      const assignedTo = itemAssignment[item.id]
      if (assignedTo !== undefined) {
        totals[assignedTo] += item.total_price
      }
    }
    setPersons((prev) =>
      prev.map((p, i) => ({ ...p, amount: totals[i] ?? 0 }))
    )
  }, [itemAssignment, mode, numPeople, items])

  // Sync persons count when numPeople changes in por_item mode
  useEffect(() => {
    if (mode === 'por_item' || mode === 'igual') {
      setPersons((prev) => {
        const next = [...prev]
        while (next.length < numPeople) {
          next.push({ label: `Pessoa ${next.length + 1}`, method: 'pix', amount: 0 })
        }
        return next.slice(0, numPeople)
      })
    }
  }, [numPeople, mode])

  function updatePersonMethod(index: number, method: PaymentMethod) {
    setPersons((prev) => prev.map((p, i) => (i === index ? { ...p, method } : p)))
  }

  function addCustomPerson() {
    setCustomAmounts((prev) => [...prev, { label: `Pessoa ${prev.length + 1}`, amount: '0.00', method: 'pix' }])
  }

  function removeCustomPerson(index: number) {
    setCustomAmounts((prev) => prev.filter((_, i) => i !== index))
  }

  function getSplits(): { label: string; amount: number; method: PaymentMethod }[] {
    if (mode === 'igual' || mode === 'por_item') {
      return persons.map((p) => ({ label: p.label, amount: p.amount, method: p.method }))
    }
    // customizado
    return customAmounts.map((p) => ({
      label: p.label,
      amount: parseFloat(p.amount) || 0,
      method: p.method,
    }))
  }

  const splits = getSplits()
  const splitSum = splits.reduce((s, p) => s + p.amount, 0)
  const diff = Math.abs(splitSum - order.total)
  const isValid = diff <= 0.02

  function handleConfirm() {
    setError(null)
    if (!isValid) {
      setError(`Soma das divisoes deve ser igual ao total do pedido (${formatCurrency(order.total)})`)
      return
    }
    startTransition(async () => {
      const res = await splitOrderPayments(order.id, splits)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      onDone?.()
      onClose()
    })
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modeLabel: Record<SplitMode, string> = {
    igual: 'Igual',
    por_item: 'Por item',
    customizado: 'Personalizado',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-night border border-night-lighter rounded-xl flex flex-col max-h-[90vh] shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[14px] font-medium text-cloud tracking-tight">Dividir conta</h2>
            <p className="text-[11px] text-stone-dark mt-0.5 font-data">
              Total: {formatCurrency(order.total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Mode selector */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex gap-1 p-1 bg-night-light rounded-md">
            {(['igual', 'por_item', 'customizado'] as SplitMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 h-7 text-[11px] font-medium rounded transition-colors tracking-tight',
                  mode === m ? 'bg-cloud text-night' : 'text-stone-light hover:text-cloud'
                )}
              >
                {modeLabel[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* IGUAL mode */}
          {mode === 'igual' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-stone tracking-tight">Dividir entre</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNumPeople(Math.max(2, numPeople - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-night-light text-stone-light hover:text-cloud transition-colors"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-[14px] font-medium text-cloud font-data w-6 text-center">
                    {numPeople}
                  </span>
                  <button
                    onClick={() => setNumPeople(Math.min(20, numPeople + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-night-light text-stone-light hover:text-cloud transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <span className="text-[12px] text-stone tracking-tight">pessoas</span>
              </div>

              <div className="space-y-2">
                {persons.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-night-lighter/60 last:border-0">
                    <span className="text-[12px] text-cloud tracking-tight flex-1">{p.label}</span>
                    <span className="text-[13px] font-medium text-cloud font-data">{formatCurrency(p.amount)}</span>
                    <div className="flex gap-1">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m}
                          onClick={() => updatePersonMethod(i, m)}
                          className={cn(
                            'h-6 px-2 text-[10px] rounded transition-colors',
                            p.method === m ? 'bg-cloud text-night font-medium' : 'text-stone-dark hover:text-cloud hover:bg-night-light'
                          )}
                        >
                          {PAYMENT_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* POR ITEM mode */}
          {mode === 'por_item' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-stone tracking-tight">Numero de pessoas</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNumPeople(Math.max(2, numPeople - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-night-light text-stone-light hover:text-cloud transition-colors"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="text-[14px] font-medium text-cloud font-data w-6 text-center">
                    {numPeople}
                  </span>
                  <button
                    onClick={() => setNumPeople(Math.min(10, numPeople + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-night-light text-stone-light hover:text-cloud transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                  Atribuir itens
                </p>
                {items.map((item) => {
                  const prod = products.find((p) => p.id === item.product_id)
                  const assigned = itemAssignment[item.id]
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-night-lighter/60 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-cloud tracking-tight truncate">
                          <span className="font-data text-stone-dark mr-1">{item.quantity}×</span>
                          {prod?.name ?? 'Produto'}
                        </p>
                        <p className="text-[10px] font-data text-stone-dark">{formatCurrency(item.total_price)}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {Array.from({ length: numPeople }, (_, i) => (
                          <button
                            key={i}
                            onClick={() =>
                              setItemAssignment((prev) =>
                                prev[item.id] === i
                                  ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== item.id))
                                  : { ...prev, [item.id]: i }
                              )
                            }
                            className={cn(
                              'h-6 w-7 text-[10px] rounded transition-colors',
                              assigned === i
                                ? 'bg-leaf text-night font-medium'
                                : 'text-stone-dark hover:text-cloud hover:bg-night-light'
                            )}
                          >
                            P{i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-1.5 pt-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                  Resumo por pessoa
                </p>
                {persons.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-night-lighter/60 last:border-0">
                    <span className="text-[12px] text-cloud tracking-tight flex-1">{p.label}</span>
                    <span className="text-[13px] font-medium text-cloud font-data">{formatCurrency(p.amount)}</span>
                    <div className="flex gap-1">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m}
                          onClick={() => updatePersonMethod(i, m)}
                          className={cn(
                            'h-6 px-2 text-[10px] rounded transition-colors',
                            p.method === m ? 'bg-cloud text-night font-medium' : 'text-stone-dark hover:text-cloud hover:bg-night-light'
                          )}
                        >
                          {PAYMENT_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CUSTOMIZADO mode */}
          {mode === 'customizado' && (
            <div className="space-y-2">
              {customAmounts.map((p, i) => (
                <div key={i} className="space-y-2 py-3 border-b border-night-lighter/60 last:border-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.label}
                      onChange={(e) =>
                        setCustomAmounts((prev) =>
                          prev.map((c, ci) => (ci === i ? { ...c, label: e.target.value } : c))
                        )
                      }
                      className="flex-1 h-8 bg-transparent text-[12px] text-cloud placeholder:text-stone focus:outline-none tracking-tight border-b border-night-lighter/60"
                      placeholder="Nome"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] text-stone-dark">R$</span>
                      <input
                        type="number"
                        value={p.amount}
                        min="0"
                        step="0.01"
                        onChange={(e) =>
                          setCustomAmounts((prev) =>
                            prev.map((c, ci) => (ci === i ? { ...c, amount: e.target.value } : c))
                          )
                        }
                        className="w-24 h-8 bg-transparent text-[12px] text-cloud text-right font-data placeholder:text-stone focus:outline-none tracking-tight"
                      />
                    </div>
                    {customAmounts.length > 2 && (
                      <button
                        onClick={() => removeCustomPerson(i)}
                        className="w-6 h-6 flex items-center justify-center text-stone-dark hover:text-primary transition-colors"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        onClick={() =>
                          setCustomAmounts((prev) =>
                            prev.map((c, ci) => (ci === i ? { ...c, method: m } : c))
                          )
                        }
                        className={cn(
                          'h-6 px-2 text-[10px] rounded transition-colors',
                          p.method === m ? 'bg-cloud text-night font-medium' : 'text-stone-dark hover:text-cloud hover:bg-night-light'
                        )}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={addCustomPerson}
                className="w-full h-8 border border-dashed border-night-lighter rounded-md text-[12px] text-stone hover:text-cloud hover:border-stone transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={12} />
                Adicionar pessoa
              </button>
            </div>
          )}
        </div>

        {/* Summary footer */}
        <div className="px-6 py-4 border-t border-night-lighter space-y-1.5 shrink-0">
          <div className="flex justify-between text-[12px]">
            <span className="text-stone tracking-tight">Total do pedido</span>
            <span className="font-data text-cloud">{formatCurrency(order.total)}</span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-stone tracking-tight">Soma das divisoes</span>
            <span className={cn('font-data', isValid ? 'text-leaf' : 'text-primary')}>
              {formatCurrency(splitSum)}
            </span>
          </div>
          {!isValid && (
            <p className="text-[10px] text-primary tracking-tight">
              Diferenca: {formatCurrency(diff)}
            </p>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[11px] text-primary tracking-tight shrink-0">
            {error}
          </div>
        )}

        <div className="px-6 pb-5 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-9 text-[12px] text-stone-light hover:text-cloud hover:bg-night-light rounded-md transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={pending || !isValid}
            className="flex-1 h-9 bg-cloud text-night text-[12px] font-medium rounded-md hover:bg-cloud-dark transition-colors disabled:opacity-40"
          >
            {pending ? 'Processando...' : 'Confirmar divisao'}
          </button>
        </div>
      </div>
    </div>
  )
}
