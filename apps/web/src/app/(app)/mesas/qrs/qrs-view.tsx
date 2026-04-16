'use client'

import { useEffect, useState } from 'react'
import type { Table } from '@txoko/shared'
import { Printer, ArrowLeft } from 'lucide-react'
import QRCode from 'qrcode'
import Link from 'next/link'

type Props = {
  tables: Table[]
  restaurantSlug: string
  restaurantName: string
}

function buildMenuUrl(slug: string, tableNumber: number): string {
  return `https://app.txoko.com.br/menu/${slug}?mesa=${tableNumber}`
}

export function MesasQrsView({ tables, restaurantSlug, restaurantName }: Props) {
  const [qrMap, setQrMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurantSlug || tables.length === 0) {
      setLoading(false)
      return
    }

    async function generate() {
      const entries = await Promise.all(
        tables.map(async (t) => {
          const url = buildMenuUrl(restaurantSlug, t.number)
          const dataUrl = await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: { dark: '#1A1A1A', light: '#FFFFFF' },
          })
          return [t.id, dataUrl] as const
        })
      )
      setQrMap(Object.fromEntries(entries))
      setLoading(false)
    }

    generate()
  }, [tables, restaurantSlug])

  return (
    <div className="-mx-8 -mt-6">
      {/* Header — hidden on print */}
      <div className="px-8 pt-6 pb-5 border-b border-night-lighter flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href="/mesas"
            className="flex items-center gap-1.5 text-[12px] text-stone hover:text-cloud transition-colors tracking-tight"
          >
            <ArrowLeft size={13} />
            Voltar
          </Link>
          <div>
            <h1 className="text-[18px] font-medium text-cloud tracking-tight">
              QR Codes — Todas as mesas
            </h1>
            <p className="text-[12px] text-stone mt-0.5 tracking-tight">
              {tables.length} {tables.length === 1 ? 'mesa' : 'mesas'} · {restaurantName}
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          disabled={loading}
          className="flex items-center gap-2 h-9 px-4 rounded-md bg-cloud text-night text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Printer size={13} />
          Imprimir todos
        </button>
      </div>

      {/* Grid */}
      <div className="p-8 print:p-4">
        {loading ? (
          <p className="text-[13px] text-stone tracking-tight print:hidden">
            Gerando QR codes...
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 print:grid-cols-4 print:gap-4">
            {tables.map((table) => {
              const dataUrl = qrMap[table.id]
              return (
                <div
                  key={table.id}
                  className="flex flex-col items-center bg-white rounded-xl p-5 border border-night-lighter print:border print:border-neutral-200 print:rounded-lg print:p-4"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-500 mb-3">
                    {restaurantName}
                  </p>
                  {dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={dataUrl}
                      alt={`QR Mesa ${table.number}`}
                      width={180}
                      height={180}
                      className="rounded"
                    />
                  ) : (
                    <div className="w-[180px] h-[180px] bg-neutral-100 rounded flex items-center justify-center">
                      <span className="text-[11px] text-neutral-400">...</span>
                    </div>
                  )}
                  <p className="text-[18px] font-semibold text-black mt-3 tracking-tight">
                    Mesa {table.number}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5 text-center tracking-tight">
                    Escaneie para ver o cardapio
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-1 text-center tracking-tight">
                    Peca sem esperar o garcom
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
