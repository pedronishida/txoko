'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Customer } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import { deleteCustomer, saveCustomer } from './actions'
import { MetricBand } from '@/components/metric-band'
import { TabBar } from '@/components/tab-bar'

export type CustomerWithStats = Customer & {
  total_orders: number
  total_spent: number
  last_visit_at: string | null
  engagement_score?: number
  churn_risk?: number
  optimal_send_hour?: number | null
  spending_trend?: number
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

const SEGMENT_LABEL: Record<Segment, string> = {
  all: 'Todos',
  vip: 'VIP',
  frequent: 'Frequente',
  new: 'Novo',
  inactive: 'Inativo',
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
        const matchSegment =
          segmentFilter === 'all' || getSegment(c) === segmentFilter
        return matchSearch && matchSegment
      })
      .sort((a, b) => b.total_spent - a.total_spent)
  }, [customers, search, segmentFilter])

  const counts = useMemo(
    () => ({
      all: customers.length,
      vip: customers.filter((c) => getSegment(c) === 'vip').length,
      frequent: customers.filter((c) => getSegment(c) === 'frequent').length,
      new: customers.filter((c) => getSegment(c) === 'new').length,
      inactive: customers.filter((c) => getSegment(c) === 'inactive').length,
    }),
    [customers]
  )

  const selected = selectedId
    ? customers.find((c) => c.id === selectedId)
    : null

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
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR')
  }

  function daysSince(d: string | null) {
    if (!d) return null
    return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  }

  const segmentTabs = (['all', 'vip', 'frequent', 'new', 'inactive'] as const).map((seg) => ({
    key: seg,
    label: SEGMENT_LABEL[seg],
    count: counts[seg],
  }))

  return (
    <div>
      {/* KPI band */}
      <MetricBand
        metrics={[
          { label: 'Total', value: String(counts.all) },
          { label: 'VIPs', value: String(counts.vip) },
          { label: 'Frequentes', value: String(counts.frequent) },
          { label: 'Inativos', value: String(counts.inactive) },
        ]}
        columns={4}
      />

      {/* Controls */}
      <div className="flex items-center gap-6 mb-6">
        <input
          type="text"
          placeholder="Buscar cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-9 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none tracking-tight"
        />
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors shrink-0"
        >
          <Plus size={14} strokeWidth={2} />
          Novo cliente
        </button>
      </div>

      <div className="mb-6">
        <TabBar
          tabs={segmentTabs}
          active={segmentFilter}
          onChange={(k) => setSegmentFilter(k as Segment)}
        />
      </div>

      <div className="flex gap-8">
        {/* Table */}
        <section className="flex-1 min-w-0">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_0.7fr_0.7fr_0.8fr_auto] gap-4 pb-3 border-b border-night-lighter text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
            <span>Cliente</span>
            <span>Contato</span>
            <span className="text-right">Gasto</span>
            <span className="text-right">Pedidos</span>
            <span className="text-right">Pontos</span>
            <span>Segmento</span>
            <span></span>
          </div>
          <div className="divide-y divide-night-lighter">
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-stone tracking-tight">
                Nenhum cliente encontrado
              </p>
            ) : (
              filtered.map((c) => {
                const seg = getSegment(c)
                const days = daysSince(c.last_visit_at)
                const active = selectedId === c.id
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'group grid grid-cols-[2fr_1.2fr_1fr_0.7fr_0.7fr_0.8fr_auto] gap-4 py-3 items-center cursor-pointer transition-colors',
                      active && 'bg-night-light/60'
                    )}
                    onClick={() =>
                      setSelectedId(c.id === selectedId ? null : c.id)
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-cloud tracking-tight truncate">
                        {c.name}
                      </p>
                      <p className="text-[10px] text-stone-dark tracking-tight mt-0.5">
                        {days !== null ? `${days}d atras` : 'Sem visita'}
                      </p>
                    </div>
                    <div className="min-w-0 text-[11px] text-stone tracking-tight">
                      {c.phone && (
                        <p className="truncate font-data">{c.phone}</p>
                      )}
                      {c.email && <p className="truncate">{c.email}</p>}
                    </div>
                    <span className="text-[12px] font-data text-cloud text-right">
                      {formatCurrency(c.total_spent)}
                    </span>
                    <span className="text-[12px] font-data text-stone-light text-right">
                      {c.total_orders}
                    </span>
                    <span className="text-[12px] font-data text-stone-light text-right">
                      {c.loyalty_points}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] tracking-tight',
                        seg === 'vip' && 'text-warm',
                        seg === 'frequent' && 'text-leaf',
                        seg === 'new' && 'text-cloud',
                        seg === 'inactive' && 'text-stone-dark'
                      )}
                    >
                      {SEGMENT_LABEL[seg]}
                    </span>
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openForm(c)
                        }}
                        className="text-[10px] text-stone-light hover:text-cloud tracking-tight"
                      >
                        editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(c.id)
                        }}
                        className="text-[10px] text-stone-dark hover:text-primary tracking-tight"
                      >
                        remover
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* Detail panel */}
        {selected && (
          <aside className="w-[300px] shrink-0">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
                  {SEGMENT_LABEL[getSegment(selected)]}
                </p>
                <h3 className="text-[16px] font-medium text-cloud tracking-tight mt-1.5 leading-tight">
                  {selected.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
                aria-label="Fechar"
              >
                <X size={12} />
              </button>
            </div>

            <div className="space-y-2.5 pb-5 border-b border-night-lighter">
              {selected.phone && (
                <PanelRow label="Telefone" value={selected.phone} mono />
              )}
              {selected.email && (
                <PanelRow label="E-mail" value={selected.email} />
              )}
              {selected.birthday && (
                <PanelRow label="Aniversario" value={formatDate(selected.birthday)} />
              )}
            </div>

            {selected.notes && (
              <div className="pt-5 pb-5 border-b border-night-lighter">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Observacoes
                </p>
                <p className="text-[12px] text-stone-light tracking-tight leading-relaxed">
                  {selected.notes}
                </p>
              </div>
            )}

            <div className="pt-5 space-y-4">
              <Stat label="Pedidos" value={String(selected.total_orders)} />
              <Stat
                label="Gasto total"
                value={formatCurrency(selected.total_spent)}
              />
              <Stat
                label="Pontos"
                value={String(selected.loyalty_points)}
              />
              <Stat
                label="Ticket medio"
                value={
                  selected.total_orders > 0
                    ? formatCurrency(selected.total_spent / selected.total_orders)
                    : '—'
                }
              />
            </div>

            {/* Scoring (se calculado) */}
            {(selected.engagement_score !== undefined ||
              selected.churn_risk !== undefined) && (
              <div className="pt-5 mt-5 border-t border-night-lighter space-y-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                  Inteligencia
                </p>
                {selected.engagement_score !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-stone-dark tracking-tight">
                      Engagement
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1 bg-night-lighter rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            selected.engagement_score >= 70
                              ? 'bg-leaf'
                              : selected.engagement_score >= 40
                                ? 'bg-cloud'
                                : 'bg-stone-dark'
                          )}
                          style={{
                            width: `${selected.engagement_score}%`,
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-data text-cloud w-7 text-right">
                        {selected.engagement_score}
                      </span>
                    </div>
                  </div>
                )}
                {selected.churn_risk !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-stone-dark tracking-tight">
                      Risco de churn
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1 bg-night-lighter rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            selected.churn_risk >= 70
                              ? 'bg-primary'
                              : selected.churn_risk >= 40
                                ? 'bg-warm'
                                : 'bg-stone-dark'
                          )}
                          style={{
                            width: `${selected.churn_risk}%`,
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-data text-cloud w-7 text-right">
                        {selected.churn_risk}
                      </span>
                    </div>
                  </div>
                )}
                {selected.optimal_send_hour != null && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-stone-dark tracking-tight">
                      Melhor horario
                    </span>
                    <span className="text-[12px] font-data text-cloud">
                      {selected.optimal_send_hour}:00
                    </span>
                  </div>
                )}
                {selected.spending_trend !== undefined &&
                  selected.spending_trend !== 0 && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-stone-dark tracking-tight">
                        Tendencia de gasto
                      </span>
                      <span
                        className={cn(
                          'text-[12px] font-data',
                          selected.spending_trend > 0
                            ? 'text-leaf'
                            : 'text-primary'
                        )}
                      >
                        {selected.spending_trend > 0 ? '+' : ''}
                        {selected.spending_trend.toFixed(1)}%
                      </span>
                    </div>
                  )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-cloud tracking-tight">
                {editing ? 'Editar cliente' : 'Novo cliente'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {error && (
                <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
                  {error}
                </div>
              )}
              <Field label="Nome *">
                <Input value={formName} onChange={setFormName} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Telefone">
                  <Input value={formPhone} onChange={setFormPhone} mono />
                </Field>
                <Field label="E-mail">
                  <Input value={formEmail} onChange={setFormEmail} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Documento">
                  <Input
                    value={formDocument}
                    onChange={setFormDocument}
                    placeholder="CPF / CNPJ"
                    mono
                  />
                </Field>
                <Field label="Aniversario">
                  <Input
                    value={formBirthday}
                    onChange={setFormBirthday}
                    type="date"
                    mono
                  />
                </Field>
              </div>
              <Field label="Observacoes">
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Alergias, preferencias"
                  className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark resize-none transition-colors"
                />
              </Field>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
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

function PanelRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-stone-dark tracking-tight">{label}</span>
      <span
        className={cn(
          'text-[12px] text-cloud tracking-tight truncate',
          mono && 'font-data'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-stone-dark tracking-tight">{label}</span>
      <span className="text-[14px] font-medium text-cloud font-data tracking-tight">
        {value}
      </span>
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
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors',
        mono && 'font-data'
      )}
    />
  )
}
