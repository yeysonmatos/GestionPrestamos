<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mis Préstamos — Objetivo

App profesional de control de préstamos (Next.js + Supabase) con dos modelos de amortización:
- **Francesa** — cuota fija, capital creciente, interés decreciente (bancos/financieras)
- **Interest-Only** — pagos periódicos de solo interés, capital al liquidar (prestamistas informales RD)

## Estado actual (13 Jul 2026)

### Completado
- [x] Fundación: types, calculos, utils, storage, supabase client/server/route
- [x] Schema DB con RLS + update_client_stats function
- [x] UI Components: Card, Badge, Button, Input, Select, Modal, Progress, Tabs, Avatar, SearchInput, PageHeader, StatCard, Skeleton, EmptyState
- [x] Layout: Sidebar + MainLayout
- [x] Login page (email/password con Supabase Auth)
- [x] Dashboard con métricas reales y gráfica
- [x] Clientes: listado, create, profile con tabs
- [x] Préstamos (French OK): listado, creación con vista previa, detalle con tabla amortización + pago + reversión + contrato
- [x] Colecciones: cobros del día/vencidos/próximos + historial + pago inline
- [x] Calendario: vista mensual con cuotas y pagos
- [x] Reportes: estadísticas, gráficas (barras + pie)
- [x] Documentos: subida, listado, filtro por tipo, borrado
- [x] Configuración: negocio, moneda, prefijo, mora, defaults
- [x] API routes: /api/collections, /api/calendar, /api/reports, /api/documents, /api/settings, /api/clients
- [x] Sistema de diseño persistido (ui-ux-pro-max → design-system/mis-préstamos/)
- [x] Design tokens aplicados (Tailwind v4 @theme + IBM Plex Sans)
- [x] Amortización francesa implementada en calculations.ts
- [x] update_client_stats RPC function en schema.sql
- [x] user_id agregado a inserts de payments
- [x] Mora calculada al pagar cuota vencida
- [x] Collections actualiza loan (paid_installments, progress, remaining_amount)
- [x] Dashboard con datos reales (no hardcodeados)
- [x] BadgeVariant incluye 'late'
- [x] Eliminados todos los `as any` casts
- [x] Columna `amortization_type` en schema.sql + type Loan
- [x] Payment type extendido: 'capital_abono', 'liquidation'
- [x] Schema: first_name, last_name, nickname, sex, document_type, whatsapp, provincia, municipio, sector, calle, numero, referencia, gps_lat, gps_lng en clients
- [x] Schema: open_ended, payment_day en loans
- [x] calculateInterestOnly(): período completo, si open_ended → schedule vacío + installment_amount
- [x] calculateProportionalInterest() para liquidación anticipada
- [x] NewLoanForm: checkbox "Sin límite de cuotas", campo "Día de pago", insert condicional de schedule
- [x] LoanDetail: open-ended view (sin tabla), liquidación con interés proporcional, botón Documentos con subida
- [x] Collections: open-ended loans en tabs Hoy/Vencidos/Próximos con vencimiento dinámico
- [x] Calendar: open-ended loans con próximos 12 vencimientos generados
- [x] Formulario cliente nuevo: Información Personal (nombres, apellidos, apodo, cédula, sexo), Contacto (tel, whatsapp, email), Dirección (provincia, municipio, sector, calle, número, referencia)
- [x] formatDate default → dd/mm/aaaa
- [x] Tasa de interés visible en detalle del préstamo
- [x] Filtros en lista de préstamos: por tipo (interés/francesa) y frecuencia (diario/semanal/quincenal/mensual)
- [x] Búsqueda por teléfono en lista de préstamos
- [x] Botón WhatsApp en header del préstamo (abre wa.me o copia al portapapeles si no hay teléfono)
- [x] Botón WhatsApp por pago individual en lista de pagos
- [x] Reversión de pago resetea la cuota a `status='pending'` para poder pagarla de nuevo
- [x] Modal de éxito post-pago con acciones: Descargar PDF, WhatsApp, Compartir
- [x] Fecha de pago por defecto usa zona horaria local (no UTC)
- [x] PWA: manifest.json, iconos SVG, service worker, meta tags iOS/Android
- [x] Auth: `createBrowserClient` de @supabase/ssr (cookies sincronizadas client/server)
- [x] UI responsiva iPhone 12 Mini: touch targets 44px (min-h-11), `min-w-0` en inputs date, grids stacked en mobile
- [x] Formato moneda: `formatNumber`/`formatCurrency` sin decimales → `1,234,567` (sin $ en cards, con $ en formularios)
- [x] NewLoanForm: grids responsive (stacked en mobile, 2 col tablet, 3-4 col desktop)
- [x] Deploy: Vercel + Supabase Cloud (snwwvvmszizarakrozah.supabase.co), URL estable `loan-tracker-olive-eight.vercel.app`

### Pendiente
- Nada por ahora

## Hoy — 15 Jul 2026

### Completado
- [x] **Pagos parciales**: HandlePay acepta cualquier monto; asigna primero a cuota, luego a mora
- [x] **Parcial badge**: `(paid_amount > 0 && status !== 'paid')` → badge "Parcial" en Collections cards, LoanDetail tabla amortización, Calendar cuotas
- [x] **Dropdown cuota**: Filtra `status !== 'paid'` (incluye parciales), muestra monto restante + pagado antes
- [x] **Mora dinámica**: openPayment/onChange calcula mora al abrir; checkbox toggle actualiza paymentAmount (sin mora → solo cuota restante, con mora → cuota + mora)
- [x] **Modal total summary**: Subtotal cuota + Mora = Total (solo visible cuando hay mora)
- [x] **handlePay allocation**: `paidToInstallment = Math.min(amount, remaining)`, `paidToLate = Math.max(0, amount - paidToInstallment)`
- [x] **paid_amount tracking**: `installments.update({ paid_amount: totalPaidOnInstallment })` en lugar de sobreescribir con amount total; `paid_at` solo si fully paid
- [x] **Loan stats**: `fullyPaidCount` (no paidCount) para progress/remaining; partial payments no cuentan como paid

### Fix aplicado
- [x] **isNowFullyPaid bug**: Comparaba `totalPaidOnInstallment >= installmentAmount` → si la cuota quedaba cubierta (5000/5000) marcaba `paid` aunque faltara mora. Corregido a `amount >= (remaining) + (includeMora ? totalLateAmount : 0)`
- [x] **late_amount**: Ahora guarda `totalLateAmount` (mora total calculada) en vez de `paidToLate` (solo lo pagado a mora), para que el badge en cards refleje la deuda real

### Pendiente de corregir
- Nada por ahora

## Hoy — 18 Jul 2026

### Refactor mayor (sesión 1)
- [x] **Shared payment service**, `paid_late_amount` tracking, reversión inteligente, settings en Collections, sync UI, etc.

### Fixes aplicados (sesión 2)
- [x] **CR-1**: Collections pasaba `amortization_type: 'french'` forzado — ahora usa el tipo real del préstamo (toma `amortization_type` de `inst.loan`)
- [x] **CR-2**: Reversión sumaba `capital_amount` en vez de `payment.amount` para `remaining_amount` — corregido a `payment.amount`
- [x] **CR-3**: `recalculateInstallment` ponía `paid_at = today` — ahora usa la fecha del pago más reciente
- [x] **CR-5**: Query de próximos usaba `>= today` solapándose con los de hoy — cambiado a `> today`
- [x] **CR-6**: `paidToInstallment` sin cap en `remaining` cuando `includeMora=false` — ahora siempre capped
- [x] **H-2/H-3**: Catch blocks silenciosos reemplazados con `setPaymentError()` + UI visible en modales
- [x] **H-4**: Resultado de installment update no se verificaba — ahora lanza error si falla
- [x] **H-5**: División por cero en francesa con `n=0` — guard clause añadido
- [x] **H-6**: `calculateLateDays` mezclaba UTC/local — ahora usa `differenceInCalendarDays` de date-fns
- [x] **H-10**: Mora se calculaba sobre `installment.amount` completo — ahora sobre `remaining` (saldo restante)
- [x] **H-11**: `paidCount = 0 + 1` para open-ended — saltado cuando `isOpenEnded`
- [x] **M-2**: Interest-only cerrado nunca pasaba a 'paid' — eliminado filtro `!isInterestOnly` en auto-complete
- [x] **M-6**: Pago open-ended en Cobros no actualizaba loan — ahora actualiza `paid_amount` y llama `update_client_stats`
- [x] **M-8**: Balance threshold `< 0.01` cambiado a `< 0.005` para mejor precisión
- [x] **L-3**: Montos negativos pasaban validación (`!amount`) — cambiado a `amount <= 0`
