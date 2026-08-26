'use client'

import { useEffect } from 'react'

/**
 * Registra o service worker da estacao.
 *
 * Sem ele a estacao nao e instalavel e queda de internet vira tela branca.
 * Com ele, o terminal abre do cache e continua abrindo — o que falha e o que
 * de fato precisa do servidor.
 *
 * Em dev nao registra: o Next serve o /sw.js por um caminho que o navegador
 * recusa como worker, e o erro so polui o console.
 */
export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    let refreshing = false

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {})

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {
        // Estacao sem service worker ainda funciona online. Falhar aqui nao
        // pode derrubar a tela.
      })

    // Recarrega quando o worker novo assume, pra versao nova entrar sem
    // alguem ter de fechar o terminal.
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange
    )
    return () =>
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      )
  }, [])

  return null
}
