# Funcionalidad sueldos - Analisis, Planificacion, Proximos Pasos

## 1. Objetivo del documento

Este documento resume el estado actual del modulo de sueldos, identifica brechas funcionales y tecnicas, y define un plan de trabajo priorizado para mejorar precision, estabilidad y escalabilidad.

Se basa en:
- `Documentacion Tecnica/Formuleo Sueldos SOS CONTADOR.md`
- `Documentacion Tecnica/Funcionalidad Sueldos.md`
- `docs/SUELDOS-ARQUITECTURA.md`

---

## 2. Estado actual del modulo

### 2.1 Que ya funciona

- Gestion por cliente de convenios, categorias y escalas salariales.
- ABM de empleados/legajos con datos de liquidacion y pago.
- Catalogo de conceptos y grilla de recibo estilo SOS.
- Liquidacion individual y masiva.
- Guardado de cabecera y detalle de recibo.
- Confirmacion e impresion de recibos.
- Exportaciones clave (LSD/F931, libro, listados), segun flujo actual.

### 2.2 Como opera hoy (resumen funcional)

1. Se define estructura laboral (convenios, categorias, escalas).
2. Se asigna empleado a convenio y categoria.
3. Se crea el recibo para periodo y tipo de liquidacion.
4. Se cargan conceptos desde plantilla SOS o copia de periodo anterior.
5. El motor calcula montos por concepto.
6. Se totaliza en haberes, descuentos, retenciones y no remunerativos.
7. Se confirma y se usa para impresion/exportacion.

---

## 3. Analisis de brechas y riesgos

## 3.1 Critico (impacta calculo y exactitud)

- **Subtotales acumulados incompletos en motor**  
  Conceptos que dependen de bases tipo `sub1_9`, `sub1_19`, `sub1_26`, `sub1_39`, `sub1_199`, `sub411_469` pueden quedar mal calculados si no se actualizan en secuencia.

- **Referencia a otro concepto (`ref_concepto`) no plenamente integrada**  
  Conceptos que usan "Imp. Conc. Nro" no siempre pueden resolverse correctamente en cascada.

- **Uso inconsistente de `divHsNorm` y `divCantidad`**  
  En algunos casos el divisor esta embebido en formula texto en vez de aplicarse como regla estructural.

## 3.2 Alto (consistencia de datos y operacion)

- **Proceso sin transaccion completa**  
  Delete + insert multiple sin transaccion puede dejar estado intermedio ante error.

- **Borrado de cabecera demasiado amplio**  
  Si el borrado no discrimina por tipo, puede afectar recibos distintos del mismo mes (ej: sueldo y SAC).

- **UI de conceptos no cubre totalmente tipo `retencion`**  
  Limita gestion completa desde interfaz.

## 3.3 Medio (usabilidad y mantenimiento)

- Restriccion rigida a liquidar solo mes anterior.
- Reglas de clasificacion por rangos SOS repetidas en varios puntos.
- Oportunidades de optimizacion en procesos masivos (N+1, poca vectorizacion).

---

## 4. Planificacion propuesta (por fases)

## Fase 1 - Correccion del nucleo de calculo (prioridad maxima)

**Objetivo:** asegurar exactitud de liquidacion alineada a SOS.

### Alcance
- Implementar subtotales acumulados running dentro del motor.
- Integrar `ref_concepto` con resolucion ordenada por dependencia.
- Aplicar `divHsNorm` y `divCantidad` como pre-proceso estandar del calculo.
- Unificar clasificacion de conceptos por rango SOS en una sola funcion utilitaria.

### Criterio de salida
- Recibos de muestra (casos simples y complejos) coinciden con resultados esperados.
- Retenciones y adicionales sobre subtotal se calculan correctamente.
- Pruebas automatizadas de regresion para formulas y subtotales.

---

## Fase 2 - Robustez transaccional y consistencia de datos

**Objetivo:** evitar inconsistencias y perdida parcial de informacion.

### Alcance
- Envolver calculo/guardado en transacciones atomicas.
- Ajustar borrados para que siempre discriminen por `empleado + periodo + tipo`.
- Completar trazabilidad en detalle de concepto (`base_usada`, `pct_usado`, etc.).
- Normalizar formato de periodo y helpers comunes.

### Criterio de salida
- Ante error de calculo, no quedan recibos parciales.
- Convivencia correcta de varios tipos de recibo en mismo periodo.
- Auditoria basica disponible por linea de concepto.

---

## Fase 3 - Productividad operativa y escalabilidad

**Objetivo:** mejorar experiencia de uso y performance.

### Alcance
- Habilitar tipo `retencion` completo en UI de conceptos.
- Permitir reliquidaciones historicas con control por rol/permiso.
- Optimizar liquidacion masiva con enfoque batch.
- Revisar y limpiar deuda tecnica de nomenclaturas/modelo legado.

### Criterio de salida
- Operacion mas flexible sin comprometer control.
- Mejor tiempo de respuesta en liquidaciones grandes.
- Menos codigo duplicado y menor costo de mantenimiento.

---

## 5. Proximos pasos concretos (en estos dias)

## 5.1 Proximos 3 dias (ejecucion inmediata)

- Cerrar definicion tecnica final del motor (subtotales, divisores y referencias).
- Implementar subtotales running (`sub1_9`, `sub1_19`, `sub1_26`, `sub1_39`, `sub1_199`, `sub411_469`).
- Resolver `ref_concepto` con orden de dependencia y casos en cascada.
- Crear set minimo de pruebas unitarias para validar calculo base.

## 5.2 Proximos 7 dias (estabilizacion)

- Integrar `divHsNorm` y `divCantidad` como regla estructural unica de calculo.
- Envolver guardado de recibo en transaccion atomica.
- Corregir borrado de cabecera para filtrar por `empleado + periodo + tipo`.
- Ejecutar pruebas de regresion con casos reales de recibos.

## 5.3 Proximos 15 dias (cierre operativo corto)

- Habilitar tipo `retencion` completo en UI de conceptos.
- Completar trazabilidad por linea (`base_usada`, `pct_usado`).
- Centralizar clasificacion por rangos SOS en una unica funcion compartida.
- Medir performance inicial de liquidacion masiva y definir optimizaciones inmediatas.

---

## 6. KPIs de seguimiento recomendados

- **Precision de calculo:** porcentaje de recibos que coinciden contra benchmark SOS.
- **Incidencias post-liquidacion:** cantidad de ajustes manuales por periodo.
- **Estabilidad:** errores de proceso por cada 1000 recibos.
- **Rendimiento:** tiempo promedio de liquidacion masiva por 100 empleados.
- **Cobertura funcional:** porcentaje de conceptos gestionables desde UI.

---

## 7. Riesgos y mitigaciones

- **Riesgo:** cambios en motor impactan resultados historicos.  
  **Mitigacion:** feature flag + pruebas de regresion por dataset.

- **Riesgo:** dependencia de calidad de datos importados.  
  **Mitigacion:** validaciones de entrada y reportes de consistencia previos.

- **Riesgo:** aumento de complejidad en formulas.  
  **Mitigacion:** centralizar reglas, testear por tipo de concepto, documentar ejemplos.

---

## 8. Conclusiones

El modulo tiene base funcional solida y estructura de datos suficiente para evolucionar.  
La prioridad inmediata debe estar en cerrar la brecha del motor de calculo (subtotales, divisores y referencias), luego reforzar consistencia transaccional, y finalmente ampliar capacidades operativas y de escala.

Con este orden, se logra:
- mejor exactitud legal/contable,
- menor riesgo operativo,
- mejor experiencia para liquidaciones mensuales y procesos masivos.
