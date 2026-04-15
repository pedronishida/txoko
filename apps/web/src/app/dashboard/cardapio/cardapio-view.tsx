'use client'

import { useMemo, useState, useTransition } from 'react'
import type { Category, Product } from '@txoko/shared'
import { Plus, Search } from 'lucide-react'
import { ProductCard } from '@/components/cardapio/product-card'
import { ProductForm } from '@/components/cardapio/product-form'
import { createCategory, saveProduct, toggleProductActive } from './actions'

type Props = {
  products: Product[]
  categories: Category[]
}

export function CardapioView({ products, categories }: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory = !selectedCategory || p.category_id === selectedCategory
      return matchSearch && matchCategory
    })
  }, [products, search, selectedCategory])

  function handleSave(data: Omit<Product, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) {
    setError(null)
    startTransition(async () => {
      const res = await saveProduct({
        id: editingProduct?.id,
        name: data.name,
        description: data.description,
        price: data.price,
        cost: data.cost,
        category_id: data.category_id,
        prep_time_minutes: data.prep_time_minutes,
        allergens: data.allergens,
        tags: data.tags,
        is_active: data.is_active,
        sort_order: data.sort_order,
        image_url: data.image_url,
      })
      if ('error' in res && res.error) setError(res.error)
    })
  }

  function handleToggle(id: string) {
    const current = products.find((p) => p.id === id)
    if (!current) return
    startTransition(async () => {
      await toggleProductActive(id, !current.is_active)
    })
  }

  function handleAddCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    startTransition(async () => {
      const res = await createCategory(name)
      if ('error' in res && res.error) setError(res.error)
      setNewCategoryName('')
      setShowNewCategory(false)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cloud">Cardapio</h1>
          <p className="text-sm text-stone mt-1">{products.length} produtos cadastrados</p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null)
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          Novo Produto
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedCategory
                ? 'bg-primary/10 text-primary'
                : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
            }`}
          >
            Todos
          </button>
          {categories.filter((c) => c.is_active).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-primary/10 text-primary'
                  : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
              }`}
            >
              {cat.name}
            </button>
          ))}
          {!showNewCategory ? (
            <button
              onClick={() => setShowNewCategory(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border border-dashed border-night-lighter text-stone hover:text-cloud transition-colors"
            >
              + Categoria
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                placeholder="Nome..."
                className="w-28 px-2 py-1.5 bg-night border border-night-lighter rounded-lg text-xs text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30"
                autoFocus
              />
              <button onClick={handleAddCategory} className="px-2 py-1.5 bg-primary text-white rounded-lg text-xs font-medium">
                OK
              </button>
              <button onClick={() => setShowNewCategory(false)} className="px-2 py-1.5 text-stone text-xs">
                X
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            categoryName={categories.find((c) => c.id === product.category_id)?.name || ''}
            onEdit={(p) => {
              setEditingProduct(p)
              setShowForm(true)
            }}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-stone">Nenhum produto encontrado.</div>
      )}

      {showForm && (
        <ProductForm
          product={editingProduct}
          categories={categories}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false)
            setEditingProduct(null)
          }}
        />
      )}
    </div>
  )
}
