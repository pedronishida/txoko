'use client'

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import QRCode from 'qrcode'

type Props = {
  tableNumber: number
  restaurantName: string
  menuUrl: string
}

export function TableQrPrint({ tableNumber, restaurantName, menuUrl }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(menuUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#1A1A1A', light: '#FFFFFF' },
    }).then(setQrDataUrl)
  }, [menuUrl])

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      {/* Print button — hidden on print */}
      <button
        onClick={() => window.print()}
        className="fixed top-5 right-5 flex items-center gap-2 h-9 px-4 rounded-md bg-black text-white text-[12px] font-medium hover:opacity-80 transition-opacity print:hidden"
      >
        <Printer size={13} />
        Imprimir
      </button>

      <div className="flex flex-col items-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-500 mb-6">
          {restaurantName}
        </p>

        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={`QR Mesa ${tableNumber}`}
            width={320}
            height={320}
            className="rounded-lg"
          />
        ) : (
          <div className="w-[320px] h-[320px] bg-neutral-100 rounded-lg flex items-center justify-center">
            <span className="text-[13px] text-neutral-400">Gerando QR code...</span>
          </div>
        )}

        <h1 className="text-[36px] font-bold text-black mt-6 tracking-tight">
          Mesa {tableNumber}
        </h1>
        <p className="text-[16px] text-neutral-600 mt-2 tracking-tight">
          Escaneie para ver o cardapio
        </p>
        <p className="text-[13px] text-neutral-400 mt-1 tracking-tight">
          Peca sem esperar o garcom
        </p>
        <p className="text-[10px] text-neutral-300 mt-4 font-mono">
          {menuUrl}
        </p>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  )
}
