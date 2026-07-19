'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import {
  Layout, Users, Handshake, HandCoins,
  Calendar, ChartBar, FileText, Gear, SignOut,
  List, X,
} from '@phosphor-icons/react'
import { useState, useEffect } from 'react'

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Layout },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/loans', label: 'Préstamos', icon: Handshake },
  { href: '/collections', label: 'Cobros', icon: HandCoins },
  { href: '/calendar', label: 'Calendario', icon: Calendar },
  { href: '/reports', label: 'Reportes', icon: ChartBar },
  { href: '/documents', label: 'Documentos', icon: FileText },
  { href: '/settings', label: 'Configuración', icon: Gear },
]

export default function Sidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserEmail(data.user.email ?? null)
    })
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActivePath(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href + '/') || pathname === href
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#081528] to-[#0F2A55]">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-3">
          <img src="/GP Logo.png" alt="GP" className="w-9 h-9 rounded-xl shrink-0 object-cover" />
          <div className="min-w-0">
            <span className="font-semibold text-white text-lg tracking-tight block leading-tight">Mis Préstamos</span>
            <span className="text-[11px] text-blue-300/70 tracking-wide">Control profesional</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {menuItems.map(item => {
          const isActive = isActivePath(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative min-h-11',
                isActive
                  ? 'text-white bg-blue-500/20 shadow-sm'
                  : 'text-blue-300/70 hover:text-white hover:bg-blue-500/10'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#8B5CF6] shadow-sm shadow-[#8B5CF6]/50" />
              )}
              <Icon
                className={cn('h-5 w-5 shrink-0', isActive ? 'text-[#8B5CF6]' : 'text-blue-300/50')}
                weight={isActive ? 'fill' : 'regular'}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#2563EB] flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{userEmail ?? 'Usuario'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-300/70 hover:text-red-400 hover:bg-red-500/10 transition-colors w-full min-h-11 mt-0.5"
        >
          <SignOut className="h-5 w-5 shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#081528] border-b border-white/10 px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/GP Logo.png" alt="GP" className="w-8 h-8 rounded-lg shrink-0 object-cover" />
          <span className="font-semibold text-white">Mis Préstamos</span>
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="min-h-11 min-w-11 flex items-center justify-center text-blue-300/70 hover:text-white transition-colors">
          {mobileOpen ? <X className="h-6 w-6" /> : <List className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <div className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 w-72 shadow-2xl transform transition-transform duration-300 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-30">
        {sidebarContent}
      </aside>
    </>
  )
}
