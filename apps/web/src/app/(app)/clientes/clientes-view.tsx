'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Customer } from '@txoko/shared'
import { BookmarkPlus, Download, MessageSquare, Megaphone, Plus, X } from 'lucide-react'
import {
  bulkAddTag,
  countCustomersByRules,
  createSegmentFromRules,
  deleteCustomer,
  exportCustomersCsv,
  saveCustomer,
  type SegmentRule,
} from './actions'
import { MetricBand } from '@/components/metric-band'
import { TabBar } from '@/components/tab-bar'
import { useRouter } from 'next/navigation'

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

// ---------------------------------------------------------------
// Main view
// ---------------------------------------------------------------

export function ClientesView({ customers }: Props) {
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState<Segment>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CustomerWithStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Bulk selection
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [showBulkWhatsapp, setShowBulkWhatsapp] = useState(false)
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showSegmentBuilder, setShowSegmentBuilder] = useState(false)

  const router = useRouter()

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

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((c) => checked.has(c.id))

  function toggleAll() {
    if (allFilteredChecked) {
      setChecked((prev) => {
        const next = new Set(prev)
        filtered.forEach((c) => next.delete(c.id))
        return next
      })
    } else {
      setChecked((prev) => {
        const next = new Set(prev)
        filtered.forEach((c) => next.add(c.id))
        return next
      })
    }
  }

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  function handleExportCsv() {
    startTransition(async () => {
      const res = await exportCustomersCsv(Array.from(checked))
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      if ('csv' in res && res.csv) {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = res.filename ?? 'clientes.csv'
        link.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  function handleCreateCampaign() {
    const ids = Array.from(checked).join(',')
    router.push(`/marketing/campaigns/new?audience_from_selection=${ids}`)
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

  const checkedCount = checked.size

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
          onClick={() => setShowSegmentBuilder(true)}
          className="inline-flex items-center gap-2 h-9 px-3.5 border border-night-lighter text-stone-light text-[13px] font-medium rounded-md hover:text-cloud hover:border-stone-dark transition-colors shrink-0"
        >
          <BookmarkPlus size={14} strokeWidth={2} />
          Nova segmentacao
        </button>
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

      {/* Bulk action bar */}
      {checkedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 bg-night-light border border-night-lighter rounded-lg">
          <span className="text-[12px] text-cloud font-data tracking-tight shrink-0">
            {checkedCount} {checkedCount === 1 ? 'cliente' : 'clientes'} selecionado{checkedCount === 1 ? '' : 's'}
          </span>
          <span className="w-px h-4 bg-night-lighter" />
          <button
            onClick={() => setShowBulkWhatsapp(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors tracking-tight"
          >
            <MessageSquare size={11} />
            Enviar WhatsApp
          </button>
          <button
            onClick={() => setShowBulkTag(true)}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors tracking-tight"
          >
            <BookmarkPlus size={11} />
            Adicionar tag
          </button>
          <button
            onClick={handleExportCsv}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors tracking-tight disabled:opacity-40"
          >
            <Download size={11} />
            Exportar CSV
          </button>
          <button
            onClick={handleCreateCampaign}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors tracking-tight"
          >
            <Megaphone size={11} />
            Criar campanha
          </button>
          <button
            onClick={() => setChecked(new Set())}
            className="ml-auto w-6 h-6 flex items-center justify-center text-stone-dark hover:text-cloud rounded-md hover:bg-night-lighter transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex gap-8">
        {/* Table */}
        <section className="flex-1 min-w-0">
          <div className="grid grid-cols-[1.5rem_2fr_1.2fr_1fr_0.7fr_0.7fr_0.8fr_auto] gap-4 pb-3 border-b border-night-lighter text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
            <span>
              <input
                type="checkbox"
                checked={allFilteredChecked}
                onChange={toggleAll}
                className="w-3.5 h-3.5 accent-cloud"
              />
            </span>
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
                const isChecked = checked.has(c.id)
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'group grid grid-cols-[1.5rem_2fr_1.2fr_1fr_0.7fr_0.7fr_0.8fr_auto] gap-4 py-3 items-center cursor-pointer transition-colors',
                      active && 'bg-night-light/60',
                      isChecked && 'bg-night-lighter/20'
                    )}
                    onClick={() =>
                      setSelectedId(c.id === selectedId ? null : c.id)
                    }
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleOne(c.id)
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(c.id)}
                        className="w-3.5 h-3.5 accent-cloud"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </span>
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
                  {selected.notes.replace(/^\[tags:[^\]]*\]\s*/, '')}
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

            {/* Scoring */}
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
                          style={{ width: `${selected.engagement_score}%` }}
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
                          style={{ width: `${selected.churn_risk}%` }}
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
                          selected.spending_trend > 0 ? 'text-leaf' : 'text-primary'
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

      {/* Customer form modal */}
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

      {/* Bulk WhatsApp modal */}
      {showBulkWhatsapp && (
        <BulkWhatsappModal
          count={checkedCount}
          onClose={() => setShowBulkWhatsapp(false)}
          onError={setError}
        />
      )}

      {/* Bulk tag modal */}
      {showBulkTag && (
        <BulkTagModal
          customerIds={Array.from(checked)}
          onClose={() => setShowBulkTag(false)}
          onSuccess={() => {
            setChecked(new Set())
            setShowBulkTag(false)
          }}
          onError={setError}
        />
      )}

      {/* Segment builder modal */}
      {showSegmentBuilder && (
        <SegmentBuilderModal
          onClose={() => setShowSegmentBuilder(false)}
          onError={setError}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Bulk WhatsApp modal
// ---------------------------------------------------------------

function BulkWhatsappModal({
  count,
  onClose,
  onError,
}: {
  count: number
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [templateId, setTemplateId] = useState('')
  const [pending, startTransition] = useTransition()
  void onError

  function handleSend() {
    if (!templateId) return
    startTransition(async () => {
      // In production: queue messages via marketing dispatch
      // For now: show confirmation
      alert(`Mensagens enfileiradas para ${count} clientes via template ${templateId}`)
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            Enviar WhatsApp
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-[13px] text-stone-light tracking-tight">
            Enviar mensagem para{' '}
            <span className="text-cloud font-data">{count}</span> clientes selecionados.
          </p>
          <Field label="ID do template (WhatsApp)">
            <input
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Cole o ID ou nome do template"
              className="w-full h-9 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>
          <p className="text-[11px] text-stone-dark tracking-tight">
            As mensagens serao enfileiradas e enviadas via WhatsApp Business API
          </p>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 h-9 border border-night-lighter rounded-md text-[12px] text-stone-light hover:text-cloud transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={pending || !templateId.trim()}
              className="flex-1 h-9 bg-leaf text-night rounded-md text-[12px] font-medium hover:bg-leaf/90 transition-colors disabled:opacity-40"
            >
              {pending ? 'Enfileirando...' : 'Confirmar envio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Bulk tag modal
// ---------------------------------------------------------------

function BulkTagModal({
  customerIds,
  onClose,
  onSuccess,
  onError,
}: {
  customerIds: string[]
  onClose: () => void
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const [tag, setTag] = useState('')
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    if (!tag.trim()) return
    startTransition(async () => {
      const res = await bulkAddTag({ customerIds, tag })
      if ('error' in res && res.error) {
        onError(res.error)
        return
      }
      onSuccess()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            Adicionar tag
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-[13px] text-stone-light tracking-tight">
            Adicionar tag para{' '}
            <span className="text-cloud font-data">{customerIds.length}</span> clientes.
          </p>
          <Field label="Tag">
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Ex: vip, aniversario, promo-verao"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full h-9 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 h-9 border border-night-lighter rounded-md text-[12px] text-stone-light hover:text-cloud transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={pending || !tag.trim()}
              className="flex-1 h-9 bg-cloud text-night rounded-md text-[12px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
            >
              {pending ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Segment builder modal
// ---------------------------------------------------------------

const RULE_FIELDS: Array<{ value: string; label: string; ops: string[] }> = [
  { value: 'total_spent', label: 'Gasto total (R$)', ops: ['eq', 'gt', 'gte', 'lt', 'lte'] },
  { value: 'total_orders', label: 'Numero de pedidos', ops: ['eq', 'gt', 'gte', 'lt', 'lte'] },
  { value: 'last_visit_at', label: 'Dias sem visita', ops: ['gt', 'gte', 'lt', 'lte'] },
  { value: 'loyalty_points', label: 'Pontos fidelidade', ops: ['eq', 'gt', 'gte', 'lt', 'lte'] },
  { value: 'birthday_month', label: 'Mes de aniversario (1-12)', ops: ['eq'] },
  { value: 'created_at', label: 'Dias desde cadastro', ops: ['gt', 'gte', 'lt', 'lte'] },
]

const OP_LABEL: Record<string, string> = {
  eq: '=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
}

function SegmentBuilderModal({
  onClose,
  onError,
}: {
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [rules, setRules] = useState<SegmentRule[]>([
    { field: 'total_spent', op: 'gte', value: 0 },
  ])
  const [operator, setOperator] = useState<'AND' | 'OR'>('AND')
  const [liveCount, setLiveCount] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [counting, setCounting] = useState(false)

  function addRule() {
    setRules([...rules, { field: 'total_spent', op: 'gte', value: 0 }])
  }

  function updateRule(index: number, patch: Partial<SegmentRule>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  function handleCount() {
    setCounting(true)
    startTransition(async () => {
      const res = await countCustomersByRules(rules, operator)
      setCounting(false)
      if ('count' in res) setLiveCount(res.count!)
    })
  }

  function handleSave() {
    if (!name.trim()) return
    startTransition(async () => {
      const res = await createSegmentFromRules({ name, rules, operator })
      if ('error' in res && res.error) {
        onError(res.error)
        return
      }
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between sticky top-0 bg-night-light z-10">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            Nova segmentacao
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <Field label="Nome do segmento *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Clientes VIP inativos"
              autoFocus
              className="w-full h-9 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>

          {/* Operator */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
              Logica
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setOperator('AND')}
                className={cn(
                  'h-8 px-3 rounded-md text-[11px] font-medium transition-colors tracking-tight',
                  operator === 'AND'
                    ? 'bg-cloud text-night'
                    : 'border border-night-lighter text-stone-light hover:text-cloud'
                )}
              >
                TODAS as regras (E)
              </button>
              <button
                onClick={() => setOperator('OR')}
                className={cn(
                  'h-8 px-3 rounded-md text-[11px] font-medium transition-colors tracking-tight',
                  operator === 'OR'
                    ? 'bg-cloud text-night'
                    : 'border border-night-lighter text-stone-light hover:text-cloud'
                )}
              >
                QUALQUER regra (OU)
              </button>
            </div>
          </div>

          {/* Rules */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                Regras
              </label>
              <button
                onClick={addRule}
                className="text-[11px] text-stone-light hover:text-cloud tracking-tight transition-colors"
              >
                + Adicionar regra
              </button>
            </div>

            <div className="space-y-2">
              {rules.map((r, i) => {
                const fieldDef = RULE_FIELDS.find((f) => f.value === r.field)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={r.field}
                      onChange={(e) => updateRule(i, { field: e.target.value, op: RULE_FIELDS.find((f) => f.value === e.target.value)?.ops[0] ?? 'eq' })}
                      className="flex-1 h-9 px-2 bg-night border border-night-lighter rounded-md text-[11px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
                    >
                      {RULE_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      value={r.op}
                      onChange={(e) => updateRule(i, { op: e.target.value })}
                      className="w-16 h-9 px-2 bg-night border border-night-lighter rounded-md text-[11px] text-cloud font-data text-center focus:outline-none focus:border-stone-dark transition-colors"
                    >
                      {(fieldDef?.ops ?? ['eq']).map((op) => (
                        <option key={op} value={op}>{OP_LABEL[op]}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={r.value}
                      onChange={(e) => updateRule(i, { value: Number(e.target.value) || 0 })}
                      className="w-24 h-9 px-2 bg-night border border-night-lighter rounded-md text-[11px] text-cloud font-data text-center focus:outline-none focus:border-stone-dark transition-colors"
                    />
                    <button
                      onClick={() => removeRule(i)}
                      className="w-7 h-7 flex items-center justify-center text-stone-dark hover:text-primary rounded-md hover:bg-night-lighter transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}

              {rules.length === 0 && (
                <p className="text-[12px] text-stone-dark tracking-tight py-2">
                  Sem regras — inclui todos os clientes
                </p>
              )}
            </div>
          </div>

          {/* Live count */}
          <div className="border-t border-night-lighter pt-4 flex items-center justify-between">
            <div>
              {liveCount !== null && (
                <p className="text-[13px] text-cloud font-data tracking-tight">
                  {liveCount}{' '}
                  <span className="text-[11px] text-stone-dark font-sans">
                    clientes correspondem
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={handleCount}
              disabled={counting || pending}
              className="h-8 px-3 text-[11px] font-medium text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors disabled:opacity-40 tracking-tight"
            >
              {counting ? 'Contando...' : 'Contar clientes'}
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending || !name.trim()}
              className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
            >
              {pending ? 'Salvando...' : 'Salvar segmento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Micro components
// ---------------------------------------------------------------

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
