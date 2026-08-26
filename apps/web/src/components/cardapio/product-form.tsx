'use client'

import { useState, useEffect, useTransition } from 'react'
import type { Product, Category } from '@txoko/shared'
import { ImagePlus, X } from 'lucide-react'
import { uploadProductImage } from '@/app/(app)/cardapio/actions'

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
  const [soldByWeight, setSoldByWeight] = useState(false)
  const [pricePerKg, setPricePerKg] = useState('')
  const [barcode, setBarcode] = useState('')
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
      setSoldByWeight(product.sold_by_weight)
      setPricePerKg(product.price_per_kg?.toString() || '')
      setBarcode(product.barcode || '')
    } else {
      setImageUrl(null)
      setSoldByWeight(false)
      setPricePerKg('')
      setBarcode('')
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
      price: parseFloat(price) || 0,
      cost: cost ? parseFloat(cost) : null,
      category_id: categoryId || categories[0]?.id || '',
      image_url: imageUrl,
      is_active: product?.is_active ?? true,
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      allergens: allergens ? allergens.split(',').map(s => s.trim()).filter(Boolean) : [],
      tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      sort_order: product?.sort_order ?? 0,
      sold_by_weight: soldByWeight,
      price_per_kg: soldByWeight && pricePerKg ? parseFloat(pricePerKg) : null,
      barcode: barcode.trim() || null,
    })
    onClose()
  }

  const inputClass = 'w-full px-3 py-2 bg-night border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-colors'
  const labelClass = 'block text-sm font-medium text-foreground/75 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            {product ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-muted-subtle">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Imagem</label>
            <div className="flex items-center gap-3">
              <label className="relative w-20 h-20 rounded-lg border-2 border-dashed border-border bg-night flex items-center justify-center cursor-pointer hover:border-success/40 transition-colors overflow-hidden">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus size={20} className="text-muted" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <div className="flex-1 text-xs text-muted">
                {uploading ? (
                  <p className="text-success">Enviando...</p>
                ) : imageUrl ? (
                  <>
                    <p className="text-foreground">Imagem enviada</p>
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="text-destructive text-[10px] hover:underline mt-0.5"
                    >
                      Remover
                    </button>
                  </>
                ) : (
                  <p>PNG, JPG ou WebP. Maximo 5MB.</p>
                )}
                {uploadError && <p className="text-destructive mt-1">{uploadError}</p>}
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
              <label className={labelClass}>
                {soldByWeight ? 'Preco unitario (R$)' : 'Preco (R$) *'}
              </label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0,00"
                className={`${inputClass} font-data`}
                required={!soldByWeight}
                disabled={soldByWeight}
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

          <div className="flex items-center gap-2 py-1">
            <input
              id="sold_by_weight"
              type="checkbox"
              checked={soldByWeight}
              onChange={e => setSoldByWeight(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-night text-primary focus:ring-1 focus:ring-primary/30"
            />
            <label htmlFor="sold_by_weight" className="text-sm text-foreground/75 cursor-pointer">
              Vendido por kg (self-service)
            </label>
          </div>

          {soldByWeight && (
            <div>
              <label className={labelClass}>Preco por kg (R$) *</label>
              <input
                type="number"
                step="0.01"
                value={pricePerKg}
                onChange={e => setPricePerKg(e.target.value)}
                placeholder="99,90"
                className={`${inputClass} font-data`}
                required
              />
              <p className="mt-1 text-xs text-muted">
                Usado pela estacao de pesagem. Preco por unidade fica desativado.
              </p>
            </div>
          )}

          <div>
            <label className={labelClass}>Codigo de barras</label>
            {/* O leitor de codigo digita no campo e manda Enter, entao basta
                focar aqui e bipar a embalagem. */}
            <input
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              placeholder="Bipe a embalagem ou digite o EAN"
              className={`${inputClass} font-data`}
            />

            <p className="mt-1 text-xs text-muted">
              Usado no PDV e na estacao pra lancar itens unitarios (refri, agua,
              sobremesa). Bebida feita na casa — suco, caipirinha — nao tem
              codigo: deixe em branco e lance clicando no produto.
            </p>
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
              className="flex-1 py-2.5 border border-border rounded-lg text-sm font-medium text-foreground/75 hover:text-foreground hover:bg-muted-subtle transition-colors"
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
