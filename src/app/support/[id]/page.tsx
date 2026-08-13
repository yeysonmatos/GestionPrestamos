import MainLayout from '@/components/layout/MainLayout'
import SupportDetail from './SupportDetail'

export const dynamic = 'force-dynamic'
export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <MainLayout>
      <SupportDetail ticketId={id} />
    </MainLayout>
  )
}