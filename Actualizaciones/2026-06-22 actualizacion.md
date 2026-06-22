# Actualizacion - 2026-06-22

## 1) Objetivo general del dia

Implementar el Portal del Cliente (BLAK-G): sistema para que cada cliente pueda tener su propio usuario de consulta, gestionado íntegramente desde el estudio dentro de la app. La infraestructura de DB y rutas del portal ya existía — el trabajo de hoy consiste en construir las server functions de administración de accesos, el tab "Portal" en el detalle de cada cliente, y el fix del redirect post-login para usuarios portal.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Gestión de usuarios portal desde el detalle de cliente

- **Cambio:** Nueva pestaña "Portal" en la vista de detalle de cada cliente (representative). Permite al estudio crear usuarios de consulta, editar sus permisos y revocarlos.
- **Motivo:** Los clientes necesitan acceder a su propia información fiscal (vencimientos, deudas, notificaciones) sin tener que llamar al estudio.
- **Impacto:** El estudio crea el usuario (nombre, email, contraseña), define qué puede ver (deudas, IVA, sueldos, documentos, chat IA), y el cliente ingresa con esas credenciales directamente al portal.
- **Archivos:** `src/actions/client-portal.tsx`, `src/components/client-detail-page.tsx`

### 2.2 Fix redirect post-login para usuarios portal

- **Cambio:** Al iniciar sesión, si el usuario tiene acceso portal (`representativeUserAccess`), es redirigido automáticamente a `/portal` en lugar del dashboard del estudio (`/`).
- **Motivo:** Sin este fix, un usuario portal quedaba en una pantalla de error al no tener `activeOrganizationId`.
- **Impacto:** La experiencia de login es transparente — cada tipo de usuario llega a su pantalla correcta.
- **Archivos:** `src/components/login-form.tsx`

---

## 3) Cambios técnicos (implementación)

### 3.1 Backend / server functions

Agregadas en `src/actions/client-portal.tsx` (sección "Studio-side"):

- **`listPortalUsers({ representativeId })`** — lista usuarios con acceso, JOIN con tabla `user` de Better Auth. Valida que el representative pertenezca al `orgId` del estudio.
- **`createPortalUser({ representativeId, name, email, password, permissions })`** — usa `auth.api.createUser` (Better Auth admin plugin) + INSERT en `representativeUserAccess`.
- **`updatePortalUserPermissions({ accessId, ...permisos })`** — UPDATE sobre `representativeUserAccess`, validando ownership del org.
- **`resetPortalUserPassword({ userId, newPassword })`** — usa `auth.api.setUserPassword`, validando que el userId tenga acceso a un representative de esta org.
- **`revokePortalAccess({ accessId })`** — DELETE de `representativeUserAccess`. El usuario Better Auth se conserva.

### 3.2 Frontend / UI

- **Tab "Portal"** en `client-detail-page.tsx`: tabla de usuarios con permisos en badges, dialogs para crear/editar/revocar.
- **Fix login** en `login-form.tsx`: post-signin consulta `getPortalSession()` para detectar usuarios portal y redirigir a `/portal`.

### 3.3 Datos / DB / scripts

- Sin migraciones. La tabla `representative_user_access` ya existe en el schema.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados

- `Documentacion Tecnica/Portal del Cliente - Plan de Implementacion.md` — plan técnico completo creado antes de implementar.
- `Actualizaciones/2026-06-22 actualizacion.md` — este documento.

---

## 2b) Correcciones módulo Sueldos (segunda sesión)

### 2b.1 Bug: orden numérico de conceptos en el recibo

- **Cambio:** Los conceptos dentro del recibo ahora se listan siempre en orden numérico ascendente (1, 2, 3... 19, 20 — no 1, 10, 19, 2...).
- **Motivo:** Las 4 queries que traen `liquidacion_import_concepto_valor` usaban `ORDER BY codigo` sobre texto, produciendo orden lexicográfico incorrecto.
- **Fix:** Cambio a `ORDER BY codigo::int` en `getReciboPlantillaConceptos`, `getReciboDetalle`, `listRecibosDetalleParaPDF` y la query batch de cargas.
- **Archivos:** `src/actions/sueldos.ts`

### 2b.2 Bug: concepto 211 (y similares) no calculaba con importe directo

- **Cambio:** Conceptos donde el usuario ingresa solo un importe fijo (sin porcentaje ni cantidad) ahora calculan correctamente.
- **Motivo:** `montoLiquidadoDesdeEditsSos` calculaba `cant(0) × pct(0)/100 × base = 0` cuando no se completaban cantidad ni porcentaje. Afectaba al concepto 211 y cualquier otro donde se quiera ingresar un monto directo.
- **Fix:** Cuando `cant=0` y `pct=0`, si hay `importeConceptoNumero` o `importe`, se devuelve ese valor directamente como monto final.
- **Archivos:** `src/lib/sos-recibo-totales.ts`

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Observaciones

- Un usuario portal no tiene `activeOrganizationId` — queda bloqueado naturalmente de todas las rutas `/_authed/*` sin lógica adicional.
- `auth.api.createUser` no envía email de verificación (comportamiento deseado — el estudio gestiona credenciales).
- Al revocar acceso el usuario Better Auth se conserva intencionalmente para trazabilidad.

### 5.2 Pendiente inmediato

- [ ] (Futuro) Soporte para que un usuario portal tenga acceso a múltiples representatives (muchos-a-muchos ya está soportado en DB, falta UI).
- [ ] (Futuro) Log de accesos del portal para auditoría.

---

## 6) Archivos principales involucrados

- `src/actions/client-portal.tsx`
- `src/components/client-detail-page.tsx`
- `src/components/login-form.tsx`
- `Documentacion Tecnica/Portal del Cliente - Plan de Implementacion.md`
- `src/actions/sueldos.ts` (orden numérico de conceptos)
- `src/lib/sos-recibo-totales.ts` (concepto 211 / importe directo)
- `Actualizaciones/2026-06-22 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
