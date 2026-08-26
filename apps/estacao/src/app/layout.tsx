import type { Metadata, Viewport } from 'next'
import { SWRegister } from '@/components/sw-register'
import { KioskThemeToggle } from '@/components/kiosk-theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Estacao Txoko',
  description: 'Self-service por peso e unidade',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // --bg do tema claro, que e o padrao do quiosque.
  themeColor: '#f4f6f8',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Anti-flash do tema do quiosque. Claro e o padrao, entao so escreve
            o atributo quando o terminal foi trocado pra escuro — e escreve
            antes de qualquer conteudo ser analisado, senao a tela pisca clara
            antes de escurecer. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("txoko-kiosk-theme")==="dark"){document.documentElement.setAttribute("data-kiosk","dark")}}catch(e){}`,
          }}
        />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>
        {children}
        <KioskThemeToggle />
        <SWRegister />
      </body>
    </html>
  )
}
