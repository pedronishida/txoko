export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg flex">
      {/* Coluna esquerda — brand (hidden em mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,199,0,0.5) 0%, transparent 50%)',
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <svg
              width={44}
              height={44}
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Txoko"
            >
              <rect width="40" height="40" rx="10" fill="white" />
              <path
                d="M11 12 H29 V16.5 H22.25 V30 H17.75 V16.5 H11 V12 Z"
                fill="var(--primary)"
              />
              <circle cx="30.5" cy="11" r="2.5" fill="var(--accent)" />
            </svg>
            <span className="text-2xl font-bold tracking-tight">txoko</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-5xl font-bold leading-tight tracking-tight">
              Gestao que faz o<br />
              <span className="italic">basico brilhar.</span>
            </h1>
            <p className="text-lg text-white/90 max-w-md leading-relaxed">
              PDV, KDS, Cardapio, Financeiro, CRM e um assistente IA que
              entende do seu restaurante. Tudo em um lugar so.
            </p>
            <div className="flex items-center gap-6 pt-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-sm text-white/80">Tempo real</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-sm text-white/80">Claude AI</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-sm text-white/80">Multi-tenant</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-white/60">
            &copy; 2026 Txoko · Todos os direitos reservados
          </p>
        </div>
      </div>

      {/* Coluna direita — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-bg">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
