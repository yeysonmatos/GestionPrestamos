import PageHeader from '@/components/ui/PageHeader'
import AdminPayments from './AdminPayments'

export const dynamic = 'force-dynamic'

export default function AdminPaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos de suscripción"
        description="Historial de mensualidades cobradas"
      />
      <AdminPayments />
    </div>
  )
}
