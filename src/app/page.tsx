import { createServerSideClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/Button'

export default async function Home() {
  const supabase = await createServerSideClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    const { data: isAdmin } = await supabase.rpc('is_admin')
    redirect(isAdmin === true ? '/admin' : '/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-primary-light/20 to-background">
      <img src="/gp-icon.png" alt="GP" className="w-20 h-20 rounded-2xl object-cover mb-6" />
      <h1 className="text-3xl font-bold text-foreground text-center">Gestor de Prestamos</h1>
      <p className="text-muted-foreground mt-3 max-w-md text-center leading-relaxed">
        Administra tus préstamos de forma profesional, segura y desde cualquier lugar.
      </p>
      <div className="flex flex-col items-center gap-4 mt-8 w-full max-w-xs">
        <Link href="/register" className="w-full">
          <Button size="lg" className="w-full">Crear cuenta gratis</Button>
        </Link>
        <p className="text-sm text-muted-foreground">
          ¿Ya tienes una cuenta?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}