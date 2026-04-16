/**
 * Txoko Service Worker
 * Estrategias de cache para modo offline (PDV + KDS criticos)
 */

const CACHE_VERSION = 'txoko-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Rotas criticas para pre-cache no install
const PRECACHE_URLS = [
  '/',
  '/home',
  '/pdv',
  '/kds',
  '/pedidos',
  '/offline',
]

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // addAll falha silenciosamente por rota — nao bloqueia install
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  )
})

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Ignora metodos nao-GET
  if (request.method !== 'GET') return

  // Ignora requisicoes de extensoes do browser ou chrome-extension
  if (!request.url.startsWith('http')) return

  const url = new URL(request.url)

  // API: network-first, fallback JSON offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Assets estaticos Next.js: cache-first agressivo
  if (
    url.pathname.startsWith('/_next/static/') ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Paginas: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request))
})

// ─── Estrategias ─────────────────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(
      JSON.stringify({ offline: true, error: 'Sem conexao com o servidor' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Asset indisponivel offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches
          .open(RUNTIME_CACHE)
          .then((cache) => cache.put(request, response.clone()))
      }
      return response
    })
    .catch(async () => {
      // Sem rede: tenta cache de rotas offline
      const offlineFallback = await caches.match('/offline')
      return (
        offlineFallback ||
        new Response('Pagina indisponivel offline', { status: 503 })
      )
    })

  return cached || fetchPromise
}

// ─── Background Sync ─────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders())
  }
})

async function syncPendingOrders() {
  // A logica real de sync esta em indexed-db.ts no cliente.
  // O SW apenas sinaliza — o cliente executa via postMessage quando volta online.
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_ORDERS' })
  })
}

// ─── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Txoko', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Txoko', {
      body: payload.body ?? '',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: payload.tag ?? 'txoko-notification',
      data: { url: payload.url ?? '/home' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/home'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(url))
        if (existing) return existing.focus()
        return self.clients.openWindow(url)
      })
  )
})
