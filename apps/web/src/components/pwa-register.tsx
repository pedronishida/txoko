'use client'

import { useEffect } from 'react'

/**
 * Registra o Service Worker do Txoko.
 * Colocado no root layout — renderiza null.
 */
export function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Ouve mensagens do SW (ex: SYNC_ORDERS via Background Sync)
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_ORDERS') {
            import('@/lib/offline/indexed-db')
              .then(({ syncPendingOrders }) => syncPendingOrders())
              .catch(console.error)
          }
        })

        // Verifica atualizacoes a cada 30min
        setInterval(() => registration.update(), 30 * 60 * 1000)
      })
      .catch(console.error)
  }, [])

  return null
}
