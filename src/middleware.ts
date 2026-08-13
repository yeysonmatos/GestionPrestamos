import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u
  } catch {
    // Cookie inválida o error de auth → tratar como no autenticado
  }

  const { pathname } = request.nextUrl
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isPublic = pathname === '/login' || pathname === '/register' || pathname === '/pricing' || pathname.startsWith('/auth/') || pathname.startsWith('/_next/') || pathname.startsWith('/api/') || pathname === '/' || pathname === '/favicon.ico' || pathname.startsWith('/gp-icon.png') || pathname === '/manifest.json' || pathname === '/offline.html' || pathname === '/suspended'

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Rutas de administración: requieren rol admin
  if (user && isAdminRoute) {
    let isAdmin = false
    try {
      const { data } = await supabase.rpc('is_admin')
      isAdmin = data === true
    } catch {
      isAdmin = false
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  if (user && (pathname === '/login' || (!isAdminRoute && !isPublic))) {
    let isAdmin = false
    try {
      const { data } = await supabase.rpc('is_admin')
      isAdmin = data === true
    } catch {
      isAdmin = false
    }
    if (isAdmin && !isAdminRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }
    if (!isAdmin && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Clientes: redirigir al onboarding si no lo han completado
  if (user && !isAdminRoute && !isPublic && pathname !== '/onboarding') {
    let onboardingCompleted = true
    try {
      const { data } = await supabase
        .from('settings')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle()
      onboardingCompleted = data?.onboarding_completed !== false
    } catch {
      onboardingCompleted = true
    }
    if (!onboardingCompleted) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  // Clientes: bloquear si el admin lo bloqueó o la suscripción está vencida/cancelada
  if (user && !isAdminRoute && !isPublic && pathname !== '/suspended') {
    let blocked = false
    try {
      const { data: appUser } = await supabase
        .from('app_users')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()
      blocked = appUser?.status === 'blocked'
    } catch {
      blocked = false
    }

    let expired = false
    let isTrialPlan = false
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status, ends_at, plan:plans(price, name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (sub) {
        const ended = sub.ends_at ? new Date(sub.ends_at).getTime() < Date.now() : false
        expired = sub.status === 'expired' || sub.status === 'cancelled' || ended
        const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan
        isTrialPlan = Number(plan?.price || 0) === 0
      }
    } catch {
      expired = false
    }

    // Downgrade suave: si el plan vencido es Trial/gratuito, NO bloquear.
    // El usuario sigue accediendo (modo lectura) y la UI muestra el banner para elegir plan.
    if (blocked || (expired && !isTrialPlan)) {
      const url = request.nextUrl.clone()
      url.pathname = '/suspended'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|gp-icon.png|manifest.json|offline.html).*)',
  ],
}
