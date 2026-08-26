/**
 * Service worker da estacao.
 *
 * A estacao e export estatico: a tela inteira cabe no cache e nao depende do
 * servidor pra renderizar. Sem este arquivo, queda de internet nao deixava a
 * estacao lenta — deixava tela branca, que e o pior modo de falha do sistema.
 *
 * Duas regras, e so duas:
 *   - o app (HTML, JS, CSS, fontes, icones) vem do cache primeiro. Ele so
 *     muda quando sai deploy, entao rede a cada carga seria desperdicio.
 *   - o Supabase nunca vem do cache. Comanda, preco e saldo servidos velhos
 *     seriam pior que erro honesto — o operador cobraria o valor errado.
 *
 * A fila de mutacoes offline nao mora aqui: ela precisa de IndexedDB e de
 * decisao por tipo de operacao (lancar item pode esperar, fechar conta nao).
 * Este arquivo so garante que a tela abre.
 */

const VERSION = 'estacao-v1'
const SHELL = `${VERSION}-shell`

// O que precisa existir pra tela abrir sem rede.
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // allSettled: um 404 num item do precache nao pode impedir a instalacao
      // inteira do worker.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Mutacao nunca passa por aqui: deixa falhar de verdade, pra tela poder
  // avisar. Cachear POST seria mentir sobre um item que nao foi lancado.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Supabase e qualquer outra origem: sempre rede. Sem fallback de cache.
  if (url.origin !== self.location.origin) return

  // Navegacao: cache primeiro, com a rede atualizando por baixo. E o que faz
  // a estacao abrir instantaneamente e continuar abrindo sem internet.
  if (request.mode === 'navigate') {
    event.respondWith(shellFirst(event))
    return
  }

  event.respondWith(cacheFirst(request))
})

async function shellFirst(event) {
  const cache = await caches.open(SHELL)
  const cached =
    (await cache.match(event.request)) || (await cache.match('/index.html'))

  const network = fetch(event.request)
    .then((response) => {
      if (response && response.ok) cache.put('/index.html', response.clone())
      return response
    })
    .catch(() => null)

  // Com cache, responde na hora e revalida em segundo plano. O waitUntil
  // mantem o worker vivo ate a revalidacao terminar, sem prender a resposta.
  if (cached) {
    event.waitUntil(network)
    return cached
  }
  const fresh = await network
  return fresh || new Response('Estacao indisponivel', { status: 503 })
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    // Os assets do Next tem hash no nome, entao guardar pra sempre e seguro:
    // versao nova vem com nome novo.
    if (response && response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return new Response('', { status: 503 })
  }
}
