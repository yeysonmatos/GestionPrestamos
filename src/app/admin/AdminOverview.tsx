'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import StatCard from '@/components/ui/StatCard'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { formatNumber, formatDateShort } from '@/lib/utils'
import { Users, Wallet, Alarm, HandCoins, BuildingOffice, ShieldCheck, TrendUp, MinusCircle, ArrowUpRight } from '@phosphor-icons/react'

const AdminRevenueChart = dynamic(() => import('./AdminRevenueChart'), { ssr: false })
const AdminUsersPieChart = dynamic(() => import('./AdminUsersPieChart'), { ssr: false })

interface UserData {
  id: string
  email: string
  role: string
  status: string
  subscription: {
    plan_name: string
    plan_price: number
    billing_cycle: string
    status: string
    ends_at: string
  } | null
}

interface PaymentData {
  id: string
  user_id: string
  user_label: string
  amount: number
  payment_date: string
  method: string
}

interface StatsData {
  revenue_by_month: { month: string; income: number }[]
  users_per_plan: { plan_id: string; name: string; count: number }[]
  conversion_rate: number
  trial_count: number
  active_count: number
  expired_count: number
  blocked_count: number
  mrr: number
  total_collected: number
  recent_payments: PaymentData[]
}

export default function AdminOverview() {
  const [users, setUsers] = useState<UserData[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    async function load() {
      try {
        const [uRes, sRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/admin/stats'),
        ])
        const uData = await uRes.json()
        const sData = await sRes.json()
        if (!uRes.ok) throw new Error(uData.error || 'Error al cargar usuarios')
        if (!sRes.ok) throw new Error(sData.error || 'Error al cargar estadísticas')
        setUsers(uData.users || [])
        setStats(sData)
        setNow(Date.now())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error de conexión')
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>

  const activeUsers = users.filter(u => u.role === 'client' && u.status === 'active')
  const payingUsers = activeUsers.filter(u => u.subscription?.status === 'active' && u.subscription.plan_price > 0)
  const expiringSoon = activeUsers.filter(u => u.subscription?.ends_at && new Date(u.subscription.ends_at).getTime() - now <= 7 * 24 * 60 * 60 * 1000)
  const mrr = Number(stats?.mrr || 0)
  const totalCollected = Number(stats?.total_collected || 0)
  const recentPayments = (stats?.recent_payments || []).slice(0, 8)

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Clientes activos" value={formatNumber(activeUsers.length)} icon={Users} className="bg-white" />
        <StatCard label="Clientes que pagan" value={formatNumber(payingUsers.length)} icon={ShieldCheck} className="bg-white" />
        <StatCard label="Ingreso mensual (MRR)" value={`RD$${formatNumber(mrr)}`} icon={Wallet} className="bg-white" />
        <StatCard label="Total cobrado" value={`RD$${formatNumber(totalCollected)}`} icon={HandCoins} className="bg-white" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Trial → Pago" value={`${stats?.conversion_rate ?? 0}%`} icon={ArrowUpRight} className="bg-white" />
        <StatCard label="Suscripciones activas" value={formatNumber(stats?.active_count ?? 0)} icon={TrendUp} className="bg-white" />
        <StatCard label="En prueba (trial)" value={formatNumber(stats?.trial_count ?? 0)} icon={Wallet} className="bg-white" />
        <StatCard label="Vencidas / bloqueados" value={formatNumber((stats?.expired_count ?? 0) + (stats?.blocked_count ?? 0))} icon={MinusCircle} className="bg-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-base font-semibold text-foreground mb-4">Ingresos por mes</h3>
          <div className="h-64">
            <AdminRevenueChart data={stats?.revenue_by_month || []} />
          </div>
        </Card>
        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Usuarios por plan</h3>
          <div className="h-64">
            <AdminUsersPieChart data={stats?.users_per_plan || []} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Suscripciones por vencer (7 días)</h3>
            <Badge variant="active">
              <Alarm className="h-3 w-3 mr-1" /> {formatNumber(expiringSoon.length)}
            </Badge>
          </div>
          {expiringSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin vencimientos próximos</p>
          ) : (
            <div className="space-y-2">
              {expiringSoon.slice(0, 6).map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-warning-light flex items-center justify-center shrink-0">
                      <BuildingOffice className="h-5 w-5 text-warning" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{u.email}</p>
                      <p className="text-xs text-muted-foreground">{u.subscription?.plan_name} · vence {u.subscription?.ends_at ? formatDateShort(u.subscription.ends_at) : '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Últimos cobros</h3>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay cobros registrados</p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div>
                    <p className="font-medium text-sm text-foreground">{p.user_label}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(p.payment_date)} · {p.method}</p>
                  </div>
                  <span className="text-sm font-semibold text-success">RD${formatNumber(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
