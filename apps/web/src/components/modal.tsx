'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal.
 *
 * As quatro regras do handoff, num lugar so: role="dialog", foco movido para
 * o painel, Tab preso dentro, Escape fecha e a rolagem do fundo travada. Sem
 * a trava, rolar dentro do modal rola a tela atras dele; sem o Tab preso, a
 * terceira tabulacao ja esta no menu lateral.
 *
 * O painel e opaco (--overlay), nunca translucido: sobre uma lista de pedidos
 * um modal translucido vira ruido exatamente onde a atencao precisa parar.
 */
export function Modal({
  label,
  onClose,
  children,
  className,
}: {
  label: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    const previous = document.activeElement as HTMLElement | null
    panel?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      const f = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (f.length === 0) {
        e.preventDefault()
        return
      }
      const first = f[0]!
      const last = f[f.length - 1]!
      const active = document.activeElement

      if (!panel.contains(active)) {
        first.focus()
        e.preventDefault()
      } else if (e.shiftKey && active === first) {
        last.focus()
        e.preventDefault()
      } else if (!e.shiftKey && active === last) {
        first.focus()
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--scrim)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-rule bg-overlay outline-none',
          className
        )}
        style={{ boxShadow: 'var(--e3)' }}
      >
        {children}
      </div>
    </div>
  )
}
