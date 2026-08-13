import MainLayout from '@/components/layout/MainLayout'
import ClientForm from './ClientForm'

export default async function NewClientPage() {
  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Nuevo cliente</h1>
        <ClientForm />
      </div>
    </MainLayout>
  )
}
