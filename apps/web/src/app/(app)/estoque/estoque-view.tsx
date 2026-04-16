'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Ingredient, Supplier } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import { deleteIngredient, saveIngredient } from './actions'
import { MetricBand } from '@/components/metric-band'
import { TabBar } from '@/components/tab-bar'

const STORAGE_LOCATIONS = ['geladeira', 'deposito', 'cozinha', 'bar']
const UNITS = ['kg', 'g', 'l', 'ml', 'un']

type Props = {
  ingredients: Ingredient[]
  suppliers: Pick<Supplier, 'id' | 'name'>[]
}

export function EstoqueView({ ingredients, suppliers }: Props) {
  const [search, setSearch] = useState('')
  const [filterLocation, setFilterLocation] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [formName, setFormName] = useState('')
  const [formUnit, setFormUnit] = useState('kg')
  const [formStock, setFormStock] = useState('')
  const [formMinStock, setFormMinStock] = useState('')
  const [formCost, setFormCost] = useState('')
  const [formSupplier, setFormSupplier] = useState('')
  const [formLocation, setFormLocation] = useState('geladeira')

  const filtered = useMemo(() => {
    return ingredients.filter((i) => {
      const matchSearch =
        !search || i.name.toLowerCase().includes(search.toLowerCase())
      const matchLocation =
        !filterLocation || i.storage_location === filterLocation
      return matchSearch && matchLocation
    })
  }, [ingredients, search, filterLocation])

  const alertCount = ingredients.filter(
    (i) => i.current_stock <= i.min_stock
  ).length
  const warningCount = ingredients.filter(
    (i) => i.current_stock > i.min_stock && i.current_stock <= i.min_stock * 1.5
  ).length
  const totalCost = ingredients.reduce(
    (s, i) => s + (Number(i.cost_per_unit) || 0) * Number(i.current_stock),
    0
  )

  function openForm(ingredient: Ingredient | null) {
    setError(null)
    if (ingredient) {
      setEditing(ingredient)
      setFormName(ingredient.name)
      setFormUnit(ingredient.unit)
      setFormStock(String(ingredient.current_stock))
      setFormMinStock(String(ingredient.min_stock))
      setFormCost(
        ingredient.cost_per_unit != null
          ? String(ingredient.cost_per_unit)
          : ''
      )
      setFormSupplier(ingredient.supplier_id || '')
      setFormLocation(ingredient.storage_location || 'geladeira')
    } else {
      setEditing(null)
      setFormName('')
      setFormUnit('kg')
      setFormStock('')
      setFormMinStock('')
      setFormCost('')
      setFormSupplier('')
      setFormLocation('geladeira')
    }
    setShowForm(true)
  }

  function handleSave() {
    if (!formName.trim() || !formStock) return
    startTransition(async () => {
      const res = await saveIngredient({
        id: editing?.id,
        name: formName.trim(),
        unit: formUnit,
        current_stock: parseFloat(formStock),
        min_stock: parseFloat(formMinStock) || 0,
        cost_per_unit: formCost ? parseFloat(formCost) : null,
        supplier_id: formSupplier || null,
        storage_location: formLocation || null,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este insumo?')) return
    startTransition(async () => {
      await deleteIngredient(id)
    })
  }

  function getStatus(ing: Ingredient): 'critical' | 'warning' | 'ok' {
    if (Number(ing.current_stock) <= Number(ing.min_stock)) return 'critical'
    if (Number(ing.current_stock) <= Number(ing.min_stock) * 1.5)
      return 'warning'
    return 'ok'
  }

  const locationTabs = [
    { key: '', label: 'Todos', count: ingredients.length },
    ...STORAGE_LOCATIONS.map((loc) => ({
      key: loc,
      label: loc.charAt(0).toUpperCase() + loc.slice(1),
      count: ingredients.filter((i) => i.storage_location === loc).length,
    })),
  ]

  return (
    <div>
      {/* KPI band */}
      <MetricBand
        metrics={[
          { label: 'Total', value: String(ingredients.length) },
          {
            label: 'Critico',
            value: String(alertCount),
            tone: alertCount > 0 ? 'negative' : 'neutral',
          },
          {
            label: 'Atencao',
            value: String(warningCount),
            tone: 'neutral',
          },
          { label: 'Valor em estoque', value: formatCurrency(totalCost) },
        ]}
        columns={4}
      />

      {/* Controls */}
      <div className="flex items-center gap-6 mb-6">
        <input
          type="text"
          placeholder="Buscar insumo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-9 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none tracking-tight"
        />
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors shrink-0"
        >
          <Plus size={14} strokeWidth={2} />
          Novo insumo
        </button>
      </div>

      <div className="mb-6">
        <TabBar
          tabs={locationTabs}
          active={filterLocation ?? ''}
          onChange={(k) => setFilterLocation(k === '' ? null : k)}
        />
      </div>

      {/* Table */}
      <div>
        <div className="grid grid-cols-[2fr_0.7fr_0.9fr_0.7fr_0.9fr_1.2fr_0.8fr_auto] gap-4 pb-3 border-b border-night-lighter text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
          <span>Insumo</span>
          <span>Un.</span>
          <span className="text-right">Estoque</span>
          <span className="text-right">Min.</span>
          <span className="text-right">Custo</span>
          <span>Fornecedor</span>
          <span>Local</span>
          <span></span>
        </div>
        <div className="divide-y divide-night-lighter">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-stone tracking-tight">
              Nenhum insumo cadastrado
            </p>
          ) : (
            filtered.map((ing) => {
              const status = getStatus(ing)
              const supplier = ing.supplier_id
                ? suppliers.find((s) => s.id === ing.supplier_id)
                : null
              return (
                <div
                  key={ing.id}
                  className="group grid grid-cols-[2fr_0.7fr_0.9fr_0.7fr_0.9fr_1.2fr_0.8fr_auto] gap-4 py-3 items-center"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {status === 'critical' && (
                      <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                    )}
                    {status === 'warning' && (
                      <span className="w-1 h-1 rounded-full bg-warm shrink-0" />
                    )}
                    <span className="text-[13px] text-cloud tracking-tight truncate">
                      {ing.name}
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-dark font-data">
                    {ing.unit}
                  </span>
                  <span
                    className={cn(
                      'text-[12px] font-data text-right',
                      status === 'critical' && 'text-primary',
                      status === 'warning' && 'text-warm',
                      status === 'ok' && 'text-cloud'
                    )}
                  >
                    {Number(ing.current_stock)}
                  </span>
                  <span className="text-[11px] text-stone-dark font-data text-right">
                    {Number(ing.min_stock)}
                  </span>
                  <span className="text-[12px] text-stone-light font-data text-right">
                    {ing.cost_per_unit
                      ? formatCurrency(Number(ing.cost_per_unit))
                      : '—'}
                  </span>
                  <span className="text-[11px] text-stone tracking-tight truncate">
                    {supplier?.name || '—'}
                  </span>
                  <span className="text-[11px] text-stone tracking-tight capitalize">
                    {ing.storage_location ?? '—'}
                  </span>
                  <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openForm(ing)}
                      className="text-[10px] text-stone-light hover:text-cloud tracking-tight"
                    >
                      editar
                    </button>
                    <button
                      onClick={() => handleDelete(ing.id)}
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
                {editing ? 'Editar insumo' : 'Novo insumo'}
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
              <div className="grid grid-cols-3 gap-4">
                <Field label="Unidade">
                  <Select value={formUnit} onChange={setFormUnit}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estoque *">
                  <Input
                    value={formStock}
                    onChange={setFormStock}
                    type="number"
                    mono
                  />
                </Field>
                <Field label="Minimo">
                  <Input
                    value={formMinStock}
                    onChange={setFormMinStock}
                    type="number"
                    mono
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Custo por unidade">
                  <Input
                    value={formCost}
                    onChange={setFormCost}
                    type="number"
                    placeholder="R$"
                    mono
                  />
                </Field>
                <Field label="Local">
                  <Select value={formLocation} onChange={setFormLocation}>
                    {STORAGE_LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Fornecedor">
                <Select value={formSupplier} onChange={setFormSupplier}>
                  <option value="">Nenhum</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
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
      step={type === 'number' ? '0.01' : undefined}
      className={cn(
        'w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors',
        mono && 'font-data'
      )}
    />
  )
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-10 px-3 bg-night border border-night-lighter rounded-md text-[13px] text-cloud focus:outline-none focus:border-stone-dark transition-colors capitalize"
    >
      {children}
    </select>
  )
}
