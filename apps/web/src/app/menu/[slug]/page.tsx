import { Suspense } from 'react'
import { MenuPageContent } from '@/components/menu/menu-page-content'

export function generateStaticParams() {
  return [{ slug: 'txoko-demo' }]
}

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-night flex items-center justify-center text-stone">Carregando cardapio...</div>}>
      <MenuPageContent />
    </Suspense>
  )
}
