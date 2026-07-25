import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSideClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op: cookies solo se pueden modificar en Server Actions/Route Handlers
          // Las mutaciones de auth ocurren en /api/auth/* (login, logout, refresh)
        },
      },
    }
  )
}
