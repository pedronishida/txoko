import { cn, splitCurrency } from '@/lib/utils'

/**
 * Moeda como unidade tipografica.
 *
 * O simbolo sai num <span> proprio, mas herda tamanho e peso do numero: e
 * assim que as 17 telas do redesign e a secao 3 do Handoff compoem o par —
 * "R$ 246,40" numa so medida, unido por U+202F. O span existe para que
 * mudar essa decisao (simbolo menor e elevado, por exemplo) seja uma linha
 * aqui, e nao uma varredura por todas as telas.
 *
 * O par nunca quebra linha: U+202F e inquebravel e o whitespace-nowrap
 * protege o resto.
 */
export function Money({
  value,
  className,
  symbolClassName,
}: {
  value: number
  className?: string
  symbolClassName?: string
}) {
  const { symbol, amount } = splitCurrency(value)
  return (
    <span className={cn('font-data whitespace-nowrap', className)}>
      <span className={symbolClassName}>{symbol}</span>
      {' '}
      {amount}
    </span>
  )
}
