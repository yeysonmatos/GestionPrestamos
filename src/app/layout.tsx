import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import './globals.css'

const PwaRegister = dynamic(() => import('@/components/PwaRegister'))

export const metadata: Metadata = {
  title: 'Gestor de Prestamos',
  description: 'Control de préstamos personales — profesional y confiable',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#081528" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Préstamos" />
        <link rel="apple-touch-icon" href="/gp-icon.png" />
        <link rel="icon" href="/gp-icon.png" sizes="any" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
