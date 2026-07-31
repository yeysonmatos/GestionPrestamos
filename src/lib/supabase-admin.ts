import { createServerClient } from '@supabase/ssr'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  return createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}
