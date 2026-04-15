'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Customer } from '@txoko/shared'
import {
  Plus,
  Search,
  X,
  Star,
  Crown,
  UserCheck,
  UserMinus,
  Pencil,
  Phone,
  Mail,
  Gift,
  Trash2,
} from 'lucide-react'
import { deleteCustomer, saveCustomer } from './actions'

export type CustomerWithStats = Customer & {
  total_orders: number
  total_spent: number
  last_visit_at: string | null
}

type Segment = 'all' | 'vip' | 'frequent' | 'new' | 'inactive'

function getSegment(c: CustomerWithStats): Segment {
  const daysSinceVisit = c.last_visit_at
    ? Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86400000)
    : 999
  if (c.total_spent > 5000) return 'vip'
  if (c.total_orders > 10) return 'frequent'
  if (daysSinceVisit > 30) return 'inactive'
  if (c.total_orders <= 3) return 'new'
  return 'frequent'
}

const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; icon: typeof Star }> = {
  all: { label: 'Todos', color: 'text-cloud', bg: 'bg-cloud/10', icon: UserCheck },
  vip: { label: 'VIP', color: 'text-warm', bg: 'bg-warm/10', icon: Crown },
  frequent: { label: 'Frequente', color: 'text-leaf', bg: 'bg-leaf/10', icon: UserCheck },
  new: { label: 'Novo', color: 'text-cloud', bg: 'bg-cloud/10', icon: Star },
  inactive: { label: 'Inativo', color: 'text-stone', bg: 'bg-stone/10', icon: UserMinus },
}

type Props = {
  customers: CustomerWithStats[]
}

export function ClientesView({ customers }: Props) {
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState<Segment>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CustomerWithStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formDocument, setFormDocument] = useState('')
  const [formBirthday, setFormBirthday] = useState('')
  const [formNotes, setFormNotes] = useState('')

  const filtered = useMemo(() => {
    return customers
      .filter((c) => {
        const matchSearch =
          !search ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone?.includes(search) ||
          c.email?.toLowerCase().includes(search.toLowerCase())
        const matchSegment = segmentFilter === 'all' || getSegment(c) === segmentFilter
        return matchSearch && matchSegment
      })
      .sort((a, b) => b.total_spent - a.total_spent)
  }, [customers, search, segmentFilter])

  const counts = useMemo(
    () => ({
      all: customers.length,
      vip: customers.filter((c) => getSegment(c) === 'vip').length,
      frequent: customers.filter((c) => getSegment(c) === 'frequent').length,
      inactive: customers.filter((c) => getSegment(c) === 'inactive').length,
    }),
    [customers]
  )

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : null

  function openForm(customer: CustomerWithStats | null) {
    setError(null)
    if (customer) {
      setEditing(customer)
      setFormName(customer.name)
      setFormPhone(customer.phone || '')
      setFormEmail(customer.email || '')
      setFormDocument(customer.document || '')
      setFormBirthday(customer.birthday || '')
      setFormNotes(customer.notes || '')
    } else {
      setEditing(null)
      setFormName('')
      setFormPhone('')
      setFormEmail('')
      setFormDocument('')
      setFormBirthday('')
      setFormNotes('')
    }
    setShowForm(true)
  }

  function handleSave() {
    if (!formName.trim()) return
    startTransition(async () => {
      const res = await saveCustomer({
        id: editing?.id,
        name: formName.trim(),
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        document: formDocument.trim() || null,
        birthday: formBirthday || null,
        notes: formNotes.trim() || null,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este cliente?')) return
    startTransition(async () => {
      await deleteCustomer(id)
      if (selectedId === id) setSelectedId(null)
    })
  }

  function formatDate(d: string | null) {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('pt-BR')
  }

  function daysSince(d: string | null) {
    if (!d) return null
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone">{customers.length} clientes cadastrados</p>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-3">
          <p className="text-xs text-stone">Total Clientes</p>
          <p className="text-xl font-bold font-data text-cloud">{counts.all}</p>
        </div>
        <div className="bg-night-light border border-warm/20 rounded-xl p-3">
          <p className="text-xs text-stone">VIPs</p>
          <p className="text-xl font-bold font-data text-warm">{counts.vip}</p>
        </div>
        <div className="bg-night-light border border-primary/20 rounded-xl p-3">
          <p className="text-xs text-stone">Frequentes</p>
          <p className="text-xl font-bold font-data text-leaf">{counts.frequent}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-3">
          <p className="text-xs text-stone">Inativos</p>
          <p className="text-xl font-bold font-data text-stone-light">{counts.inactive}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'vip', 'frequent', 'new', 'inactive'] as const).map((seg) => {
            const cfg = SEGMENT_CONFIG[seg]
            return (
              <button
                key={seg}
                onClick={() => setSegmentFilter(seg)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  segmentFilter === seg
                    ? 'bg-primary/10 text-primary'
                    : 'bg-night-light text-stone-light border border-night-lighter'
                )}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => openForm(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors shrink-0"
        >
          <Plus size={16} /> Novo Cliente
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 bg-night-light border border-night-lighter rounded-xl">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_0.8fr_0.8fr_0.7fr_auto] gap-2 px-5 py-2.5 border-b border-night-lighter text-xs text-stone font-medium">
            <span>Cliente</span>
            <span>Contato</span>
            <span>Gasto Total</span>
            <span>Pedidos</span>
            <span>Pontos</span>
            <span>Segmento</span>
            <span></span>
          </div>
          <div className="divide-y divide-night-lighter max-h-[55vh] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-5 py-8 text-sm text-stone text-center">Nenhum cliente encontrado</p>
            )}
            {filtered.map((c) => {
              const seg = getSegment(c)
              const cfg = SEGMENT_CONFIG[seg]
              const days = daysSince(c.last_visit_at)
              return (
                <div
                  key={c.id}
                  className={cn(
                    'grid grid-cols-[2fr_1.2fr_1fr_0.8fr_0.8fr_0.7fr_auto] gap-2 px-5 py-2.5 items-center text-left transition-colors hover:bg-night/30 cursor-pointer',
                    selectedId === c.id && 'bg-night/50'
                  )}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                >
                  <div>
                    <p className="text-sm text-cloud truncate">{c.name}</p>
                    <p className="text-[10px] text-stone">
                      {days !== null ? `Ultima visita: ${days}d atras` : 'Sem visita'}
                    </p>
                  </div>
                  <div className="text-xs text-stone truncate">
                    {c.phone && <p>{c.phone}</p>}
                    {c.email && <p className="truncate">{c.email}</p>}
                  </div>
                  <span className="text-sm font-data font-semibold text-cloud">
                    {formatCurrency(c.total_spent)}
                  </span>
                  <span className="text-sm font-data text-cloud">{c.total_orders}</span>
                  <span className="text-sm font-data text-leaf">{c.loyalty_points}</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium text-center', cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openForm(c)
                      }}
                      className="p-1 text-stone hover:text-cloud"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(c.id)
                      }}
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

        {selected && (
          <div className="w-72 bg-night-light border border-night-lighter rounded-xl shrink-0">
            <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-cloud text-sm">{selected.name}</h3>
                {(() => {
                  const seg = getSegment(selected)
                  const cfg = SEGMENT_CONFIG[seg]
                  return (
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium',
                        cfg.bg,
                        cfg.color
                      )}
                    >
                      {cfg.label}
                    </span>
                  )
                })()}
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 text-stone hover:text-cloud"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {selected.phone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={12} className="text-stone" />
                  <span className="text-cloud">{selected.phone}</span>
                </div>
              )}
              {selected.email && (
                <div className="flex items-center gap-2 text-xs">
                  <Mail size={12} className="text-stone" />
                  <span className="text-cloud">{selected.email}</span>
                </div>
              )}
              {selected.birthday && (
                <div className="flex items-center gap-2 text-xs">
                  <Gift size={12} className="text-stone" />
                  <span className="text-cloud">{formatDate(selected.birthday)}</span>
                </div>
              )}
              {selected.notes && (
                <div className="bg-night rounded-lg p-2 text-xs text-stone-light">
                  {selected.notes}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="bg-night rounded-lg p-2 text-center">
                  <p className="text-lg font-bold font-data text-cloud">{selected.total_orders}</p>
                  <p className="text-[10px] text-stone">Pedidos</p>
                </div>
                <div className="bg-night rounded-lg p-2 text-center">
                  <p className="text-lg font-bold font-data text-leaf">
                    {formatCurrency(selected.total_spent)}
                  </p>
                  <p className="text-[10px] text-stone">Gasto Total</p>
                </div>
                <div className="bg-night rounded-lg p-2 text-center">
                  <p className="text-lg font-bold font-data text-warm">{selected.loyalty_points}</p>
                  <p className="text-[10px] text-stone">Pontos</p>
                </div>
                <div className="bg-night rounded-lg p-2 text-center">
                  <p className="text-lg font-bold font-data text-cloud">
                    {selected.total_orders > 0
                      ? formatCurrency(selected.total_spent / selected.total_orders)
                      : '-'}
                  </p>
                  <p className="text-[10px] text-stone">Ticket Medio</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">
                {editing ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-stone hover:text-cloud"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error && (
                <div className="px-3 py-2 bg-coral/10 border border-coral/30 rounded-lg text-xs text-coral">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm text-stone-light mb-1">Nome *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Telefone</label>
                  <input
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Email</label>
                  <input
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Documento</label>
                  <input
                    value={formDocument}
                    onChange={(e) => setFormDocument(e.target.value)}
                    placeholder="CPF / CNPJ"
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Aniversario</label>
                  <input
                    type="date"
                    value={formBirthday}
                    onChange={(e) => setFormBirthday(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">Observacoes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Alergias, preferencias..."
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                />
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
