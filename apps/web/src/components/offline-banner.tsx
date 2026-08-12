'use client'

import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Faixa de status de conexao.
 * Amarela quando offline, verde por 3s quando volta.
 * Adicionado ao dashboard-shell.tsx.
 */
export function OfflineBanner() {
  // Comeca sempre 'online' pra bater com o SSR. Nao dá pra checar
  // navigator.onLine aqui: `navigator` existe no servidor (Node 21+ e
  // Cloudflare Workers), mas `onLine` e undefined la — `!undefined` e true,
  // entao o servidor renderizava a faixa de offline, o cliente nao, e a
  // hidratacao quebrava (React #418) alem de piscar a faixa a cada navegacao.
  const [status, setStatus] = useState<'online' | 'offline' | 'reconnected'>(
    'online'
  )

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

  if (status === 'online') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 h-8 text-[12px] font-medium tracking-tight',
        'transition-colors duration-300',
        status === 'offline'
          ? 'bg-warning/15 text-warning border-b border-warning/20'
          : 'bg-success/15 text-success border-b border-success/20'
      )}
    >
      {status === 'offline' ? (
        <>
          <WifiOff size={13} strokeWidth={1.75} />
          <span>Sem conexao — PDV e KDS funcionam offline</span>
        </>
      ) : (
        <>
          <Wifi size={13} strokeWidth={1.75} />
          <span>Conexao restaurada — sincronizando pedidos...</span>
        </>
      )}
    </div>
  )
}
