import type { Metadata } from 'next'
import { Archivo, Space_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { PWARegister } from '@/components/pwa-register'
import './globals.css'

// Archivo para tudo que se le como texto.
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
  display: 'swap',
})

// Space Mono so para o que se compara em coluna: numeros, codigos,
// horarios e duracoes. Nunca em texto corrido, nunca em rotulo.
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://app.txoko.com.br'),
  title: {
    default: 'Txoko — Gestao para Restaurantes',
    template: '%s · Txoko',
  },
  description:
    'O sistema que faz o basico com excelencia, aplica IA onde importa e automatiza o que ninguem quer fazer. PDV, KDS, Cardapio, Financeiro e IA Claude em um so lugar.',
  keywords: [
    'sistema de gestao',
    'restaurante',
    'PDV',
    'cardapio digital',
    'delivery',
    'KDS',
    'estoque',
    'financeiro',
    'IA',
    'Claude',
    'SaaS',
  ],
  authors: [{ name: 'Txoko' }],
  creator: 'Txoko',
  publisher: 'Txoko',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Txoko',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: 'https://app.txoko.com.br',
    siteName: 'Txoko',
    title: 'Txoko — Gestao para Restaurantes',
    description:
      'PDV, KDS, Cardapio, Financeiro, Estoque e IA Claude. Tudo em tempo real, em um so lugar.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Txoko — Gestao para Restaurantes',
    description:
      'PDV, KDS, Cardapio, Financeiro e IA Claude em um so lugar.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Polyfill pro esbuild helper __name — next-themes inline script depende
            disso mas nao injeta. Sem isso o browser trava com "__name is not defined". */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__name=window.__name||((t,v)=>(Object.defineProperty(t,"name",{value:v,configurable:true}),t));`,
          }}
        />
        {/* Anti-flash. O next-themes tambem faz isso, mas o script dele sai
            depois do <body> — hoje nada pintavel vem antes, o que torna a
            garantia incidental. Aqui ela e estrutural: o tema esta no <html>
            antes de qualquer conteudo ser analisado. Mesma chave, mesmo
            atributo e mesmo padrao do ThemeProvider, entao os dois concordam. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("txoko-theme");t=t==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t}catch(e){}`,
          }}
        />
        {/* --bg do tema claro, que e o padrao do app. O escuro e preferencia
            gravada e nao acompanha o sistema, entao nao ha media query util
            aqui — seguir prefers-color-scheme daria a cor errada pra quem
            tem o sistema escuro e o app claro. */}
        <meta name="theme-color" content="#ebeff4" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <PWARegister />
      </body>
    </html>
  )
}
