import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Espaco estreito inquebravel entre o simbolo e o valor (U+202F).
 *
 * Intl devolve U+00A0, que em mono vale um avanco inteiro e afasta demais —
 * o olho le dois blocos onde deveria ler um preco. U+2009 aproxima mas quebra
 * linha, deixando o "R$" sozinho acima do numero. U+202F resolve os dois.
 */
const NNBSP = ' '

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
    .format(value)
    .replace(/ /g, NNBSP)
}

/** As duas metades da moeda, para quem precisa compor o par no markup. */
export function splitCurrency(value: number): { symbol: string; amount: string } {
  const formatted = formatCurrency(value)
  const i = formatted.indexOf(NNBSP)
  if (i === -1) return { symbol: 'R$', amount: formatted }
  return { symbol: formatted.slice(0, i), amount: formatted.slice(i + 1) }
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

/**
 * Otimiza URL de imagem via Supabase Image Transformation
 * (so funciona pra URLs hospedadas no Supabase Storage).
 * Se a URL for externa, retorna como esta.
 */
export function optimizeImage(
  url: string | null | undefined,
  width: number,
  quality = 80
): string | null {
  if (!url) return null
  if (url.includes('/storage/v1/object/public/')) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}width=${width}&quality=${quality}&resize=cover`
  }
  return url
}
