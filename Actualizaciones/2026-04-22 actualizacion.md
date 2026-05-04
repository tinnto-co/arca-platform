# Actualizacion - 2026-04-22

## 1) Objetivo general del dia

Se continuo fortaleciendo el modulo de Sueldos con foco en tres frentes: (1) firma digital integrada al flujo de recibos y simulacion, (2) robustez de liquidacion masiva por perfil/periodo con manejo de errores y omisiones, y (3) compatibilidad de schema/migraciones para soportar coexistencia de recibos generados e importados. El resultado buscado fue mejorar control, trazabilidad y ejecucion segura de liquidaciones sin romper flujos legacy.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Firma digital en recibo y simulador
- **Cambio:** Se incorporo la firma del empleador en vistas de recibo y simulador, y se habilito su gestion desde una pestana dedicada de "Firma Digital".
- **Motivo:** Completar el circuito documental dentro del modulo de sueldos sin depender de procesos externos.
- **Impacto:** Los recibos/previsualizaciones quedan listos para validacion y entrega con formato mas completo.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/components/sueldos/SueldosSimulador.tsx`, `src/components/sueldos/TablaReciboSos.tsx`, `src/routes/_authed/sueldos/index.tsx`

### 2.2 Liquidacion masiva mas guiada y segura
- **Cambio:** Se cerro el flujo de masiva con filtrado por `profileId`, validaciones de pertenencia, deteccion de recibos ya generados, asignacion guiada de convenio faltante y resumen de resultados (ok/fail/skipped) con codigos de error.
- **Motivo:** Evitar recalculos duplicados y facilitar diagnostico cuando una corrida masiva falla en casos puntuales.
- **Impacto:** Mayor previsibilidad operativa y menor riesgo de inconsistencias por corrida sobre datos incompletos.
- **Archivos:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosDashboard.tsx`

### 2.3 Nueva visualizacion de recibos por periodo
- **Cambio:** En Recibos se paso de selector individual a listado tabular por periodo con accion "Ver detalle".
- **Motivo:** Mejorar navegacion y control cuando hay muchos empleados liquidados.
- **Impacto:** Consulta mas rapida de resultados y acceso directo al detalle por empleado.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`

### 2.4 Convivencia de recibos importados y generados
- **Cambio:** Se actualizo la unicidad de recibos para contemplar `origen` en la clave unica y se agrego bandera de perfil `usa_lsd_referencia` para escenarios legacy.
- **Motivo:** Permitir usar importados como referencia sin bloquear generacion de recibos propios del mismo periodo/tipo.
- **Impacto:** Mayor flexibilidad operativa en migraciones LSD -> flujo propio, evitando colisiones de datos.
- **Archivos:** `drizzle/0016_liquidacion_recibo_unique_con_origen.sql`, `drizzle/0017_profile_usa_lsd_referencia.sql`, `drizzle/schema.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor
- Se agrego resolucion de convenio para empleado cuando falta dato en legajo (si hay un unico convenio de cliente).
- Se reforzo resolucion de categoria para calculo de basico y se agrego backfill de `convenioId/categoriaId` al legajo para corridas futuras.
- `listEmpleados` y `calcularLiquidacionMasiva` ahora exigen `profileId` y validan relacion `profile-client`.
- Se agrego tipado de errores de liquidacion masiva (`NO_CONVENIO`, `NO_CATEGORIA`, `PERIODO_INVALIDO`, `EMPLEADO_NO_ENCONTRADO`, `YA_GENERADO`, `OTRO`) y mapping por mensaje.
- `calcularLiquidacionMasiva` devuelve `summary` y detalle por empleado (nombre/legajo/errorCode) para trazabilidad operativa.

### 3.2 Frontend / UI
- Dashboard de Sueldos: dialogo de confirmacion de masiva con listado de pendientes, selector de convenio cuando falta, y modal de errores con opcion de copia.
- Recibos: tabla por periodo con columnas de importes y boton de detalle por empleado.
- Integracion de firma del empleador en render de recibo y tabla SOS.

### 3.3 Datos / DB / scripts
- Se incorporo migracion para ajustar constraint unica de `liquidacion_import_recibo` a `(empleado_id, periodo, tipo, origen)`.
- Se incorporo migracion para bandera `profile.usa_lsd_referencia` con backfill inicial segun existencia de recibos importados.
- Se alineo `drizzle/schema.ts` con campos/tablas legacy para evitar drops accidentales en `drizzle-kit push`.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados
- `Actualizaciones/2026-04-22 actualizacion.md`

### 4.2 Documentos depurados (si aplica)
- No aplica hasta este corte del dia.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados
- Parte de los cambios del dia sigue en working tree (no consolidado en commit), por lo que puede variar el alcance final.
- La inferencia automatica de convenio depende de que el cliente tenga un unico convenio activo; en escenarios multi-convenio sigue siendo necesaria asignacion explicita.
- La convivencia importado/generado depende de ejecutar correctamente migraciones en cada entorno antes de habilitar el flujo.

### 5.2 Pendiente inmediato (proximo paso)
- Cerrar pruebas funcionales de liquidacion masiva por perfil con casos mixtos (convenio completo, faltante, ya generado).
- Verificar que el flujo de asignacion de convenio en modal masivo impacte correctamente en corrida posterior.
- Ejecutar regresion rapida del listado de recibos por periodo y render final del detalle.
- Validar en QA el comportamiento de `usa_lsd_referencia` por perfil y su efecto en corrida/visualizacion.

---

## 6) Archivos principales involucrados

- `drizzle/schema.ts`
- `drizzle/0016_liquidacion_recibo_unique_con_origen.sql`
- `drizzle/0017_profile_usa_lsd_referencia.sql`
- `src/actions/sueldos.ts`
- `src/components/sueldos/SueldosDashboard.tsx`
- `src/components/sueldos/SueldosRecibo.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/TablaReciboSos.tsx`
- `src/routes/_authed/sueldos/index.tsx`
- `Actualizaciones/2026-04-22 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
