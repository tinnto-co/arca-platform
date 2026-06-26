# Actualizacion - 2026-05-15

## 1) Objetivo general del dia

Carga de escalas salariales para el CCT 389/04 (Gastronómicos) y corrección estructural del módulo de sueldos: se detectó que `payroll_convenio` estaba modelado a nivel cliente en lugar de a nivel profile (empresa), lo que impedía que empresas bajo el mismo cliente liquidaran sueldos de forma independiente. Se realizó la migración de datos, actualización de schema y corrección de todas las actions afectadas.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Escalas salariales Gastronómicos CCT 389/04

- **Cambio:** Se cargaron las categorías y escalas salariales del CCT 389/04 (FEHGRA) para los períodos Abril, Mayo y Junio 2026.
- **Motivo:** El convenio gastronómico no tenía datos de escalas en el sistema.
- **Impacto:** Las empresas con CCT 389/04 ahora pueden liquidar sueldos con las escalas de referencia correctas (Acuerdo 2025-2026, tercer tramo).
- **Archivos:** `src/scripts/seed-gastronomico-categorias.ts`, `src/scripts/seed-gastronomico-escalas.ts`, `src/scripts/seed-empleados-categorias-gastronomico.ts`

### 2.2 Convenios por empresa (profile) en lugar de por cliente

- **Cambio:** `payroll_convenio` ahora se asocia a un `profile_id` (empresa individual) en lugar de a un `client_id` (grupo/cliente).
- **Motivo:** Dentro de un mismo cliente pueden existir múltiples empresas (profiles) que liquidan sueldos por separado y pueden tener convenios distintos. La lógica anterior compartía los convenios entre todas las empresas del cliente.
- **Impacto:** Cada empresa ve y gestiona sus propios convenios en la solapa "Convenios" del módulo de sueldos. No hay más mezcla de convenios entre empresas del mismo grupo.
- **Archivos:** `drizzle/schema.ts`, `src/actions/sueldos.ts`, `src/components/sueldos/SueldosConvenios.tsx`

### 2.3 Limpieza de convenios incorrectos

- **Cambio:** Se eliminaron 69 registros de `payroll_convenio` que tenían CCTs incorrectos según los datos de AFIP (`afip_empleadores_convenio`).
- **Motivo:** Muchas empresas tenían asignado el CCT 389/04 cuando AFIP indica que son Comercio (130/75) u otro convenio.
- **Impacto:** El selector de convenios en el módulo de sueldos muestra solo los convenios que corresponden a cada empresa según AFIP.
- **Archivos:** `src/scripts/delete-convenios-sobrantes.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor

- `payroll_convenio.profile_id` agregado como columna `NOT NULL` con FK a `profile(id) ON DELETE CASCADE`.
- Todos los filtros en `src/actions/sueldos.ts` cambiados de `eq(payrollConvenio.clientId, clientId)` a `eq(payrollConvenio.profileId, profileId)`.
- `resolveConvenioIdParaEmpleado()` actualizada para recibir `profileId` en lugar de `clientId`.
- Input validators de `createConvenio` y `listConvenios` actualizados para incluir `profileId` como campo requerido.

### 3.2 Frontend / UI

- `SueldosConvenios.tsx`: `createConvenio` ahora envía `profileId` junto con `clientId`.

### 3.3 Datos / DB / scripts

- **Migración de datos** (`src/scripts/migrate-convenio-client-to-profile.ts`):
  - 25 convenios con empleados de un solo profile → asignados directamente.
  - 6 convenios ambiguos (empleados de 2+ profiles) → duplicados, empleados reasignados, categorías y escalas copiadas.
  - 25 convenios sin empleados → asignados al profile con `liquida_sueldos = true`.
  - Total final: 62 convenios, todos con `profile_id NOT NULL`.
- **Categorías gastronómicas** (`seed-gastronomico-categorias.ts`): 858 registros insertados en `payroll_convenio_categoria` (33 categorías × 26 convenios).
- **Escalas gastronómicas** (`seed-gastronomico-escalas.ts`): 2574 registros insertados en `payroll_escala` (99 por convenio × 26 convenios).
- **Tabla `empleados_categorias`** (`seed-empleados-categorias-gastronomico.ts`): 33 categorías de CCT 389/04 insertadas.
- **`drizzle.config.ts`**: Agregado `tablesFilter: ["!empleados_categorias"]` para excluir tablas raw SQL del push de Drizzle.
- **`db:push` pendiente**: La tabla `client_request` (agregada por Gastón en commit "New UI") aún no fue creada en la DB. Requiere correr `bun run db:push` manualmente y seleccionar "+ client_request → create table".

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados

- `Actualizaciones/2026-05-15 actualizacion.md` (este documento)

### 4.2 Scripts de auditoría creados (desechables)

- `src/scripts/check-afip-empleadores-gastronomico.ts`
- `src/scripts/auditoria-convenios.ts`
- `src/scripts/check-convenios-sobrantes.ts`
- `src/scripts/list-gastronomico-empresas.ts`
- `src/scripts/relevamiento-convenios-multiprofile.ts`
- `src/scripts/list-convenios-con-empleados-sin-afip.ts`
- `src/scripts/check-vites.ts`
- `src/scripts/check-db-push.ts`

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados

- **41 empresas** tienen convenios cuyos empleados no tienen respaldo en AFIP (no scrapeadas). No se tocaron — requieren scraping de AFIP para confirmar su CCT real.
- **VITES FRANCISCO CARLOS**: tiene convenios 9999/99 y 329/00 pero sus empleados son de Gb Bazar SA (mismo cliente). Los convenios son válidos para Gb Bazar — no se eliminaron.
- Algunas empresas tienen employees en convenio `9999/99` ("fuera de convenio") que es correcto para gerentes/dueños — no deben eliminarse.

### 5.2 Pendiente inmediato

- Correr `bun run db:push` manualmente → seleccionar "+ client_request create table" → confirmar Yes.
- Revisar las 41 empresas sin datos AFIP una vez que sean scrapeadas.
- Considerar si las empresas con CCT incorrecto en AFIP (ej: 9999/99 con empleados reales) deben ser corregidas manualmente.

---

## 6) Archivos principales involucrados

- `drizzle/schema.ts` — `payrollConvenio` con `profileId NOT NULL`
- `drizzle.config.ts` — `tablesFilter` para excluir `empleados_categorias`
- `src/actions/sueldos.ts` — filtros por `profileId`, validators actualizados
- `src/components/sueldos/SueldosConvenios.tsx` — `createConvenio` con `profileId`
- `src/scripts/seed-gastronomico-categorias.ts`
- `src/scripts/seed-gastronomico-escalas.ts`
- `src/scripts/seed-empleados-categorias-gastronomico.ts`
- `src/scripts/migrate-convenio-client-to-profile.ts`
- `src/scripts/delete-convenios-sobrantes.ts`
- `Actualizaciones/2026-05-15 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
