export function formatCurrency(n: number): string {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatWeight(grams: number | null): string {
  if (grams == null) return ''
  if (grams < 1000) return `${grams} g`
  return `${(grams / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
}

export function formatPricePerKg(n: number): string {
  return `${formatCurrency(n)}/kg`
}
