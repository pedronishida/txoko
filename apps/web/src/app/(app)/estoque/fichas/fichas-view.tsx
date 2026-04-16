'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  Plus,
  X,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from 'lucide-react'
import { saveRecipe, deleteRecipe } from './actions'
import { MetricBand } from '@/components/metric-band'
import type { RecipeIngredientInput } from './actions'

// ----------------------------------------------------------------
// Data types (mirror DB rows; no @txoko/shared types needed)
// ----------------------------------------------------------------
type ProductRow = {
  id: string
  name: string
  price: number
  category_id: string | null
}

type IngredientRow = {
  id: string
  name: string
  unit: string
  cost_per_unit: number | null
  current_stock: number
}

type RecipeMetaRow = {
  id: string
  product_id: string
  yield_quantity: number
  yield_unit: string
  prep_time_minutes: number | null
  instructions: string | null
}

type RecipeIngRow = {
  id: string
  product_id: string
  ingredient_id: string
  quantity: number
  unit: string
  waste_percent: number
  notes: string | null
  sort_order: number
}

type Props = {
  products: ProductRow[]
  metadata: RecipeMetaRow[]
  ingredients: IngredientRow[]
  recipeIngredients: RecipeIngRow[]
}

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------
const UNITS = ['g', 'kg', 'ml', 'L', 'un', 'cx', 'fardo']

const YIELD_UNITS = ['porcao', 'unidade', 'kg', 'L', 'porcoes']

// Unit conversion to canonical (for cost estimation when user picks g but ingredient is kg)
function toBaseUnit(qty: number, unit: string, baseUnit: string): number {
  if (unit === baseUnit) return qty
  if (unit === 'g' && baseUnit === 'kg') return qty / 1000
  if (unit === 'kg' && baseUnit === 'g') return qty * 1000
  if (unit === 'ml' && baseUnit === 'L') return qty / 1000
  if (unit === 'L' && baseUnit === 'ml') return qty * 1000
  return qty // unknown conversion — use raw
}

// ----------------------------------------------------------------
// CMV coloring
// ----------------------------------------------------------------
function cmvColor(cmvPct: number) {
  if (cmvPct <= 0) return 'text-stone'
  if (cmvPct < 30) return 'text-leaf'
  if (cmvPct < 40) return 'text-warm'
  return 'text-coral'
}

// ----------------------------------------------------------------
// Main component
// ----------------------------------------------------------------
export function FichasView({
  products,
  metadata,
  ingredients,
  recipeIngredients,
}: Props) {
  const [search, setSearch] = useState('')
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // ------- editor state -------
  const [draftMeta, setDraftMeta] = useState({
    yield_quantity: 1,
    yield_unit: 'porcao',
    prep_time_minutes: '' as string | number,
    instructions: '',
  })
  const [draftRows, setDraftRows] = useState<RecipeIngredientInput[]>([])

  // ------- derived maps -------
  const metaByProduct = useMemo(() => {
    const m = new Map<string, RecipeMetaRow>()
    for (const r of metadata) m.set(r.product_id, r)
    return m
  }, [metadata])

  const ingsByProduct = useMemo(() => {
    const m = new Map<string, RecipeIngRow[]>()
    for (const r of recipeIngredients) {
      const arr = m.get(r.product_id) ?? []
      arr.push(r)
      m.set(r.product_id, arr)
    }
    return m
  }, [recipeIngredients])

  const ingredientById = useMemo(() => {
    const m = new Map<string, IngredientRow>()
    for (const i of ingredients) m.set(i.id, i)
    return m
  }, [ingredients])

  // ------- computed fichas -------
  const fichas = useMemo(() => {
    return products.map((product) => {
      const meta = metaByProduct.get(product.id)
      const rows = ingsByProduct.get(product.id) ?? []
      const totalCost = rows.reduce((sum, r) => {
        const ing = ingredientById.get(r.ingredient_id)
        if (!ing?.cost_per_unit) return sum
        const baseQty = toBaseUnit(r.quantity, r.unit, ing.unit)
        return sum + baseQty * (1 + r.waste_percent / 100) * Number(ing.cost_per_unit)
      }, 0)
      const price = Number(product.price)
      const margin = price - totalCost
      const marginPct = price > 0 ? (margin / price) * 100 : 0
      const cmvPct = price > 0 ? (totalCost / price) * 100 : 0
      return { product, meta, rows, totalCost, price, margin, marginPct, cmvPct }
    })
  }, [products, metaByProduct, ingsByProduct, ingredientById])

  // ------- aggregated KPIs -------
  const kpi = useMemo(() => {
    const withRecipe = fichas.filter((f) => f.rows.length > 0)
    const avgCmv =
      withRecipe.length > 0
        ? withRecipe.reduce((s, f) => s + f.cmvPct, 0) / withRecipe.length
        : 0
    const aboveThreshold = withRecipe.filter((f) => f.cmvPct > 40).length
    return {
      total: products.length,
      withRecipe: withRecipe.length,
      avgCmv,
      aboveThreshold,
    }
  }, [fichas, products.length])

  // ------- filtered list -------
  const filtered = useMemo(() => {
    if (!search) return fichas
    const q = search.toLowerCase()
    return fichas.filter((f) => f.product.name.toLowerCase().includes(q))
  }, [fichas, search])

  // ------- draft cost (real-time in editor) -------
  const draftCost = useMemo(() => {
    return draftRows.reduce((sum, r) => {
      const ing = ingredientById.get(r.ingredient_id)
      if (!ing?.cost_per_unit) return sum
      const baseQty = toBaseUnit(r.quantity, r.unit, ing.unit)
      return sum + baseQty * (1 + (r.waste_percent ?? 0) / 100) * Number(ing.cost_per_unit)
    }, 0)
  }, [draftRows, ingredientById])

  // ------- editor helpers -------
  function openEditor(productId: string) {
    setError(null)
    const meta = metaByProduct.get(productId)
    const rows = ingsByProduct.get(productId) ?? []

    setDraftMeta({
      yield_quantity: meta?.yield_quantity ?? 1,
      yield_unit: meta?.yield_unit ?? 'porcao',
      prep_time_minutes: meta?.prep_time_minutes ?? '',
      instructions: meta?.instructions ?? '',
    })
    setDraftRows(
      rows
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({
          ingredient_id: r.ingredient_id,
          quantity: r.quantity,
          unit: r.unit,
          waste_percent: r.waste_percent,
          notes: r.notes ?? null,
          sort_order: r.sort_order,
        }))
    )
    setEditingProductId(productId)
  }

  function closeEditor() {
    setEditingProductId(null)
    setDraftRows([])
    setError(null)
  }

  function addDraftRow() {
    const firstUnused = ingredients.find(
      (ing) => !draftRows.some((d) => d.ingredient_id === ing.id)
    )
    if (!firstUnused) return
    setDraftRows((prev) => [
      ...prev,
      {
        ingredient_id: firstUnused.id,
        quantity: 1,
        unit: firstUnused.unit,
        waste_percent: 0,
        notes: null,
        sort_order: prev.length,
      },
    ])
  }

  function updateDraftRow(index: number, patch: Partial<RecipeIngredientInput>) {
    setDraftRows((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d
        const next = { ...d, ...patch }
        // Auto-set unit when ingredient changes
        if (patch.ingredient_id) {
          const ing = ingredientById.get(patch.ingredient_id)
          if (ing) next.unit = ing.unit
        }
        return next
      })
    )
  }

  function removeDraftRow(index: number) {
    setDraftRows((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    if (!editingProductId) return
    startTransition(async () => {
      const res = await saveRecipe({
        product_id: editingProductId,
        yield_quantity: Number(draftMeta.yield_quantity) || 1,
        yield_unit: draftMeta.yield_unit,
        prep_time_minutes:
          draftMeta.prep_time_minutes !== ''
            ? Number(draftMeta.prep_time_minutes)
            : null,
        instructions: draftMeta.instructions || null,
        ingredients: draftRows
          .filter((r) => r.ingredient_id && r.quantity > 0)
          .map((r, i) => ({ ...r, sort_order: i })),
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      closeEditor()
    })
  }

  function handleDelete(productId: string) {
    if (!confirm('Remover ficha tecnica deste produto?')) return
    startTransition(async () => {
      await deleteRecipe(productId)
    })
  }

  // ------- editor product -------
  const editingProduct = editingProductId
    ? products.find((p) => p.id === editingProductId) ?? null
    : null

  const editingPrice = editingProduct ? Number(editingProduct.price) : 0
  const draftMargin = editingPrice - draftCost
  const draftMarginPct = editingPrice > 0 ? (draftMargin / editingPrice) * 100 : 0
  const draftCmvPct = editingPrice > 0 ? (draftCost / editingPrice) * 100 : 0

  return (
    <div>
      {/* KPI band */}
      <MetricBand
        metrics={[
          { label: 'Produtos', value: String(kpi.total) },
          {
            label: 'Com ficha',
            value: String(kpi.withRecipe),
            tone: kpi.withRecipe > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'CMV medio',
            value: kpi.withRecipe > 0 ? `${kpi.avgCmv.toFixed(1)}%` : '—',
            tone:
              kpi.avgCmv === 0
                ? 'neutral'
                : kpi.avgCmv < 30
                ? 'positive'
                : kpi.avgCmv < 40
                ? 'neutral'
                : 'negative',
          },
          {
            label: 'CMV > 40%',
            value: String(kpi.aboveThreshold),
            tone: kpi.aboveThreshold > 0 ? 'negative' : 'neutral',
          },
        ]}
        columns={4}
      />

      {/* Search */}
      <div className="flex items-center gap-4 mb-6">
        <input
          type="text"
          placeholder="Buscar produto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-9 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none tracking-tight"
        />
      </div>

      {/* Warning: no ingredients */}
      {ingredients.length === 0 && (
        <div className="mb-6 px-3.5 py-2.5 bg-warm/5 border border-warm/20 rounded-md text-[12px] text-warm tracking-tight">
          Nenhum insumo cadastrado. Cadastre insumos na aba Insumos antes de criar fichas
          tecnicas.
        </div>
      )}

      {/* Table header */}
      {products.length > 0 && (
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.7fr_auto] gap-4 pb-3 border-b border-night-lighter text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
          <span>Produto</span>
          <span className="text-right">Custo (CMV)</span>
          <span className="text-right">Preco</span>
          <span className="text-right">Margem</span>
          <span className="text-center">Ingredientes</span>
          <span></span>
        </div>
      )}

      {/* Table rows */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-stone tracking-tight">
          Nenhum produto ativo
        </p>
      ) : (
        <div className="divide-y divide-night-lighter">
          {filtered.map((ficha) => {
            const hasRecipe = ficha.rows.length > 0
            return (
              <div
                key={ficha.product.id}
                className="group grid grid-cols-[2fr_1fr_1fr_1fr_0.7fr_auto] gap-4 py-3.5 items-center"
              >
                {/* Product name */}
                <div className="flex items-center gap-2 min-w-0">
                  {hasRecipe ? (
                    <CheckCircle2 size={13} className="text-leaf shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-night-lighter shrink-0" />
                  )}
                  <span className="text-[13px] text-cloud tracking-tight truncate">
                    {ficha.product.name}
                  </span>
                </div>

                {/* Cost */}
                <div className="text-right">
                  {hasRecipe ? (
                    <span className={cn('text-[12px] font-data', cmvColor(ficha.cmvPct))}>
                      {formatCurrency(ficha.totalCost)}
                      <span className="text-[10px] ml-1">({ficha.cmvPct.toFixed(1)}%)</span>
                    </span>
                  ) : (
                    <span className="text-[12px] text-stone-dark">—</span>
                  )}
                </div>

                {/* Price */}
                <span className="text-[12px] text-stone-light font-data text-right">
                  {formatCurrency(ficha.price)}
                </span>

                {/* Margin */}
                <div className="text-right">
                  {hasRecipe ? (
                    <span
                      className={cn(
                        'text-[12px] font-data',
                        ficha.marginPct >= 60 ? 'text-leaf' : 'text-warm'
                      )}
                    >
                      {ficha.marginPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-[12px] text-stone-dark">—</span>
                  )}
                </div>

                {/* Ingredient count */}
                <div className="text-center">
                  <span className="text-[11px] text-stone-dark font-data">
                    {hasRecipe ? ficha.rows.length : '—'}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditor(ficha.product.id)}
                    className={cn(
                      'h-7 px-3 text-[11px] font-medium rounded-md transition-colors tracking-tight',
                      hasRecipe
                        ? 'text-stone-light hover:text-cloud hover:bg-night-light'
                        : 'text-leaf hover:text-leaf/80 hover:bg-leaf/5 border border-leaf/20'
                    )}
                  >
                    {hasRecipe ? 'Editar' : '+ Criar ficha'}
                  </button>
                  {hasRecipe && (
                    <button
                      onClick={() => handleDelete(ficha.product.id)}
                      className="w-7 h-7 flex items-center justify-center text-stone-dark hover:text-coral rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ----------------------------------------------------------------
          Editor Modal
          ---------------------------------------------------------------- */}
      {editingProductId && editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm px-4"
          onClick={closeEditor}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-night-lighter flex items-start justify-between shrink-0">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                  Ficha tecnica
                </p>
                <h2 className="text-[15px] font-medium text-cloud tracking-tight mt-0.5">
                  {editingProduct.name}
                </h2>
                <p className="text-[11px] text-stone-dark tracking-tight mt-1">
                  Preco de venda:{' '}
                  <span className="font-data text-stone-light">
                    {formatCurrency(editingPrice)}
                  </span>
                </p>
              </div>
              <button
                onClick={closeEditor}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {error && (
                <div className="px-3 py-2 bg-coral/5 border border-coral/20 rounded-md text-[12px] text-coral tracking-tight">
                  {error}
                </div>
              )}

              {/* Yield + Prep time */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                  Rendimento e preparo
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-stone mb-1.5">Rendimento</label>
                    <input
                      type="number"
                      min="0.001"
                      step="0.5"
                      value={draftMeta.yield_quantity}
                      onChange={(e) =>
                        setDraftMeta((d) => ({
                          ...d,
                          yield_quantity: parseFloat(e.target.value) || 1,
                        }))
                      }
                      className="w-full h-9 px-3 bg-night border border-night-lighter rounded-md text-[13px] text-cloud font-data focus:outline-none focus:border-stone-dark transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone mb-1.5">Unidade</label>
                    <div className="relative">
                      <select
                        value={draftMeta.yield_unit}
                        onChange={(e) =>
                          setDraftMeta((d) => ({ ...d, yield_unit: e.target.value }))
                        }
                        className="w-full h-9 px-3 pr-8 bg-night border border-night-lighter rounded-md text-[13px] text-cloud focus:outline-none focus:border-stone-dark transition-colors appearance-none"
                      >
                        {YIELD_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={12}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone pointer-events-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone mb-1.5">
                      Tempo de preparo (min)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="—"
                      value={draftMeta.prep_time_minutes}
                      onChange={(e) =>
                        setDraftMeta((d) => ({
                          ...d,
                          prep_time_minutes: e.target.value,
                        }))
                      }
                      className="w-full h-9 px-3 bg-night border border-night-lighter rounded-md text-[13px] text-cloud font-data focus:outline-none focus:border-stone-dark transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Ingredients */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                  Ingredientes
                </p>

                {draftRows.length > 0 && (
                  <div className="mb-2">
                    <div className="grid grid-cols-[2fr_1fr_0.8fr_0.7fr_auto] gap-2 mb-2 text-[10px] text-stone-dark uppercase tracking-[0.05em]">
                      <span>Ingrediente</span>
                      <span>Qtd + Un</span>
                      <span>Perda %</span>
                      <span className="text-right">Custo</span>
                      <span></span>
                    </div>
                    <div className="space-y-2">
                      {draftRows.map((row, i) => {
                        const ing = ingredientById.get(row.ingredient_id)
                        const baseQty = ing
                          ? toBaseUnit(row.quantity, row.unit, ing.unit)
                          : row.quantity
                        const rowCost = ing?.cost_per_unit
                          ? baseQty *
                            (1 + (row.waste_percent ?? 0) / 100) *
                            Number(ing.cost_per_unit)
                          : null
                        const isLowStock =
                          ing &&
                          baseQty * (1 + (row.waste_percent ?? 0) / 100) >
                            Number(ing.current_stock)
                        return (
                          <div key={i} className="grid grid-cols-[2fr_1fr_0.8fr_0.7fr_auto] gap-2 items-center">
                            {/* Ingredient select */}
                            <div className="relative">
                              <select
                                value={row.ingredient_id}
                                onChange={(e) =>
                                  updateDraftRow(i, { ingredient_id: e.target.value })
                                }
                                className={cn(
                                  'w-full h-9 px-2.5 pr-7 bg-night border rounded-md text-[12px] text-cloud focus:outline-none transition-colors appearance-none',
                                  isLowStock
                                    ? 'border-warm/40'
                                    : 'border-night-lighter focus:border-stone-dark'
                                )}
                              >
                                {ingredients.map((ing) => (
                                  <option key={ing.id} value={ing.id}>
                                    {ing.name} ({ing.unit}
                                    {ing.cost_per_unit
                                      ? ` · ${formatCurrency(Number(ing.cost_per_unit))}`
                                      : ''})
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                size={11}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone pointer-events-none"
                              />
                            </div>

                            {/* Qty + unit */}
                            <div className="flex gap-1">
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={row.quantity}
                                onChange={(e) =>
                                  updateDraftRow(i, {
                                    quantity: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-16 h-9 px-2 bg-night border border-night-lighter rounded-md text-[12px] text-cloud font-data focus:outline-none focus:border-stone-dark transition-colors text-right"
                              />
                              <div className="relative flex-1">
                                <select
                                  value={row.unit}
                                  onChange={(e) =>
                                    updateDraftRow(i, { unit: e.target.value })
                                  }
                                  className="w-full h-9 px-1.5 pr-6 bg-night border border-night-lighter rounded-md text-[11px] text-cloud focus:outline-none focus:border-stone-dark transition-colors appearance-none"
                                >
                                  {UNITS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown
                                  size={10}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-stone pointer-events-none"
                                />
                              </div>
                            </div>

                            {/* Waste */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="100"
                                value={row.waste_percent}
                                onChange={(e) =>
                                  updateDraftRow(i, {
                                    waste_percent: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-full h-9 px-2 bg-night border border-night-lighter rounded-md text-[12px] text-cloud font-data focus:outline-none focus:border-stone-dark transition-colors text-right"
                              />
                            </div>

                            {/* Row cost + stock warning */}
                            <div className="text-right">
                              {rowCost !== null ? (
                                <div>
                                  <span className="text-[11px] text-stone-light font-data">
                                    {formatCurrency(rowCost)}
                                  </span>
                                  {isLowStock && (
                                    <AlertTriangle
                                      size={10}
                                      className="inline ml-1 text-warm"
                                    />
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-stone-dark">—</span>
                              )}
                            </div>

                            {/* Remove */}
                            <button
                              onClick={() => removeDraftRow(i)}
                              className="w-7 h-7 flex items-center justify-center text-stone-dark hover:text-coral rounded-md hover:bg-night-lighter transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={addDraftRow}
                  disabled={draftRows.length >= ingredients.length || ingredients.length === 0}
                  className="w-full h-9 flex items-center justify-center gap-1.5 text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors disabled:opacity-40 tracking-tight border border-dashed border-night-lighter mt-2"
                >
                  <Plus size={12} strokeWidth={2} /> Adicionar ingrediente
                </button>
              </div>

              {/* Instructions */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Instrucoes de preparo{' '}
                  <span className="normal-case font-normal text-stone">(opcional)</span>
                </p>
                <textarea
                  rows={3}
                  placeholder="Descreva o modo de preparo..."
                  value={draftMeta.instructions}
                  onChange={(e) =>
                    setDraftMeta((d) => ({ ...d, instructions: e.target.value }))
                  }
                  className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors resize-none"
                />
              </div>

              {/* CMV panel */}
              {draftRows.length > 0 && (
                <div className="bg-night rounded-lg border border-night-lighter p-4 space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                    Calculo em tempo real
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-stone">Custo total</p>
                      <p className="text-[16px] font-data font-medium text-cloud mt-0.5">
                        {formatCurrency(draftCost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone">Preco de venda</p>
                      <p className="text-[16px] font-data font-medium text-cloud mt-0.5">
                        {formatCurrency(editingPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone">Margem bruta</p>
                      <p
                        className={cn(
                          'text-[16px] font-data font-medium mt-0.5',
                          draftMargin >= 0 ? 'text-leaf' : 'text-coral'
                        )}
                      >
                        {formatCurrency(draftMargin)}{' '}
                        <span className="text-[12px]">({draftMarginPct.toFixed(1)}%)</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone">CMV (food cost)</p>
                      <p
                        className={cn(
                          'text-[16px] font-data font-medium mt-0.5',
                          cmvColor(draftCmvPct)
                        )}
                      >
                        {draftCmvPct.toFixed(1)}%
                        {draftCmvPct > 40 && (
                          <AlertTriangle
                            size={12}
                            className="inline ml-1.5 text-coral"
                          />
                        )}
                      </p>
                    </div>
                  </div>
                  {draftCmvPct > 40 && (
                    <p className="text-[11px] text-coral/80 mt-2 tracking-tight">
                      CMV acima de 40% — verifique custos dos ingredientes ou ajuste o
                      preco de venda.
                    </p>
                  )}
                  {draftCmvPct > 0 && draftCmvPct < 30 && (
                    <p className="text-[11px] text-leaf/70 mt-2 tracking-tight">
                      CMV saudavel — abaixo de 30%.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-night-lighter shrink-0 flex gap-3">
              <button
                onClick={closeEditor}
                className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud/90 transition-colors disabled:opacity-40"
              >
                {pending ? 'Salvando...' : 'Salvar ficha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
