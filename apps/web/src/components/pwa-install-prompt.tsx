'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'txoko-pwa-dismissed'

/**
 * Banner de instalacao PWA.
 * Aparece uma vez — pode ser fechado permanentemente.
 * Adicionado ao dashboard layout (pos-login).
 */
export function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Ja dispensou antes
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return

    // Ja esta instalado como PWA (standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!visible || !prompt) return null

  async function handleInstall() {
    if (!prompt) return
    setInstalling(true)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') {
        setVisible(false)
        setPrompt(null)
      }
    } catch {
      // usuario cancelou
    } finally {
      setInstalling(false)
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar Txoko"
      className={cn(
        'fixed bottom-4 right-4 z-50 w-72',
        'bg-surface border border-border rounded-xl p-4 shadow-2xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-300'
      )}
    >
      {/* Fechar */}
      <button
        onClick={handleDismiss}
        aria-label="Dispensar"
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
      >
        <X size={13} strokeWidth={2} />
      </button>

      {/* Icone + titulo */}
      <div className="flex items-center gap-3 mb-3 pr-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Download size={16} className="text-primary" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-foreground tracking-tight">
            Instalar Txoko
          </p>
          <p className="text-[11px] text-muted-foreground tracking-tight">
            Acesso rapido direto do dispositivo
          </p>
        </div>
      </div>

      {/* Beneficios rapidos */}
      <ul className="mb-4 space-y-1">
        {[
          'Abre sem precisar do browser',
          'Funciona offline no PDV e KDS',
          'Notificacoes de pedidos',
        ].map((item) => (
          <li key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-1 h-1 rounded-full bg-success shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={handleInstall}
        disabled={installing}
        className={cn(
          'w-full h-9 rounded-lg text-[13px] font-medium tracking-tight transition-colors',
          'bg-primary text-primary-foreground hover:bg-primary-hover',
          'disabled:opacity-60 disabled:cursor-not-allowed'
        )}
      >
        {installing ? 'Instalando...' : 'Instalar agora'}
      </button>
    </div>
  )
}
