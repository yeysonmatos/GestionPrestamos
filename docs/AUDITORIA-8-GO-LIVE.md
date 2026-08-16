# Auditoría 8 — Preparación para Producción (Go Live)

**Fecha inicial:** 13 Ago 2026 — **Fecha de consolidación final:** 16 Ago 2026 (re-consolidación tras cerrar A1+A2)
**Alcance:** Rendimiento, Escalabilidad, Seguridad, Pruebas, Respaldo, Recuperación, Logs, Monitoreo, Versionado, Manejo de errores, UX, Cumplimiento.
**Método:** Revisión de código (Next.js 16.2.10 + Supabase) + pruebas reales de la BD de producción (PostgREST con anon/service role) + verificación directa del código + `npx tsc --noEmit`, `npx vitest run` (46/46 ✔) y `npm run build` (46 rutas ✔).

> Re-consolidación final: re-verifica cada hallazgo del 13 Ago contra el código/BD actual (sesiones de hardening del 13-16 Ago + go-live A1/A2 aplicadas y probadas en producción) y re-puntúa.

---

## ✅ PUNTUACIÓN GENERAL: **75 / 100** — LISTO PARA GO-LIVE

Las vulnerabilidades críticas/explotables (S1-S3) fueron **corregidas y re-verificadas**, y los 2 ítems de resiliencia de datos (A1 restore transaccional + A2 backup automático) quedaron **implementados y probados en producción** (cron ejecutado: 4 backups OK; RPC transaccional: rollback verificado; manifest con checksums). No quedan condiciones bloqueantes para lanzar; la cola restante es de mejora continua (semana 1-2).

---

## 📊 CALIFICACIÓN POR MÓDULO (13 Ago → 16 Ago)

| Módulo | 13 Ago | 16 Ago | Comentario |
|---|---|---|---|
| Cumplimiento de requisitos | 90 | **90** | Sin cambios; flujos completos, RPCs contables correctos |
| Pruebas | 78 | **80** | 46/46; núcleo financiero y billing cubiertos; hooks de orquestación siguen sin tests |
| UX | 75 | **82** | Error boundaries añadidos; SW corregido; recovery de contraseña funcional (correo integrado) |
| Versionado | 72 | **75** | Migraciones aplicadas y scripts idempotentes; AGENTS.md aún desincronizado en 1 punto |
| Logs | 68 | **72** | Cron `cleanup-audit-logs-weekly` **activado** (antes comentado); audit_logs traducido |
| Dimensionamiento/prestaciones | 66 | **78** | Índice `payments(user_id,status)` creado; `get_loan_stats` filtra por `user_id` en todas las subqueries |
| Tratamiento de errores | 55 | **78** | Boundaries + `req.json().catch` + montos validados + hooks con setPaymentError |
| Ampliación | 50 | **55** | N+1 en loan-status y middleware multi-consulta persisten; paginación simplificada |
| Respaldo | 45 | **85** | **Automático** (cron Vercel diario `0 4 * * *` → `/api/cron/backup` con `CRON_SECRET`), retención 30 días (`pruneOldBackups`), tabla por usuario con checksums sha256 por archivo verificados en producción |
| Recuperación | 40 | **80** | `restore_user_backup` **transaccional** (BEGIN/COMMIT, rollback total probado con uuid inválido), valida `userId` + checksums antes de borrar, recalcula `update_client_stats` por cliente. Pendiente: recuperar `documents` en Storage (solo `documents.csv` en tabla) |
| Supervisión | 35 | **38** | Sin uptime checks, alertas, Sentry ni Analytics |
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

**A1 + A2 → CORREGIDOS** (16 Ago, aplicados y probados en producción):

**A1. Restore transaccional** (`supabase/backup-restore-transactional.sql` + `src/lib/backup/import.ts`)
- RPC `restore_user_backup(p_user_id, p_settings, p_clients, p_loans, p_installments, p_payments, p_documents)` SECURITY DEFINER: borra en orden FK e inserta **en una sola transacción** (rollback total si algo falla). Guarda (dueño o postgres/service_role), desactiva `trg_enforce_client_limit` durante el restore, recalcula `update_client_stats` por cliente. REVOKE PUBLIC/anon.
- `import.ts` valida folder (regex anti-traversal), descarga + verifica `manifest.userId` y **checksums sha256** de cada CSV **antes** de tocar datos, y delega el borrado+inserción al RPC.
- **Verificado:** payload con `uuid` corrupto → `{ok:false, error:…}` y los 24 clientes del prestamista quedaron **intactos** (rollback real).

**A2. Backup automático diario** (`src/app/api/cron/backup/route.ts` + `vercel.json`)
- Cron Vercel `0 4 * * *` → `/api/cron/backup`, protegido con `Authorization: Bearer CRON_SECRET` (creado en Vercel: production/preview/development + `.env.local`/`.env.production`).
- Respaldos TODOS los `app_users` vía service role con `pruneOldBackups(retentionDays=30)`.
- **Verificado:** GET con `CRON_SECRET` → `{ok:true, backups:4, purged:0, users:4, errors:[]}`; carpetas `user_*` con `clients.csv` (24 filas), `installments.csv` (datos), manifest con `userId` correcto + checksums.

**Limitación conocida (no bloqueante):** el backup respalda la tabla `documents` (`documents.csv`) pero **no copia los archivos de Storage**; el folder `user_*` del bucket `documents` no se recolecta en el backup. Pendiente para semana 1 (Baja).

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
- **M12.** **Antes**: tras restore no se recalcula `update_client_stats`. **RESTAURADO**: el RPC `restore_user_backup` recalcula `update_client_stats` por cada cliente restaurado dentro de la transacción. ✅
- **Sensible en git:** `cookies.txt`, `ngrok-url.txt`, `docs/conversation-2026-08-05.json` siguen trackeados → `git rm --cached` + `.gitignore`.
- **Baja:** `aria-label` faltante en algunos botones icon-only; `confirm()` nativo en DocumentsContent; `toLocaleString('en-US')` en /pricing; mensajes de error en inglés en algunas vistas.
- **Correo de recuperación:** operativo vía correo integrado de Supabase (`no-reply@supabase.co`), pero con **tope de 2 emails/hora** (fijo sin SMTP custom). SMTP Gmail rechazado (`535 BadCredentials`); plan B pendiente: verificar dominio Resend `gestiondeprestamos.com` (DNS TXT `resend._domainkey`, MX `send`, TXT SPF) para levantar el tope.

---

## 📝 LISTA PRIORIZADA DE MEJORAS

### Go-Live (imprescindibles — 2 ítems) ✅ COMPLETADOS (16 Ago, verificado en producción)
- [x] **Restore transaccional** (A1): RPC `restore_user_backup` con `BEGIN/COMMIT/ROLLBACK`, valida checksum + `manifest.userId` antes de tocar datos. Rollback probado.
- [x] **Backup automático diario** (A2): cron Vercel `vercel.json` `0 4 * * *` → `/api/cron/backup` con `CRON_SECRET`, retención 30 días. Ejecutado: 4 backups OK.

### Semana 1-2
1. **Backup de archivos Storage** (añadir tras go-live): recolectar también el bucket `documents` (folder `user_*`) en el backup, no solo la tabla.
2. **Correo de recuperación estable**: verificar dominio Resend `gestiondeprestamos.com` (DNS) → SMTP custom → subir `rate_limit_email_sent` (hoy 2/hora).
3. **N+1 en loan-status** (A8): reescribir set-based o activar cron `update_all_loan_statuses`.
4. **Middleware de 1 RPC** (M3) `get_middleware_state`.
5. **Tests de hooks financieros** (A9) + `csv/messages/audit-ui`.
6. **Paginación real** en clientes/préstamos (M4).
7. **Headless**: Vercel Web Analytics + Speed Insights + uptime checks (M9).
8. **Tracked files sensibles**: `git rm --cached cookies.txt ngrok-url.txt docs/conversation-2026-08-05.json` + `.gitignore` (M-baja).
9. **Limpiar código muerto**: `sendEmail`/Resend (M13), `Skeleton`/`InstallmentRows` documentado pero inexistente (M15 → corregir AGENTS.md).

### Pulido
11. `aria-label` en botones icon-only; `confirm()` nativo; `en-US` en /pricing; mensajes ES en collections/calendar.
12. Rate-limit distribuido (Upstash/Redis) opcional.

---

## ✅ RECOMENDACIÓN FINAL

**SÍ se puede lanzar.** Las dos condiciones de go-live (A1 restore transaccional, A2 backup automático) están **cerradas y verificadas en producción** (rollback probado + 4 backups generados por cron con checksums). La fase Go-Live de la lista priorizada queda **completa**.

- Las vulnerabilidades **explotables remotamente (S1-S3) están cerradas y verificadas** en producción.
- La seguridad pasó de 35 → **88**; el núcleo financiero, los RPCs y las pruebas están sólidos (46/46, build OK). Puntaje global 62 → **75**.
- Los riesgos restantes son de **mejora continua** (semana 1-2: backup de Storage, Resend, N+1, monitoreo), ninguno bloquea el lanzamiento.

**Cierre de go-live (verificado):** cron diario activo y probado; ante una catástrofe, el restore del manifest (validado por checksum) se aplica en una sola transacción sin dejar tablas vacías. **Abre al público ahora.**