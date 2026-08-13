import PageHeader from '@/components/ui/PageHeader'
import { requireAdmin } from '@/lib/admin'
import AdminReminders from './AdminReminders'

export const dynamic = 'force-dynamic'

export default async function AdminRemindersPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Renovaciones"
        description="Suscripciones por vencer o vencidas — avisa por correo a los prestamistas"
      />
      <AdminReminders />
    </div>
  )
}
