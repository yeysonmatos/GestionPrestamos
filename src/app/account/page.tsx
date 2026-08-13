import MainLayout from '@/components/layout/MainLayout'
import AccountContent from './AccountContent'

export const dynamic = 'force-dynamic'

export default function AccountPage() {
  return (
    <MainLayout>
      <AccountContent />
    </MainLayout>
  )
}