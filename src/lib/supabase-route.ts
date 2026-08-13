import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// Cliente para app route handlers.
// Nota: NUNCA usar NextResponse.next() aquí — está prohibido en route handlers
// ("NextResponse.next() was used in a app route handler, this is not supported").
// Las cookies refrescadas se acumulan en `supabaseResponse` (a devolver en la
// respuesta de la ruta) para que el navegador las reciba como Set-Cookie.
export async function createRouteHandlerClient(request: NextRequest) {
  let supabaseResponse = new NextResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  return { supabase, supabaseResponse }
}

// Cliente para API Routes (sin NextResponse.next)
export function createApiRouteClient(request: NextRequest) {
  const cookies = request.cookies
  const cookieStore = {
    getAll() {
      return cookies.getAll()
    },
    setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
      // En API routes no podemos setear cookies en el request directamente
      // Las cookies se deben setear en la respuesta manualmente
      console.warn('[supabase-route] setAll called in API route - cookies must be set on response manually')
    },
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieStore,
    }
  )

  return { supabase }
}

export function getSupabaseCookies(request: NextRequest): string[] {
  return request.cookies.getAll().map(c => `${c.name}=${c.value}`)
}
