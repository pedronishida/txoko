'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { Ingredient, Supplier } from '@txoko/shared'
import { Plus, X } from 'lucide-react'
import { deleteSupplier, saveSupplier } from '../actions'

type Props = {
  suppliers: Supplier[]
  ingredients: Pick<
    Ingredient,
    'id' | 'name' | 'unit' | 'current_stock' | 'supplier_id'
  >[]
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

  const selected = selectedId
    ? suppliers.find((s) => s.id === selectedId)
    : null
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
    if (
      !confirm(
        'Remover este fornecedor? Os insumos vinculados serao desvinculados.'
      )
    )
      return
    startTransition(async () => {
      await deleteSupplier(id)
      if (selectedId === id) setSelectedId(null)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-[13px] text-stone tracking-tight">
          {suppliers.length}{' '}
          {suppliers.length === 1
            ? 'fornecedor cadastrado'
            : 'fornecedores cadastrados'}
        </p>
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 h-9 px-3.5 bg-cloud text-night text-[13px] font-medium rounded-md hover:bg-cloud-dark transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
          Novo fornecedor
        </button>
      </div>

      <div className="flex gap-8">
        <section className="flex-1 min-w-0">
          {suppliers.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-stone tracking-tight">
              Nenhum fornecedor cadastrado
            </p>
          ) : (
            <div className="divide-y divide-night-lighter">
              {suppliers.map((sup) => {
                const ingCount = ingredients.filter(
                  (i) => i.supplier_id === sup.id
                ).length
                const active = selectedId === sup.id
                return (
                  <button
                    key={sup.id}
                    onClick={() =>
                      setSelectedId(sup.id === selectedId ? null : sup.id)
                    }
                    className={cn(
                      'group w-full py-4 text-left flex items-start justify-between gap-4 transition-colors',
                      active && 'bg-night-light/40 -mx-4 px-4'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3 mb-1">
                        <span className="text-[14px] font-medium text-cloud tracking-tight">
                          {sup.name}
                        </span>
                        {sup.document && (
                          <span className="text-[10px] font-data text-stone-dark">
                            {sup.document}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone tracking-tight">
                        {sup.phone && (
                          <span className="font-data">{sup.phone}</span>
                        )}
                        {sup.phone && sup.email && (
                          <span className="text-stone-dark">·</span>
                        )}
                        {sup.email && <span>{sup.email}</span>}
                      </div>
                      {sup.notes && (
                        <p className="text-[11px] text-stone-dark tracking-tight mt-1 line-clamp-1">
                          {sup.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[11px] font-data text-stone-dark">
                        {ingCount} insumos
                      </span>
                      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            openForm(sup)
                          }}
                          className="text-[10px] text-stone-light hover:text-cloud tracking-tight cursor-pointer"
                        >
                          editar
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(sup.id)
                          }}
                          className="text-[10px] text-stone-dark hover:text-primary tracking-tight cursor-pointer"
                        >
                          remover
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {selected && (
          <aside className="w-[280px] shrink-0">
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-[14px] font-medium text-cloud tracking-tight leading-tight">
                {selected.name}
              </h3>
              <button
                onClick={() => setSelectedId(null)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-light transition-colors"
              >
                <X size={12} />
              </button>
            </div>
            <div className="space-y-3 pb-5 border-b border-night-lighter">
              {selected.document && (
                <PanelRow label="Documento" value={selected.document} mono />
              )}
              {selected.phone && (
                <PanelRow label="Telefone" value={selected.phone} mono />
              )}
              {selected.email && (
                <PanelRow label="E-mail" value={selected.email} />
              )}
            </div>
            {selected.notes && (
              <div className="py-5 border-b border-night-lighter">
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
                  Observacoes
                </p>
                <p className="text-[12px] text-stone-light tracking-tight leading-relaxed">
                  {selected.notes}
                </p>
              </div>
            )}
            <div className="pt-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-3">
                Insumos fornecidos
              </p>
              {supplierIngredients.length === 0 ? (
                <p className="text-[12px] text-stone tracking-tight">
                  Nenhum insumo vinculado
                </p>
              ) : (
                <div className="space-y-2">
                  {supplierIngredients.map((ing) => (
                    <div
                      key={ing.id}
                      className="flex items-baseline justify-between"
                    >
                      <span className="text-[12px] text-cloud tracking-tight truncate">
                        {ing.name}
                      </span>
                      <span className="text-[11px] font-data text-stone-dark shrink-0">
                        {Number(ing.current_stock)} {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-night/70 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-night-light border border-night-lighter rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-night-lighter flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-cloud tracking-tight">
                {editing ? 'Editar fornecedor' : 'Novo fornecedor'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-stone hover:text-cloud hover:bg-night-lighter transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {error && (
                <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary tracking-tight">
                  {error}
                </div>
              )}
              <Field label="Nome *">
                <Input value={formName} onChange={setFormName} />
              </Field>
              <Field label="CNPJ">
                <Input
                  value={formDocument}
                  onChange={setFormDocument}
                  placeholder="00.000.000/0000-00"
                  mono
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Telefone">
                  <Input value={formPhone} onChange={setFormPhone} mono />
                </Field>
                <Field label="E-mail">
                  <Input value={formEmail} onChange={setFormEmail} />
                </Field>
              </div>
              <Field label="Observacoes">
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone focus:outline-none focus:border-stone-dark resize-none transition-colors"
                />
              </Field>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-10 border border-night-lighter rounded-md text-[13px] text-stone-light hover:text-cloud hover:border-stone-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 h-10 bg-cloud text-night rounded-md text-[13px] font-medium hover:bg-cloud-dark transition-colors disabled:opacity-40"
                >
                  {pending ? 'Salvando' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PanelRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-stone-dark tracking-tight">{label}</span>
      <span
        className={cn(
          'text-[12px] text-cloud tracking-tight truncate',
          mono && 'font-data'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-[0.06em] text-stone-dark mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full h-10 px-3.5 bg-night border border-night-lighter rounded-md text-[13px] text-cloud placeholder:text-stone-dark focus:outline-none focus:border-stone-dark transition-colors',
        mono && 'font-data'
      )}
    />
  )
}
