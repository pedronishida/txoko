'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { cn, formatCurrency } from '@/lib/utils'
import type { Ingredient } from '@txoko/shared'
import { Plus, Search, AlertTriangle, Package, MapPin, Pencil, X } from 'lucide-react'

const STORAGE_LOCATIONS = ['geladeira', 'deposito', 'cozinha', 'bar']

export default function InsumosPage() {
  const { ingredients, suppliers, addIngredient, updateIngredient } = useStore()
  const [search, setSearch] = useState('')
  const [filterLocation, setFilterLocation] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formUnit, setFormUnit] = useState('kg')
  const [formStock, setFormStock] = useState('')
  const [formMinStock, setFormMinStock] = useState('')
  const [formCost, setFormCost] = useState('')
  const [formSupplier, setFormSupplier] = useState('')
  const [formLocation, setFormLocation] = useState('geladeira')

  const filtered = useMemo(() => {
    return ingredients.filter(i => {
      const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
      const matchLocation = !filterLocation || i.storage_location === filterLocation
      return matchSearch && matchLocation
    })
  }, [ingredients, search, filterLocation])

  const alertCount = ingredients.filter(i => i.current_stock <= i.min_stock).length
  const warningCount = ingredients.filter(i => i.current_stock > i.min_stock && i.current_stock <= i.min_stock * 1.5).length
  const totalCost = ingredients.reduce((s, i) => s + (i.cost_per_unit || 0) * i.current_stock, 0)

  function openForm(ingredient: Ingredient | null) {
    if (ingredient) {
      setEditing(ingredient)
      setFormName(ingredient.name)
      setFormUnit(ingredient.unit)
      setFormStock(ingredient.current_stock.toString())
      setFormMinStock(ingredient.min_stock.toString())
      setFormCost(ingredient.cost_per_unit?.toString() || '')
      setFormSupplier(ingredient.supplier_id || '')
      setFormLocation(ingredient.storage_location || 'geladeira')
    } else {
      setEditing(null)
      setFormName(''); setFormUnit('kg'); setFormStock(''); setFormMinStock(''); setFormCost(''); setFormSupplier(''); setFormLocation('geladeira')
    }
    setShowForm(true)
  }

  function handleSave() {
    if (!formName || !formStock) return
    const data = {
      name: formName,
      unit: formUnit,
      current_stock: parseFloat(formStock),
      min_stock: parseFloat(formMinStock) || 0,
      cost_per_unit: formCost ? parseFloat(formCost) : null,
      supplier_id: formSupplier || null,
      storage_location: formLocation,
    }
    if (editing) {
      updateIngredient(editing.id, data)
    } else {
      addIngredient(data)
    }
    setShowForm(false)
  }

  function getStockStatus(ing: Ingredient): 'critical' | 'warning' | 'ok' {
    if (ing.current_stock <= ing.min_stock) return 'critical'
    if (ing.current_stock <= ing.min_stock * 1.5) return 'warning'
    return 'ok'
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-night-light border border-night-lighter rounded-xl p-3">
          <p className="text-xs text-stone">Total Insumos</p>
          <p className="text-xl font-bold font-data text-cloud">{ingredients.length}</p>
        </div>
        <div className="bg-night-light border border-coral/20 rounded-xl p-3">
          <p className="text-xs text-stone">Estoque Critico</p>
          <p className="text-xl font-bold font-data text-coral">{alertCount}</p>
        </div>
        <div className="bg-night-light border border-warm/20 rounded-xl p-3">
          <p className="text-xs text-stone">Atencao</p>
          <p className="text-xl font-bold font-data text-warm">{warningCount}</p>
        </div>
        <div className="bg-night-light border border-night-lighter rounded-xl p-3">
          <p className="text-xs text-stone">Valor em Estoque</p>
          <p className="text-xl font-bold font-data text-cloud">{formatCurrency(totalCost)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="text"
            placeholder="Buscar insumo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-night-light border border-night-lighter rounded-lg text-sm text-cloud placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-leaf/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setFilterLocation(null)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', !filterLocation ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light border border-night-lighter')}>
            Todos
          </button>
          {STORAGE_LOCATIONS.map(loc => (
            <button key={loc} onClick={() => setFilterLocation(loc === filterLocation ? null : loc)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors', filterLocation === loc ? 'bg-leaf/10 text-leaf' : 'bg-night-light text-stone-light border border-night-lighter')}>
              {loc}
            </button>
          ))}
        </div>
        <button onClick={() => openForm(null)} className="flex items-center gap-2 px-4 py-2 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors">
          <Plus size={16} /> Novo Insumo
        </button>
      </div>

      {/* Table */}
      <div className="bg-night-light border border-night-lighter rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2fr_0.7fr_1fr_1fr_1fr_1.2fr_0.8fr_auto] gap-2 px-5 py-2.5 border-b border-night-lighter text-xs text-stone font-medium">
          <span>Insumo</span><span>Unidade</span><span>Estoque</span><span>Minimo</span><span>Custo/Un</span><span>Fornecedor</span><span>Local</span><span></span>
        </div>
        <div className="divide-y divide-night-lighter max-h-[55vh] overflow-y-auto">
          {filtered.map(ing => {
            const status = getStockStatus(ing)
            const supplier = ing.supplier_id ? suppliers.find(s => s.id === ing.supplier_id) : null
            return (
              <div key={ing.id} className={cn('grid grid-cols-[2fr_0.7fr_1fr_1fr_1fr_1.2fr_0.8fr_auto] gap-2 px-5 py-2.5 items-center', status === 'critical' && 'bg-coral/5')}>
                <div className="flex items-center gap-2">
                  {status === 'critical' && <AlertTriangle size={14} className="text-coral shrink-0" />}
                  {status === 'warning' && <AlertTriangle size={14} className="text-warm shrink-0" />}
                  <span className="text-sm text-cloud truncate">{ing.name}</span>
                </div>
                <span className="text-xs text-stone font-data">{ing.unit}</span>
                <span className={cn('text-sm font-data font-medium', status === 'critical' ? 'text-coral' : status === 'warning' ? 'text-warm' : 'text-cloud')}>
                  {ing.current_stock}
                </span>
                <span className="text-xs text-stone font-data">{ing.min_stock}</span>
                <span className="text-xs text-cloud font-data">{ing.cost_per_unit ? formatCurrency(ing.cost_per_unit) : '-'}</span>
                <span className="text-xs text-stone truncate">{supplier?.name || '-'}</span>
                <span className="text-xs text-stone capitalize flex items-center gap-1"><MapPin size={10} />{ing.storage_location}</span>
                <button onClick={() => openForm(ing)} className="p-1 text-stone hover:text-cloud"><Pencil size={14} /></button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">{editing ? 'Editar Insumo' : 'Novo Insumo'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 text-stone hover:text-cloud"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm text-stone-light mb-1">Nome *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Unidade</label>
                  <select value={formUnit} onChange={e => setFormUnit(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50">
                    {['kg', 'g', 'l', 'ml', 'un'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Estoque Atual *</label>
                  <input type="number" step="0.01" value={formStock} onChange={e => setFormStock(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-leaf/50" />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Estoque Minimo</label>
                  <input type="number" step="0.01" value={formMinStock} onChange={e => setFormMinStock(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-leaf/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Custo por Unidade (R$)</label>
                  <input type="number" step="0.01" value={formCost} onChange={e => setFormCost(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-leaf/50" />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Local</label>
                  <select value={formLocation} onChange={e => setFormLocation(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50">
                    {STORAGE_LOCATIONS.map(l => <option key={l} value={l} className="capitalize">{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">Fornecedor</label>
                <select value={formSupplier} onChange={e => setFormSupplier(e.target.value)} className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-leaf/50">
                  <option value="">Nenhum</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors">Cancelar</button>
                <button onClick={handleSave} className="flex-1 py-2.5 bg-leaf text-night font-semibold rounded-lg text-sm hover:bg-leaf-dark transition-colors">{editing ? 'Salvar' : 'Criar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
