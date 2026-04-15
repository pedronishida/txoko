'use client'

import { useState, useTransition } from 'react'
import type { Ingredient, Supplier } from '@txoko/shared'
import { Plus, Phone, Mail, X, Pencil, Trash2, Package } from 'lucide-react'
import { deleteSupplier, saveSupplier } from '../actions'

type Props = {
  suppliers: Supplier[]
  ingredients: Pick<Ingredient, 'id' | 'name' | 'unit' | 'current_stock' | 'supplier_id'>[]
}

export function FornecedoresView({ suppliers, ingredients }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [formName, setFormName] = useState('')
  const [formDocument, setFormDocument] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formNotes, setFormNotes] = useState('')

  const selected = selectedId ? suppliers.find((s) => s.id === selectedId) : null
  const supplierIngredients = selected
    ? ingredients.filter((i) => i.supplier_id === selected.id)
    : []

  function openForm(supplier: Supplier | null) {
    setError(null)
    if (supplier) {
      setEditing(supplier)
      setFormName(supplier.name)
      setFormDocument(supplier.document || '')
      setFormPhone(supplier.phone || '')
      setFormEmail(supplier.email || '')
      setFormNotes(supplier.notes || '')
    } else {
      setEditing(null)
      setFormName('')
      setFormDocument('')
      setFormPhone('')
      setFormEmail('')
      setFormNotes('')
    }
    setShowForm(true)
  }

  function handleSave() {
    if (!formName.trim()) return
    startTransition(async () => {
      const res = await saveSupplier({
        id: editing?.id,
        name: formName.trim(),
        document: formDocument.trim() || null,
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        notes: formNotes.trim() || null,
      })
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      setShowForm(false)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Remover este fornecedor? Os insumos vinculados serao desvinculados.')) return
    startTransition(async () => {
      await deleteSupplier(id)
      if (selectedId === id) setSelectedId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => openForm(null)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} /> Novo Fornecedor
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          {suppliers.length === 0 ? (
            <div className="bg-night-light border border-night-lighter rounded-xl p-8 text-center text-sm text-stone">
              Nenhum fornecedor cadastrado
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suppliers.map((sup) => {
                const ingCount = ingredients.filter((i) => i.supplier_id === sup.id).length
                return (
                  <div
                    key={sup.id}
                    onClick={() => setSelectedId(sup.id === selectedId ? null : sup.id)}
                    className={`bg-night-light border rounded-xl p-4 text-left cursor-pointer transition-colors ${
                      selectedId === sup.id ? 'border-primary/30' : 'border-night-lighter hover:border-night-lighter/80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-cloud">{sup.name}</h3>
                        {sup.document && (
                          <p className="text-xs text-stone font-data mt-0.5">{sup.document}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openForm(sup)
                          }}
                          className="p-1 text-stone hover:text-cloud"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(sup.id)
                          }}
                          className="p-1 text-stone hover:text-coral"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-stone">
                      {sup.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={12} />
                          {sup.phone}
                        </span>
                      )}
                      {sup.email && (
                        <span className="flex items-center gap-1">
                          <Mail size={12} />
                          {sup.email}
                        </span>
                      )}
                    </div>
                    {sup.notes && (
                      <p className="text-xs text-stone-light mt-2 line-clamp-1">{sup.notes}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      <Package size={12} className="text-leaf" />
                      <span className="text-xs text-leaf font-data">{ingCount} insumos</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="w-72 bg-night-light border border-night-lighter rounded-xl shrink-0">
            <div className="px-4 py-3 border-b border-night-lighter flex items-center justify-between">
              <h3 className="font-semibold text-cloud text-sm">{selected.name}</h3>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 text-stone hover:text-cloud"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {selected.document && (
                <div>
                  <p className="text-[10px] text-stone">Documento</p>
                  <p className="text-xs text-cloud font-data">{selected.document}</p>
                </div>
              )}
              {selected.phone && (
                <div>
                  <p className="text-[10px] text-stone">Telefone</p>
                  <p className="text-xs text-cloud">{selected.phone}</p>
                </div>
              )}
              {selected.email && (
                <div>
                  <p className="text-[10px] text-stone">Email</p>
                  <p className="text-xs text-cloud">{selected.email}</p>
                </div>
              )}
              {selected.notes && (
                <div>
                  <p className="text-[10px] text-stone">Observacoes</p>
                  <p className="text-xs text-stone-light">{selected.notes}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-stone mb-2">Insumos fornecidos</p>
                {supplierIngredients.length > 0 ? (
                  <div className="space-y-1">
                    {supplierIngredients.map((ing) => (
                      <div
                        key={ing.id}
                        className="flex items-center justify-between text-xs bg-night rounded-lg px-2 py-1.5"
                      >
                        <span className="text-cloud">{ing.name}</span>
                        <span className="text-stone font-data">
                          {Number(ing.current_stock)} {ing.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-stone">Nenhum insumo vinculado</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-night-lighter">
              <h2 className="font-semibold text-cloud">
                {editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
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
              <div>
                <label className="block text-sm text-stone-light mb-1">Nome *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">CNPJ</label>
                <input
                  value={formDocument}
                  onChange={(e) => setFormDocument(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud font-data focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-stone-light mb-1">Telefone</label>
                  <input
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-light mb-1">Email</label>
                  <input
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-light mb-1">Observacoes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-night border border-night-lighter rounded-lg text-sm text-cloud focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-night-lighter rounded-lg text-sm text-stone-light hover:text-cloud transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {pending ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
