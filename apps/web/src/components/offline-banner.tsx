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
  const [status, setStatus] = useState<'online' | 'offline' | 'reconnected'>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  )

  useEffect(() => {
    let reconnectedTimer: ReturnType<typeof setTimeout>

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
