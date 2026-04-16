'use client'

import { useMemo, useState, useTransition } from 'react'
import type { Category, Product } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductCard } from '@/components/cardapio/product-card'
import { ProductForm } from '@/components/cardapio/product-form'
import { createCategory, saveProduct, toggleProductActive } from './actions'
import { PageHeader } from '@/components/page-header'

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
      const matchSearch =
        !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory =
        !selectedCategory || p.category_id === selectedCategory
      return matchSearch && matchCategory
    })
  }, [products, search, selectedCategory])

  function handleSave(
    data: Omit<Product, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>
  ) {
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
    <div>
      {/* Header */}
      <PageHeader
        title="Cardapio"
        subtitle={`${products.length} ${products.length === 1 ? 'produto cadastrado' : 'produtos cadastrados'}`}
        action={
          <button
            onClick={() => {
              setEditingProduct(null)
              setShowForm(true)
            }}
            className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
          >
            <Plus size={14} strokeWidth={2} />
            Novo produto
          </button>
        }
        className="mb-8"
      />

      {error && (
        <div className="mb-6 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="mb-8 space-y-5 pb-5 border-b border-night-lighter">
        <input
          type="text"
          placeholder="Buscar produto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 bg-transparent border-0 text-[13px] text-cloud placeholder:text-stone focus:outline-none tracking-tight"
        />

        <div className="flex items-center gap-5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'text-[11px] font-medium tracking-tight transition-colors whitespace-nowrap shrink-0',
              !selectedCategory
                ? 'text-cloud'
                : 'text-stone hover:text-stone-light'
            )}
          >
            Todos
            <span className="ml-1.5 text-[10px] text-stone-dark font-data">
              {products.length}
            </span>
          </button>
          {categories
            .filter((c) => c.is_active)
            .map((cat) => {
              const count = products.filter((p) => p.category_id === cat.id).length
              const active = selectedCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() =>
                    setSelectedCategory(
                      cat.id === selectedCategory ? null : cat.id
                    )
                  }
                  className={cn(
                    'text-[11px] font-medium tracking-tight transition-colors whitespace-nowrap shrink-0',
                    active ? 'text-cloud' : 'text-stone hover:text-stone-light'
                  )}
                >
                  {cat.name}
                  <span className="ml-1.5 text-[10px] text-stone-dark font-data">
                    {count}
                  </span>
                </button>
              )
            })}
          <div className="shrink-0">
            {!showNewCategory ? (
              <button
                onClick={() => setShowNewCategory(true)}
                className="text-[11px] font-medium tracking-tight text-stone-dark hover:text-cloud transition-colors whitespace-nowrap"
              >
                + Categoria
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  placeholder="Nome"
                  className="w-28 h-6 bg-transparent border-0 text-[11px] text-cloud placeholder:text-stone-dark focus:outline-none tracking-tight"
                  autoFocus
                />
                <button
                  onClick={handleAddCategory}
                  className="text-[11px] text-cloud hover:text-cloud-dark transition-colors tracking-tight"
                >
                  criar
                </button>
                <button
                  onClick={() => setShowNewCategory(false)}
                  className="w-4 h-4 flex items-center justify-center text-stone-dark hover:text-cloud"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-stone tracking-tight">
          Nenhum produto encontrado
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={
                categories.find((c) => c.id === product.category_id)?.name || ''
              }
              onEdit={(p) => {
                setEditingProduct(p)
                setShowForm(true)
              }}
              onToggle={handleToggle}
            />
          ))}
        </div>
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
