'use client'

import { useState, useEffect } from 'react'
import type { Product, Category } from '@txoko/shared'
import { X } from 'lucide-react'

interface ProductFormProps {
  product: Product | null
  categories: Category[]
  onSave: (data: Omit<Product, 'id' | 'restaurant_id' | 'created_at' | 'updated_at'>) => void
  onClose: () => void
}

export function ProductForm({ product, categories, onSave, onClose }: ProductFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [prepTime, setPrepTime] = useState('')
  const [allergens, setAllergens] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    if (product) {
      setName(product.name)
      setDescription(product.description || '')
      setPrice(product.price.toString())
      setCost(product.cost?.toString() || '')
      setCategoryId(product.category_id)
      setPrepTime(product.prep_time_minutes?.toString() || '')
      setAllergens(product.allergens.join(', '))
      setTags(product.tags.join(', '))
    }
  }, [product])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name,
      description: description || null,
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : null,
      category_id: categoryId || categories[0]?.id || '',
      image_url: product?.image_url || null,
      is_active: product?.is_active ?? true,
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      allergens: allergens ? allergens.split(',').map(s => s.trim()).filter(Boolean) : [],
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      sort_order: product?.sort_order ?? 0,
    })
    onClose()
  }

  const inputClass = 'w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50 focus:border-leaf/50 transition-colors'
  const labelClass = 'block text-sm font-medium text-stone-light mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
          <h2 className="font-semibold text-cloud">
            {product ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-stone hover:text-cloud hover:bg-night-lighter">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Nome *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Risoto de Camarao"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Descricao</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descricao do prato..."
              rows={2}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Preco (R$) *</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0,00"
                className={`${inputClass} font-data`}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                value={cost}
                onChange={e => setCost(e.target.value)}
                placeholder="0,00"
                className={`${inputClass} font-data`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Categoria *</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Selecione...</option>
                {categories.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tempo preparo (min)</label>
              <input
                type="number"
                value={prepTime}
                onChange={e => setPrepTime(e.target.value)}
                placeholder="15"
                className={`${inputClass} font-data`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Alergenos (separar por virgula)</label>
            <input
              value={allergens}
              onChange={e => setAllergens(e.target.value)}
              placeholder="gluten, lactose, ovo"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Tags (separar por virgula)</label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="vegetariano, sem gluten"
              className={inputClass}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm font-medium text-stone-light hover:text-cloud hover:bg-night-lighter transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors"
            >
              {product ? 'Salvar' : 'Criar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
