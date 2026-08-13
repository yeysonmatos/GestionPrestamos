import PageHeader from '@/components/ui/PageHeader'
import AdminSupport from './AdminSupport'

export const dynamic = 'force-dynamic'

export default function AdminSupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Soporte"
        description="Gestiona los tickets de tus clientes"
      />
      <AdminSupport />
    </div>
  )
}