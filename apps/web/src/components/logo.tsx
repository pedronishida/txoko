import { cn } from '@/lib/utils'

type LogoProps = {
  /** Tamanho em pixels do quadrado. */
  size?: number
  /** Mostra o wordmark "txoko" ao lado. */
  showWordmark?: boolean
  className?: string
}

/**
 * Marca grafica Txoko — quadrado vermelho com "T" geometrico e
 * ponto de destaque amarelo no canto superior direito.
 */
export function Logo({ size = 32, showWordmark = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Txoko"
      >
        {/* Fundo arredondado primary */}
        <rect width="40" height="40" rx="10" fill="var(--primary)" />

        {/* T geometrico em branco — barra vertical alinhada ao centro */}
        <path
          d="M11 12 H29 V16.5 H22.25 V30 H17.75 V16.5 H11 V12 Z"
          fill="white"
        />

        {/* Dot amarelo de destaque — serif point */}
        <circle cx="30.5" cy="11" r="2.5" fill="var(--accent)" />
      </svg>
      {showWordmark && (
        <span className="text-xl font-bold tracking-tight text-foreground">
          txoko
        </span>
      )}
    </span>
  )
}
