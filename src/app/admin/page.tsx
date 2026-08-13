import PageHeader from '@/components/ui/PageHeader'
import AdminOverview from './AdminOverview'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel de Administración"
        description="Resumen de tu plataforma SaaS"
      />
      <AdminOverview />
    </div>
  )
}
