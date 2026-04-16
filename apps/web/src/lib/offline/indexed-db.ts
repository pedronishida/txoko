/**
 * IndexedDB wrapper para fila de pedidos offline.
 * Usado pelo PDV quando sem conexao — pedidos ficam aqui ate o sync.
 */

const DB_NAME = 'txoko-offline'
const DB_VERSION = 1
const STORE_ORDERS = 'pending-orders'

export interface PendingOrder {
  /** ID local gerado no cliente (UUID v4) */
  localId: string
  restaurantId: string
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
  lastError?: string
}

// ─── DB init ─────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        const store = db.createObjectStore(STORE_ORDERS, {
          keyPath: 'localId',
        })
        store.createIndex('restaurantId', 'restaurantId', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ─── CRUD helpers ────────────────────────────────────────────────────────────

function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function queueOrderOffline(
  order: Omit<PendingOrder, 'localId' | 'createdAt' | 'attempts'>
): Promise<string> {
  const db = await openDB()
  const localId = generateLocalId()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)

    const record: PendingOrder = {
      localId,
      restaurantId: order.restaurantId,
      payload: order.payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    }

    const req = store.add(record)
    req.onsuccess = () => resolve(localId)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getPendingOrders(
  restaurantId?: string
): Promise<PendingOrder[]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readonly')
    const store = tx.objectStore(STORE_ORDERS)

    const req = restaurantId
      ? store.index('restaurantId').getAll(restaurantId)
      : store.getAll()

    req.onsuccess = () => resolve(req.result as PendingOrder[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function removePendingOrder(localId: string): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)

    const req = store.delete(localId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

async function incrementAttempts(
  localId: string,
  error?: string
): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)

    const getReq = store.get(localId)
    getReq.onsuccess = () => {
      const record = getReq.result as PendingOrder | undefined
      if (!record) {
        resolve()
        return
      }
      record.attempts += 1
      if (error) record.lastError = error
      const putReq = store.put(record)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
    tx.oncomplete = () => db.close()
  })
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function syncPendingOrders(
  restaurantId?: string
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingOrders(restaurantId)

  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  await Promise.allSettled(
    pending.map(async (order) => {
      // Limite de 5 tentativas para evitar loop
      if (order.attempts >= 5) {
        failed++
        return
      }

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order.payload),
        })

        if (res.ok) {
          await removePendingOrder(order.localId)
          synced++
        } else {
          const errorText = await res.text().catch(() => String(res.status))
          await incrementAttempts(order.localId, errorText)
          failed++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        await incrementAttempts(order.localId, msg)
        failed++
      }
    })
  )

  return { synced, failed }
}

// ─── Online listener ─────────────────────────────────────────────────────────

export function listenForOnline(callback: () => void): () => void {
  window.addEventListener('online', callback)
  return () => window.removeEventListener('online', callback)
}

export function listenForOffline(callback: () => void): () => void {
  window.addEventListener('offline', callback)
  return () => window.removeEventListener('offline', callback)
}
