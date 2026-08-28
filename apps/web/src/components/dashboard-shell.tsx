'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { CommandPalette } from '@/components/command-palette'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'
import type { Membership } from '@/lib/server/restaurant'

type Props = {
  user: { id: string; email: string }
  memberships: Membership[]
  activeRestaurantId: string | null
  children: React.ReactNode
}

// Restaura as preferencias de layout antes do primeiro paint. Roda como
// script inline no proprio HTML: useEffect chegaria tarde e a sidebar
// piscaria aberta a cada navegacao pra quem a deixou recolhida.
const BOOT_LAYOUT_PREFS = `try{var d=document.documentElement;localStorage.getItem('txoko-nav-collapsed')==='1'&&d.setAttribute('data-nav-collapsed','');localStorage.getItem('txoko-header-hidden')==='1'&&d.setAttribute('data-header-hidden','')}catch(e){}`

/**
 * Header, sidebar e conteudo como paineis independentes sobre o fundo.
 *
 * O recolhimento da sidebar tem dois caminhos: a media query em globals.css
 * (abaixo de 1240px vira trilho) e o atributo data-nav-collapsed no <html>,
 * gravado pelo chevron da propria sidebar. O rotulo de cada link permanece
 * na arvore de acessibilidade nos dois casos — recortado da tela, nao
 * removido do DOM.
 *
 * O cabecalho tambem se recolhe (data-header-hidden): o slot dele sai do
 * grid e o mouse encostado no topo da tela o revela por cima do conteudo.
 *
 * A ilha de conteudo usa --e2: ela apenas repousa sobre o fundo. Header e
 * sidebar flutuam acima dela, em --e3.
 */
export function DashboardShell({
  user,
  memberships,
  activeRestaurantId,
  children,
}: Props) {
  const [headerHidden, setHeaderHidden] = useState(false)

  // O boot script ja aplicou o atributo; aqui so espelha pro estado do
  // React, que decide o icone do botao no Header.
  useEffect(() => {
    setHeaderHidden(document.documentElement.hasAttribute('data-header-hidden'))
  }, [])

  const toggleHeader = useCallback(() => {
    setHeaderHidden((prev) => {
      const next = !prev
      const d = document.documentElement
      if (next) {
        d.setAttribute('data-header-hidden', '')
      } else {
        d.removeAttribute('data-header-hidden')
        d.removeAttribute('data-header-peek')
      }
      try {
        localStorage.setItem('txoko-header-hidden', next ? '1' : '0')
      } catch {
        /* modo privado sem storage: a preferencia so nao persiste */
      }
      return next
    })
  }, [])

  // Com o cabecalho recolhido, encostar o mouse no topo da tela o revela.
  useEffect(() => {
    if (!headerHidden) return
    const d = document.documentElement
    function onMove(e: MouseEvent) {
      if (e.clientY <= 2) d.setAttribute('data-header-peek', '')
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      d.removeAttribute('data-header-peek')
    }
  }, [headerHidden])

  const hidePeek = useCallback(() => {
    document.documentElement.removeAttribute('data-header-peek')
  }, [])
  const showPeek = useCallback(() => {
    if (document.documentElement.hasAttribute('data-header-hidden')) {
      document.documentElement.setAttribute('data-header-peek', '')
    }
  }, [])

  // As colunas vivem em globals.css sob [data-shell]: em style inline elas
  // venceriam a media query e o trilho de icones nunca colapsaria.
  return (
    <div data-shell className="grid h-screen gap-4 overflow-hidden bg-bg p-4">
      <script dangerouslySetInnerHTML={{ __html: BOOT_LAYOUT_PREFS }} />

      {/* Tab do teclado tambem revela o cabecalho recolhido — o atalho de
          busca e o sino nao podem existir so pra quem usa mouse. */}
      <div
        data-header-slot
        className="col-span-2"
        onMouseLeave={hidePeek}
        onFocusCapture={showPeek}
        onBlurCapture={hidePeek}
      >
        <Header
          user={user}
          memberships={memberships}
          activeRestaurantId={activeRestaurantId}
          headerHidden={headerHidden}
          onToggleHeaderHidden={toggleHeader}
        />
      </div>

      <Sidebar restaurantId={activeRestaurantId} />

      {/* Sem animacao de entrada: trocar de tela custava 420ms por clique
          numa ferramenta que troca de tela o turno inteiro, e o transform
          fazia o painel transbordar. */}
      <main className="island-content thin-scroll relative flex min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-[20px]">
        {/* flex-col aqui e o que permite a uma tela (PDV, Pedidos) se
            declarar flex-1 min-h-0 e ocupar a ilha exata, com rolagem por
            painel interno — em vez de adivinhar a altura com calc(100vh-N). */}
        <div className="flex min-h-0 flex-1 flex-col px-8 py-6">{children}</div>
      </main>

      <CommandPalette />
      <PwaInstallPrompt />
    </div>
  )
}
