'use client'

import Sidebar from './Sidebar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64 pt-14 lg:pt-0">
        <div className="max-w-6xl mx-auto px-3 py-4 sm:px-4 sm:py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
