import { cn } from '@/lib/utils'

/**
 * Os quatro estados que toda tela que busca dados precisa ter: vazio,
 * carregando, offline e erro. Antes da Fase 02 nenhuma das telas mostrava
 * "nenhum pedido", "sem conexao" ou "falha ao sincronizar" — e restaurante
 * perde rede no meio do servico, que e justamente quando a interface tem de
 * segurar a operacao.
 */

/** Bloco cinza que pulsa. Uma peca do esqueleto, nao o esqueleto inteiro. */
export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return <div aria-hidden className={cn('skeleton', className)} style={style} />
}

/**
 * Esqueleto de cartao de metrica. Mesma caixa do cartao real, para a tela
 * nao pular de altura quando os dados chegam.
 */
export function MetricSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando"
      className="grid gap-3.5"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel px-5 pt-[18px] pb-5">
          <Skeleton className="h-[9px] w-16" />
          <Skeleton className="mt-3.5 h-[26px] w-[78%]" />
          <Skeleton className="mt-3.5 h-[9px] w-[52%]" />
        </div>
      ))}
    </div>
  )
}

/** Esqueleto de lista: marcador, codigo, duas linhas de texto e valor. */
export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando"
      className="flex flex-col gap-1.5 pt-2"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-3 py-3.5">
          <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
          <Skeleton className="h-[9px] w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-[11px] w-[46%]" />
            <Skeleton className="mt-[7px] h-[9px] w-[68%]" />
          </div>
          <Skeleton className="h-3 w-[72px] shrink-0" />
        </div>
      ))}
    </div>
  )
}

/**
 * Estado vazio. O titulo diz o que nao ha; a linha de baixo diz o que fazer
 * a respeito — um vazio que nao aponta saida so informa que a tela falhou.
 */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-3 py-14 text-center', className)}>
      <p className="mb-1.5 text-[14.5px] font-semibold text-ink">{title}</p>
      {hint && (
        <p className="mx-auto max-w-[380px] text-[12.5px] leading-relaxed text-ink-muted text-pretty">
          {hint}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

/**
 * Estado de erro dentro do conteudo. Sempre com uma saida: sem o botao, quem
 * usa fica olhando para um beco.
 */
export function ErrorState({
  title = 'Nao foi possivel carregar',
  hint,
  onRetry,
  className,
}: {
  title?: string
  hint?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cn('px-3 py-14 text-center', className)}>
      <p className="mb-1.5 text-[14.5px] font-semibold text-red">{title}</p>
      {hint && (
        <p className="mx-auto max-w-[380px] text-[12.5px] leading-relaxed text-ink-muted text-pretty">
          {hint}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex h-11 items-center rounded-[11px] border border-rule px-[18px] text-[13px] font-semibold text-ink hover:bg-sunken"
        >
          Tentar de novo
        </button>
      )}
    </div>
  )
}

/**
 * Pilula de estado da conexao, no header. Fica ao lado do seletor de unidade
 * porque e onde o olho ja passa ao trocar de tela — nao numa faixa que empurra
 * o layout para baixo quando aparece.
 */
export function ConnectionPill({
  kind,
  onRetry,
}: {
  kind: 'offline' | 'error'
  onRetry?: () => void
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex h-[30px] shrink-0 items-center gap-[7px] rounded-lg border border-red bg-red-tint pl-3',
        kind === 'error' && onRetry ? 'gap-[9px] pr-2' : 'pr-3'
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red" />
      <span className="whitespace-nowrap text-xs font-semibold text-red">
        {kind === 'offline'
          ? 'Sem conexao — pedidos em fila local'
          : 'Falha ao sincronizar'}
      </span>
      {kind === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-1 text-xs font-bold text-red underline"
        >
          Tentar de novo
        </button>
      )}
    </div>
  )
}
