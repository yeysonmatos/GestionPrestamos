export interface Client {
  id: string
  user_id: string
  name: string
  first_name: string | null
  last_name: string | null
  nickname: string | null
  sex: 'M' | 'F' | '' | null
  document_type: string | null
  email: string | null
  phone: string | null
  phone_alt: string | null
  whatsapp: string | null
  document: string | null
  address: string | null
  provincia: string | null
  municipio: string | null
  sector: string | null
  calle: string | null
  numero: string | null
  referencia: string | null
  gps_lat: number | null
  gps_lng: number | null
  photo: string | null
  occupation: string | null
  workplace: string | null
  monthly_income: number
  references: ClientReference[] | null
  status: 'active' | 'inactive'
  trust_level: 'high' | 'medium' | 'low'
  trust_score: number
  notes: string | null
  balance: number
  total_loans: number
  active_loans: number
  paid_loans: number
  late_loans: number
  total_borrowed: number
  total_paid: number
  total_interest: number
  last_payment_at: string | null
  last_loan_at: string | null
  created_at: string
  loans?: Loan[]
}

export interface ClientReference {
  name: string
  phone: string
  relation: string
}

export interface Loan {
  id: string
  loan_id: string
  user_id: string
  client_id: string
  client?: Client
  amount: number
  interest_type: 'percentage' | 'fixed'
  interest_rate: number
  total_amount: number
  total_interest: number
  installment_amount: number
  installments: number
  paid_installments: number
  paid_amount: number
  remaining_amount: number
  progress: number
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  start_date: string
  first_payment_date: string
  end_date: string | null
  amortization_type: 'interest_only' | 'french'
  open_ended: boolean
  payment_day: number | null
  status: 'active' | 'paid' | 'late' | 'cancelled'
  late_days: number
  late_interest_rate: number
  guarantee: string | null
  notes: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface Installment {
  id: string
  loan_id: string
  client_id: string
  number: number
  amount: number
  capital: number
  interest: number
  balance: number
  paid_amount: number
  due_date: string
  paid_at: string | null
  status: 'pending' | 'paid' | 'late'
  late_days: number
  late_amount: number
  loan?: Loan & { client?: Client }
}

export interface Payment {
  id: string
  loan_id: string
  installment_id: string | null
  client_id: string
  user_id: string
  amount: number
  capital_amount: number
  interest_amount: number
  late_amount: number
  type: 'installment' | 'partial' | 'capital_abono' | 'liquidation'
  payment_date: string
  method: 'cash' | 'transfer' | 'deposit' | 'other'
  notes: string | null
  status: 'paid' | 'reversed'
  reversed_by: string | null
  reversed_at: string | null
  reversal_reason: string | null
  created_at: string
  loan?: Loan & { client?: Client }
}

export interface Document {
  id: string
  client_id: string
  loan_id: string | null
  name: string
  type: 'contract' | 'promissory' | 'guarantee' | 'photo' | 'note'
  path: string
  mime_type: string | null
  size: number | null
  notes: string | null
  created_at: string
  client?: { id: string; name: string }
}

export interface Setting {
  id: string
  user_id: string
  business_name: string
  business_address: string
  business_phone: string
  business_email: string
  currency: string
  late_interest_rate: number
  loan_id_prefix: string
  notify_upcoming_days: number
  default_installments: number
  default_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  language: string
  updated_at: string
}

export interface DashboardData {
  total_capital: number
  recovered_capital: number
  pending_capital: number
  generated_interest: number
  active_clients: number
  late_clients: number
  active_loans: number
  today_collections: number
  today_count: number
  overdue_collections: number
  overdue_count: number
  monthly_data: { month: string; income: number; loans: number }[]
  upcoming_payments: Payment[]
  recent_loans: Loan[]
}

export interface ReportOverview {
  total_loans: number
  total_recovered: number
  total_pending: number
  total_interest: number
  active_clients: number
  active_loans: number
  portfolio_health: number
}

export interface Person {
  id: string
  name: string
  notes: string | null
  created_at: string
}

export type Currency = 'MXN' | 'USD' | 'EUR' | 'COP' | 'ARS' | 'CLP' | 'PEN' | 'BRL' | 'DOP'

export const CURRENCIES: { code: Currency; symbol: string; name: string }[] = [
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  { code: 'USD', symbol: '$', name: 'Dólar Americano' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
  { code: 'DOP', symbol: 'RD$', name: 'Peso Dominicano' },
  { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
  { code: 'CLP', symbol: '$', name: 'Peso Chileno' },
  { code: 'PEN', symbol: 'S/', name: 'Sol Peruano' },
  { code: 'BRL', symbol: 'R$', name: 'Real Brasileño' },
]

export const FREQUENCIES = [
  { value: 'daily', label: 'Diario', days: 1 },
  { value: 'weekly', label: 'Semanal', days: 7 },
  { value: 'biweekly', label: 'Quincenal', days: 14 },
  { value: 'monthly', label: 'Mensual', days: 30 },
]

export const TRUST_LEVELS = [
  { value: 'high', label: 'Alto', color: 'green' },
  { value: 'medium', label: 'Medio', color: 'yellow' },
  { value: 'low', label: 'Bajo', color: 'red' },
]

export const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contrato', icon: 'FileText' },
  { value: 'promissory', label: 'Pagaré', icon: 'FileSignature' },
  { value: 'guarantee', label: 'Garantía', icon: 'Shield' },
  { value: 'photo', label: 'Foto', icon: 'Image' },
  { value: 'note', label: 'Nota', icon: 'File' },
]

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'deposit', label: 'Depósito' },
  { value: 'other', label: 'Otro' },
]
