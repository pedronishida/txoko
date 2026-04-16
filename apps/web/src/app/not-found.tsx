import Link from 'next/link'
import { Logo } from '@/components/logo'

export default function NotFound() {
  return (
    <div className="theme-light min-h-screen bg-bg flex flex-col">
      <header className="px-8 py-6">
        <Link href="/">
          <Logo size={22} />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-[64px] font-light text-foreground/10 font-data tracking-[-0.04em] leading-none">
            404
          </p>
          <h1 className="text-[22px] font-medium text-foreground tracking-[-0.02em] mt-6">
            Pagina nao encontrada
          </h1>
          <p className="text-[13px] text-muted mt-3 tracking-tight leading-relaxed">
            Essa pagina nao existe ou foi movida.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <Link
              href="/"
              className="h-9 px-4 inline-flex items-center text-[13px] font-medium bg-foreground text-bg rounded-md hover:opacity-90 transition-opacity"
            >
              Voltar
            </Link>
            <Link
              href="/home"
              className="text-[12px] text-muted hover:text-foreground transition-colors tracking-tight"
            >
              Ir pro dashboard →
            </Link>
          </div>
        </div>
      </main>
      <footer className="px-8 py-6 text-center">
        <p className="text-[11px] text-muted tracking-tight">© 2026 Txoko</p>
      </footer>
    </div>
  )
}
