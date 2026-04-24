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
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        // Forca check de update imediato + notifica SW pra skipWaiting
        registration.update().catch(() => {})
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })

        // Recarrega quando o novo SW assume controle
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return
          refreshing = true
          window.location.reload()
        })

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
