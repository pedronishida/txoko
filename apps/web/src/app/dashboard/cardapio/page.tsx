'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { ProductCard } from '@/components/cardapio/product-card'
import { ProductForm } from '@/components/cardapio/product-form'
import type { Product } from '@txoko/shared'
import { Plus, Search } from 'lucide-react'

export default function CardapioPage() {
  const { products, categories, addProduct, updateProduct, toggleProduct, addCategory } = useStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      const matchCategory = !selectedCategory || p.category_id === selectedCategory
      return matchSearch && matchCategory
    })
  }, [products, search, selectedCategory])

  function handleSave(data: Omit<Product, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) {
    if (editingProduct) {
      updateProduct(editingProduct.id, data)
    } else {
      addProduct(data)
    }
  }

  function handleAddCategory() {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim())
      setNewCategoryName('')
      setShowNewCategory(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cloud">Cardapio</h1>
          <p className="text-sm text-stone mt-1">{products.length} produtos cadastrados</p>
        </div>
        <button
          onClick={() => { setEditingProduct(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors"
        >
          <Plus size={16} />
          Novo Produto
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50 focus:border-leaf/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedCategory ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
            }`}
          >
            Todos
          </button>
          {categories.filter(c => c.is_active).map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light hover:text-cloud border border-night-lighter'
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
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                placeholder="Nome..."
                className="w-28 px-2 py-1.5 bg-night border border-night-lighter rounded-lg text-xs text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50"
                autoFocus
              />
              <button onClick={handleAddCategory} className="px-2 py-1.5 bg-leaf text-night rounded-lg text-xs font-medium">
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
        {filtered.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            categoryName={categories.find(c => c.id === product.category_id)?.name || ''}
            onEdit={(p) => { setEditingProduct(p); setShowForm(true) }}
            onToggle={toggleProduct}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-stone">
          Nenhum produto encontrado.
        </div>
      )}

      {showForm && (
        <ProductForm
          product={editingProduct}
          categories={categories}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingProduct(null) }}
        />
      )}
    </div>
  )
}
