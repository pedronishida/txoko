'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import type { ComandaCard, ServiceMode } from '@txoko/shared'
import { Printer, Plus, X, AlertTriangle, ChefHat, Scale, Ban } from 'lucide-react'
import {
  createCardBatch,
  createCancelCards,
  deactivateCard,
  reactivateCard,
} from '@/app/(app)/estacao/cartoes/actions'

type SelfServiceProduct = {
  id: string
  name: string
  sold_by_weight: boolean
  price: number
  price_per_kg: number | null
  is_active: boolean
}

interface CardsViewProps {
  cards: ComandaCard[]
  selfServiceProducts: SelfServiceProduct[]
}

const MODE_LABEL: Record<ServiceMode, string> = {
  avontade: 'A Vontade',
  por_kg: 'Por Kg',
}

export function CardsView({ cards, selfServiceProducts }: CardsViewProps) {
  const [filterMode, setFilterMode] = useState<ServiceMode | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')
  const [showBatch, setShowBatch] = useState(false)
  const [showCancelBatch, setShowCancelBatch] = useState(false)

  const customerCards = useMemo(() => cards.filter((c) => c.card_kind === 'customer'), [cards])
  const cancelCards = useMemo(() => cards.filter((c) => c.card_kind === 'cancel'), [cards])

  const filtered = useMemo(() => {
    return customerCards.filter((c) => {
      if (filterMode !== 'all' && c.service_mode !== filterMode) return false
      if (filterActive === 'active' && !c.is_active) return false
      if (filterActive === 'inactive' && c.is_active) return false
      return true
    })
  }, [customerCards, filterMode, filterActive])

  const hasAvontade = selfServiceProducts.some(
    (p) => !p.sold_by_weight && p.is_active && p.name.toLowerCase().includes('a vontade'),
  )
  const hasPorKg = selfServiceProducts.some((p) => p.sold_by_weight && p.is_active)

  const activeCount = customerCards.filter((c) => c.is_active).length
  const avontadeCount = customerCards.filter((c) => c.service_mode === 'avontade' && c.is_active).length
  const porKgCount = customerCards.filter((c) => c.service_mode === 'por_kg' && c.is_active).length

  return (
    <div className="space-y-6">
      {/* Avisos de setup */}
      {(!hasAvontade || !hasPorKg) && (
        <div className="rounded-xl border border-warm/30 bg-warm/10 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-warm shrink-0 mt-0.5" />
          <div className="text-sm text-cloud space-y-1">
            <p className="font-semibold">Produtos self-service nao cadastrados</p>
            <p className="text-stone-light">
              Antes de usar a estacao, cadastre no <Link href="/cardapio" className="underline hover:text-cloud">Cardapio</Link>:
            </p>
            <ul className="text-stone-light text-xs mt-1 space-y-0.5">
              {!hasAvontade && <li>• 1 produto chamado &quot;Self-Service a Vontade&quot; (preco fixo)</li>}
              {!hasPorKg && <li>• 1 produto &quot;vendido por kg&quot; com o preco do quilo</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Painel cartoes de cancelamento (caixa) */}
      <CancelCardsPanel
        cards={cancelCards}
        onGenerate={() => setShowCancelBatch(true)}
      />

      {/* Stats (so customer cards) */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ativos (cliente)" value={activeCount} sub={`${customerCards.length} totais`} />
        <StatCard label="A Vontade" value={avontadeCount} icon={<ChefHat size={14} />} />
        <StatCard label="Por Kg" value={porKgCount} icon={<Scale size={14} />} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as ServiceMode | 'all')}
          className="h-9 px-3 bg-night border border-night-lighter rounded-lg text-sm text-cloud"
        >
          <option value="all">Todos os modos</option>
          <option value="avontade">A Vontade</option>
          <option value="por_kg">Por Kg</option>
        </select>

        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
          className="h-9 px-3 bg-night border border-night-lighter rounded-lg text-sm text-cloud"
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>

        <div className="flex-1" />

        {filtered.length > 0 && (
          <Link
            href={`/estacao-imprimir?mode=${filterMode}&status=${filterActive}`}
            target="_blank"
            className="inline-flex items-center gap-2 h-9 px-3 border border-night-lighter rounded-lg text-sm text-cloud hover:bg-night-lighter"
          >
            <Printer size={14} />
            Imprimir {filtered.length}
          </Link>
        )}

        <button
          onClick={() => setShowBatch(true)}
          className="inline-flex items-center gap-2 h-9 px-3 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover"
        >
          <Plus size={14} />
          Gerar lote
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-night-lighter bg-night p-10 text-center">
          <p className="text-stone text-sm">
            {cards.length === 0
              ? 'Nenhum cartao cadastrado ainda. Clique em "Gerar lote" pra comecar.'
              : 'Nenhum cartao nos filtros selecionados.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-night-lighter overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-night text-stone-light text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">N°</th>
                <th className="text-left px-4 py-2.5 font-medium">Modo</th>
                <th className="text-left px-4 py-2.5 font-medium">Token</th>
                <th className="text-left px-4 py-2.5 font-medium">Criado</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-lighter">
              {filtered.map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showBatch && <BatchModal onClose={() => setShowBatch(false)} />}
      {showCancelBatch && <CancelBatchModal onClose={() => setShowCancelBatch(false)} />}
    </div>
  )
}

function CancelCardsPanel({
  cards,
  onGenerate,
}: {
  cards: ComandaCard[]
  onGenerate: () => void
}) {
  const active = cards.filter((c) => c.is_active)
  const remaining = 2 - active.length

  return (
    <div className="rounded-xl border border-coral/30 bg-coral/5 p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-coral/15 flex items-center justify-center shrink-0">
          <Ban size={18} className="text-coral" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-cloud">Cartoes de cancelamento (caixa)</h3>
              <p className="text-xs text-stone-light mt-0.5">
                Usado pelo caixa pra cancelar itens na estacao. Maximo 2 ativos.
              </p>
            </div>
            {remaining > 0 && (
              <button
                onClick={onGenerate}
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 bg-coral/20 text-coral rounded-lg text-xs font-semibold hover:bg-coral/30"
              >
                <Plus size={13} />
                Gerar
              </button>
            )}
          </div>

          {active.length === 0 ? (
            <p className="mt-3 text-xs text-stone">Nenhum cartao de cancelamento ativo.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {active.map((c) => (
                <div
                  key={c.id}
                  className="inline-flex items-center gap-2 px-2.5 h-7 rounded-md bg-night border border-night-lighter text-xs"
                >
                  <span className="font-data text-cloud">#{String(c.card_number).padStart(3, '0')}</span>
                  <span className="text-stone font-data">{c.qr_token.slice(0, 8)}...</span>
                  <CardToggleMini card={c} />
                </div>
              ))}
              <Link
                href={`/estacao-imprimir?kind=cancel`}
                target="_blank"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-night-lighter rounded-md text-xs text-stone-light hover:text-cloud hover:bg-night-lighter"
              >
                <Printer size={11} />
                Imprimir
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CardToggleMini({ card }: { card: ComandaCard }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deactivateCard(card.id)
        })
      }
      disabled={pending}
      className="text-stone hover:text-coral text-[10px]"
      title="Desativar"
    >
      {pending ? '...' : 'desativar'}
    </button>
  )
}

function CancelBatchModal({ onClose }: { onClose: () => void }) {
  const [quantity, setQuantity] = useState('1')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const q = parseInt(quantity)
    startTransition(async () => {
      const res = await createCancelCards(q)
      if ('error' in res) setError(res.error)
      else setSuccess(`${res.created} cartao${res.created === 1 ? '' : 'es'} de cancelamento criado${res.created === 1 ? '' : 's'} (n° ${res.first_number}${res.last_number !== res.first_number ? ` a ${res.last_number}` : ''})`)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-night-light border border-coral/30 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
          <div className="flex items-center gap-2">
            <Ban size={16} className="text-coral" />
            <h2 className="font-semibold text-cloud">Gerar cartao de cancelamento</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-stone hover:text-cloud hover:bg-night-lighter">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-light mb-1">Quantidade</label>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((n) => (
                <label
                  key={n}
                  className={
                    'flex items-center justify-center gap-2 h-11 border rounded-lg cursor-pointer ' +
                    (quantity === String(n)
                      ? 'border-coral bg-coral/10 text-cloud'
                      : 'border-night-lighter text-stone-light hover:bg-night-lighter')
                  }
                >
                  <input
                    type="radio"
                    value={n}
                    checked={quantity === String(n)}
                    onChange={() => setQuantity(String(n))}
                    className="hidden"
                  />
                  <span className="text-sm font-data">{n} cartao{n === 1 ? '' : 'es'}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-stone">
              Maximo 2 cartoes de cancelamento ativos por restaurante. Entregue ao operador de caixa.
            </p>
          </div>

          {error && <p className="text-coral text-xs">{error}</p>}
          {success && <p className="text-leaf text-xs">{success}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm font-medium text-stone-light hover:text-cloud hover:bg-night-lighter"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 bg-coral text-white font-semibold rounded-lg text-sm hover:bg-coral/80 disabled:opacity-50"
            >
              {pending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: number
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-night-lighter bg-night p-4">
      <div className="flex items-center gap-1.5 text-stone text-xs uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-data font-semibold text-cloud">{value}</div>
      {sub && <div className="text-stone-light text-xs mt-0.5">{sub}</div>}
    </div>
  )
}

function CardRow({ card }: { card: ComandaCard }) {
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      if (card.is_active) await deactivateCard(card.id)
      else await reactivateCard(card.id)
    })
  }

  return (
    <tr className="text-cloud">
      <td className="px-4 py-2.5 font-data">{card.card_number}</td>
      <td className="px-4 py-2.5">
        <span
          className={
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ' +
            (card.service_mode === 'avontade'
              ? 'bg-leaf/10 text-leaf'
              : 'bg-warm/10 text-warm')
          }
        >
          {card.service_mode === 'avontade' ? <ChefHat size={11} /> : <Scale size={11} />}
          {card.service_mode ? MODE_LABEL[card.service_mode] : '—'}
        </span>
      </td>
      <td className="px-4 py-2.5 font-data text-stone-light text-xs">
        {card.qr_token.slice(0, 12)}...
      </td>
      <td className="px-4 py-2.5 text-stone-light text-xs">
        {new Date(card.created_at).toLocaleDateString('pt-BR')}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={
            'text-xs ' + (card.is_active ? 'text-leaf' : 'text-stone')
          }
        >
          {card.is_active ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          onClick={toggle}
          disabled={pending}
          className={
            'text-xs px-2.5 py-1 rounded-md transition-colors ' +
            (card.is_active
              ? 'text-coral hover:bg-coral/10'
              : 'text-leaf hover:bg-leaf/10')
          }
        >
          {pending ? '...' : card.is_active ? 'Desativar' : 'Reativar'}
        </button>
      </td>
    </tr>
  )
}

function BatchModal({ onClose }: { onClose: () => void }) {
  const [quantity, setQuantity] = useState('100')
  const [mode, setMode] = useState<ServiceMode>('por_kg')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const q = parseInt(quantity)
    startTransition(async () => {
      const res = await createCardBatch(q, mode)
      if ('error' in res) setError(res.error)
      else setSuccess(`${res.created} cartoes criados (n° ${res.first_number} a ${res.last_number})`)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
          <h2 className="font-semibold text-cloud">Gerar lote de cartoes</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-stone hover:text-cloud hover:bg-night-lighter">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-light mb-1">
              Quantidade
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
              required
            />
            <p className="mt-1 text-xs text-stone">
              Lotes comuns: 100 (1 pacote de cartoes PVC). Max 500.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-light mb-1">
              Modo de servico
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={
                  'flex items-center gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ' +
                  (mode === 'avontade'
                    ? 'border-leaf bg-leaf/10 text-cloud'
                    : 'border-night-lighter text-stone-light hover:bg-night-lighter')
                }
              >
                <input
                  type="radio"
                  name="mode"
                  value="avontade"
                  checked={mode === 'avontade'}
                  onChange={() => setMode('avontade')}
                  className="hidden"
                />
                <ChefHat size={14} />
                <span className="text-sm">A Vontade</span>
              </label>

              <label
                className={
                  'flex items-center gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ' +
                  (mode === 'por_kg'
                    ? 'border-warm bg-warm/10 text-cloud'
                    : 'border-night-lighter text-stone-light hover:bg-night-lighter')
                }
              >
                <input
                  type="radio"
                  name="mode"
                  value="por_kg"
                  checked={mode === 'por_kg'}
                  onChange={() => setMode('por_kg')}
                  className="hidden"
                />
                <Scale size={14} />
                <span className="text-sm">Por Kg</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-stone">
              Todos os cartoes desse lote serao do mesmo modo. Pra mixar, gere 2 lotes.
            </p>
          </div>

          {error && <p className="text-coral text-xs">{error}</p>}
          {success && <p className="text-leaf text-xs">{success}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm font-medium text-stone-light hover:text-cloud hover:bg-night-lighter"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
