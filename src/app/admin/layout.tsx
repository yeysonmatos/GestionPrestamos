import { requireAdmin } from '@/lib/admin'
import AdminLayoutClient from './AdminLayoutClient'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
