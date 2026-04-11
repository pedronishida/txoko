'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { formatCurrency } from '@/lib/utils'
import { MOCK_RECIPES } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function FichasPage() {
  const { products, ingredients } = useStore()

  const fichas = useMemo(() => {
    return MOCK_RECIPES.map(recipe => {
      const product = products.find(p => p.id === recipe.product_id)
      if (!product) return null

      const ingredientDetails = recipe.ingredients.map(ri => {
        const ing = ingredients.find(i => i.id === ri.ingredient_id)
        const cost = ing?.cost_per_unit ? ri.quantity * ing.cost_per_unit : 0
        return { ...ri, name: ing?.name || '?', costPerUnit: ing?.cost_per_unit || 0, totalCost: cost }
      })

      const totalCost = ingredientDetails.reduce((s, i) => s + i.totalCost, 0)
      const margin = product.price - totalCost
      const marginPercent = product.price > 0 ? (margin / product.price) * 100 : 0

      return { product, ingredients: ingredientDetails, totalCost, margin, marginPercent }
    }).filter(Boolean)
  }, [products, ingredients])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {fichas.map(ficha => {
          if (!ficha) return null
          const isGoodMargin = ficha.marginPercent >= 60
          return (
            <div key={ficha.product.id} className="bg-night-light border border-night-lighter rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-cloud">{ficha.product.name}</h3>
                  <p className="text-xs text-stone mt-0.5">Preco venda: <span className="font-data text-cloud">{formatCurrency(ficha.product.price)}</span></p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {isGoodMargin ? <TrendingUp size={14} className="text-leaf" /> : <TrendingDown size={14} className="text-warm" />}
                    <span className={cn('text-sm font-bold font-data', isGoodMargin ? 'text-leaf' : 'text-warm')}>
                      {ficha.marginPercent.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-stone">margem</p>
                </div>
              </div>

              <div className="px-4 py-2">
                <div className="grid grid-cols-[2fr_0.8fr_1fr_1fr] gap-2 text-[10px] text-stone font-medium py-1 border-b border-night-lighter">
                  <span>Ingrediente</span><span>Qtd</span><span>Custo/Un</span><span className="text-right">Custo</span>
                </div>
                {ficha.ingredients.map((ing, i) => (
                  <div key={i} className="grid grid-cols-[2fr_0.8fr_1fr_1fr] gap-2 text-xs py-1.5 border-b border-night-lighter/50 last:border-0">
                    <span className="text-cloud">{ing.name}</span>
                    <span className="text-stone font-data">{ing.quantity} {ing.unit}</span>
                    <span className="text-stone font-data">{formatCurrency(ing.costPerUnit)}</span>
                    <span className="text-cloud font-data text-right">{formatCurrency(ing.totalCost)}</span>
                  </div>
                ))}
              </div>

              <div className="px-4 py-2.5 bg-night/30 flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-stone">Custo: <span className="font-data text-coral font-semibold">{formatCurrency(ficha.totalCost)}</span></span>
                  <span className="text-stone">Margem: <span className={cn('font-data font-semibold', isGoodMargin ? 'text-leaf' : 'text-warm')}>{formatCurrency(ficha.margin)}</span></span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {fichas.length === 0 && (
        <div className="text-center py-12 text-stone">Nenhuma ficha tecnica cadastrada.</div>
      )}
    </div>
  )
}
