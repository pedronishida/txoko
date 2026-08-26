'use client'

import { useEffect, useState } from 'react'

const KEY = 'txoko-kiosk-theme'

type Kiosk = 'light' | 'dark'

/**
 * Tema do quiosque.
 *
 * Claro por padrao: o balcao costuma ser bem iluminado, e tela escura sob luz
 * forte perde contraste. O escuro fica como escolha, gravada no aparelho — e
 * escolha do terminal, nao do usuario, entao vive em localStorage e nao no
 * banco.
 */
export function KioskThemeToggle() {
  const [theme, setTheme] = useState<Kiosk>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'dark' || saved === 'light') setTheme(saved)
    } catch {
      // Aparelho com storage bloqueado continua no claro.
    }
  }, [])

  function troca() {
    const next: Kiosk = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    const root = document.documentElement
    if (next === 'dark') root.setAttribute('data-kiosk', 'dark')
    else root.removeAttribute('data-kiosk')
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Sem storage, a escolha vale so ate recarregar.
    }
  }

  // Antes de hidratar nao da pra saber qual e o tema salvo; um rotulo errado
  // piscando num quiosque e pior que um espaco vazio por um instante.
  if (!mounted) return <div className="fixed bottom-5 left-6 h-11 w-28" aria-hidden />

  return (
    <button
      type="button"
      onClick={troca}
      // Canto inferior esquerdo: longe do leitor e do fluxo de quem opera, mas
      // alcancavel por quem esta configurando o terminal.
      className="fixed bottom-5 left-6 z-30 min-h-11 rounded-[4px] border border-rule px-4 text-[13px] font-semibold text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
      aria-label={
        theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'
      }
    >
      {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
    </button>
  )
}
