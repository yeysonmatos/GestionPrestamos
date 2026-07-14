import { createServerSideClient } from '@/lib/supabase-server'
import MainLayout from '@/components/layout/MainLayout'
import SettingsContent from './SettingsContent'

export default async function SettingsPage() {
  const supabase = await createServerSideClient()

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .single()

  return (
    <MainLayout>
      <SettingsContent settings={settings} />
    </MainLayout>
  )
}
