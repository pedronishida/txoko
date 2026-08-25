import { cn } from '@/lib/utils'

export type Metric = {
  label: string
  /** Ja formatado. Numeros e moeda saem em mono; texto nunca. */
  value: string
  /** Variacao contra o periodo anterior, ex. "+18,4%". */
  delta?: string | null
  /** Linha de contexto abaixo do numero, ex. "vs R$ 3.621,00 ontem". */
  caption?: string
  tone?: 'positive' | 'negative' | 'neutral'
}

const TONE: Record<string, string> = {
  positive: 'text-teal',
  negative: 'text-red',
  neutral: 'text-ink-soft',
}

/**
 * Cartao de metrica: rotulo, numero, variacao e contexto.
 *
 * O numero vai em mono para alinhar por coluna e ficar legivel de longe; o
 * rotulo e a legenda ficam em Archivo, porque sao texto e nao se comparam.
 */
export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="panel p-[18px]">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {metric.label}
      </p>
      <div className="mt-2.5 flex items-baseline gap-2">
        <p className="font-data text-2xl font-semibold leading-none tracking-[-0.02em] text-ink">
          {metric.value}
        </p>
        {metric.delta && (
          <span
            className={cn(
              'text-[11px] font-bold',
              TONE[metric.tone ?? 'positive']
            )}
          >
            {metric.delta}
          </span>
        )}
      </div>
      {metric.caption && (
        <p className="mt-2 text-[11px] text-ink-muted">{metric.caption}</p>
      )}
    </div>
  )
}

/** Grade fluida de cartoes de metrica, com faixa minima de 190px. */
export function MetricCards({
  metrics,
  className,
}: {
  metrics: Metric[]
  className?: string
}) {
  return (
    <div
      className={cn('grid gap-3.5', className)}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
    >
      {metrics.map((m) => (
        <MetricCard key={m.label} metric={m} />
      ))}
    </div>
  )
}
