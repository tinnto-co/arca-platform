# Manual Maestro Sueldos SOS + Arca

## 0) Alcance y criterio de unificacion

Este documento unifica en una sola referencia:

1. Funcionamiento actual del modulo de sueldos en `arca-platform`.
2. Reglas de calculo SOS verificadas en pruebas reales.
3. Catalogo operativo de conceptos SOS y su uso en la UI.

El objetivo es tener una unica fuente de consulta para operacion, analisis funcional y soporte tecnico.

---

## 1) Fuentes usadas (trazabilidad)

### 1.1 Fuentes principales (base de este maestro)

- `Documentacion Tecnica/Funcionalidad Sueldos.md`
  - Arquitectura del modulo Arca.
  - Tablas y flujo operativo en la aplicacion.
  - Secciones UI y flujo de liquidacion.

- `Documentacion Tecnica/Pruebas Formuleo SOS 2026-04-20.md`
  - Reglas de formula verificadas en SOS.
  - Prioridad de campos, bugs y workarounds.
  - Casos de prueba y dependencias de subtotales.

- `Documentacion Tecnica/Todos los conceptos SOS.md`
  - Catalogo de conceptos (Nro SOS, Nro AFIP, campos editables).
  - Base de calculo y divisores por concepto.

### 1.2 Fuentes complementarias

- `Documentacion Tecnica/Fases de migracion tablas sueldos.md`
  - Contexto historico del modelo de datos y migracion.

- `Documentacion Tecnica/Funcionalidad sueldos - Analisis, Planificacion, Proximos Pasos.md`
  - Brechas, plan por fases y roadmap operativo.

- `Documentacion Tecnica/Formuleo Sueldos SOS CONTADOR.md`
  - Referencia general de SOS (documento previo; parcialmente solapado).

- `Documentacion Tecnica/Cuadro Formulas por Concepto SOS.md`
  - Indice al canvas operativo de formulas.

---

## 2) Siglas y definiciones clave

| Sigla | Significado | Uso operativo |
|---|---|---|
| H | Haberes | Total de conceptos que suman como haberes |
| D | Descuentos | Total de descuentos sobre haberes |
| R | Retenciones | Aportes/retenciones que restan al neto |
| NR | No Remunerativo | Monto que suma al neto y no integra base estandar de aportes |
| CN | Concepto Numero | Referencia a monto de otro concepto |
| SAC | Sueldo Anual Complementario | Aguinaldo |
| HE | Horas Extras | Horas con recargo (50/100) |
| Imp.N | Importe Concepto Numero | Campo de referencia de importe por concepto |
| OS | Obra Social | Retencion/aporte de salud |
| ART | Aseguradora de Riesgos del Trabajo | Prestaciones de riesgos del trabajo |

---

## 3) Mapa funcional del modulo en Arca

### 3.1 Que hace el modulo hoy

- Gestion por cliente de convenios, categorias y escalas.
- ABM de empleados/legajos con datos de liquidacion y pago.
- Catalogo de conceptos y grilla de recibo estilo SOS.
- Liquidacion individual y masiva.
- Guardado de cabecera y detalle de recibo.
- Confirmacion e impresion de recibos.

### 3.2 Flujo operativo resumido

1. Definir estructura laboral (convenio/categoria/escala).
2. Asignar empleado a convenio y categoria.
3. Crear recibo por periodo y tipo.
4. Cargar conceptos (plantilla SOS o copia de periodo previo).
5. Calcular montos por concepto.
6. Totalizar en H, D, R, NR.
7. Confirmar recibo e imprimir/exportar.

### 3.3 Regla de neto

`Neto = H - D - R + NR`

---

## 4) Reglas de calculo SOS verificadas

### 4.1 Formula general

`importeCalculado = BASE / divHs / divCant`

Luego se obtiene `raw` por prioridad de campos.

### 4.2 Prioridad de calculo (orden real)

1. Si `CN > 0`:
   - `raw = importeConcepto[CN] * (%/100) * cantidad`
   - El campo `importe` se ignora.

2. Si `CN = 0` y `base = 1.00`:
   - `raw = importe * cantidad * (%/100)`

3. Si `CN = 0` y `base > 1.00`:
   - Si `importe = 0`: `raw = base * cantidad * (%/100)`
   - Si `importe > 0`: `raw = base * (%/100) * importe` (bug triple-campo)

4. Aplicar clamp:
   - `resultado = max(minimo, min(maximo, raw))`

### 4.3 Bug critico y workaround

- Bug: base subtotal + porcentaje + importe puede multiplicar en forma destructiva.
- Casos sensibles: 511-520 y 551-562.
- Workaround operativo: usar `importe = 1` cuando corresponda calcular sobre base dinamica.

### 4.4 Casos especiales relevantes

- Concepto 42 (SAC proporcional): calculo final en servidor.
- Conceptos 501-504, 511-520, 551-562:
  - Estan en bloque visual NR, pero su impacto contable va a R.

---

## 5) Bases de calculo y subtotales

| Base | Significado |
|---|---|
| SL | Sueldo del legajo/perfil |
| SL_hora | SL dividido por horas mensuales |
| S1a2 | Subtotal conceptos 1-2 |
| S1a9 | Subtotal conceptos 1-9 |
| S1a19 | Subtotal conceptos 1-19 |
| S1a26 | Subtotal conceptos 1-26 |
| S1a39 | Subtotal conceptos 1-39 |
| S1a199 | Total haberes (base clasica de retenciones) |
| S411a469 | Total no remunerativos del bloque base |
| S1a199 + S411a469 | Base combinada H+NR |
| 1.00 | Sin base automatica (importe manual) |

---

## 6) Catalogo operativo de conceptos (resumen por bloques)

Nota: el detalle exhaustivo de los 231 conceptos sigue en el catalogo maestro de conceptos.

### 6.1 Haberes (1-99)

- Basicos, antiguedad, premios, adicionales, horas extras, SAC, vacaciones, comisiones.
- Mezcla de conceptos con base automatica y conceptos de importe manual.

### 6.2 Descuentos (100-199)

- Descuentos por dias y bloques genericos multi-modo.

### 6.3 Retenciones (200-299)

- Base principal: `S1a199`.
- Aportes tipicos: jubilacion, PAMI, obra social, sindicato, etc.

### 6.4 No remunerativos y retenciones asociadas (400-699)

- 401-499: mayormente no remunerativos.
- 501-599: retenciones ligadas a NR/H+NR (impactan en R).
- 601-620: asignaciones/beneficios no remunerativos y variantes.

### 6.5 Referencia de detalle completo

Para detalle concepto por concepto (Nro SOS, AFIP, campos visibles, base y divisor):

- `Documentacion Tecnica/Todos los conceptos SOS.md`
- Canvas operativo: `~/.cursor/projects/.../canvases/cuadro-formulas-sos-sueldos.canvas.tsx`

---

## 7) Mapeo con la UI (campos editables frecuentes)

- `cantidad`
- `%`
- `Imp.N` (importe concepto numero)
- `importe`
- `imp. minimo`
- `imp. maximo`
- `memo`

Regla practica:
- Si hay `CN`, prevalece sobre importe.
- En conceptos de base dinamica con `%`, revisar uso de `importe` para no inducir bug.

---

## 8) Validaciones y guardrails recomendados en operacion

- No usar porcentaje negativo.
- Controlar porcentaje extremo (fuera de rango operativo).
- Validar que `minimo <= maximo`.
- En 511-520 y 551-562, usar `importe=1` cuando el calculo sea sobre base subtotal.
- Revisar concepto 42 al guardar (servidor puede ajustar valor final).

---

## 9) Estado de vigencia y mantenimiento

- Este documento reemplaza la lectura dispersa de multiples archivos para trabajo diario.
- Si cambia una regla de calculo, actualizar primero este maestro y luego los anexos tecnicos.
- Mantener historicos en carpeta de archivo para auditoria de decisiones.

---

## 10) Anexos sugeridos

### 10.1 Anexo A (tecnico)
- Tabla 231 conceptos completa (si se decide consolidar dentro de este maestro).

### 10.2 Anexo B (operativo)
- Checklist de cierre mensual de liquidacion.

### 10.3 Anexo C (qa)
- Casos de prueba de regresion funcional (CP) y expected result.
