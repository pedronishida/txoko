import { Logo } from '@/components/logo'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-8 py-6">
        <Logo size={22} />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        {/* Cartao de autenticacao: a unica superficie da tela, entao carrega a
            elevacao mais alta e um blur proprio. */}
        <div
          className="w-full max-w-[400px] rounded-3xl border border-edge-hi p-9"
          style={{
            background: 'var(--auth-card)',
            backdropFilter: 'blur(28px) saturate(160%)',
            boxShadow: 'var(--e3), inset 0 1px 0 var(--edge-hi)',
          }}
        >
          {children}
        </div>
      </main>
      <footer className="px-8 py-6 text-center">
        <p className="text-[11px] text-muted tracking-tight">
          © 2026 Txoko · Gestao para restaurantes
        </p>
      </footer>
    </div>
  )
}
