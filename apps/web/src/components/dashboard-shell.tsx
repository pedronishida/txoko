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

/**
 * Header, sidebar e conteudo como paineis independentes sobre o fundo.
 *
 * O recolhimento da sidebar deixou de ser estado de React: e uma media query
 * em globals.css sobre [data-shell] e [data-nav-*]. Alem de dispensar o
 * matchMedia, e o que permite manter o rotulo de cada link na arvore de
 * acessibilidade quando a sidebar vira trilho — recortado da tela, nao
 * removido do DOM.
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
  // As colunas vivem em globals.css sob [data-shell]: em style inline elas
  // venceriam a media query e o trilho de icones nunca colapsaria.
  return (
    <div data-shell className="grid h-screen gap-4 overflow-hidden bg-bg p-4">
      <div className="col-span-2">
        <Header
          user={user}
          memberships={memberships}
          activeRestaurantId={activeRestaurantId}
        />
      </div>

      <Sidebar restaurantId={activeRestaurantId} />

      {/* Sem animacao de entrada: trocar de tela custava 420ms por clique
          numa ferramenta que troca de tela o turno inteiro, e o transform
          fazia o painel transbordar. */}
      <main className="island-content thin-scroll relative flex min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-[20px]">
        <div className="flex-1 px-8 py-6">{children}</div>
      </main>

      <CommandPalette />
      <PwaInstallPrompt />
    </div>
  )
}
