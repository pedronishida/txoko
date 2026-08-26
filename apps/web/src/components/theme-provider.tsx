'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * Contrato de tema do redesign:
 *   - claro por padrao;
 *   - escuro e preferencia gravada do usuario, nao o tema do sistema;
 *   - a escolha vive em localStorage sob a chave txoko-theme;
 *   - o tema ativo aparece como data-theme no <html>.
 *
 * next-themes injeta o script anti-flash antes da hidratacao, entao o tema
 * nao pisca no refresh — nao ha script proprio a manter.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      storageKey="txoko-theme"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
