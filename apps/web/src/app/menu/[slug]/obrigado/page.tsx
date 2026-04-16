import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ObrigadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ order?: string }>
}) {
  const { slug } = await params
  const { order } = await searchParams

  const shortId = order ? order.slice(0, 8).toUpperCase() : null

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-5">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--success,#4ade80)]/10 flex items-center justify-center mx-auto mb-6">
          <span className="text-[26px]">✓</span>
        </div>

        <h1 className="text-[28px] font-medium text-foreground tracking-[-0.03em] leading-none">
          Pedido confirmado
        </h1>

        {shortId && (
          <p className="text-[11px] font-data text-muted mt-3">
            #{shortId}
          </p>
        )}

        <p className="text-[13px] text-muted mt-4 tracking-tight leading-relaxed">
          Recebemos seu pedido e ja estamos preparando.
          Voce sera avisado quando estiver pronto.
        </p>

        <div className="mt-8 space-y-3">
          <Link
            href={`/menu/${slug}`}
            className="block w-full h-11 bg-foreground text-bg text-[13px] font-medium rounded-md hover:opacity-90 transition-opacity flex items-center justify-center"
          >
            Voltar ao cardapio
          </Link>
        </div>

        <p className="text-[10px] text-muted mt-8 tracking-tight">
          Powered by txoko
        </p>
      </div>
    </div>
  )
}
