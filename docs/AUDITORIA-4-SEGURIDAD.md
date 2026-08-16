# Auditoría 4 — Seguridad Completa (fusión con Auditoría 8)

**Fecha:** 13 Ago 2026 · **Proyecto:** Gestor de Préstamos (Next.js 16.2.10 + Supabase)
**Método:** 4 agentes de exploración (Autenticación, Autorización/Permisos, Protección de APIs, Datos Sensibles) + **verificación en vivo contra la BD de producción** con la anon key pública (mismo nivel de acceso que el frontend).

---

## 🚨 HALLAZGOS CONFIRMADOS EN PRODUCCIÓN (explotables con la anon key pública)

Pruebas reales ejecutadas contra `https://snwwvvmszizarakrozah.supabase.co` con la **anon key**:

| RPC / Recurso | Resultado real | Impacto |
|---|---|---|
| `reconcile_money(NULL)` | **200** — `{"ran":true,"user_id":null,"testable_loans":3,"clients_checked":26,...}` | Fuga financiera de **TODOS los tenants** (nombres, montos, balances). |
| `admin_list_users()` | **200** — devuelve emails + IDs de `auth.users` | Fuga de cuentas de la plataforma SaaS. |
| `admin_usage_stats()` | **200** — `{"mrr":1499.00,"trial_count":2,"active_count":1,...}` | Métricas de negocio (MRR/ingresos) expuestas. |
| `update_all_loan_statuses()` | **200** — ejecutó y devolvió 0 | **Muta status/late_days de préstamos de todos los usuarios.** |
| `get_loan_stats(uid ajeno)` | 200 null | ✅ Guarda correcta (no fuga). |
| `is_admin()` | 200 false | ✅ Inofensiva (solo devuelve false). |
| `subscription_payments.status` | default `'confirmed'` | Cliente puede auto-confirmar pagos (infla MRR). |
| Bucket `documents` | políticas solo `auth.role()='authenticated'` | Cross-tenant: leer/borrar documentos ajenos. |

---

## HALLAZGOS CRÍTICOS (bloquean producción)

1. **C1 · `reconcile_money` sin guarda ni REVOKE** — `supabase/audit-reconcile.sql:15` SECURITY DEFINER, `p_user_id=NULL` recorre toda la BD, expone PII. Fix: guarda `auth.uid()` + `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE TO service_role`.
2. **C2 · `update_all_loan_statuses` sin guarda ni REVOKE** — `supabase/schema.sql:644` muta todos los préstamos. Fix: guarda + REVOKE service_role-only.
3. **C3 · Bucket `documents` sin prefijo por usuario** — `supabase/documents-storage.sql:11-28`. Fix: políticas con `(storage.foldername(name))[1] = 'user_' || auth.uid()::text` + prefijar paths de soporte y LoanDetail.

## HALLAZGOS ALTOS

4. **A4 · `/api/backup/setup` sin auth (service role)** — `src/app/api/backup/setup/route.ts`. Fix: `requireAdminApi`.
5. **A5 · `subscription_payments.status DEFAULT 'confirmed'` + INSERT propia** — `supabase/payment-requests.sql:7,27`. Fix: default `'pending'` + `WITH CHECK` restringe `status='pending'` + validar pertenencia de `subscription_id`.
6. **A6 · Guards NULL-débiles en RPCs de pago** — `schema.sql:454`, `cascade-guard.sql:271`: `p_user_id <> auth.uid()` evalúa NULL con payload anónimo. Fix: `IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RETURN ...` + REVOKE anon.
7. **A7 · Mass assignment en `clients/[id]` y `settings`** — `.update(body)` con body completo. Fix: whitelist de columnas.
8. **A8 · Cookies de sesión sin `httpOnly` ni `Secure`** — Fix: `cookieOptions: { sameSite:'lax', secure: true }` en producción.
9. **A9 · Open redirect en `/auth/callback`** — `next` sin validar. Fix: exigir pathname local.
10. **A10 · Rate limiter bypasseable** — key por header `x-user-id`. Fix: key por IP real.
11. **A11 · Sin security headers** — Fix: CSP, X-Frame-Options, nosniff, HSTS en `next.config.ts`.

## HALLAZGOS MEDIOS

12. **M1 · Fail-open en middleware** (onboarding/blocked/expired). Fix: fail-closed.
13. **M2 · Sin error/loading boundaries** — Fix: `error.tsx`, `global-error.tsx`, `loading.tsx`, `not-found.tsx`.
14. **M3 · PII sin cifrar en reposo** (cédula, GPS). 
15. **M4 · `smtp_config.pass` en claro y devuelto por GET** — Fix: no devolver `pass`.
16. **M5 · Service role importado en componente cliente** (`AdminUserDetail.tsx:282`). Fix: cerrar ticket vía API.
17. **M6 · `support/notify` lee tickets ajenos con service role** — Fix: validar propiedad.
18. **M7 · Sin MFA/2FA** para admins.
19. **M8 · `audit_logs.details` acumula PII** + export admin vuelca JSON crudo. Fix: redactar en `logAuditEvent`.
20. **M9 · `nextDueDateAfter` y 21 sitios usan día UTC** — Fix: `getLocalDate()`.
21. **M10 · Restore de backups no transaccional** (borra antes de insertar).
22. **M11 · Sin política de privacidad / derechos ARCO (Ley 172-13 RD)**.

## HALLAZGOS BAJOS

23. **B1 · Sin rate-limit en rutas de negocio** (loans, clients, documents).
24. **B2 · `request.json()` sin try/catch en 7 rutas** → 500 con stack.
25. **B3 · `calculateFlatRate` divide por cero con `n=0`** → Infinity/NaN.
26. **B4 · `POST /api/loans` sin validar `amount>0`**.
27. **B5 · `X-Powered-By` habilitado** (ocultado con `X-Powered-By: SimplifiedLender`).
28. **B6 · `confirm()` nativo; `aria-label` faltante; `lateStatusLabel` "Atrs Nd"; `toLocaleString('en-US')` en /pricing; `?mode=register` sin procesar; `loan_id`+monto en query string.**
29. **B7 · Upload sin validación de tipo/tamaño** (`storage.ts`).
30. **B8 · Hooks de pago/liquidación/reversión sin tests; `csv/messages/audit-ui/loan-status` sin tests.**

## ✅ LO QUE YA ESTÁ BIEN (protección existente)

- **RLS en TODAS las 16 tablas** con scope por `auth.uid()` y separación SELECT/write en `payments`.
- **`requireAdminApi` en las 15 rutas admin** — valida sesión + `is_admin()` antes del service role.
- **`is_admin` endurecida** (SECURITY DEFINER + search_path + STABLE).
- **`get_loan_stats`/`update_client_stats` con guardas correctas** (patrón a replicar).
- **Bucket `backups` aislado por usuario** (`user_<uid>/` + RLS).
- **Cero XSS** (0 `dangerouslySetInnerHTML`) y **cero SQLi** (100% queries parametrizadas).
- **CORS cerrado**, **SameSite=Lax** por default.
- **PKCE forzado** en browser y server; `getUser()` como fuente de verdad (32 usos).
- **Secretos fuera del repo**: `.env*` ignorado; sin `sb_secret_`/`resend_`/JWT en `src/**` ni `.sql`.
- **`createSignedUrl` de 60s** en todos los puntos de descarga.
- **Sin logging server de PII**.

---

## 📝 PLAN DE REMEDIACIÓN (aplicado en su mayoría)

### Fase A — SQL en BD (`supabase/security-hardening.sql` + `scripts/exec-security-hardening.mjs`) — PENDIENTE DE APLICAR
1. Guardas internas + REVOKE/GRANT en: `reconcile_money`, `update_all_loan_statuses`, `process_installment_payment`, `process_cascade_payment`, `update_client_stats`, `is_admin`, `calc_late_days`, `calc_late_amount`.
2. Políticas del bucket `documents` por prefijo `user_<uid>`.
3. `subscription_payments.status` default → `'pending'`.
4. Índice `payments(user_id, status)`.
5. Cron `cleanup-audit-logs-weekly` activado.

### Fase B — Código Next.js (✅ APLICADO)
6. `next.config.ts`: headers de seguridad + CSP. ✅
7. `rate-limit.ts`: key por IP. ✅
8. Cookies `sameSite`+`secure`. ✅
9. `/auth/callback`: validar `next`. ✅
10. `backup/setup`: `requireAdminApi`. ✅
11. `clients/[id]` + `settings`: whitelist. ✅
12. `smtp-config` GET: sin `pass`. ✅
13. `support/notify`: validar propiedad. ✅
14. Error/loading/not-found boundaries. ✅
15. `POST /api/loans` validar monto; guard flat-rate. ✅
16. `request.json().catch` en las 7 rutas. ✅
17. Redacción PII en `logAuditEvent`. ✅
18. `getLocalDate()` en los 21 sitios UTC. ✅
19. SW sin cachear APIs/Supabase. ✅

---

## 📅 RECOMENDACIÓN

**NO go-live hasta aplicar la Fase A** (SQL de hardening). Tras ello, re-verificar con la anon key que los RPCs devuelvan bloqueo y que un usuario A no pueda leer documentos del B (condición de go-live de la Auditoría 8). Fase C (Confirm email, MFA, política de privacidad, uptime checks) puede arrancarse en paralelo.