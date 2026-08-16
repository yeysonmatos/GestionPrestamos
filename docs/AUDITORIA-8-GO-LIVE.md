# Auditoría 8 — Preparación para Producción (Go Live)

**Fecha inicial:** 13 Ago 2026 — **Fecha de consolidación:** 16 Ago 2026
**Alcance:** Rendimiento, Escalabilidad, Seguridad, Pruebas, Respaldo, Recuperación, Logs, Monitoreo, Versionado, Manejo de errores, UX, Cumplimiento.
**Método:** Revisión de código (Next.js 16.2.10 + Supabase) + pruebas reales de la BD de producción (PostgREST con anon/service role) + verificación directa del código + `npx tsc --noEmit`, `npx vitest run` (46/46 ✔) y `npm run build` (46 rutas ✔).

> Esta versión es una **consolidación**: re-verifica cada hallazgo del 13 Ago contra el código/BD actual (sesiones de hardening del 13-16 Ago aplicadas) y re-puntúa.

---

## ✅ PUNTUACIÓN GENERAL: **69 / 100** — LISTO PARA GO-LIVE CONDICIONADO

Las vulnerabilidades críticas/explotables (S1-S3) fueron **corregidas y re-verificadas**. La funcionalidad de negocio está completa y robusta. Quedan **2 ítems de resiliencia de datos (A1, A2)** como condición de go-live y una cola de mejoras de monitoreo/escalabilidad para la semana 1.

---

## 📊 CALIFICACIÓN POR MÓDULO (13 Ago → 16 Ago)

| Módulo | 13 Ago | 16 Ago | Comentario |
|---|---|---|---|
| Cumplimiento de requisitos | 90 | **90** | Sin cambios; flujos completos, RPCs contables correctos |
| Pruebas | 78 | **80** | 46/46; núcleo financiero y billing cubiertos; hooks de orquestación siguen sin tests |
| UX | 75 | **82** | Error boundaries añadidos; SW corregido; recovery de contraseña funcional (correo integrado) |
| Versionado | 72 | **75** | Migraciones aplicadas y scripts idempotentes; AGENTS.md aún desincronizado en 1 punto |
| Logs | 68 | **72** | Cron `cleanup-audit-logs-weekly` **activado** (antes comentado); audit_logs traducido |
| Rendimiento | 66 | **78** | Índice `payments(user_id,status)` creado; `get_loan_stats` filtra por `user_id` en todas las subqueries |
| Manejo de errores | 55 | **78** | Boundaries + `req.json().catch` + montos validados + hooks con setPaymentError |
| Escalabilidad | 50 | **55** | N+1 en loan-status y middleware multi-consulta persisten; paginación simplificada |
| Respaldo | 45 | **50** | Aún **manual** (sin cron de backup, sin compresión/retención); bucket y RLS correctos |
| Recuperación | 40 | **40** | Restore **no transaccional** (borra-antes-de-insertar); sin checksum ni validación de manifest |
| Monitoreo | 35 | **38** | Sin uptime checks, alertas, Sentry ni Analytics |
| Seguridad | 35 | **88** | S1-S3 cerrados y verificados; REVOKEs + guardas + whitelists + headers + MFA activo |

---

## ✅ LO QUE SE CORRIGIÓ DESDE EL 13 AGO (verificado en código/BD)

### S1. RPCs expuestos a anónimos → **CORREGIDO**
- `reconcile_money(UUID)`: guarda interna `auth.uid() IS NULL AND current_user='postgres'`, `REVOKE ALL FROM PUBLIC/anon` + `GRANT authenticated/service_role` (`supabase/security-hardening.sql:15,132-135`).
- `admin_list_users()`: `REVOKE FROM PUBLIC/anon/authenticated`, `GRANT service_role` (`security-hardening2.sql:13-16`).
- `admin_usage_stats(TEXT)`: ídem (`security-hardening2.sql:21-24`).
- `update_all_loan_statuses()`: guarda con `session_user` + `REVOKE PUBLIC/anon/authenticated` (`security-hardening.sql:140,194-196` + `hardening2:88-91`).
- **Re-verificado en producción:** las 5 funciones sensibles devuelven `401 permission denied` con la anon key; service role sigue funcionando.

### S2. Bucket `documents` cross-tenant → **CORREGIDO**
- Políticas SELECT/INSERT/DELETE ahora exigen `(storage.foldername(name))[1] = 'user_' || auth.uid()` (mismo patrón que `backups`). Aplicado en producción.

### S3. `/api/backup/setup` sin auth → **CORREGIDO**
- Ahora exige `requireAdminApi(request)` antes de tocar service role (`src/app/api/backup/setup/route.ts:17-23`).

### Riesgos altos/medios resueltos
- **A3** Error boundaries: existen `src/app/error.tsx`, `global-error.tsx`, `loading.tsx`, `not-found.tsx`. ✅
- **A4** SW excluye Supabase y `/api/` del cache (v5, `public/sw.js:12-18`). ✅
- **A6** `POST /api/loans` valida `Number.isFinite(amount) && amount > 0`; guard `n<=0` en calculations. ✅
- **A7** `getLocalDate()` aplicado en los 21 sitios UTC. ✅
- **A10** `req.json().catch(()=>({}))` + try/catch en rutas de negocio. ✅
- **M1** Índice `idx_payments_user_status` creado (`security-hardening.sql:331`). ✅
- **M2** Todas las subqueries de `get_loan_stats` filtran `WHERE user_id = p_user_id` (`loan-stats.sql`). ✅
- **M5** `subscription_payments.status` default → `'pending'` + política INSERT con `status='pending'`. ✅
- **M7** Rate limiter clave solo por IP real (x-forwarded-for/cf-connecting-ip/x-real-ip). ✅
- **M8** Headers de seguridad en `next.config.ts` (CSP, X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy, X-Powered-By). ✅
- **M10** Whitelist de columnas en `PATCH /api/clients/[id]` y `PATCH /api/settings`. ✅
- **M11** Cron `cleanup-audit-logs-weekly` activado (`security-hardening.sql:337`); `recalc-client-stats-daily` activo. ✅
- **M14** Backup/setup y smtp-config endurecidos (smpt GET ya no devuelve `pass`). ✅

---

## 🚨 RIESGOS CRÍTICOS RESTANTES (condición de go-live — resiliencia de datos)

**A1. Restore no transaccional** (`src/lib/backup/import.ts:75-140`)
Por cada tabla: **borra todas las filas** del usuario y luego inserta. Un fallo a mitad (descarga, insert) deja la tabla vacía/parcial sin posibilidad de rollback. No valida checksum ni `manifest.userId` ni integridad de las filas CSV.
→ *Fix:* RPC `restore_user_backup(p_user_id, folder)` en SQL con `BEGIN…COMMIT` dentro de `SECURITY DEFINER`, o al menos validar el manifest (`userId`, `exportedAt`, checksum) ANTES de borrar nada y ordenar el restore bajo una transacción.

**A2. Sin backup automático**
El único disparador es el botón manual en Settings (`/api/backup/generate`). No hay `vercel.json` con cron, no hay Cron Doctor/Supabase, no hay retención ni compresión. Si el admin olvida respaldar y algo ocurre a un tenant, se pierde todo su historial.
→ *Fix:* `vercel.json` con cron diario `POST /api/backup/generate` protegido por `CRON_SECRET`, retención N días (purgar backups >30 días), o un `pg_cron` que exporte a un bucket service-role.

---

## ⚠️ RIESGOS ALTOS (semana 1-2 post-lanzamiento)

- **A8.** `/api/loan-status` sigue con **N+1** (2 round-trips por préstamo, `route.ts:30-57`). La mora se pinta de inmediato al crear/editar (`computeLateStatus`) y `update_client_stats` no depende de ello, pero el estado consolidado `late_*` por cron sigue sin resolver el N+1. → Reescribir set-based o activar `pg_cron` con `update_all_loan_statuses()`.
- **A9.** Hooks de pago/liquidación/reversión (`useFrenchLoan`, `useInterestOnlyLoan`, `useSharedLoanHandlers`) sin tests (~400+ líneas financieras).
- **M3.** Middleware hace ~5 consultas por request (`getUser`, `getSession`, `is_admin`, `settings`, `app_users`) — consolidar en 1 RPC `get_middleware_state`.
- **M4.** Clientes/préstamos cargados con `.limit(1000)` pero sin paginación real (cursor/offset); búsqueda solo sobre lo cargado.
- **M6.** Service role referenciado en componentes cliente (AdminUserDetail) — no filtra credenciales hoy, pero es anti-patrón.

---

## 🟡 RIESGOS MEDIOS / BAJOS

- **M9.** Sin Sentry / Vercel Analytics / uptime checks / alertas en ningún canal. Respaldo y monitoreo quedan para la semana 1.
- **M13.** `sendEmail` de Resend (`src/lib/email.ts`) **no tiene llamadores reales** (Grep: solo definición). Los correos reales salen por nodemailer/SMTP custom (hoy: correo integrado de Supabase tras el fix de recovery del 16 Ago). Limpiar o conectar.
- **M15.** AGENTS.md desincronizado: documenta `InstallmentRows.tsx` (sesión 8) que **no existe** (LoanDetail/Collections usan render inline) y no registra los ajustes del 16 Ago (T1-T4, favicon) en el cuerpo histórico. Favor de corregir.
- **M12.** Tras restore no se recalcula `update_client_stats` (trust/balance viejos hasta el cron).
- **Sensible en git:** `cookies.txt`, `ngrok-url.txt`, `docs/conversation-2026-08-05.json` siguen trackeados → `git rm --cached` + `.gitignore`.
- **Baja:** `aria-label` faltante en algunos botones icon-only; `confirm()` nativo en DocumentsContent; `toLocaleString('en-US')` en /pricing; mensajes de error en inglés en algunas vistas.
- **Correo de recuperación:** operativo vía correo integrado de Supabase (`no-reply@supabase.co`), pero con **tope de 2 emails/hora** (fijo sin SMTP custom). SMTP Gmail rechazado (`535 BadCredentials`); plan B pendiente: verificar dominio Resend `gestiondeprestamos.com` (DNS TXT `resend._domainkey`, MX `send`, TXT SPF) para levantar el tope.

---

## 📝 LISTA PRIORIZADA DE MEJORAS

### Go-Live (imprescindibles — 2 ítems)
1. **Restore transaccional** (A1): RPC `restore_user_backup` con `BEGIN/COMMIT`, validar checksum + `manifest.userId` antes de tocar datos.
2. **Backup automático diario** (A2): cron Vercel `vercel.json` → `POST /api/backup/generate` con `CRON_SECRET`, retención N días.

### Semana 1-2
3. **Correo de recuperación estable**: verificar dominio Resend `gestiondeprestamos.com` (DNS) → SMTP custom → subir `rate_limit_email_sent` (hoy 2/hora).
4. **N+1 en loan-status** (A8): reescribir set-based o activar cron `update_all_loan_statuses`.
5. **Middleware de 1 RPC** (M3) `get_middleware_state`.
6. **Tests de hooks financieros** (A9) + `csv/messages/audit-ui`.
7. **Paginación real** en clientes/préstamos (M4).
8. **Headless**: Vercel Web Analytics + Speed Insights + uptime checks (M9).
9. **Tracked files sensibles**: `git rm --cached cookies.txt ngrok-url.txt docs/conversation-2026-08-05.json` + `.gitignore` (M-baja).
10. **Limpiar código muerto**: `sendEmail`/Resend (M13), `Skeleton`/`InstallmentRows` documentado pero inexistente (M15 → corregir AGENTS.md).

### Pulido
11. `aria-label` en botones icon-only; `confirm()` nativo; `en-US` en /pricing; mensajes ES en collections/calendar.
12. Rate-limit distribuido (Upstash/Redis) opcional.

---

## ✅ RECOMENDACIÓN FINAL

**SÍ se puede lanzar** — con la condición de cerrar **A1 + A2** (resiliencia de datos) durante la misma ventana de go-live, y arrancar la semana 1 con la lista superior.

- Las vulnerabilidades **explotables remotamente (S1-S3) están cerradas y verificadas** en producción.
- La seguridad pasó de 35 → **88**; el núcleo financiero, los RPCs y las pruebas están sólidos (46/46, build OK).
- Los riesgos restantes son de **operación/resiliencia** (no de ataque a la confidencialidad/integridad cross-tenant): backup manual y restore frágil.

**Condición mínima de go-live:** aplicar los 2 ítems de la fase Go-Live, re-verificar que `reconcile_money`/`admin_list_users`/`update_all_loan_statuses` sigan bloqueados para anon tras cualquier cambio, y probar 1 backup→restore completo transaccionalmente antes de abrir al público.