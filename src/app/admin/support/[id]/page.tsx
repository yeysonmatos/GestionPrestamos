import AdminSupportDetail from './AdminSupportDetail'

export const dynamic = 'force-dynamic'
export default async function AdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminSupportDetail ticketId={id} />
}