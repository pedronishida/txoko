'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, Save, X } from 'lucide-react'
import { updateIfoodProductMapping } from '../ifood-actions'

type MappingRow = {
  id: string
  ifood_sku: string
  ifood_name: string | null
  product_id: string | null
  auto_create: boolean
}

type ProductRow = {
  id: string
  name: string
}

// =============================================================
// iFood Produto Mappings
// Permite associar SKUs iFood a produtos internos do Txoko.
// =============================================================

export function IfoodProdutosView({
  mappings: initialMappings,
  products,
}: {
  mappings: MappingRow[]
  products: ProductRow[]
}) {
  const [mappings, setMappings] = useState<MappingRow[]>(initialMappings)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleProductChange(mappingId: string, productId: string) {
    setMappings((prev) =>
      prev.map((m) =>
        m.id === mappingId
          ? { ...m, product_id: productId === '' ? null : productId }
          : m
      )
    )
  }

  function handleAutoCreateChange(mappingId: string, val: boolean) {
    setMappings((prev) =>
      prev.map((m) => (m.id === mappingId ? { ...m, auto_create: val } : m))
    )
  }

  function handleSave(mapping: MappingRow) {
    setError(null)
    setSavedId(null)
    startTransition(async () => {
      const res = await updateIfoodProductMapping({
        mappingId: mapping.id,
        productId: mapping.product_id,
        autoCreate: mapping.auto_create,
      })
      if ('error' in res && res.error) {
        setError(res.error)
      } else {
        setSavedId(mapping.id)
        setTimeout(() => setSavedId(null), 2000)
      }
    })
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <header className="mb-10">
        <a
          href="/configuracoes/canais"
          className="inline-flex items-center gap-1.5 text-[12px] text-stone-light hover:text-cloud transition-colors tracking-tight mb-4"
        >
          <ChevronLeft size={13} />
          Voltar para Canais
        </a>
        <h1 className="text-[26px] font-medium tracking-[-0.03em] text-cloud leading-none">
          Produtos iFood
        </h1>
        <p className="text-[13px] text-stone mt-2 tracking-tight max-w-lg">
          Associe os SKUs recebidos do iFood aos produtos do Txoko. Quando um SKU nao tem
          mapeamento e Auto-criar esta ativo, o produto e criado automaticamente na primeira
          chegada do pedido.
        </p>
      </header>

      {/* Erro global */}
      {error && (
        <div className="mb-6 px-3.5 py-2.5 bg-primary/5 border border-primary/20 rounded-md text-[12px] text-primary flex items-center justify-between tracking-tight">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-primary/60 hover:text-primary">
            <X size={12} />
          </button>
        </div>
      )}

      {mappings.length === 0 ? (
        <div className="border border-night-lighter rounded-lg py-16 text-center">
          <p className="text-[13px] text-stone tracking-tight">
            Nenhum mapeamento ainda
          </p>
          <p className="text-[11px] text-stone-dark mt-1.5 tracking-tight">
            Mapeamentos sao criados automaticamente quando pedidos iFood chegam.
            Volte aqui para ajustar as associacoes.
          </p>
        </div>
      ) : (
        <div className="border border-night-lighter rounded-lg overflow-hidden">
          {/* Cabecalho da tabela */}
          <div className="grid grid-cols-[1fr_1fr_120px_80px] gap-4 px-6 py-3 border-b border-night-lighter bg-night-light/30">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              SKU iFood
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Produto Txoko
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Auto-criar
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-stone-dark">
              Acao
            </span>
          </div>

          {/* Linhas */}
          <div className="divide-y divide-night-lighter">
            {mappings.map((mapping) => (
              <div
                key={mapping.id}
                className="grid grid-cols-[1fr_1fr_120px_80px] gap-4 items-center px-6 py-3.5"
              >
                {/* SKU + nome iFood */}
                <div className="min-w-0">
                  <p className="text-[12px] text-cloud font-mono truncate">{mapping.ifood_sku}</p>
                  {mapping.ifood_name && (
                    <p className="text-[11px] text-stone tracking-tight truncate">{mapping.ifood_name}</p>
                  )}
                </div>

                {/* Produto Txoko */}
                <select
                  value={mapping.product_id ?? ''}
                  onChange={(e) => handleProductChange(mapping.id, e.target.value)}
                  className="h-8 px-2.5 bg-night border border-night-lighter rounded-md text-[12px] text-cloud focus:outline-none focus:border-stone-dark transition-colors"
                >
                  <option value="">Auto-criar</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {/* Auto-criar toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    role="switch"
                    aria-checked={mapping.auto_create}
                    onClick={() => handleAutoCreateChange(mapping.id, !mapping.auto_create)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none',
                      mapping.auto_create ? 'bg-leaf' : 'bg-night-lighter'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform',
                        mapping.auto_create ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                  <span className="text-[11px] text-stone tracking-tight">
                    {mapping.auto_create ? 'Sim' : 'Nao'}
                  </span>
                </label>

                {/* Botao salvar */}
                <button
                  onClick={() => handleSave(mapping)}
                  disabled={pending}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors disabled:opacity-40 tracking-tight',
                    savedId === mapping.id
                      ? 'bg-leaf/10 text-leaf'
                      : 'text-stone-light hover:text-cloud hover:bg-night-lighter'
                  )}
                >
                  <Save size={11} />
                  {savedId === mapping.id ? 'Salvo' : 'Salvar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-stone-dark tracking-tight">
        Tip: Quando Produto Txoko esta vazio e Auto-criar esta ativo, o produto sera criado
        na categoria padrao com o preco vindo do iFood. Voce pode editar depois em Cardapio.
      </p>
    </div>
  )
}
