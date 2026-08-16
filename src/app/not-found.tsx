import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-4 p-6">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">404</div>
        <h1 className="text-xl font-bold">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  )
}