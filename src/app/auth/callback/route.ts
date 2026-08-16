import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  let supabaseResponse = new NextResponse()

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const url = new URL(`${origin}${next}`)
      const redirect = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) =>
        redirect.cookies.set(name, value, { ...options })
      )
      return redirect
    }
  }

  const errUrl = new URL(`${origin}/login`)
  errUrl.searchParams.set('error', 'Auth failed')
  errUrl.searchParams.set('error_description', 'No se pudo completar la autenticación. Intenta de nuevo o solicita un nuevo enlace.')
  return NextResponse.redirect(errUrl)
}
