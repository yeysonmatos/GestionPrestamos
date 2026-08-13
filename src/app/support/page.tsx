import MainLayout from '@/components/layout/MainLayout'
import SupportContent from './SupportContent'

export const dynamic = 'force-dynamic'

export default function SupportPage() {
  return (
    <MainLayout>
      <SupportContent />
    </MainLayout>
  )
}