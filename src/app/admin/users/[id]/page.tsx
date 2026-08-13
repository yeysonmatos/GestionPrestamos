import { requireAdmin } from '@/lib/admin'
import AdminUserDetail from './AdminUserDetail'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  return <AdminUserDetail userId={id} />
}
