'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Ingredient, Product } from '@txoko/shared'
import { Pencil, Plus, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
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
        const cost = ing?.cost_per_unit ? Number(r.quantity) * Number(ing.cost_per_unit) : 0
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
    setDraft(existing.map((r) => ({ ingredient_id: r.ingredient_id, quantity: Number(r.quantity) })))
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
    <div className="space-y-4">
      {ingredients.length === 0 && (
        <div className="bg-warm/10 border border-warm/30 rounded-xl p-4 text-sm text-warm">
          Nenhum insumo cadastrado. Cadastre insumos antes de criar fichas tecnicas.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {fichas.map((ficha) => {
          const isGoodMargin = ficha.marginPercent >= 60
          const hasItems = ficha.items.length > 0
          return (
            <div
              key={ficha.product.id}
              className="bg-night-light border border-night-lighter rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-cloud">{ficha.product.name}</h3>
                  <p className="text-xs text-stone mt-0.5">
                    Preco venda:{' '}
                    <span className="font-data text-cloud">{formatCurrency(Number(ficha.product.price))}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {hasItems && (
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {isGoodMargin ? (
                          <TrendingUp size={14} className="text-leaf" />
                        ) : (
                          <TrendingDown size={14} className="text-warm" />
                        )}
                        <span
                          className={cn(
                            'text-sm font-bold font-data',
                            isGoodMargin ? 'text-leaf' : 'text-warm'
                          )}
                        >
                          {ficha.marginPercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-[10px] text-stone">margem</p>
                    </div>
                  )}
                  <button
                    onClick={() => openEditor(ficha.product.id)}
                    className="p-1.5 text-stone hover:text-cloud rounded-lg hover:bg-night"
                    title={hasItems ? 'Editar ficha' : 'Criar ficha'}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              {hasItems ? (
                <>
                  <div className="px-4 py-2">
                    <div className="grid grid-cols-[2fr_0.8fr_1fr_1fr] gap-2 text-[10px] text-stone font-medium py-1 border-b border-night-lighter">
                      <span>Ingrediente</span>
                      <span>Qtd</span>
                      <span>Custo/Un</span>
                      <span className="text-right">Custo</span>
                    </div>
                    {ficha.items.map((ing, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[2fr_0.8fr_1fr_1fr] gap-2 text-xs py-1.5 border-b border-night-lighter/50 last:border-0"
                      >
                        <span className="text-cloud">{ing.name}</span>
                        <span className="text-stone font-data">
                          {ing.quantity} {ing.unit}
                        </span>
                        <span className="text-stone font-data">
                          {ing.costPerUnit > 0 ? formatCurrency(ing.costPerUnit) : '-'}
                        </span>
                        <span className="text-cloud font-data text-right">
                          {formatCurrency(ing.totalCost)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-2.5 bg-night/30 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-stone">
                        Custo:{' '}
                        <span className="font-data text-coral font-semibold">
                          {formatCurrency(ficha.totalCost)}
                        </span>
                      </span>
                      <span className="text-stone">
                        Margem:{' '}
                        <span
                          className={cn(
                            'font-data font-semibold',
                            isGoodMargin ? 'text-leaf' : 'text-warm'
                          )}
                        >
                          {formatCurrency(ficha.margin)}
                        </span>
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-stone">Ficha tecnica nao cadastrada</p>
                  <button
                    onClick={() => openEditor(ficha.product.id)}
                    className="mt-2 text-xs text-leaf hover:underline"
                  >
                    Criar ficha
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12 text-stone">Nenhum produto ativo.</div>
      )}

      {editingProductId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter sticky top-0 bg-night-light">
              <h2 className="font-semibold text-cloud">
                Ficha tecnica —{' '}
                {products.find((p) => p.id === editingProductId)?.name}
              </h2>
              <button
                onClick={() => setEditingProductId(null)}
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
              {draft.length === 0 && (
                <p className="text-xs text-stone text-center py-4">
                  Nenhum ingrediente adicionado
                </p>
              )}
              {draft.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.ingredient_id}
                    onChange={(e) => updateDraftRow(i, { ingredient_id: e.target.value })}
                    className="flex-1 px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
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
                    onChange={(e) => updateDraftRow(i, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-24 px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <button
                    onClick={() => removeDraftRow(i)}
                    className="p-2 text-stone hover:text-coral"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addDraftRow}
                disabled={draft.length >= ingredients.length}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-night-lighter rounded-lg text-xs text-stone hover:text-cloud transition-colors disabled:opacity-50"
              >
                <Plus size={14} /> Adicionar ingrediente
              </button>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingProductId(null)}
                  className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {pending ? 'Salvando...' : 'Salvar Ficha'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
