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

### Pendiente
- Nada por ahora
