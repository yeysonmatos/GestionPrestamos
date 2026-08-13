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
- [x] Deploy: Vercel + Supabase Cloud (snwwvvmszizarakrozah.supabase.co), URL estable `gestion-prestamos-one.vercel.app` (proyecto Vercel `gestion-prestamos`)

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

## Hoy — 19 Jul 2026

### UI/UX & Branding
- [x] **Nueva paleta azul**: Primary `#2563EB`, Primary-hover `#3B82F6`, Primary-light `#60A5FA`, Accent `#8B5CF6`, Success `#22C55E`, Warning `#F59E0B`, Destructive `#EF4444`
- [x] **Sidebar navy gradient** (`#081528` → `#0F2A55`) con GP Logo.png + indicador activo morado + avatar usuario
- [x] **PWA icons actualizados**: `icon.svg` / `apple-icon.svg` con logo "GP" blanco sobre gradient azul→morado
- [x] **Sidebar fondo blanco** (reemplaza navy): `bg-white border-r border-border`, nav items con `bg-primary/10` activo, texto `text-muted-foreground`/`text-foreground`
- [x] **Icon cards fondo blanco** en Dashboard, Reports, Collections, StatCard: `bg-white border border-border` + icono `text-primary|text-success|text-destructive|text-emerald-600|text-purple-600`
- [x] **GP Logo.png unificado**: Sidebar (desktop+mobile), Login page, PWA manifest (512×512 maskable), favicon, apple-touch-icon, offline.html
- [x] **GP Login.png** para login page (imagen distinta a sidebar)
- [x] **Títulos**: "Mis Préstamos" → "Gestor de Prestamos" en Login y Sidebar; eliminada tagline "Control profesional"
- [x] **Filtros Loans unificados**: Mobile usa ActionSheet bottom sheet (igual que Clients) para filtro principal estado; Tipo y Frecuencia en sus propios ActionSheets; eliminado dropdown desktop

### LoanDetail & State
- [x] **LoanDetail restaurado con estado local**: `useState` para `loan`, `installments`, `payments` → mutaciones reactivas (pagar, abonar, liquidar, reversar) sin router.refresh()
- [x] `Progress` import corregido a named export

### Pendiente
- Nada por ahora

## Hoy — 20 Jul 2026

### LoanFilters (componente nuevo)
- [x] **LoanFilters component**: Filtros estilo MiFinanzApp — chips horizontales (Estado/Tipo/Frecuencia/Cliente), colores por categoría, badge con count, panel colapsable, resumen filtros activos removibles, date range, amount range
- [x] **UnifiedFilterSheet**: Bottom sheet unificado con secciones configurables, single/multi-select, contadores, limpiar por sección y global, botón "Aplicar (N)"
- [x] **tailwindcss-animate** + **framer-motion** instalados; ActionSheet reescrito con AnimatePresence + spring slide-up
- [x] **CSS module**: `LoanFilters.module.css` creado con transiciones, animaciones, chips, active filters summary

### Unificación / Fixes
- [x] **LoansClientUnified.tsx**: Nueva versión del listado que usa `LoanFilters` en lugar de filtros viejos; búsqueda + filtros en un solo componente
- [x] **Eliminada barra duplicada**: LoansClientUnified tenía su propio `<SearchInput>` — ahora solo LoanFilters maneja búsqueda
- [x] **CSS variables corregidas**: `LoanFilters.module.css` usaba `var(--primary)` pero Tailwind v4 define `var(--color-primary)` — reemplazadas 50 referencias a nombres correctos
- [x] **Bottom sheet en móvil**: Panel de filtros usa `AnimatePresence` + `motion.div` con slide-up desde abajo en mobile (<640px); inline en desktop
- [x] **View toggle movido**: El toggle cards/table ahora se renderiza dentro de LoanFilters (prop `viewToggle`), a la derecha del botón "Filtros"
- [x] **Importaciones limpias**: Eliminados `SearchInput`, `Funnel`, `calculateLateDays`, `search` state, `hasActiveFilters` no usados en LoansClientUnified

### Vercel Deploy
- [x] **Proyecto Vercel desconectado de GitHub**: `vercel.com/yeysonmatos/loan-tracker` muestra "No Production Deployment" — requiere conectar repositorio manualmente

### Collections Quick Payment Responsive
- [x] **BottomSheet centrado en desktop**: Cambiado `left-0 right-0` → `sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:max-w-lg` para centrar el modal en pantallas grandes
- [x] **className duplicado eliminado**: BottomSheet ya no aplica `className` al contenedor interno de contenido
- [x] **flex-shrink-0 en loan_id**: Cliente seleccionable en Quick Payment ahora tiene `flex-shrink-0` en el loan_id para evitar que se comprima
- [x] **flex-wrap en botones de monto**: Los botones 25%/50%/75%/100%/Cuota ahora envuelven en móvil con `flex-wrap`

## Hoy — 20 Jul 2026 (sesión 2)

### Fixes de persistencia de datos (críticos)
- [x] **Fix 1+8**: `handlePayInstallment` en LoanDetail.tsx ahora llama `updateLoanAfterPayment` y persiste `paid_amount`/`remaining_amount` en la tabla `loans` — evita que el pendiente vuelva al monto anterior al recargar
- [x] **Fix 1b**: Corregido `capital_amount` en `handlePayInstallment` — ahora separa capital de interés (usando `payInterestAmount`/`payCapitalAmount`) igual que `processInstallmentPayment`
- [x] **Fix 5**: `handleReversePayment` ahora resetea `status→'active'`, `progress`, `paid_installments` tras reversión; si es liquidación, recalcula todas las cuotas forzadas vía `recalculateInstallment`
- [x] **Fix 5b**: Se agregó `updateLoanAfterPayment` en reversión para recalcular métricas del préstamo desde datos reales

### Fixes de lógica de negocio
- [x] **Fix 2**: `calcCapitalRemaining` corregido — filtro invertido cambiado de excluir `capital_abono`/`installment` a incluir todos los pagos con `capital_amount > 0`
- [x] **Fix 3**: `handleCapitalAbono` ahora recalcula `installment_amount` en préstamos interest-only (nuevo interés = `newRemaining * periodicRate`), actualiza cuotas pendientes y persiste en DB
- [x] **Fix updateLoanAfterPayment**: `paidAmount` ahora incluye pagos tipo `capital_abono` y `liquidation` para préstamos no open-ended — evita que `remaining_amount` se sobreescriba con valor incorrecto tras abonos a capital

### Fixes de UI/UX
- [x] **Fix 6**: Badge de fecha en colecciones movido de la línea del nombre al subtítulo, y `flex-wrap` agregado para evitar truncamiento de nombres
- [x] **Fix 7**: Etiqueta "(C+I)" eliminada → ahora solo "Cuota" en NewLoanForm.tsx
- [x] **Progress bar**: `progressValue` en LoanDetail ahora calcula desde `installments.filter(status='paid')` si `loan.progress` es 0; mismo fix en LoansClientUnified y LoansClient

### Fixes de Dashboard/Reports
- [x] **Dashboard**: Capital recuperado ahora usa `totalCapital - pendingCapital` (con `remaining_amount` de loans activos) en vez de payments de 30 días
- [x] **Dashboard**: `overdueTotal` ahora descuenta `paid_amount` de cuotas parciales
- [x] **Dashboard**: Payments query extendido a 6 meses para gráfica mensual
- [x] **Reports**: `period` state ahora filtra loans/payments por fecha seleccionada
- [x] **Reports**: Monthly chart ya no salta meses sin payments (crea entrada si no existe)

### Pendiente
- [x] Bug 4: Fallback mejorado en historial cobros (muestra loan_id si client name es null)
- [x] **Bug 10: Sistema de Recibos post-pago**: Componente `PaymentReceipt` con formato imprimible (@media print), integrado en modal de éxito de LoanDetail y CollectionsContent. Incluye datos del negocio, cliente, préstamo, desglose (capital/interés/mora), balance anterior/nuevo. Botones PDF (print), WhatsApp, Compartir.

## Hoy — 26 Jul 2026

### Separación de lógica francesa vs interés-only (hooks)
- [x] **`loan-handler.types.ts`**: Interfaz compartida `LoanHandlerInput` (state + setters + services) que tipa los hooks de forma idéntica
- [x] **`useFrenchLoan.ts`**: Hook con los 4 handlers (`handlePayInstallment`, `handleCapitalAbono`, `handleLiquidation`, `handleReversePayment`) con lógica francesa — recalcula schedule con `recalculateFrenchSchedule` al abonar/reversar
- [x] **`useInterestOnlyLoan.ts`**: Hook con los 4 handlers con lógica interés-only — recalcula interés periódico sobre nuevo capital al abonar/reversar
- [x] **`LoanDetail.tsx` refactorizado**: Eliminados 400+ líneas de handlers inline; usa `useFrenchLoan` o `useInterestOnlyLoan` según `amortization_type`; imports limpios
- [x] **Aislamiento total**: Modificar lógica francesa (ej. fórmula de recálculo) no afecta interés-only y viceversa — archivos completamente independientes

### Pendiente
- Nada por ahora

## Hoy — 03 Ago 2026

### Panel de Administración (SaaS multi-tenant)
- [x] **Schema**: `supabase/admin-schema.sql` — tablas `app_users` (role admin/client, status active/blocked), `plans`, `subscriptions`, `subscription_payments` con RLS por rol
- [x] **RPC `is_admin()`**: guard security definer para middleware y API
- [x] **`handle_new_user` extendido**: al registrarse crea `app_users(role='client')` + suscripción `trial` (busca plan Trial) + settings
- [x] **Seed SQL comentado**: marcar tu email como admin + planes iniciales (Trial/Básico/Pro)
- [x] **Middleware**: `/admin/*` solo admin (vía RPC); login redirige admin→`/admin`, cliente→`/dashboard`; clientes con suscripción vencida/cancelada → `/suspended`
- [x] **`src/lib/admin.ts`**: `isAdminUser`, `getAdminSession`, `requireAdmin` (server), `requireAdminApi` (route handler guard + service role client)
- [x] **UI admin aislada**: `src/app/admin/*` con `AdminLayoutClient` + `AdminSidebar` (sidebar oscuro "GP Admin", separado de la app cliente)
- [x] **Páginas admin**: `/admin` (Resumen: MRR, clientes activos, por vencer, total cobrado), `/admin/users` (asignar plan, registrar pago, bloquear/desbloquear, crear usuario), `/admin/plans` (CRUD), `/admin/payments` (historial)
- [x] **API admin**: `/api/admin/users`, `/api/admin/users/[id]`, `/api/admin/plans`, `/api/admin/plans/[id]`, `/api/admin/payments` — todos con `requireAdminApi` + service role
- [x] **Pantalla `/suspended`**: suscripción vencida (client component por el icono de Phosphor que usa createContext)
- [x] **Verificado**: `npm run build` pasa (TypeScript OK). Icono del resumen es `Layout` (no `LayoutDashboard`) en esta versión de Phosphor
- [x] **Schema aplicado en Supabase**: `supabase/admin-schema.sql` ejecutado (4 tablas + RPC `is_admin` + `handle_new_user` extendido)
- [x] **Seed aplicado (vía service role)**: owner `yeysonmatos@outlook.com` (id `2863f8a1…`) marcado como **admin**; planes Trial (0 DOP) / Básico (500 DOP) / Pro (1000 DOP) creados; 3 cuentas client existentes con `app_users` + suscripción trial 14 días
- [x] **`SUPABASE_SERVICE_ROLE_KEY`** agregada a `.env.local` y `.env.production`
- [x] **Fix GoTrue 500**: `supabase/fix-auth-users.sql` — borra fila corrupta `5b37db05…` de `auth.users` (rompía `listUsers`) + crea RPC `admin_list_users()` (lee `auth.users` vía PostgREST, sin depender del endpoint GoTrue `/auth/v1/admin/users`). API `/api/admin/users` usa el RPC
- [x] **Middleware**: admin en rutas client → redirigido a `/admin` (antes solo redirigía desde `/login`)

## Hoy — 04 Ago 2026

### Retención SaaS + venta (fases 3-5, sin WhatsApp)
- [x] **Banner suscripción por vencer**: `dashboard/page.tsx` lee la suscripción del usuario; `DashboardContent` muestra banner ámbar cuando expira en ≤7 días ("Tu plan X vence el ... — contacta al administrador")
- [x] **Página `/pricing` pública**: server component que lee planes activos (RLS permite anon); 3 cards Trial/Básico/Pro con features + CTA a `/login?mode=register`. Sin iconos Phosphor (server component → usan createContext, mismo issue que `/suspended`)
- [x] **Login**: acepta `?mode=register` (abre directo el registro) + link "Ver planes" a `/pricing`
- [x] **Middleware**: `/pricing` agregado a `isPublic`
- [x] **`/account` self-service**: página cliente con plan actual (nombre, estado, inicio/vencimiento, días restantes, aviso si vence pronto) + historial de `subscription_payments`; datos del negocio desde `settings`. Ítem "Mi plan" (icono `Cardholder`) agregado al Sidebar
- [x] **Verificado**: `npm run build` OK (rutas `/account` + `/pricing` compilan), TypeScript OK, tests 35/35

## Hoy — 05 Ago 2026

### Upgrade de plan — Opción B (pago-por-plan-nuevo)
- [x] **Flujo**: cliente en Trial elige Básico/Pro → `POST /api/subscription/upgrade-request` crea una `subscription_payments` **pending** (amount = precio del plan nuevo, `target_plan_id`), ya NO un ticket de soporte
- [x] **Admin confirma en 1 acción** (`/admin/payments` o `/admin/users/[id]`): `confirm_payment` ahora resuelve `plan_id = payment.target_plan_id || sub.plan_id` → cambia el plan + extiende suscripción + audit `subscription.upgraded`
- [x] **SQL**: `supabase/sub-payment-target-plan.sql` agrega `subscription_payments.target_plan_id UUID → plans(id)`; `supabase/support-tickets-type.sql` agrega `support_tickets.type`
- [x] **Tickets de upgrade eliminados del flujo** (AdminUserDetail conserva código muerto inofensivo)
- [x] **Verificado**: `npx tsc --noEmit` y `npm run build` OK

### Pendiente (WhatsApp descartado — no se usará)
- ~~WhatsApp Cloud API~~ **descartado**: no se integra WhatsApp. Notificaciones solo por email (Resend).
- [x] **`RESEND_API_KEY` configurada** en `.env.local` y `.env.production` → notificaciones de correo activas (soporte, upgrades, pagos, recordatorios, vencimientos). Plan gratis Resend: 3,000 emails/mes, 100/día.
- [ ] **(Opcional futuro)** Job cron recordatorio automático: `POST /api/cron/daily` con `CRON_SECRET` + `vercel.json`.

## Hoy — 06 Ago 2026

### DOP-only (solo mercado dominicano)
- [x] **SQL**: `plans.currency` default `'DOP'` (admin-schema.sql), seed RD$ (Básico 500 / Pro 1000), `cleanup.sql` reset → `'DOP'`. Columna `currency` queda inerte (sin migración DROP)
- [x] **Tipos**: eliminado `Currency` + `CURRENCIES` de `src/types/index.ts`; `COUNTRIES` recortado a solo República Dominicana
- [x] **UI**: selectores de moneda eliminados de `SettingsContent.tsx` y onboarding (DOP fijo); `AdminPlans.tsx` y `AdminUsers.tsx` sin campo currency
- [x] **API**: `/api/admin/plans` (POST) escribe `currency: 'DOP'`; `plans/[id]` ya no actualiza currency; `/api/export` CSV sin columna "Moneda" (loans no tiene esa columna)

### Unificación de pagos admin
- [x] **`src/lib/billing.ts`**: `recordSubscriptionPayment()` — núcleo único que registra/confirma pago, extiende suscripción (upgrade con `target_plan_id` conserva `ends_at`, renovación extiende ciclo) y escribe `audit_logs`
- [x] **`POST /api/admin/payments`** (pago directo) y **`confirm_payment`** en `PATCH /api/admin/users/[id]` delegan en el mismo helper — un solo punto de verdad

### Métricas y escalabilidad
- [x] **`supabase/admin-stats.sql`**: RPC `admin_usage_stats(p_from_month)` — agregación 100% en SQL (ingresos por mes, usuarios por plan, conversión sin ventana de meses, MRR, counts). **Aplicado en Supabase**
- [x] **`/api/admin/stats`** reescrito para usar el RPC (deja de cargar tablas completas y agregar en JS)
- [x] **`GET /api/admin/users/[id]`**: loans/clients/payments ahora filtrados por `user_id` (antes cargaba TODA la BD de todos los usuarios); eliminado refiltrado en JS
- [x] **`GET /api/admin/users` (listado)**: reescrito para usar RPC `admin_usage_by_user()` — los conteos de uso (loans/clients/payments por usuario) se agregan en SQL; ya no carga las tablas completas
- [x] **MRR unificado**: `AdminOverview` usa `mrr`/`total_collected`/`recent_payments` del RPC (eliminada dependencia de `/api/admin/payments`); RPC `users_per_plan` ahora incluye `name`
- [x] **Errores 400**: `BillingError` en `billing.ts`; `POST /api/admin/payments` devuelve 400 para errores de negocio (sin suscripción, solicitud ya procesada, monto ≤0)
- [x] **Tests nuevos**: `src/lib/__tests__/billing.test.ts` — `computeUpgradeAmount` (prorate) + `recordSubscriptionPayment` (pago directo, confirmación pending, upgrade conserva ends_at, BillingError). **41/41 tests pasando**
- [x] **Paginación `/admin/payments`**: servidor — `GET /api/admin/payments` ahora acepta `page`/`page_size` (default 20, max 100), usa `.range()` y devuelve `total` (conteo con `count:'exact'`, mismos filtros), `total_amount` (suma de no-rechazados) y `counts` globales por estado. UI: `AdminPayments.tsx` con botones Anterior/Siguiente y reset a página 1 al filtrar
- [x] **Paginación `/admin/users`**: cliente (porque filtra en cliente) — `AdminUsers.tsx` pagina `filteredUsers` a 10/página con controles y reset al cambiar filtro
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41

### Pendiente
- Rotación de tokens (service_role + access token) — aplazada por el usuario

## Hoy — 06 Ago 2026 (sesión 2)

### Fixes críticos del panel admin
- [x] **Fix payJSON 500 en rutas admin**: `createRouteHandlerClient` en `src/lib/supabase-route.ts` usaba `NextResponse.next()` → **prohibido en app route handlers** (`NextResponse.next() was used in a app route handler, this is not supported`), causaba 500 con body vacío → client roto en `.json()`. Cambiado a `new NextResponse()` acumulando Set-Cookie; impacta todas las rutas admin y de app que propagan `supabaseResponse`.
- [x] **Fix métricas admin (is_admin guard)**: `supabase/admin-stats.sql` — el RPC `admin_usage_stats` tenía `IF NOT public.is_admin() THEN RAISE`. `is_admin()` chequea `auth.uid()`, NULL bajo service_role (cliente del API admin) → siempre 403/"Acceso denegado" → MRR/total/count eran 0. Eliminado el guard y protegido con `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.admin_usage_stats(text) TO service_role;`. Ahora MRR calcula precios reales, `total_collected` suma confirmados, planes por suscripción más reciente.
- [x] Verificado con datos: MRR RD$1,000 (2×Básico), Total cobrado RD$7,000, Suscripciones activas 2, Trial→Pago 67%, Usuarios por plan Básico 2/Trial 1.

## Hoy — 09 Ago 2026 (sesión 1)

### Auditoría entendible para el prestamista
- [x] **`src/lib/audit-ui.ts` reescrito**: `detailsSummary` ahora produce frases legibles por `action`/`entityType` en lugar de volcar `details` crudos. `ACTION_LABELS` agrega `subscription.upgraded` ("Cambio de plan"), traduce `subscription.rejected`, corrige duplicado de `subject` (ticket mostrará "Asunto: …"). Monedas formateadas `RD$…`, fechas de backup como `09/08/2026 12:51`, `open_ended` como "sí/no", tabla de claves conocidas (evita filtrado de raw). Labels de settings más claros ("Mora diaria", "Prefijo de ID", "Días de gracia").

### Eliminación de préstamos: borrado real + pagos conservados
- [x] **`supabase/delete-preserve-payments.sql`** (aplicado): `payments.loan_id` pasa de `ON DELETE CASCADE` a `ON DELETE SET NULL` (nullable); RLS de payments ampliada a `auth.uid() = payments.user_id OR EXISTS(loans del usuario)` (pagos huérfanos legibles); `update_client_stats.total_paid` ahora suma `payments.capital_amount` (status paid) en vez de `loans.paid_amount` → lo cobrado sobrevive al borrado.
- [x] **`DELETE /api/loans/[id]`**: lee el préstamo antes de borrar; tras borrar registra auditoría `loan.deleted` (label ya existía en `audit-ui.ts`) y llama `update_client_stats`.
- [x] **`LoanDetail.tsx`**: botón papelera (Trash) en header → `BottomSheet` de confirmación que avisa que cuotas se eliminan, pagos cobrados siguen en Dashboard/Reportes y documentos quedan en el cliente → `fetch DELETE` → redirige a `/loans`. Variante `danger` de Button/Alert ya existía.
- [x] **"Capital recuperado" ahora viene de los pagos** (no de restar lo pendiente): Dashboard (`capitalPayments` query + `DashboardContent.recoveredCapital = Σ capital_amount`) y Reports (`ReportsContent.recoveredCapital = Σ payments.capital_amount`). Resuelve que la parte de capital ya cobrada por cuota no se pierda al borrar el préstamo.
- [x] **Schema sincronizado**: `schema.sql` y `security-guards.sql` actualizados (FK SET NULL, RLS, `update_client_stats`).
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, migración aplicada (FK `confdeltype='n'`, policy RLS correcta). Desplegado en staging `gestion-prestamos-8m6bn6h8e…` → alias `staging-gestion-prestamos.vercel.app`.

### Pendiente
- Probar el flujo completo en staging: prestar → cobrar cuota → borrar préstamo → Dashboard/Reportes conservan el pago y "capital recuperado".

## Hoy — 09 Ago 2026 (sesión 2)

### Revisión integral del borrado de préstamos — correcciones
- [x] **Fix coherencia Dashboard**: eliminado `.limit(50)` de la query `loans` → las tarjetas Prestado/Pendiente/Recuperado usan todos los préstamos; tarjeta renombrada a **"Capital Recuperado (histórico)"** (aclara que incluye préstamos borrados).
- [x] **Fix Reportes exactos**: eliminado `.limit(100)` en la query de `payments` pagados → ingresos/recuperado del período exactos; tarjeta renombrada a **"Capital recuperado (período)"**.
- [x] **Fix "Total pagado" del cliente**: `update_client_stats.total_paid` pasa de `SUM(capital_amount)` a `SUM(amount)` (capital + interés + mora) → refleja todo lo que el cliente pagó y sigue sobreviviendo al borrado. Aplicado en `schema.sql`, `security-guards.sql`, `delete-preserve-payments.sql`.
- [x] **Fix RLS payments endurecida**: política única `FOR ALL` reemplazada por dos — **SELECT** `auth.uid() = payments.user_id OR EXISTS(préstamo propio)` (pagos huérfanos legibles) y **INSERT/UPDATE/DELETE** solo `EXISTS(préstamo propio)` (un pago huérfano ya no se puede modificar ni reasignar a otra cuenta). En `schema.sql` y `delete-preserve-payments.sql`.
- [x] **Fix texto del modal**: "seguirán contando en tu Dashboard e historial" (se quitó la promesa sobre Reportes).
- [x] **Fix aviso saldo a favor**: `LoanDetail.tsx` muestra línea ámbar en el modal de borrado cuando `loan.prepaid_balance > 0` ("se perderá al eliminar").
- [x] **`supabase/post-delete-review.sql` + `scripts/exec-post-delete-review.mjs`**: migración idempotente que aplica los fixes SQL (total_paid + RLS) a la BD en producción.

## Hoy — 09 Ago 2026 (sesión 3)

### Borrado lógico (soft delete) reemplaza al borrado físico
- [x] **Decisión**: el borrado físico generaba pagos huérfanos, exigía apretar RLS y perdía el saldo a favor. Se migró a **archivado** (`loans.deleted_at TIMESTAMPTZ`): el préstamo desaparece de las listas pero su historial, cuotas, pagos y documentos se conservan. Aprobado por el usuario.
- [x] **`supabase/soft-delete-loans.sql` + `scripts/exec-soft-delete-loans.mjs`** (aplicado): columna `deleted_at` + índice `loans(user_id, deleted_at)`; `update_client_stats` excluye préstamos archivados de los agregados de préstamos (`total_paid`/`last_payment_at` siguen sumando pagos de archivados).
- [x] **`DELETE /api/loans/[id]`** ahora hace `UPDATE loans SET deleted_at=now(), status='cancelled'` (mantiene auditoría `loan.deleted` + `update_client_stats`).
- [x] **Filtros `.is('deleted_at', null)`** (préstamos) y `.is('loan.deleted_at', null)` (cuotas vía join) en: listado préstamos (page + api), detalle/edición (PATCH y edit → 404 si archivado), Dashboard (loans + overdue/upcoming), Collections (page + api + open-ended + QuickPayment), Calendar (page + api + open-ended), Reportes (loans; payments conservan historial), clientes (lista + perfil), export, loan-status (page + cron), y pagos (POST bloquea préstamos archivados).
- [x] **Modal LoanDetail** actualizado: dice que se **archiva**, que cuotas/pagos/documentos se conservan y que el **saldo a favor no se pierde** (se quitó el aviso ámbar de pérdida).
- [x] **Tipo `Loan.deleted_at`** agregado; fixtures de tests actualizados.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, migración aplicada, prueba transaccional ROLLBACK (5/5 OK: préstamo sigue en BD, deleted_at+cancelled, pago conserva loan_id, capital recuperado incluye, listado lo oculta) y 0 residuos.

## Hoy — 10 Ago 2026 (sesión 2)

### Auditoría entendible: nombre + N° de préstamo en todos los eventos
- [x] **Auditoría con nombre del cliente**: `DELETE /api/loans/[id]` ahora lee `client:clients(name)` y guarda `details.client_name`; `detailsSummary` (audit-ui) muestra "Cliente: {nombre} · N°: {loan_id}" en Préstamo eliminado — aplica a settings/AdminAudit/AdminUserDetail. Solo los borrados futuros lo incluyen (los antiguos no tenían el dato).
- [x] **Auditoría completa: nombre + N° en todos los eventos de préstamo/pago**: `detailsSummary` (audit-ui) ahora muestra `Cliente: {nombre}` y `N°: {loan_id}` también para eventos de tipo `payment` (Pago registrado/revertido/Abono a capital — antes solo tenían monto/mora/motivo, y el N° era el UUID en vez del visible). Detalles actualizados: `loan.liquidated` ahora guarda `loan_id` + `client_name` (antes ni el N° ni el cliente); `loan.created` (NewLoanForm) agrega `client_name` desde la lista de clientes; `loan.updated` (PATCH /api/loans/[id]) agrega `client_name` desde el embed `client:clients(*)`; `payment.recorded`/`capital_abono`/`payment.reversed` en `useSharedLoanHandlers` y `CollectionsContent` guardan `loan_id` visible (`loan.loan_id`/`inst.loan.loan_id`) + `client_name`. El `N°` que se muestra es el visible (ej. `L-558094`), no el UUID.

### Fix capital pendiente: solo principal (no interés programado)
- [x] **Bug confirmado por el usuario**: en francesa, `loans.remaining_amount` incluye el interés programado de las cuotas por vencer → "Capital Pendiente" se inflaba (40,000 ≠ 36,535 + 3,965 = 40,500). El interés ya tiene su indicador propio ("Total Intereses proyectados" / "Intereses cobrados"); el capital pendiente debe ser SOLO principal.
- [x] **`supabase/loan-stats.sql` (re-escrito)**: `pending_capital`, `active_capital` y `late_capital` ahora = `GREATEST(0, amount − Σ payments.capital_amount pagado)` vía subconsulta por lao (LEFT JOIN de pagos agrupados), NO `remaining_amount`. Se cumple la identidad contable **Prestado = Recuperado + Pendiente**.
- [x] **Verificado en BD real (cuenta `babfefb8…`)**: Prestado 40,000 = Recuperado 36,534.74 + Pendiente 3,465.26 (antes 3,965 inflado con ~500 de interés). El RPC devuelve NULL a la Management API (guard de seguridad, rol no superuser) y funciona con el JWT del usuario en la app — comportamiento esperado.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, migración `scripts/exec-loan-stats.mjs` aplicada (201). Aplazado deploy hasta sesión de auditoría (ya desplegada juntas en siguiente linea).

## Hoy — 09 Ago 2026 (sesión 4)

### RPC centralizado `get_loan_stats` (fuente única de "capital recuperado")
- [x] **Decisión**: antes cada pantalla calculaba sus métricas en JS desde arrays descargados (`Dashboard` historial completo, `Reportes` período con filtros). El objetivo era un solo punto de verdad en SQL para que las tarjetas no difieran ni dependan del `.limit()` de las queries.
- [x] **`supabase/loan-stats.sql` + `scripts/exec-loan-stats.mjs`** (aplicado): `public.get_loan_stats(p_user_id, p_from_date DEFAULT NULL)` SECURITY DEFINER. Devuelve jsonb con `total_capital`, `recovered_capital`, `pending_capital`, `generated_interest`, `collected_interest`, `active_capital`, `late_capital`, `active_loans`, `outstanding_loans` (activos+morosos), `paid_loans`, `late_loans`, `active_clients`, `late_clients`.
- [x] **Guarda de seguridad**: `auth.uid()` debe ser NULL (con rol superuser) o igual a `p_user_id`; si no, devuelve NULL. Verificado: sin JWT la management API (rol postgres sin superuser) recibe NULL (bloqueado) — en la app el JWT del usuario coincide con `p_user_id`.
- [x] **Exclusión de archivados**: préstamos con `deleted_at NOT NULL` fuera de los agregados de préstamos; pagos históricos (`capital_amount`/`interest_amount` de `payments`) siempre suman.
- [x] **Dashboard** (`page.tsx` + `DashboardContent.tsx`): elimina la query `capitalPayments` y `clients`; usa `loanStats` para Capital Prestado/Recuperado/Pendiente/Intereses y Clientes activos/morosos. Tarjeta renombrada antes "Capital Recuperado (histórico)" se mantiene con `stats.recovered_capital` (sin fecha → historial completo).
- [x] **Reportes** (`page.tsx` + `ReportsContent.tsx`): llama el RPC con `p_from_date = effectiveFilterDate ?? null` (período en reportes avanzados, histórico en 'all'). Elimina la query `clients` y el `useMemo` de cálculos; `portfolioHealth` se deriva de `active_capital`/`late_capital` del RPC. `statusData` usa `outstanding_loans`/`paid_loans`/`late_loans`.
- [x] **Tipo `LoanStats`** agregado a `src/types/index.ts`; `EMPTY_STATS` fallback en ambos componentes si el RPC devuelve null.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, función presente en BD y agregaciones internas validadas con datos reales (total 581K, recuperado 92.9K, pendiente 528.2K, 24 en curso).
- [ ] **(Pendiente)** Desplegar sesión 4 a staging.

## Hoy — 09 Ago 2026 (sesión 5)

### Fix de raíz: mora por cuotas vencidas + UI de listado
- [x] **Causa del bug "Clientes morosos 0 / Salud cartera 100%"**: el cron de mora pinta los préstamos con `late_1_30/31_60/61_90` (nunca `late`), y el RPC contaba morosos solo con `status='late'` exacto → siempre 0. Confirmado en BD: cuenta `bab…` tenía RD$97,702 en cuotas vencidas y 0 préstamos marcados late.
- [x] **`supabase/loan-stats.sql` re-escrito**: `late_loans`, `late_capital`, `late_clients` y `active_capital`/`active_loans` se calculan con las **cuotas realmente vencidas** (subconsulta `late_loan_ids`: `installments.status IN (pending,partial,late) AND due_date < CURRENT_DATE`), no por estado del préstamo. Mora contada **"vencida hoy"** sin respetar período de Reportes (decisión del usuario); movimiento (prestado/recuperado/interés) sí respeta `p_from_date`. `pending_capital` incluye `late_*`. Aplicado y verificado: cuenta `bab…` → 3 préstamos morosos, 2 clientes morosos, RD$184,509.97 en capital moroso.
- [x] **Dashboard**: tarjeta renombrada a **"Total capital recuperado"** (sin "(histórico)").
- [x] **Reportes**: eliminado `.limit(100)` de la query de préstamos (`reports/page.tsx`) → gráfico "Ingresos vs Préstamos" usa todos los préstamos.
- [x] **Listado de préstamos** (`LoansClientUnified.tsx` + `LoanFilters.tsx`): el default ahora es **"En curso"** (`status='active'`), que incluye activos + atrasados `late_*`. Los **pagos no salen mezclados**; solo se ven con el filtro "Pagados" (o "Todos"). `clearStatus`/`clearAll` vuelven a "En curso". Chip "Activos" renombrado a **"En curso"**. Lógica de "filtros activos"/EmptyState trata `'active'` como default (sin badge fantasma). Contadores del chip agregan `late_*` a En curso/Atrasados.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, datos reales con mora detectada.
- [x] **(Desplegado)** sesión 4+5 a staging (alias `staging-gestion-prestamos.vercel.app`).

## Hoy — (sesión 6)

### Fix del nivel de confianza (trust_score) + etiquetas Dashboard
- [x] **Causa raíz**: `update_client_stats` contaba morosos con `status='late'` exacto (que el cron nunca deja) → `late_loans` siempre 0 → todos quedaban "Alto 75/90" aunque debieran mora real.
- [x] **`supabase/client-stats-fix.sql` + `scripts/exec-client-stats-fix.mjs`** (aplicado): `update_client_stats` ahora cuenta mora real por cuotas vencidas (`installments.status IN (pending,partial,late) AND due_date < CURRENT_DATE`, no archivados) — mismo criterio que `get_loan_stats`; `active_loans`/`balance` incluyen `late_1_30/31_60/61_90`. Misma fórmula (50 +25/no-mora +15/pagados −10/moroso, ≥75 Alto / ≥40 Medio / <40 Bajo) y todas las copias sincronizadas (schema, security-guards, delete-preserve, soft-delete, post-delete-review).
- [x] **Guarda de seguridad corregida**: Supabase Cloud no da `postgres` como superuser → la invocación desde cron/management retornaba temprano y nunca actualizaba. Ahora acepta `current_user='postgres'` además de superuser.
- [x] **Cron `recalc-client-stats-daily`** re-registrado en BD con nuevo SQL (incluye `late_*` + `deleted_at IS NULL`); comentario actualizado en schema.sql.
- [x] **Re-procesado**: 29 clientes recalculados. Verificado en BD: cliente con 2 préstamos vencidos pasó de "Alto 75%" a **"Bajo 30"**; distribución 27 Alto / 1 Medio / 1 Bajo.
- [x] **Dashboard** (`DashboardContent.tsx`): tarjetas renombradas a **"Total Capital Prestado"**, **"Total Capital Pendiente"**, **"Total Intereses proyectados"**.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41. Desplegado a staging.
- [ ] **(Pendiente)** Desplegar sesión 6 a producción (vercel --prod).

## Hoy — (sesión 7)

### Eliminación de préstamo: confirmación clara, motivo y banner
- [x] **Modal de eliminación** (`LoanDetail.tsx`): texto cambiado a **"Seguro que deseas eliminar el préstamo {loan_id} de {monto}?"** + nota "Los pagos ya cobrados seguirán contando en tu Dashboard e historial y los documentos seguirán guardados en el cliente". Campo **"Motivo de eliminación (opcional)"** (textarea 300 chars) → state `deleteReason`.
- [x] **`supabase/delete-loan-reason.sql` + `scripts/exec-delete-loan-reason.mjs`** (aplicado): columna `loans.deleted_reason TEXT`; sync en `schema.sql` + tipo `Loan.deleted_reason` (+ fixtures de tests y objeto Loan de CollectionsContent). Borrado lógico mantiene la fila → el motivo persiste.
- [x] **`DELETE /api/loans/[id]`**: lee `body.reason`, lo persiste como `deleted_reason` en el préstamo y en `audit_logs.details.reason` (audit-ui ya muestra "Motivo: …").
- [x] **Banner post-eliminación**: `handleDeleteLoan` navega a `/loans?deleted=<loan_id>&amount=<monto>`; `loans/page.tsx` lee `searchParams` y lo pasa a `LoansClientUnified`, que muestra `Alert variant="success"`: **"El préstamo {loan_id} de {monto} fue eliminado."** con botón "Entendido".
- [x] **Cabecera responsive 375px** (`LoanDetail.tsx`): contenedor pasa a `flex flex-col sm:flex-row` (botones en fila propia debajo en móvil) + botones con `flex flex-wrap gap-1` — deja de distorsionarse el header. Icono `Warning` sin uso eliminado del import.
- [x] **Ajustes post-feedback**: quítado el botón "Entendido" del banner (desaparece al navegar a otro menú; `LoansClientUnified` hace `router.replace('/loans')` al montar para limpiar los query params y que no reaparezca al volver). La pregunta del modal de eliminación adopta el mismo formato que la nota inferior: caja `bg-red-50 border-red-200` con icono `Trash`, texto `text-sm text-muted-foreground`.
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41, migración aplicada. Desplegado a staging (`staging-gestion-prestamos.vercel.app` + preview `gestion-prestamos-ponqh1ip0-ymatos-projects.vercel.app`).

### Verificación post-borrado (10 Ago) — Fix: filtro embedded `!inner`
- [x] **Verificado en BD**: tras eliminar préstamos de prueba, todas las tarjetas concuerdan (Capital prestado/recuperado/pendiente/intereses, préstamos act/pag, clientes) porque vienen del RPC `get_loan_stats` que excluye `deleted_at`. El RPC es la fuente única y da números correctos.
- [x] **Bug encontrado**: "Cobros vencidos 97,702" y "Próximos pagos" del Dashboard mostraban cuotas de préstamos **borrados**. Causa: `.is('loan.deleted_at', null)` sobre el embed `loan:loans(...)` NO filtra las filas padre en PostgREST (solo recorta el embed que queda `null`). Verificado directo en la API: sin `!inner` devuelve las 15 cuotas vencidas de borrados; con `!inner` devuelve 0.
- [x] **Fix aplicado (11 queries en 6 archivos)**: `dashboard/page.tsx` (overdue+upcoming), `collections/page.tsx` (hoy/vencidos/próximos), `calendar/page.tsx` (installments), `loans/page.tsx` (pendingInstallments), `api/calendar/route.ts`, `api/collections/route.ts` — el select embedido pasa a `loan:loans!inner(...)` (inner join → solo cuotas cuyos préstamos NO estén archivados). Las queries de `payments` con historial de borrados se mantienen intactas (correcto por diseño).
- [x] **Verificado**: `npx tsc --noEmit` OK, `npm run build` OK, vitest 41/41. Desplegado a staging.
- [x] **Explicación números Dashboard/Reportes**: tras borrados, Prestado 40,000 = L-712626+L-059608 (no archivados), Recuperado 36,535 = Σ capital pagado, Pendiente 3,465 = saldo L-059608, Intereses proyectados 49,850 = Σ total_interest no archivados. El RPC excluye `deleted_at`; solo los pagos históricos de borrados siguen sumando al recuperado.
- [x] **Auditoría con nombre del cliente**: `DELETE /api/loans/[id]` ahora lee `client:clients(name)` y guarda `details.client_name`; `detailsSummary` (audit-ui) muestra "Cliente: {nombre} · N°: {loan_id}" en Préstamo eliminado — aplica a settings/AdminAudit/AdminUserDetail. Solo los borrados futuros lo incluyen (los antiguos no tenían el dato).
- [x] **Auditoría completa: nombre + N° en todos los eventos de préstamo/pago**: `detailsSummary` (audit-ui) ahora muestra `Cliente: {nombre}` y `N°: {loan_id}` también para eventos de tipo `payment` (Pago registrado/revertido/Abono a capital — antes solo tenían monto/mora/motivo, y el N° era el UUID en vez del visible). Detalles actualizados: `loan.liquidated` ahora guarda `loan_id` + `client_name` (antes ni el N° ni el cliente); `loan.created` (NewLoanForm) agrega `client_name` desde la lista de clientes; `loan.updated` (PATCH /api/loans/[id]) agrega `client_name` desde el embed `client:clients(*)`; `payment.recorded`/`capital_abono`/`payment.reversed` en `useSharedLoanHandlers` y `CollectionsContent` guardan `loan_id` visible (`loan.loan_id`/`inst.loan.loan_id`) + `client_name`. El `N°` que se muestra es el visible (ej. `L-558094`), no el UUID.

## Hoy — 10 Ago 2026 (sesión 8)

### Rediseño "Calendario de pagos" como lista financiera compacta (estilo ERP/financiero)
- [x] **`src/components/loans/InstallmentRows.tsx` (componente nuevo, genérico y reutilizable)**: lista de filas compactas de 2 líneas con separación sutil (`divide-y`) — reemplaza el grid de cards grandes del detalle de préstamo y se reutiliza en Calendar y Collections.
  - **Línea 1**: `leading` (`#03` o nombre de cliente) · fecha `formatDate(due_date,'dd MMM yyyy').toUpperCase()` → "04 NOV 2026" · monto (`remaining` o completo si pagada) · badge estado con emoji · botón "Pagar" discreto (solo si saldo>0 y se pasa `onPay`; `stopPropagation`) · chevron `›` rotativo si `showDetail`.
  - **Línea 2** (estado): pagada → "Cobrado {fecha}" (success); parcial → "Pagado {X} de {Y}"; pendiente → "Pendiente {X} · Mora {Y} ({días} días)" (mora solo si >0). `subtitle` opcional añade texto extra (ej. `Cuota #N · L-xxx`); `statusLine={false}` la oculta.
  - **Estados con emoji**: `✓ Pagado`, `◐ Parcial`, `⚠ Vencida` (nomenclatura nueva, antes "Atrasado"), `⏳ Pendiente`. Mapeo a variantes Badge paid/active/late.
  - **Expandible** (`showDetail`): click en fila → detalle Capital/Interés/Saldo (o Interés/Balance si `interestOnly`) + barra de progreso con %.
  - **Props**: `installments`, `leading`, `subtitle`, `onPay`, `payLabel` (default "Pagar", Collections usa "Cobrar"), `interestOnly`, `showDetail`, `statusLine`. Componente genérico `<T extends InstallmentRowData>` → sin casts en los consumidores.
- [x] **`LoanDetail.tsx`**: grid de cards reemplazado por `<InstallmentRows installments onPay interestOnly showDetail />`; el handler de pago extraído a `openPayModal(inst)` (setPaymentInstallmentId + mora con `calculateLateDays`/`calculateLateAmount` + includeMora + paymentAmount + showPayment). Las 4 tarjetas resumen (Pendientes/Pagadas/Por cobrar/Mora total) se conservan.
- [x] **`CalendarContent.tsx`**: filas compactas viejas reemplazadas por `<InstallmentRows installments={[inst]} leading={cliente} subtitle="Cuota #N | mensual" statusLine={false} />` (solo lectura). Import `Badge` eliminado.
- [x] **`CollectionsContent.tsx`**: cards del listado (avatar + badges Hoy/Atrasado + botón Cobrar ancho) reemplazadas por `<InstallmentRows leading={cliente} subtitle="Cuota #N · L-xxx" onPay={openPayment} payLabel="Cobrar" />`. Imports `Badge` y `CurrencyDollar` eliminados.
- [x] **Verificado**: `npx tsc --noEmit` OK, vitest 41/41, `npm run build` OK (Next 16.2.10, 45 rutas).
- [ ] **(Pendiente)** Desplegar sesión 8 a staging (`vercel --prod` con token vcp_...).

## Hoy — 11 Ago 2026

### Badge de atraso dinámico + mora inmediata
- [x] **`lateStatusLabel(status, lateDays)`** en `src/lib/utils.ts`: "Atrasado Nd" para `late`/`late_1_30`/`late_31_60`/`late_61_90`. Aplicado en cards/tabla de `LoansClientUnified` y header de `LoanDetail`.
- [x] **`computeLateStatus`** en `src/lib/loan-status.ts`; `NewLoanForm` y `PATCH /api/loans/[id]` pinta `status`+`late_days` al crear/editar si hay cuotas vencidas → la mora aparece **de inmediato** (no al día siguiente). Script `scripts/repaint-loan-statuses.mjs` repintó préstamos existentes.
- [x] **Decisión usuario**: el badge cuenta días calendario desde el vencimiento SIN días de gracia; la mora en RD$ sí aplica tras la gracia.
- [x] Card de préstamo: solo fecha de inicio (se quitó próximo vencimiento) y línea duplicada de días atrasados.
- [x] **Stripe eliminado** en 4 pantallas: LoansClientUnified, ClientsClient (borrado `statusColorMap`), CollectionsContent, ClientProfile.
- [x] **Ruido visual**: ClientsClient sin badge de trust, badge de estado solo si `status !== 'active'`; Collections botón "Cobrar" sin icono.
- [x] **Etiquetas de saldo**: "Saldo pendiente" → **"Total por cobrar"** (perfil), "Saldo:" → **"Por Cobrar:"** (card clientes y card préstamos). La fórmula NO cambió (`balance` = Σ `remaining_amount`, incluye interés programado — decisión del usuario).
- [x] **Perfil cliente unificado**: pestaña "Préstamos (N)" muestra todos los no-archivados (activos primero, pagados al final con badge verde "Pagado"); card de pagado muestra **"Cobrado RD$… · fecha"** (`paid_amount`/`paid_at`).
- [x] **Fix pestaña del perfil**: filtro ahora `status==='active' || isLateStatus()` (las cuotas repintadas `late_*` ya contaban).

### Clientes inactivos automáticos
- [x] **`supabase/client-status-auto.sql` (aplicado)**: `update_client_stats` marca `clients.status = CASE WHEN v_active_loans > 0 THEN 'active' ELSE 'inactive' END` (v_active_loans = préstamos `active`/`late*` no archivados). Cron `recalc-client-stats-daily` pasa a reevaluar **todos** los clientes + backfill. 6 copias de la función sincronizadas (schema, security-guards, delete-preserve, soft-delete, post-delete-review, client-stats-fix).
- [x] **`POST /api/clients`** inserta `status: 'inactive'` (cliente nuevo nace inactivo) → al crearle un préstamo pasa a "Activo" al instante; al archivar el último vuelve a "Inactivo".
- [x] **`getStatusLabel`** incluye `inactive: 'Inactivo'`; badge gris (`bg-muted-foreground`) y filtro "Inactivos" en la lista ya funcionaban.
- [x] **Fix selector Nuevo préstamo**: `loans/new/page.tsx` filtraba `status='active'` y ocultaba clientes inactivos → se quitó el filtro.

### Deploy
- [x] **Staging**: preview + alias (`staging-gestion-prestamos.vercel.app`), producción `gestion-prestamos-one.vercel.app` **intacta**. Verificado en staging: todo funciona.
- [ ] **(Pendiente)** Producir: mismo build a `vercel --prod` cuando el usuario lo decida.