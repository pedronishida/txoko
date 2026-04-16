import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const APEX_HOSTS = new Set(['txoko.com.br', 'www.txoko.com.br'])
const APP_HOST = 'app.txoko.com.br'

export async function middleware(request: NextRequest) {
  const hostHeader = request.headers.get('host') ?? ''
  const hostname = hostHeader.toLowerCase().split(':')[0]
  const url = request.nextUrl

  // ==========================================================
  // www.txoko.com.br → apex (SEO canonico)
  // ==========================================================
  if (hostname === 'www.txoko.com.br') {
    const canonical = new URL(
      url.pathname + url.search,
      'https://txoko.com.br'
    )
    return NextResponse.redirect(canonical, 301)
  }

  // ==========================================================
  // txoko.com.br → so landing em /. Tudo mais vai pro app.
  // ==========================================================
  if (hostname === 'txoko.com.br') {
    const allowed =
      url.pathname === '/' ||
      url.pathname.startsWith('/_next/') ||
      url.pathname.startsWith('/icon') ||
      url.pathname.startsWith('/apple-icon') ||
      url.pathname.startsWith('/opengraph-image') ||
      url.pathname === '/favicon.ico' ||
      url.pathname === '/sitemap.xml' ||
      url.pathname === '/robots.txt' ||
      url.pathname === '/manifest.webmanifest'

    if (!allowed) {
      const appUrl = new URL(
        url.pathname + url.search,
        `https://${APP_HOST}`
      )
      return NextResponse.redirect(appUrl, 301)
    }

    // Na apex, nao rodar auth — a landing e publica
    return NextResponse.next({ request })
  }

  // ==========================================================
  // app.txoko.com.br (ou qualquer outro host em dev/preview)
  // ==========================================================

  // Backwards-compat: /dashboard e /dashboard/* → / e /*
  if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
    const target = request.nextUrl.clone()
    target.pathname =
      url.pathname === '/dashboard'
        ? '/home'
        : url.pathname.replace(/^\/dashboard/, '')
    return NextResponse.redirect(target, 301)
  }

  // Raiz: a landing page cuida do redirect no server component (user → /home)
  // Nao interceptar aqui para nao criar loop.

  // /signup e publica — tambem redirecionar autenticados via page.tsx
  if (url.pathname.startsWith('/signup')) {
    return await updateSession(request)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
