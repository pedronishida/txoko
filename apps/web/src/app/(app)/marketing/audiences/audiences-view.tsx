'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { CampaignAudience } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import {
  deleteAudience,
  previewAudienceCount,
  refreshAudienceCount,
  saveAudience,
  type AudienceFilter,
} from './actions'

const FILTER_FIELDS: Array<{
  value: string
  label: string
  ops: string[]
}> = [
  { value: 'total_spent', label: 'Gasto total (R$)', ops: ['gt', 'gte', 'lt', 'lte', 'eq'] },
  { value: 'total_orders', label: 'Total de pedidos', ops: ['gt', 'gte', 'lt', 'lte', 'eq'] },
  { value: 'loyalty_points', label: 'Pontos fidelidade', ops: ['gt', 'gte', 'lt', 'lte', 'eq'] },
  { value: 'days_since_visit', label: 'Dias sem visita', ops: ['gt', 'gte', 'lt', 'lte'] },
  { value: 'has_phone', label: 'Tem telefone', ops: ['eq'] },
  { value: 'has_email', label: 'Tem e-mail', ops: ['eq'] },
  { value: 'birthday_month', label: 'Mes do aniversario', ops: ['eq'] },
  { value: 'engagement_score', label: 'Engagement (0-100)', ops: ['gt', 'gte', 'lt', 'lte'] },
  { value: 'churn_risk', label: 'Risco de churn (0-100)', ops: ['gt', 'gte', 'lt', 'lte'] },
  { value: 'optimal_send_hour', label: 'Horario ideal (0-23)', ops: ['eq'] },
]

const OP_LABEL: Record<string, string> = {
  eq: '=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  is_null: 'vazio',
  is_not_null: 'preenchido',
}

type Props = {
  audiences: CampaignAudience[]
  totalCustomers: number
}

export function AudiencesView({ audiences, totalCustomers }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CampaignAudience | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openForm(aud: CampaignAudience | null) {
    setError(null)
    setEditing(aud)
    setShowForm(true)
  }

  function handleDelete(id: string) {
    if (!confirm('Remover esta audiencia?')) return
    startTransition(async () => {
      const res = await deleteAudience(id)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleRefresh(id: string) {
    startTransition(async () => {
      const res = await refreshAudienceCount(id)
      if ('error' in res && res.error) setError(res.error)
    })
  }

  return (
    <div className="-mx-8 -mt-6">
      <header className="px-8 pt-6 pb-8 border-b border-night-lighter flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
            Audiencias
          </h1>
          <p className="text-[13px] text-stone mt-2 tracking-tight">
            Segmentos de clientes para campanhas · {totalCustomers} clientes
            no total
          </p>
        </div>
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Nova audiencia
        </button>
      </header>

      <div className="px-8 py-8">
        {error && (
          <div className="mb-6 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={12} />
            </button>
          </div>
        )}

        {audiences.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[14px] text-stone tracking-tight">
              Nenhuma audiencia criada
            </p>
            <p className="text-[12px] text-stone-dark tracking-tight mt-1.5">
              Audiencias filtram clientes por gasto, frequencia,
              aniversario e mais
            </p>
          </div>
        ) : (
          <div className="divide-y divide-night-lighter">
            {audiences.map((aud) => {
              const filters = (aud.filters ?? []) as AudienceFilter[]
              return (
                <div
                  key={aud.id}
                  className="group py-5 flex items-start justify-between gap-6"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-[14px] font-medium text-cloud tracking-tight">
                        {aud.name}
                      </span>
                      <span className="text-[13px] font-data text-stone-light">
                        {aud.cached_count}
                      </span>
                      <span className="text-[10px] text-stone-dark tracking-tight">
                        clientes
                      </span>
                    </div>
                    {aud.description && (
                      <p className="text-[12px] text-stone tracking-tight mb-2">
                        {aud.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-[10px] text-stone-dark tracking-tight">
                      {filters.map((f, i) => {
                        const fieldDef = FILTER_FIELDS.find(
                          (ff) => ff.value === f.field
                        )
                        return (
                          <span key={i}>
                            {fieldDef?.label ?? f.field} {OP_LABEL[f.op] ?? f.op}{' '}
                            {f.value}
                          </span>
                        )
                      })}
                      {filters.length === 0 && (
                        <span>Todos os clientes</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handleRefresh(aud.id)}
                      disabled={pending}
                      className="text-[10px] text-stone-light hover:text-cloud tracking-tight disabled:opacity-40"
                    >
                      atualizar
                    </button>
                    <button
                      onClick={() => openForm(aud)}
                      className="text-[10px] text-stone-light hover:text-cloud tracking-tight"
                    >
                      editar
                    </button>
                    <button
                      onClick={() => handleDelete(aud.id)}
                      disabled={pending}
                      className="text-[10px] text-stone-dark hover:text-primary tracking-tight disabled:opacity-40"
                    >
                      remover
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showForm && (
        <AudienceFormModal
          audience={editing}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function AudienceFormModal({
  audience,
  onClose,
  onError,
}: {
  audience: CampaignAudience | null
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(audience?.name ?? '')
  const [description, setDescription] = useState(audience?.description ?? '')
  const [filters, setFilters] = useState<AudienceFilter[]>(
    (audience?.filters as AudienceFilter[]) ?? []
  )
  const [previewCount, setPreviewCount] = useState<number | null>(
    audience?.cached_count ?? null
  )
  const [pending, startTransition] = useTransition()

  function addFilter() {
    setFilters([...filters, { field: 'total_spent', op: 'gte', value: 0 }])
  }

  function updateFilter(index: number, patch: Partial<AudienceFilter>) {
    setFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f))
    )
  }

  function removeFilter(index: number) {
    setFilters((prev) => prev.filter((_, i) => i !== index))
  }

  function handlePreview() {
    startTransition(async () => {
      const res = await previewAudienceCount(filters)
      if ('count' in res) setPreviewCount(res.count!)
    })
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveAudience({
        id: audience?.id,
        name,
        description: description || undefined,
        filters,
      })
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
        className="bg-night-light border border-night-lighter rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between sticky top-0 bg-night-light z-10">
          <h2 className="text-[14px] font-medium text-cloud tracking-tight">
            {audience ? 'Editar audiencia' : 'Nova audiencia'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Nome *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Clientes VIP"
              className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>
          <Field label="Descricao">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descricao opcional do segmento"
              className="w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors"
            />
          </Field>

          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                Filtros
              </label>
              <button
                onClick={addFilter}
                className="text-[11px] text-stone-light hover:text-cloud tracking-tight transition-colors"
              >
                + Adicionar filtro
              </button>
            </div>
            {filters.length === 0 && (
              <p className="text-[12px] text-stone-dark tracking-tight py-3">
                Sem filtros — inclui todos os clientes
              </p>
            )}
            <div className="space-y-2">
              {filters.map((f, i) => {
                const fieldDef = FILTER_FIELDS.find(
                  (ff) => ff.value === f.field
                )
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={f.field}
                      onChange={(e) =>
                        updateFilter(i, { field: e.target.value })
                      }
                      className="flex-1 h-9 px-2 bg-night border border-night-lighter rounded-md text-[11px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
                    >
                      {FILTER_FIELDS.map((ff) => (
                        <option key={ff.value} value={ff.value}>
                          {ff.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => updateFilter(i, { op: e.target.value })}
                      className="w-16 h-9 px-2 bg-night border border-night-lighter rounded-md text-[11px] text-cloud font-data text-center focus:outline-none focus:border-stone-dark transition-colors"
                    >
                      {(fieldDef?.ops ?? ['eq']).map((op) => (
                        <option key={op} value={op}>
                          {OP_LABEL[op]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) =>
                        updateFilter(i, {
                          value: Number(e.target.value) || 0,
                        })
                      }
                      className="w-24 h-9 px-2 bg-night border border-night-lighter rounded-md text-[11px] text-cloud font-data text-center focus:outline-none focus:border-stone-dark transition-colors"
                    />
                    <button
                      onClick={() => removeFilter(i)}
                      className="w-7 h-7 flex items-center justify-center text-stone-dark hover:text-primary rounded-md hover:bg-night-lighter transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="border-t border-night-lighter pt-4 flex items-center justify-between">
            <div>
              {previewCount !== null && (
                <p className="text-[13px] text-cloud font-data tracking-tight">
                  {previewCount}{' '}
                  <span className="text-[11px] text-stone-dark font-sans">
                    clientes encontrados
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={handlePreview}
              disabled={pending}
              className="h-8 px-3 text-[11px] font-medium text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors disabled:opacity-40 tracking-tight"
            >
              Contar clientes
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
              {pending
                ? 'Salvando'
                : audience
                  ? 'Salvar'
                  : 'Criar audiencia'}
            </button>
          </div>
        </div>
      </div>
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
