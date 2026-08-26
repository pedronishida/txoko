'use client'

import { useEffect, useState } from 'react'
import { ConnectionPill } from '@/components/states'

export type ConnectionStatus = 'online' | 'offline' | 'reconnected'

/**
 * Estado da conexao.
 *
 * Comeca sempre 'online' pra bater com o SSR. Nao da pra checar
 * navigator.onLine na primeira renderizacao: `navigator` existe no servidor
 * (Node 21+ e Cloudflare Workers), mas `onLine` e undefined la — `!undefined`
 * e true, entao o servidor renderizava offline, o cliente nao, e a hidratacao
 * quebrava (React #418) alem de piscar a cada navegacao.
 */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('online')

  useEffect(() => {
    let reconnectedTimer: ReturnType<typeof setTimeout>

    // Estado real so depois da hidratacao
    if (!navigator.onLine) setStatus('offline')

    function handleOffline() {
      setStatus('offline')
    }
    function handleOnline() {
      setStatus('reconnected')
      reconnectedTimer = setTimeout(() => setStatus('online'), 3000)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      clearTimeout(reconnectedTimer)
    }
  }, [])

  return status
}

/**
 * Indicador de conexao no header.
 *
 * Era uma faixa de largura total acima do header, que empurrava o layout
 * inteiro para baixo ao aparecer — no meio do servico, com o dedo ja a
 * caminho de um botao. Agora e uma pilula ao lado do nome da unidade: ocupa
 * espaco que ja estava reservado e nao move nada.
 */
export function ConnectionStatus() {
  const status = useConnectionStatus()

  if (status === 'offline') return <ConnectionPill kind="offline" />

  if (status === 'reconnected') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-[30px] shrink-0 items-center gap-[7px] rounded-lg border border-teal bg-teal-soft px-3"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
        <span className="whitespace-nowrap text-xs font-semibold text-teal-deep">
          Conexao restaurada — sincronizando pedidos…
        </span>
      </div>
    )
  }

  return null
}
