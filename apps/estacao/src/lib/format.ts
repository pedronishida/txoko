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

export function serviceModeLabel(mode: string | null): string {
  if (mode === 'avontade') return 'A Vontade'
  if (mode === 'por_kg') return 'Por Quilo'
  if (mode === 'por_kg_2mix') return 'Por Quilo · 2 Misturas'
  return 'Sem modalidade'
}
