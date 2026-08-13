import PageHeader from '@/components/ui/PageHeader'
import { requireAdmin } from '@/lib/admin'
import AdminAudit from './AdminAudit'

export const dynamic = 'force-dynamic'

export default async function AdminAuditPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría global"
        description="Actividad de todos los usuarios de la plataforma"
      />
      <AdminAudit />
    </div>
  )
}
