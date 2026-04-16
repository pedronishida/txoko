import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/menu/'],
        disallow: ['/home', '/inbox', '/pdv', '/pedidos', '/kds', '/mesas', '/cardapio', '/clientes', '/estoque', '/financeiro', '/avaliacoes', '/assistente', '/automacoes', '/configuracoes', '/api/'],
      },
    ],
    sitemap: 'https://txoko.com.br/sitemap.xml',
    host: 'https://txoko.com.br',
  }
}
