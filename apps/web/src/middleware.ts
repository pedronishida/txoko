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

  // Na raiz do app: redireciona pra login (nao mostra a landing de novo)
  if (url.pathname === '/') {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
