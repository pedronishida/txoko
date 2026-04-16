'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Ingredient, Product } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import { saveRecipe } from '../actions'

export type RecipeRow = {
  product_id: string
  ingredient_id: string
  quantity: number
}

type Props = {
  products: Pick<Product, 'id' | 'name' | 'price' | 'category_id'>[]
  ingredients: Ingredient[]
  recipes: RecipeRow[]
}

type Draft = { ingredient_id: string; quantity: number }

export function FichasView({ products, ingredients, recipes }: Props) {
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const recipesByProduct = useMemo(() => {
    const map: Record<string, RecipeRow[]> = {}
    for (const r of recipes) {
      ;(map[r.product_id] ??= []).push(r)
    }
    return map
  }, [recipes])

  const ingredientById = useMemo(() => {
    const map = new Map<string, Ingredient>()
    for (const i of ingredients) map.set(i.id, i)
    return map
  }, [ingredients])

  const fichas = useMemo(() => {
    return products.map((product) => {
      const items = (recipesByProduct[product.id] ?? []).map((r) => {
        const ing = ingredientById.get(r.ingredient_id)
        const cost = ing?.cost_per_unit
          ? Number(r.quantity) * Number(ing.cost_per_unit)
          : 0
        return {
          ingredient_id: r.ingredient_id,
          name: ing?.name ?? '?',
          unit: ing?.unit ?? '',
          quantity: Number(r.quantity),
          costPerUnit: Number(ing?.cost_per_unit ?? 0),
          totalCost: cost,
        }
      })
      const totalCost = items.reduce((s, i) => s + i.totalCost, 0)
      const price = Number(product.price)
      const margin = price - totalCost
      const marginPercent = price > 0 ? (margin / price) * 100 : 0
      return { product, items, totalCost, margin, marginPercent }
    })
  }, [products, recipesByProduct, ingredientById])

  function openEditor(productId: string) {
    setError(null)
    const existing = recipesByProduct[productId] ?? []
    setDraft(
      existing.map((r) => ({
        ingredient_id: r.ingredient_id,
        quantity: Number(r.quantity),
      }))
    )
    setEditingProductId(productId)
  }

  function addDraftRow() {
    const firstUnused = ingredients.find(
      (ing) => !draft.some((d) => d.ingredient_id === ing.id)
    )
    if (!firstUnused) return
    setDraft([...draft, { ingredient_id: firstUnused.id, quantity: 1 }])
  }

  function updateDraftRow(index: number, patch: Partial<Draft>) {
    setDraft((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function removeDraftRow(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    if (!editingProductId) return
    const clean = draft.filter((d) => d.ingredient_id && d.quantity > 0)
    startTransition(async () => {
      const res = await saveRecipe(editingProductId, clean)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setEditingProductId(null)
      setDraft([])
    })
  }

  return (
    <div>
      {ingredients.length === 0 && (
        <div className="mb-8 px-3.5 py-2.5 bg-warm/5 border border-warm/20 rounded-md text-[12px] text-warm tracking-tight">
          Nenhum insumo cadastrado. Cadastre insumos antes de criar fichas
          tecnicas.
        </div>
      )}

      {products.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-stone tracking-tight">
          Nenhum produto ativo
        </p>
      ) : (
        <div className="divide-y divide-night-lighter">
          {fichas.map((ficha) => {
            const isGoodMargin = ficha.marginPercent >= 60
            const hasItems = ficha.items.length > 0
            return (
              <article
                key={ficha.product.id}
                className="py-6"
              >
                <div className="flex items-baseline justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-medium text-cloud tracking-tight">
                      {ficha.product.name}
                    </h3>
                    <p className="text-[11px] text-stone-dark tracking-tight mt-1">
                      Venda{' '}
                      <span className="font-data text-stone-light">
                        {formatCurrency(Number(ficha.product.price))}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    {hasItems && (
                      <>
                        <div className="text-right">
                          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                            Custo
                          </p>
                          <p className="text-[13px] font-data text-stone-light mt-1">
                            {formatCurrency(ficha.totalCost)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                            Margem
                          </p>
                          <p
                            className={cn(
                              'text-[13px] font-data mt-1',
                              isGoodMargin ? 'text-leaf' : 'text-warm'
                            )}
                          >
                            {ficha.marginPercent.toFixed(1)}%
                          </p>
                        </div>
                      </>
                    )}
                    <button
                      onClick={() => openEditor(ficha.product.id)}
                      className="h-8 px-3 text-[11px] font-medium text-stone-light hover:text-cloud hover:bg-night-light rounded-md transition-colors tracking-tight"
                    >
                      {hasItems ? 'Editar' : 'Criar ficha'}
                    </button>
                  </div>
                </div>

                {hasItems && (
                  <div className="space-y-1.5">
                    {ficha.items.map((ing, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 items-baseline"
                      >
                        <span className="text-[12px] text-stone-light tracking-tight truncate">
                          {ing.name}
                        </span>
                        <span className="text-[11px] text-stone-dark font-data">
                          {ing.quantity} {ing.unit}
                        </span>
                        <span className="text-[11px] text-stone-dark font-data">
                          {ing.costPerUnit > 0
                            ? formatCurrency(ing.costPerUnit)
                            : '—'}
                        </span>
                        <span className="text-[12px] text-cloud font-data text-right">
                          {formatCurrency(ing.totalCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {editingProductId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => setEditingProductId(null)}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between sticky top-0 bg-night-light">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark">
                  Ficha tecnica
                </p>
                <h2 className="text-[14px] font-medium text-cloud tracking-tight mt-1">
                  {products.find((p) => p.id === editingProductId)?.name}
                </h2>
              </div>
              <button
                onClick={() => setEditingProductId(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
                  {error}
                </div>
              )}
              {draft.length === 0 ? (
                <p className="text-[12px] text-stone tracking-tight text-center py-4">
                  Nenhum ingrediente adicionado
                </p>
              ) : (
                <div className="space-y-2">
                  {draft.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={row.ingredient_id}
                        onChange={(e) =>
                          updateDraftRow(i, { ingredient_id: e.target.value })
                        }
                        className="flex-1 h-10 px-3 bg-night border border-night-lighter rounded-md text-[13px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
                      >
                        {ingredients.map((ing) => (
                          <option
                            key={ing.id}
                            value={ing.id}
                            disabled={
                              ing.id !== row.ingredient_id &&
                              draft.some((d) => d.ingredient_id === ing.id)
                            }
                          >
                            {ing.name} ({ing.unit})
                          </option>
                        ))}
                      </select>
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
                        className="w-24 h-10 px-3 bg-night border border-night-lighter rounded-md text-[13px] text-cloud font-data focus:outline-none focus:border-stone-dark transition-colors text-right"
                      />
                      <button
                        onClick={() => removeDraftRow(i)}
                        className="w-8 h-8 flex items-center justify-center text-stone hover:text-primary rounded-md hover:bg-night-lighter transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={addDraftRow}
                disabled={draft.length >= ingredients.length}
                className="w-full h-9 flex items-center justify-center gap-1.5 text-[11px] text-stone-light hover:text-cloud hover:bg-night-lighter rounded-md transition-colors disabled:opacity-40 tracking-tight"
              >
                <Plus size={12} strokeWidth={2} /> Adicionar ingrediente
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingProductId(null)}
                  className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
                >
                  {pending ? 'Salvando' : 'Salvar ficha'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
