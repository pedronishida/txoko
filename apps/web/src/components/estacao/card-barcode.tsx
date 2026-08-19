'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

// Desenha o codigo de barras do cartao no cliente, nao no servidor: a lib
// vive num chunk carregado so nesta pagina e nao entra no bundle do worker,
// que ja opera perto do limite de 3 MiB da Cloudflare.
//
// Code 128 aceita letras (o codigo comeca com 'C') e e lido por qualquer
// leitor 1D barato.
export function CardBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current) return
    JsBarcode(ref.current, value, {
      format: 'CODE128',
      // Modulo estreito: 13 caracteres precisam caber em ~45mm no cartao
      width: 1.6,
      height: 60,
      displayValue: false,
      margin: 0,
      background: '#FFFFFF',
      lineColor: '#000000',
    })
  }, [value])

  return <svg ref={ref} />
}
