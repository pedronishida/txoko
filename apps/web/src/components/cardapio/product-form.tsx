'use client'

import { useState, useEffect, useTransition } from 'react'
import type { Product, Category } from '@txoko/shared'
import { ImagePlus, X } from 'lucide-react'
import { uploadProductImage } from '@/app/dashboard/cardapio/actions'

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
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, startUpload] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)

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
      setImageUrl(product.image_url || null)
    } else {
      setImageUrl(null)
    }
  }, [product])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    startUpload(async () => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadProductImage(fd)
      if ('error' in res && res.error) {
        setUploadError(res.error)
        return
      }
      if ('url' in res) setImageUrl(res.url as string)
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name,
      description: description || null,
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : null,
      category_id: categoryId || categories[0]?.id || '',
      image_url: imageUrl,
      is_active: product?.is_active ?? true,
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      allergens: allergens ? allergens.split(',').map(s => s.trim()).filter(Boolean) : [],
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      sort_order: product?.sort_order ?? 0,
    })
    onClose()
  }

  const inputClass = 'w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-colors'
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
            <label className={labelClass}>Imagem</label>
            <div className="flex items-center gap-3">
              <label className="relative w-20 h-20 rounded-lg border-2 border-dashed border-night-lighter bg-night flex items-center justify-center cursor-pointer hover:border-leaf/40 transition-colors overflow-hidden">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus size={20} className="text-stone" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <div className="flex-1 text-xs text-stone">
                {uploading ? (
                  <p className="text-leaf">Enviando...</p>
                ) : imageUrl ? (
                  <>
                    <p className="text-cloud">Imagem enviada</p>
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="text-coral text-[10px] hover:underline mt-0.5"
                    >
                      Remover
                    </button>
                  </>
                ) : (
                  <p>PNG, JPG ou WebP. Maximo 5MB.</p>
                )}
                {uploadError && <p className="text-coral mt-1">{uploadError}</p>}
              </div>
            </div>
          </div>

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
              className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
            >
              {product ? 'Salvar' : 'Criar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
