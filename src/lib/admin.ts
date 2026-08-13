import { NextResponse, type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createServerSideClient } from '@/lib/supabase-server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { createAdminClient } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function isAdminUser(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return data === true
}

// Guard para API routes: verifica que el usuario es admin (anon/RLS)
// y devuelve un cliente service-role para operar sobre todos los datos.
// Usa createRouteHandlerClient para refrescar/girar la sesión y devolver
// Set-Cookie en la respuesta (evita logs de relogin/Acceso denegado al recargar).
export async function requireAdminApi(request: NextRequest) {
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: supabaseResponse.headers }) }
  }

  const isAdmin = await isAdminUser(supabase)
  if (!isAdmin) {
    return { ok: false as const, response: NextResponse.json({ error: 'Acceso denegado' }, { status: 403, headers: supabaseResponse.headers }) }
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return { ok: false as const, response: NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 500, headers: supabaseResponse.headers }) }
  }

  return { ok: true as const, adminClient, userId: user.id, supabaseResponse }
}

export interface AdminSession {
  userId: string | null
  isAdmin: boolean
  supabase: SupabaseClient
}

export async function getAdminSession(): Promise<AdminSession> {
  const supabase = await createServerSideClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { userId: null, isAdmin: false, supabase }

  const isAdmin = await isAdminUser(supabase)
  return { userId: user.id, isAdmin, supabase }
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session.isAdmin) {
    redirect('/dashboard')
  }
  return session
}
