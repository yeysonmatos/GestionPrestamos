import PageHeader from '@/components/ui/PageHeader'
import AdminPlans from './AdminPlans'

export const dynamic = 'force-dynamic'

export default function AdminPlansPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Planes"
        description="Crea y gestiona los planes de suscripción"
      />
      <AdminPlans />
    </div>
  )
}
