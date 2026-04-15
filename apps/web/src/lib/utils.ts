import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
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
