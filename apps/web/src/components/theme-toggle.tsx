'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-9 h-9" aria-hidden />
  }

  const current = resolvedTheme ?? theme
  const isDark = current === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/75 hover:text-foreground hover:bg-surface-hover transition-colors"
      title={isDark ? 'Mudar para claro' : 'Mudar para escuro'}
      aria-label="Alternar tema"
    >
      {isDark ? <Sun size={14} strokeWidth={1.6} /> : <Moon size={14} strokeWidth={1.6} />}
    </button>
  )
}
