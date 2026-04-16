import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Txoko — Gestao para Restaurantes',
    short_name: 'Txoko',
    description:
      'Sistema completo de gestao para restaurantes: PDV, KDS, Cardapio, Financeiro, Estoque e IA em um so lugar.',
    start_url: '/home',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0B0B0B',
    theme_color: '#EA1D2C',
    lang: 'pt-BR',
    dir: 'ltr',
    scope: '/',
    categories: ['business', 'productivity', 'food'],
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'PDV',
        short_name: 'PDV',
        url: '/pdv',
        description: 'Ponto de venda',
      },
      {
        name: 'Pedidos',
        short_name: 'Pedidos',
        url: '/pedidos',
        description: 'Gerenciar pedidos',
      },
      {
        name: 'KDS',
        short_name: 'KDS',
        url: '/kds',
        description: 'Kitchen Display System',
      },
      {
        name: 'Inbox',
        short_name: 'Inbox',
        url: '/inbox',
        description: 'Mensagens e conversas',
      },
    ],
  }
}
