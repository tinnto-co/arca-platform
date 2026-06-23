# Actualizacion - 2026-06-22

## 1) Objetivo general del dia

Jornada con 5 sesiones de trabajo:

1. **Portal del Cliente (BLAK-G):** implementar gestión de usuarios portal desde el detalle de cada cliente (server functions + tab Portal + fix redirect post-login).
2. **Fix sueldos — orden de conceptos:** corregir orden lexicográfico en la lista de conceptos del recibo.
3. **Fix sueldos — concepto 211 / importe directo:** corregir cálculo cuando el usuario ingresa solo un monto fijo sin porcentaje ni cantidad.
4. **Fix cargas sociales — scope de estado:** corregir error de runtime en `GenerarPresentacionDialog` por `showEmpleadorConfig` fuera de scope.
5. **Feature sueldos — fechas del empleado:** nueva columna `fecha_ingreso`, display de ambas fechas sobre la tabla de conceptos en "Nuevo recibo", y campo editable en el dialog del empleado.

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

## 2c) Diagnóstico y resolución: error "data is undefined" en módulo Sueldos (tercera sesión)

### 2c.1 Síntoma

Al ingresar al módulo de Sueldos y seleccionar un cliente, aparecía el alert de error:

> No se pudieron cargar los datos de sueldos
> `["liquidaciones","<clientId>","<profileId>","2026-06"] data is undefined`

### 2c.2 Causa raíz

El error `data is undefined` lo lanza internamente TanStack Query cuando el `queryFn` **resuelve a `undefined`** (no lanza una excepción). Esto ocurre en el siguiente flujo:

1. TanStack Start transforma cada `.handler(fn)` en `.handler(extractedFn, serverFn)` durante el build/dev-server — `extractedFn` es el stub client-side que hace el HTTP call; `serverFn` es el handler real que corre en el servidor.
2. Si el dev server está corriendo con una versión desactualizada del módulo (p. ej. después de un commit o `git pull` sin reiniciar), `extractedFn` queda `undefined` para las server functions del archivo modificado.
3. La middleware chain de TanStack Start hace `extractedFn?.(payload)` → `undefined` (optional chaining sin lanzar error).
4. El `queryFn` resuelve a `undefined` en lugar de lanzar.
5. TanStack Query detecta eso y lanza `new Error(\`${queryHash} data is undefined\`)`.

El commit `69a6e1e` había modificado `src/actions/sueldos.ts`; el dev server seguía corriendo sin haber procesado la nueva versión del archivo.

### 2c.3 Resolución

Reiniciar el dev server:

```bash
bun run dev
```

Para producción: `bun run build && bun run start`.

### 2c.4 Regla operativa

> Siempre que se haga `git pull` o se cambie de branch con cambios en `src/actions/`, reiniciar el dev server para que TanStack Start regenere los stubs de server functions.

---

## 2d) Corrección módulo Cargas Sociales (cuarta sesión)

### 2d.1 Bug: error "showEmpleadorConfig is not defined" en solapa Cargas Sociales

- **Cambio:** Corrección de error de runtime en el componente `GenerarPresentacionDialog`.
- **Motivo:** El estado `showEmpleadorConfig` / `setShowEmpleadorConfig` estaba declarado en el componente padre `SueldosCargas` pero era referenciado dentro del componente hijo `GenerarPresentacionDialog`, que no tiene acceso a ese scope.
- **Fix:** Se movió `const [showEmpleadorConfig, setShowEmpleadorConfig] = useState(false)` al interior de `GenerarPresentacionDialog`, donde realmente se usa (botón de settings del card "Tipo empleador" y el `EmpleadorConfigDialog`).
- **Archivos:** `src/components/sueldos/SueldosCargas.tsx`

---

## 2e) Feature: fechas del empleado visibles en pantalla "Nuevo recibo" (quinta sesión)

### 2e.1 Nueva columna `fecha_ingreso` en empleado

- **Cambio:** Se agregó la columna `fecha_ingreso` (`timestamp`) en la tabla `liquidacion_import_empleado`.
- **Semántica:**
  - `fechaAlta` = fecha más antigua del empleado, usada para calcular antigüedad. Se carga desde el LSD y nunca cambia salvo corrección manual.
  - `fechaIngreso` = fecha de ingreso a la empresa actual (CUIT corriente). Se usa cuando la empresa cambió de CUIT pero la relación laboral continuó.
- **Al importar LSD:** `fechaIngreso` se inicializa igual que `fechaAlta` (INSERT). No se sobreescribe en updates.
- **Al crear manualmente:** `fechaIngreso` se inicializa igual que `fechaAlta` en el momento de creación.
- **Archivos:** `drizzle/schema.ts`, `src/actions/sueldos.ts` (`upsertLiquidacionEmpleadoForPayrollRow`, `createEmpleadoManual`, `updateEmpleado`, `getBasicoParaEmpleadoPeriodo`)

### 2e.2 Ambas fechas visibles en la pantalla de conceptos del recibo

- **Cambio:** Al llegar a la tabla de conceptos en "Nuevo recibo" (o "Editar recibo"), se muestra una barra de info con:
  - **Fecha de alta (antigüedad):** DD/MM/YYYY
  - **Fecha de ingreso:** DD/MM/YYYY
- **Motivación:** El usuario del estudio necesita ver la antigüedad del empleado mientras carga el recibo para verificar el cálculo del bono.
- **Flujo "Nuevo recibo":** Las fechas vienen del formulario `ReciboFormulario` → `onFormSuccess` → `FlowHeader`.
- **Flujo "Editar recibo":** Las fechas vienen de `getBasicoParaEmpleadoPeriodo` como fallback (ya que `FlowHeader` no pasa por el form).
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`, `src/components/sueldos/ReciboFormulario.tsx`

### 2e.3 Campo `fechaIngreso` editable en el dialog de empleado

- **Cambio:** En `EmpleadoDetalleDialog` (pestaña Laboral):
  - El campo "Fecha de alta" ahora se muestra como "Fecha de alta (antigüedad)" para distinguirlo.
  - Se agregó campo "Fecha de ingreso" editable y visible en modo lectura.
  - La mutación `updateEmpleado` ahora pasa correctamente `fechaAlta` (antes pasaba `fechaIngreso: fechaAlta` por error de naming).
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Observaciones

- Un usuario portal no tiene `activeOrganizationId` — queda bloqueado naturalmente de todas las rutas `/_authed/*` sin lógica adicional.
- `auth.api.createUser` no envía email de verificación (comportamiento deseado — el estudio gestiona credenciales).
- Al revocar acceso el usuario Better Auth se conserva intencionalmente para trazabilidad.

### 5.2 Pendiente inmediato

- [ ] (Futuro) Soporte para que un usuario portal tenga acceso a múltiples representatives (muchos-a-muchos ya está soportado en DB, falta UI).
- [ ] (Futuro) Log de accesos del portal para auditoría.
- [ ] Scripts `src/scripts/seed-ngvs-uocra.ts` y `src/scripts/seed-uocra-escalas.ts` creados pero no commiteados — revisar si se incluyen o se descartan.

---

## 6) Archivos principales involucrados

- `src/actions/client-portal.tsx`
- `src/components/client-detail-page.tsx`
- `src/components/login-form.tsx`
- `Documentacion Tecnica/Portal del Cliente - Plan de Implementacion.md`
- `src/actions/sueldos.ts` (orden numérico de conceptos, fechaIngreso)
- `src/lib/sos-recibo-totales.ts` (concepto 211 / importe directo)
- `src/components/sueldos/SueldosCargas.tsx` (fix showEmpleadorConfig scope)
- `drizzle/schema.ts` (columna fecha_ingreso en liquidacion_import_empleado)
- `src/components/sueldos/SueldosSimulador.tsx` (display fechaAlta + fechaIngreso sobre tabla)
- `src/components/sueldos/ReciboFormulario.tsx` (pasa fechaAlta + fechaIngreso al simulador)
- `src/components/sueldos/SueldosEmpleados.tsx` (campo fechaIngreso editable + fix param naming)
- `Actualizaciones/2026-06-22 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
