# Actualizacion - 2026-04-20

## Objetivo general del dia

Se avanzo en la consolidacion funcional del modulo de Sueldos para dejar el flujo de carga/calculo de recibos SOS mas estable, trazable y operable en produccion. El foco estuvo en cerrar brechas de formula, datos maestros y herramientas de soporte para migracion/normalizacion.

---

## 1) Estado de avance funcional al cierre de hoy

### 1.1 Motor de calculo y formulario SOS
- Se mantuvieron y validaron los ajustes recientes del motor para calculo por base SOS (`baseColumna`) con divisores (`divHsNorm`, `divCantidad`), subtotales acumulados y referencias entre conceptos.
- Se dejo reforzada la trazabilidad de calculo por fila para facilitar auditoria del recibo.
- Se continuo afinando el comportamiento de grilla para que el modo manual llegue con valores precalculados y editables antes de guardar.

### 1.2 Dashboard y simulador de sueldos
- Se realizaron ajustes sobre componentes del dashboard/simulador para mejorar la consistencia entre preview, calculo y persistencia.
- Se continuo el ordenamiento de logica compartida entre UI y backend para evitar desfasajes de montos.

### 1.3 Firma digital y soporte operativo
- Se incorporo un nuevo componente para flujo de firma digital:
  - `src/components/sueldos/SueldosFirmaDigital.tsx`
- Se avanzaron utilidades de proceso para ejecucion periodica y control:
  - `src/lib/payroll-cron.ts`

---

## 2) Datos, formulas y pruebas tecnicas

### 2.1 Formula y totales SOS
- Se siguio evolucionando la capa de formulas y totalizadores:
  - `src/lib/payroll-formula.ts`
  - `src/lib/sos-recibo-totales.ts`
  - `src/lib/sos-formula-display.ts`
  - `src/components/sueldos/sos-concepto-map.ts`
- Ajustes funcionales cerrados hoy:
  - Reclasificacion de conceptos SOS `500-599` para que impacten en **Retenciones** (y no en Descuentos) en grilla y totalizadores.
  - Evaluacion estricta de formulas (`ok/error`) para evitar fallback silencioso a cero.
  - Guardrails de validacion en conceptos criticos (`511-520` y `551-562`) para evitar bug triple-campo y exigir `importe=1` cuando corresponde.
  - Trazabilidad por linea de recibo (`pctUsado`, `baseUsada`, `memo` de origen/calculo).
  - Lock transaccional para guardado SOS por `(empleado, periodo, tipo)` para evitar pisadas concurrentes.

### 2.2 Pruebas automatizadas agregadas
- Se agregaron suites iniciales para validar comportamiento esperado:
  - `src/lib/payroll-formula.test.ts`
  - `src/lib/sos-recibo-totales.test.ts`

### 2.3 Parseo y backfill de legajos SOS
- Se incorporaron mejoras en parseo de planillas y scripts de control/migracion:
  - `src/lib/parse-sos-legajos-sheet.ts`
  - scripts en `src/scripts/` para auditoria, backfill y normalizacion de legajos/empleados.

---

## 3) Documentacion y trazabilidad generada hoy

Se unifico la documentacion y se dejo una referencia principal:
- `Documentacion Tecnica/Manual Maestro Sueldos SOS + Arca.md` (nuevo documento unificado)
- `Documentacion Tecnica/Todos los conceptos SOS.md` (catalogo detallado vigente)
- `Documentacion Tecnica/Cuadro Formulas por Concepto SOS.md` (indice al canvas operativo)
- `canvases/cuadro-formulas-sos-sueldos.canvas.tsx` (cuadro visual con siglas, formulas e impacto por concepto)

Documentos depurados por solapamiento (eliminados del set operativo):
- `Documentacion Tecnica/Formuleo Sueldos SOS CONTADOR.md`
- `Documentacion Tecnica/Funcionalidad sueldos - Analisis, Planificacion, Proximos Pasos.md`
- `Documentacion Tecnica/Funcionalidad Sueldos.md`
- `Documentacion Tecnica/Fases de migracion tablas sueldos.md`
- `Documentacion Tecnica/Pruebas Formuleo SOS 2026-04-20.md`

---

## 4) Pendiente inmediato (se va a seguir haciendo)

### 4.1 Cierre funcional corto plazo
- Continuar validando casos reales por convenio/escala para asegurar paridad contra SOS.
- Ajustar casos borde en conceptos complejos (retenciones, referencias y bases no triviales).
- Terminar de alinear flujo manual vs copia de recibo para que ambos usen las mismas reglas de base/divisores.

### 4.2 Cierre tecnico corto plazo
- Ampliar cobertura de tests unitarios en formulas y totalizadores.
- Ejecutar bateria de regresion sobre perfiles/periodos representativos.
- Depurar scripts auxiliares que hoy quedan como utilidades de migracion para dejar set estable de scripts operativos.

### 4.3 Hardening para produccion
- Revisar logs/errores de corrida periodica.
- Terminar limpieza de deuda tecnica detectada en clasificacion de conceptos y normalizacion de periodos.
- Consolidar checklist de pre-liquidacion y post-liquidacion para uso operativo.

---

## 5) Archivos principales involucrados en esta tanda

- `drizzle/schema.ts`
- `src/actions/sueldos.ts`
- `src/components/sueldos/SueldosDashboard.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/TablaReciboSos.tsx`
- `src/components/sueldos/SueldosFirmaDigital.tsx`
- `src/lib/payroll-formula.ts`
- `src/lib/sos-recibo-totales.ts`
- `src/lib/sos-formula-display.ts`
- `src/lib/payroll-cron.ts`
- `src/lib/parse-sos-legajos-sheet.ts`
- `src/scripts/*` (scripts de soporte, auditoria y migracion)
- `Documentacion Tecnica/Manual Maestro Sueldos SOS + Arca.md`
- `Documentacion Tecnica/Todos los conceptos SOS.md`
- `Documentacion Tecnica/Cuadro Formulas por Concepto SOS.md`
- `canvases/cuadro-formulas-sos-sueldos.canvas.tsx`
- `Actualizaciones/2026-04-20 actualizacion.md`
