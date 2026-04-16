import type { Metadata } from 'next'
import { Rubik, JetBrains_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { PWARegister } from '@/components/pwa-register'
import './globals.css'

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
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
      className={`${rubik.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#EA1D2C" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <PWARegister />
      </body>
    </html>
  )
}
