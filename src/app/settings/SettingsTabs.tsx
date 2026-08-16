'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import PageHeader from '@/components/ui/PageHeader'
import SettingsContent from './SettingsContent'
import AccountContent from '@/app/account/AccountContent'
import SupportContent from '@/app/support/SupportContent'
import BackupPanel from '@/components/settings/BackupPanel'
import ExportPanel from '@/components/settings/ExportPanel'
import AuditLogsContent from './AuditLogsContent'
import type { Setting } from '@/types'

function SettingsTabsInner({ settings }: { settings: Setting | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'config'

  const setTab = useCallback((v: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'config') params.delete('tab')
    else params.set('tab', v)
    router.replace(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Tu negocio, plan y soporte" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="config">Configuración</TabsTrigger>
          <TabsTrigger value="plan">Mi plan</TabsTrigger>
          <TabsTrigger value="soporte">Soporte</TabsTrigger>
          <TabsTrigger value="audit">Auditoría</TabsTrigger>
          <TabsTrigger value="export">Exportar datos</TabsTrigger>
          <TabsTrigger value="backup">Backup de datos</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <SettingsContent settings={settings} showHeader={false} />
        </TabsContent>

        <TabsContent value="plan">
          <AccountContent showHeader={false} />
        </TabsContent>

        <TabsContent value="soporte">
          <SupportContent showHeader={false} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogsContent showHeader={false} />
        </TabsContent>

        <TabsContent value="export">
          <ExportPanel />
        </TabsContent>

        <TabsContent value="backup">
          <BackupPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SettingsTabs({ settings }: { settings: Setting | null }) {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>}>
      <SettingsTabsInner settings={settings} />
    </Suspense>
  )
}