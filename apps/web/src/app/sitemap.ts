import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: 'https://txoko.com.br',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: 'https://app.txoko.com.br/login',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://app.txoko.com.br/menu/txoko-demo',
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6,
    },
  ]
}
