/**
 * Fila de lancamentos da estacao.
 *
 * O padrao e o da caixa de saida: o item entra na fila ANTES de qualquer
 * tentativa de rede, e so sai de la quando o servidor confirma. Isso da duas
 * coisas de uma vez — o operador nunca espera a rede, e nada se perde se a
 * tela recarregar ou o aparelho desligar no meio.
 *
 * IndexedDB, e nao memoria nem localStorage: precisa sobreviver a recarga
 * (memoria nao sobrevive) e guardar objeto sem serializar a mao (localStorage
 * so guarda texto, e um JSON.parse que falha levaria a comanda junto).
 */

const DB = 'txoko-estacao'
const VERSAO = 1
const FILA = 'fila'
const CACHE = 'cache'

export type Pendente = {
  /** Chave de idempotencia: o servidor usa pra nao lancar duas vezes. */
  key: string
  /** Comanda a que pertence. */
  token: string
  kind: 'weight' | 'barcode'
  weightGrams?: number
  barcode?: string
  /** O que mostrar na comanda enquanto nao confirma. */
  nome: string
  qty: string
  taxa: string
  total: number
  at: number
}

export type ItemCatalogo = { barcode: string; name: string; price: number }

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(FILA)) {
        db.createObjectStore(FILA, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE, { keyPath: 'k' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  store: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, modo)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      })
  )
}

/** Chave nova. crypto.randomUUID existe em todo navegador que roda a estacao. */
export function novaChave(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export async function enfileirar(p: Pendente): Promise<void> {
  await tx(FILA, 'readwrite', (s) => s.put(p))
}

export async function remover(key: string): Promise<void> {
  await tx(FILA, 'readwrite', (s) => s.delete(key))
}

/**
 * Fila de uma comanda, na ordem em que foi lancada.
 *
 * A ordem importa: reenviar fora de ordem faz a comanda aparecer embaralhada
 * pra quem confere item por item no balcao.
 */
export async function listar(token: string): Promise<Pendente[]> {
  const todos = await tx<Pendente[]>(FILA, 'readonly', (s) => s.getAll())
  return todos.filter((p) => p.token === token).sort((a, b) => a.at - b.at)
}

/**
 * Tudo que ha pra subir, de qualquer comanda.
 *
 * A fila nao pertence a tela: comanda encerrada com item pendente continua
 * subindo em segundo plano, senao encerrar seria o mesmo que jogar fora. Cada
 * pendente carrega o proprio token, entao vai parar no pedido certo.
 */
export async function listarTudo(): Promise<Pendente[]> {
  const todos = await tx<Pendente[]>(FILA, 'readonly', (s) => s.getAll())
  return todos.sort((a, b) => a.at - b.at)
}

/** Descarta a fila de uma comanda. Usado quando a comanda e encerrada. */
export async function limparComanda(token: string): Promise<void> {
  const fila = await listar(token)
  for (const p of fila) await remover(p.key)
}

// ---------------------------------------------------------------
// Cache do que a estacao precisa saber pra funcionar sem rede
// ---------------------------------------------------------------

async function guardar(k: string, v: unknown): Promise<void> {
  await tx(CACHE, 'readwrite', (s) => s.put({ k, v, at: Date.now() }))
}

async function ler<T>(k: string): Promise<T | null> {
  const row = await tx<{ k: string; v: T } | undefined>(CACHE, 'readonly', (s) =>
    s.get(k)
  )
  return row ? row.v : null
}

export const guardarCatalogo = (token: string, itens: ItemCatalogo[]) =>
  guardar(`catalogo:${token}`, itens)
export const lerCatalogo = (token: string) =>
  ler<ItemCatalogo[]>(`catalogo:${token}`)

export const guardarTarifas = (token: string, tarifas: unknown) =>
  guardar(`tarifas:${token}`, tarifas)
export const lerTarifas = <T>(token: string) => ler<T>(`tarifas:${token}`)

/**
 * A ultima foto da comanda vinda do servidor.
 *
 * Sem isso, recarregar a tela offline perde a comanda inteira: o cartao so e
 * resolvido no servidor, entao nao ha como reconstruir do zero sem rede.
 */
export const guardarComanda = (token: string, snap: unknown) =>
  guardar(`comanda:${token}`, snap)

/**
 * A foto guardada, desde que ainda seja recente.
 *
 * O limite existe porque nao ha como perguntar ao servidor se a comanda segue
 * aberta sem arriscar abrir outra — station_open_session cria quando nao acha.
 * Comanda de horas atras ja passou pelo caixa; ressuscita-la na tela seria pior
 * que comecar limpo.
 */
export async function lerComandaRecente<T>(
  token: string,
  maxMs: number
): Promise<T | null> {
  const row = await tx<{ v: T; at: number } | undefined>(CACHE, 'readonly', (s) =>
    s.get(`comanda:${token}`)
  )
  if (!row) return null
  return Date.now() - row.at > maxMs ? null : row.v
}

/** O token da comanda aberta, pra retomar depois de uma recarga. */
export const guardarTokenAtivo = (token: string | null) =>
  guardar('token-ativo', token)
export const lerTokenAtivo = () => ler<string | null>('token-ativo')

/**
 * Falha de rede ou recusa do servidor?
 *
 * A distincao decide o destino do item: falha de rede volta pra fila e tenta
 * de novo; recusa do servidor nunca vai passar, entao insistir travaria a fila
 * pra sempre atras de um item que jamais entra.
 */
export function ehFalhaDeRede(msg: string): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return /failed to fetch|networkerror|network request failed|load failed|timeout|fetch/i.test(
    msg
  )
}
