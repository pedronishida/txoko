import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Rotas publicas — tudo o mais na raiz eh app protegido.
// As rotas abaixo NAO ficam sem protecao: cada uma tem seu proprio controle
// (Bearer CRON_SECRET nos crons, assinatura nos webhooks). O que elas nao
// podem e depender de sessao/cookie, porque quem chama nao e um browser
// logado — sem isso o middleware devolve 307 pro /login e a chamada morre
// em silencio (o fetch segue o redirect e recebe 200 da tela de login).
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/menu/',
  '/api/webhooks/',
  '/api/reviews/public',
  '/api/cron/',
  '/api/menu/',
  '/l/',
  '/termos',
  '/privacidade',
]
const PUBLIC_EXACT = new Set([
  '/',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
])

function isPublicRoute(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login')
  const isProtected = !isPublicRoute(pathname)

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
