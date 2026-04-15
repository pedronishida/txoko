import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Txoko — Gestao para Restaurantes',
    short_name: 'Txoko',
    description:
      'Sistema de gestao completo para restaurantes: PDV, KDS, Cardapio, Financeiro, Estoque e IA Claude em um so lugar.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FFFFFF',
    theme_color: '#EA1D2C',
    lang: 'pt-BR',
    categories: ['business', 'productivity', 'food'],
    icons: [
      {
        src: '/icon.png',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
