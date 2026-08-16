# Auditoría 8 — Preparación para Producción (Go Live)

**Fecha:** 13 Ago 2026
**Alcance:** Rendimiento, Escalabilidad, Seguridad, Pruebas, Respaldo, Recuperación, Logs, Monitoreo, Versionado, Manejo de errores, UX, Cumplimiento.
**Método:** Revisión de código (Next.js 16.2.10 + Supabase) + pruebas reales de la BD de producción (PostgREST con anon/service role) + `npx tsc --noEmit`, `npx vitest run` (46/46 ✔) y `npm run build` (46 rutas ✔).

---

## ✅ PUNTUACIÓN GENERAL: **62 / 100** — NO LISTO PARA PRODUCCIÓN

La funcionalidad de negocio está completa y robusta, pero existen **vulnerabilidades de seguridad explotables remotamente** (RPCs sin guarda de autorización invocables por anónimos) y **no hay backup automático ni monitoreo**. Son bloqueantes de lanzamiento.

---

## 📊 CALIFICACIÓN POR MÓDULO

| Módulo | Calificación | Comentario |
|---|---|---|
| Cumplimiento de requisitos | **90** | Todos los flujos clave implementados y conectados; RPCs centralizados; perfil de pago completo |
| Pruebas | **78** | 46/46 passan; núcleo financiero puro bien cubierto; hooks de orquestación sin tests |
| UX | **75** | Responsive móvil resuelto; faltan loading/error boundaries; SW cachea datos autenticados |
| Versionado | **72** | Migraciones SQL aplicadas y scripts idempotentes; AGENTS.md desincronizado con código real |
| Logs | **68** | audit_logs completo y traducido; cron de limpieza comentado; sin Sentry |
| Rendimiento | **66** | RPCs SQL bien agregados; falta índice `payments(user_id)`; pagina out-of-limit en clientes |
| Manejo de errores | **55** | Sin try/catch global en rutas de negocio; writes sin verificación en hooks; `req.json()` sin protección |
| Escalabilidad | **50** | N+1 en loan-status; descargas completas sin límite; middleware hace 5 round-trips/request |
| Respaldo | **45** | Solo manual, sin compresión ni retención; no hay cron de backup |
| Recuperación | **40** | Restore no transaccional (borra-antes-de-insertar); sin checksum; sin runbook de DR |
| Monitoreo | **35** | Sin uptime checks, sin alertas, sin Sentry/Analytics; crons de mora comentados |
| Seguridad | **35** | 4 RPCs críticos expuestos a anónimos (CONFIRMADO en BD), bucket de documentos abierto cross-tenant |

---

## 🚨 RIESGOS CRÍTICOS (bloquean producción — explotables remotamente)

**S1. RPCs `SECURITY DEFINER` invocables por ANÓNIMOS (CONFIRMADO en producción)**
Con la **anon key pública** del frontend se puede llamar desde el navegador:
- `reconcile_money(NULL)` → devuelve **inventario financiero completo de TODOS los tenants** (26 clientes verificados en la prueba real). Fuga de PII (nombres, montos, balances).
- `admin_list_users()` → expone **todos los emails/IDs de `auth.users`** de la plataforma (respuesta real obtenida).
- `update_all_loan_statuses()` → **muta status/late_days de préstamos de todos los usuarios** (corrupción cross-tenant; ejecución confirmada, devuelve 0 filas pero recorre la BD).
- `admin_usage_stats()` → métricas de MRR/ingresos/planes del negocio SaaS.
→ *Fix:* `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ... TO service_role;` + guarda interna en cada función (patrón que ya usa `get_loan_stats`) y/o `REVOKE` de `authenticated` en `update_all_loan_statuses`. Aplicar vía `scripts/exec-*-.mjs`.

**S2. Bucket de Storage `documents` abierto a todos los usuarios autenticados (cross-tenant)**
`supabase/documents-storage.sql:11-28`: políticas SELECT/INSERT/DELETE solo exigen `auth.role()='authenticated'`, sin restringir al prefijo del propio usuario. Cualquier cliente logueado puede **leer, sobrescribir o borrar contratos, cédulas y documentos de cualquier otro cliente**. Los paths de soporte además no llevan prefijo por usuario.
→ *Fix:* políticas que verifiquen `storage.foldername(name)[1] = 'user_' || auth.uid()::text` (como ya hace el bucket `backups`), y prefijar paths de soporte con `user_<uid>/`.

**S3. `POST /api/backup/setup` sin autenticación (usa service role)**
`src/app/api/backup/setup/route.ts:5-70` es la única ruta que crea un cliente service-role **sin `requireAdminApi` ni `getUser()`** (solo rate-limit). Un anónimo puede disparar operaciones de servicio y recibir SQL/hints.
→ *Fix:* exigir sesión + `requireAdminApi(request)`.

---

## ⚠️ RIESGOS ALTOS

- **A1. Restore no transaccional** (`src/lib/backup/import.ts:97-133`): borra todas las filas del usuario antes de insertar; un fallo a mitad deja la tabla vacía. Sin checksum ni validación de `manifest.userId`.
- **A2. Sin backup automático**: no hay `vercel.json` ni cron de backup; el único disparador es el botón manual en Settings. Retención infinita, sin compresión.
- **A3. Sin error boundaries ni loading states**: no existen `error.tsx`, `global-error.tsx`, `loading.tsx` ni `not-found.tsx` en toda la app. `Skeleton.tsx` es código muerto. Fallos de query se ven como "ceros" en Dashboard.
- **A4. Service worker cachea rutas autenticadas** (`public/sw.js:26-49`): cache-first sobre `/rest/v1/*`, `/api/*`; puede servir datos de otra sesión u obsoletos (stale).
- **A5. Escrituras sin verificar errores** en `useSharedLoanHandlers.ts` (reversión :232-272, liquidación :144-152, abono :193-197): si falla la BD, la UI muestra éxito y el estado local diverge.
- **A6. `POST /api/loans` sin validación de monto** (`route.ts:41`): inserta `amount <= 0`/NaN; `calculateFlatRate` divide por cero con `n=0` (`calculations.ts:155`) → Infinity/NaN en cronograma.
- **A7. Fecha "hoy" UTC vs local** (21 ocurrencias de `toISOString().split('T')[0]`): en RD (UTC−4), entre 20:00 y medianoche los cobros del día y la pestaña "Hoy" consultan el día equivocado.
- **A8. `/api/loan-status` N+1** (`route.ts:30-57`): 2 round-trips por préstamo; nadie agenda este cron (el de schema.sql está comentado) → la mora no se repinta sola.
- **A9. Hooks de pago/liquidación/reversión sin tests** (~288+ líneas de lógica financiera sin cobertura).
- **A10. `request.json()` sin protección en 7 rutas** de negocio y **sin try/catch global**: body vacío → 500 con stack.

---

## 🟡 RIESGOS MEDIOS / BAJOS

- **M1.** Falta índice `payments(user_id, status)` para queries hot de `get_loan_stats`, `admin_usage_by_user` y detalle admin de usuario.
- **M2.** `get_loan_stats` subquery de pagos (`loan-stats.sql:71-78,117-122`) no filtra por `user_id` → escanea pagos de todos los tenants en cada request (mitigado por guarda, pero costoso).
- **M3.** Middleware hace hasta 5 round-trips a Supabase por request (`src/middleware.ts`) — consolidar en 1 RPC `get_middleware_state`.
- **M4.** Descargas completas sin límite en `reports/page.tsx`, `dashboard/page.tsx`, `/api/reports`, `/api/calendar`, `/api/documents`, `/api/clients`; listado de préstamos/clientes truncado a 100 sin paginación real; búsqueda de clientes solo sobre los primeros 100.
- **M5.** `subscription_payments.status` default `'confirmed'` (`payment-requests.sql:7`) + RLS INSERT solo exige `auth.uid()=user_id` → un cliente puede auto-confirmarse pagos e inflar MRR/admin stats. Cambiar default a `'pending'`.
- **M6.** Service role importado en un componente cliente (`AdminUserDetail.tsx:282`) — anti-patrón, aunque hoy no filtra el key.
- **M7.** Rate limiter in-memory con clave derivada de header client-side (`x-user-id`) — bypasseable; perdido en cold starts serverless.
- **M8.** Sin headers de seguridad en `next.config.ts` (CSP, X-Frame-Options, nosniff).
- **M9.** Sin Sentry / Vercel Analytics / uptime checks / alertas en ningún canal.
- **M10.** `/api/settings` y `/api/documents` escriben body sin whitelist de columnas; paths de documentos no validados en servidor.
- **M11.** Cron `cleanup-audit-logs-weekly` comentado → audit_logs crece sin límite. Recordatorios de email manuales (sin cron).
- **M12.** TRIGGER-less: tras restore no se recalculan `update_client_stats` (trust_score/balance quedan viejos hasta el cron).
- **M13.** `RESEND_API_KEY` muerto en código (sendEmail sin caller; envío real vía SMTP nodemailer) — discrepancia en AGENTS.md.
- **M14.** Falta `REVOKE`/guarda en RPCs de mantenimiento y en docs audit/reconciile (menos crítico tras S1). SMTP password en claro en `smtp_config`.
- **M15.** AGENTS.md desincronizado (afirma `InstallmentRows.tsx` y sesión 8 que no existen en el código actual).
- **Baja:** archivos sensibles trackeados en git (`cookies.txt`, `ngrok-url.txt`, `docs/conversation-2026-08-05.json`); `aria-label` faltante en 5 botones icon-only; `lateStatusLabel` "Atrs 12d" críptico; `confirm()` nativo en DocumentsContent; `toLocaleString('en-US')` en /pricing; `?mode=register` sin procesar en login; mensajes de error en inglés en collections/calendar.

---

## 📝 LISTA PRIORIZADA DE MEJORAS

### Bloqueantes (fase 1 — imprescindibles antes de go-live)
1. **Revocar RPCs expuestos** (S1): `REVOKE ALL` + `GRANT service_role` en `reconcile_money`, `admin_list_users`, `update_all_loan_statuses`, `admin_usage_stats`, `is_admin` para PUBLIC/anon; añadir guardas internas.
2. **Cerrar bucket documents por prefijo de usuario** (S2) + prefijar paths de soporte.
3. **Autenticar `/api/backup/setup`** con `requireAdminApi` (S3).
4. **Restore transaccional** (A1): `BEGIN/COMMIT` en un RPC `restore_user_backup`, validar checksum + `userId`.
5. **Backup automático diario** (A2): `vercel.json` con cron `POST /api/backup/generate` + `CRON_SECRET`, retención N días.
6. **Error boundaries + loading.tsx** (A3): `src/app/error.tsx`, `global-error.tsx`, `not-found.tsx`, y skeletons por segmento.
7. **Restringir SW a navegación/estáticos** (A4): excluir Supabase/`/api`.
8. **Endurecer hooks de pago** (A5): comprobar `error` en cada write y abortar con `setPaymentError`.
9. **Validar montos en POST /api/loans + guard `n<=0` en `calculateFlatRate`** (A6).

### Fase 2 (semanas 1-2 post-lanzamiento)
10. **Índice `payments(user_id, status)`** y filtrar subquery de `get_loan_stats` por `user_id` (M1/M2).
11. **Unificar día local** (`getLocalDate()`) en las 21 ocurrencias UTC (A7).
12. **try/catch + `req.json().catch(()=>({}))`** en las 7 rutas de negocio (A10).
13. **Cerrar RPC de mora**: activar cron pg_cron `update-loan-statuses-daily` o reescribir `/api/loan-status` set-based (A8).
14. **Default `pending` en subscription_payments + WITH CHECK** (M5).
15. **Middleware con 1 RPC consolidado** (M3).
16. **Tests de hooks financieros** (A9) y de `csv/messages/audit-ui`.
17. **Headless: `DEV Tools` → `Vercel Web Analytics` + `Speed Insights`**; configurar uptime checks de Vercel/StatusCake.

### Fase 3 (pulido)
18. Paginación real en clientes/préstamos y proyección de columnas en reports/dashboard (M4).
19. Headers de seguridad en `next.config.ts` (M8).
20. Limpiar código muerto: `/api/loans`, `/api/clients`, `/api/collections`, `/api/settings`, `/api/documents`, `/api/calendar`, `/api/reports`, `sendEmail`/Resend, `Skeleton` sin uso.
21. `git rm --cached cookies.txt ngrok-url.txt docs/conversation-2026-08-05.json` y añadir a `.gitignore`.
22. Servicio de rate-limit distribuido (Upstash/Redis) opcional.

---

## 📅 RECOMENDACIÓN

**NO lanzar aún.** La app es funcionalmente sólida (flujos completos, RPCs contables correctos, 46/46 tests, build OK) pero **las vulnerabilidades S1-S3 son explotables hoy mismo por cualquier persona con acceso al frontend** (anon key pública) y comprometen todos los tenants. Esto, junto a la ausencia de backup automático (A1/A2) y de monitoreo, hacen que un incidente de datos o una pérdida de BD no sean recuperables de forma confiable.

**Condición de go-live:** completar la **Fase 1 (los 9 bloqueantes)** y re-verificar con una prueba anónima que `reconcile_money`/`admin_list_users`/`update_all_loan_statuses` devuelvan `403`/bloqueo y que un usuario A no pueda leer documentos del usuario B. Después de la Fase 1, se puede lanzar con calificación estimada ≥80 y arrancar la Fase 2 en paralelo al uso real.