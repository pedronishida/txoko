'use client'
import { useState, useEffect } from 'react'

export type CartItem = {
  productId: string
  name: string
  price: number
  quantity: number
  notes?: string
  imageUrl?: string | null
}

const STORAGE_KEY = 'txoko-menu-cart'

export function useCart(restaurantSlug: string) {
  const key = `${STORAGE_KEY}-${restaurantSlug}`
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) setItems(JSON.parse(stored) as CartItem[])
    } catch {}
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(key, JSON.stringify(items))
    } catch {}
  }, [items, key, hydrated])

  const add = (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    setItems((prev) => {
      const existing = prev.find(
        (i) =>
          i.productId === item.productId &&
          (i.notes ?? '') === (item.notes ?? '')
      )
      if (existing) {
        return prev.map((i) =>
          i === existing
            ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
            : i
        )
      }
      return [...prev, { ...item, quantity: item.quantity ?? 1 }]
    })
  }

  const updateQuantity = (
    productId: string,
    notes: string | undefined,
    quantity: number
  ) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter(
            (i) =>
              !(
                i.productId === productId &&
                (i.notes ?? '') === (notes ?? '')
              )
          )
        : prev.map((i) =>
            i.productId === productId && (i.notes ?? '') === (notes ?? '')
              ? { ...i, quantity }
              : i
          )
    )
  }

  const remove = (productId: string, notes: string | undefined) =>
    updateQuantity(productId, notes, 0)

  const clear = () => setItems([])

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const count = items.reduce((sum, i) => sum + i.quantity, 0)

  return { items, add, updateQuantity, remove, clear, total, count, hydrated }
}
