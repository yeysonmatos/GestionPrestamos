import PageHeader from '@/components/ui/PageHeader'
import AdminUsers from './AdminUsers'

export const dynamic = 'force-dynamic'

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Gestiona los clientes que usan tu plataforma"
      />
      <AdminUsers />
    </div>
  )
}
