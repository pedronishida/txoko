import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/menu/'],
        disallow: ['/dashboard/', '/api/'],
      },
    ],
    sitemap: 'https://txoko.com.br/sitemap.xml',
    host: 'https://txoko.com.br',
  }
}
