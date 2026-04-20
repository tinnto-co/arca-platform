# Todos los Conceptos SOS - Mr Factory Couch (CUIT: 30717679136)

## Cómo se obtuvo esta información

Se accedió al sistema SOS Contador (https://soft.sos-contador.com) posicionado en la empresa **Mr Factory Couch SA (CUIT: 30717679136)**.

Desde el menú **Sueldos → Recibos**, se abrió la pestaña de recibos y se ingresó al registro de **GODANO, VERONICA** (el registro sin valores cargados), que contiene la lista completa de todos los conceptos configurados en el sistema para esta empresa.

En la sección **"detalle del recibo"** se encuentran todos los conceptos posibles. Se extrajo la información mediante JavaScript sobre el DOM de la página, capturando para cada fila `<tr>`:
- **N° SOS**: número interno de concepto en el sistema SOS Contador
- **Nombre**: descripción del concepto tal como aparece en el recibo
- **N° AFIP**: código de concepto según la clasificación AFIP/SIJP (usado para el LSD)
- **Campos de entrada visibles**: detectados por posición X en pantalla (getBoundingClientRect)
- **Columnas ocultas**: TDs de ancho cero que almacenan la base de cálculo pre-computada
- **Divisores**: `td12` = Dividido hs. norm.; `td13` = Dividido cantidad

Los números SOS **no son consecutivos** — existen bloques de números reservados sin concepto asignado (ej: 44–50, 52–60, 131–200, 235–400, etc.).

**Total: 231 conceptos** (218 originales + 13 nuevos agregados al sistema).

---

## Lógica de fórmulas en SOS

### Estructura de columnas ocultas por fila

Cada fila de concepto en el recibo contiene exactamente **25 TDs directos**. Los índices 3–14 son columnas ocultas (width=0) que SOS pre-calcula y usa como base:

| TD índice | Nombre en SOS          | Descripción                                                 |
|-----------|------------------------|-------------------------------------------------------------|
| td3       | Val. Hora              | Valor hora = sueldo ÷ horasNormalesMes (pre-calculado)      |
| td4       | Sueldo Legajo          | Sueldo básico del empleado importado desde su legajo        |
| td5       | Sueldo                 | Sueldo del período (generalmente igual al legajo)           |
| td6       | Subtot. 1/9            | Acumulado de conceptos 1 al 9 al momento de calcular        |
| td7       | Subtot. 1/19           | Acumulado de conceptos 1 al 19                              |
| td8       | Subtot. 1/26           | Acumulado de conceptos 1 al 26                              |
| td9       | Subtot. 1/39           | Acumulado de conceptos 1 al 39                              |
| td10      | Subtot. 1/199          | Acumulado de conceptos 1 al 199 (total remunerativo)        |
| td11      | Subtot. 411/469        | Acumulado de conceptos 411 al 469 (total no remunerativo)   |
| td12      | Dividido hs. norm.     | Divisor de horas (1 = sin división; 180 = ÷ horasNormales)  |
| td13      | Dividido cantidad      | Divisor de días (1 = sin división; 25 = ÷días hábiles; 30 = ÷días corridos) |
| td14      | Subtotal calculado     | Resultado parcial calculado (output)                        |

### Fórmula general de cálculo

```
monto = base × (cantidad / divCantidad) × (pct / 100)
```

Donde:
- **`base`**: el valor de la columna oculta activa (td3–td11), o un importe fijo ingresado
- **`cantidad`**: campo de entrada "Cantidad" (días, horas, unidades)
- **`divCantidad`**: td13 (divisor de días, ej: 25 = días hábiles; 30 = días corridos)
- **`divHsNorm`**: td12 (divisor de horas, ej: 180 = horasNormalesMes); se aplica ANTES de pct
- **`pct`**: campo de entrada "%" (porcentaje)

Fórmula completa con ambos divisores:
```
monto = base × (cantidad / divHsNorm / divCantidad) × (pct / 100)
```

### Campos de entrada visibles

| Campo            | Descripción                                                                          |
|------------------|--------------------------------------------------------------------------------------|
| **Cantidad**     | Número de unidades (horas extras, días de falta, etc.)                               |
| **%**            | Porcentaje a aplicar sobre la base                                                   |
| **Imp. Conc. N°**| Referencia a otro concepto: toma el monto calculado de ese concepto como base        |
| **Importe**      | Monto fijo ingresado directamente por el usuario                                     |
| **Imp. Mínimo**  | Piso del resultado calculado                                                         |
| **Imp. Máximo**  | Techo del resultado calculado                                                        |
| **Memo**         | Campo de texto libre para aclarar el concepto (ej: nombre del seguro, rubro, etc.)  |

### Columna "Base Cálculo"

| Código en tabla | Significado                                                      |
|-----------------|------------------------------------------------------------------|
| `sueldo`        | Sueldo básico del empleado (desde legajo)                        |
| `valHora`       | Valor hora = sueldo ÷ horasNormalesMes (pre-calculado en td3)    |
| `sub1_9`        | Subtotal acumulado de conceptos 1 a 9                           |
| `sub1_19`       | Subtotal acumulado de conceptos 1 a 19                          |
| `sub1_26`       | Subtotal acumulado de conceptos 1 a 26                          |
| `sub1_39`       | Subtotal acumulado de conceptos 1 a 39                          |
| `sub1_199`      | Subtotal acumulado de conceptos 1 a 199 (total remunerativo)    |
| `sub411_469`    | Subtotal acumulado de conceptos 411 a 469 (total no remunerativo)|
| `importe_fijo`  | Monto ingresado directamente o referenciando otro concepto       |

---

## Tabla de Conceptos

> **Columnas de campos de entrada**: ✓ = campo visible y editable; vacío = campo no presente.
> **DivHs**: Divisor de horas normales (td12). **DivDías**: Divisor de días (td13).

| N° SOS | Nombre del Concepto | N° AFIP | Memo | Cantidad | % | Imp. Conc. N° | Importe | Imp. Mín | Imp. Máx | Base Cálculo | DivHs | DivDías |
|--------|---------------------|---------|------|----------|---|---------------|---------|----------|----------|--------------|-------|---------|
| 1 | Sueldo Basico | 110000 | SI | ✓ | ✓ |  |  |  |  | sueldo | 1 | 30 |
| 3 | Antiguedad (%) | 160001 | NO | ✓ | ✓ |  |  |  |  | sueldo | 1 | 1 |
| 4 | Antiguedad (Importe) | 160001 | NO | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 5 | Premio | 170000 | NO |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 6 | Licencias | 110005 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 7 | Otros Haberes Remunerativos | 161000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 8 | Otros Haberes Remunerativos | 161000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 9 | Asignacion Complementaria (s/sueldo) | 170000 | SI | ✓ | ✓ |  |  |  |  | sueldo | 1 | 1 |
| 10 | Feriados | 110007 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 25 |
| 11 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 12 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 13 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 14 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 15 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 16 | Plus por Zona Desfavorable | 140000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 17 | Horas extras 50% (s/valor hora) | 130001 | NO | ✓ | ✓ |  |  |  |  | valHora | 1 | 1 |
| 18 | Horas extras 100% (s/valor hora) | 130002 | NO | ✓ | ✓ |  |  |  |  | valHora | 1 | 1 |
| 19 | Asignacion Complementaria (s/conc. 1 a 9) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_9 | 1 | 1 |
| 20 | Asignacion Complementaria (s/conc. 1 a 9) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_9 | 1 | 1 |
| 21 | Horas extras 50% (s/sueldo) | 130001 | NO | ✓ | ✓ |  |  |  |  | sueldo | 180 | 1 |
| 22 | Horas extras 100% (s/sueldo) | 130002 | NO | ✓ | ✓ |  |  |  |  | sueldo | 180 | 1 |
| 23 | Horas extras 50% (s/conc. 1 a 9) | 130001 | NO | ✓ | ✓ |  |  |  |  | sub1_9 | 180 | 1 |
| 24 | Horas extras 100% (s/conc. 1 a 9) | 130002 | NO | ✓ | ✓ |  |  |  |  | sub1_9 | 180 | 1 |
| 25 | Horas extras 50% (s/conc. 1 a 19) | 130001 | NO | ✓ | ✓ |  |  |  |  | sub1_19 | 180 | 1 |
| 26 | Horas extras 100% (s/conc. 1 a 19) | 130002 | NO | ✓ | ✓ |  |  |  |  | sub1_19 | 180 | 1 |
| 27 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 28 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 29 | Asignacion Complementaria (s/conc. 1 a 19) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_19 | 1 | 1 |
| 30 | Asignacion Complementaria (s/conc. 1 a 26) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_26 | 1 | 1 |
| 31 | Ajustes de Haberes Remunerativos | 110000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 32 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 33 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 34 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 35 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 36 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 37 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 38 | Incremento Solidario Dec.14/2020 | 110011 | SI |  |  |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 39 | Incr.Salarial Dto 14/2020 Rectif | 110011 | SI |  |  |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 40 | Premio | 170000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 41 | Sueldo Anual Complementario | 120000 | NO |  |  |  | ✓ |  |  | sueldo | 1 | 1 |
| 42 | Sueldo Anual Complementario Proporcional | 120003 | NO | ✓ |  |  |  | ✓ |  | sueldo | 1 | 1 |
| 43 | Asignacion Complementaria (s/conc. 1 a 39) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_39 | 1 | 1 |
| 51 | Vacaciones Gozadas | 151000 | SI | ✓ |  |  | ✓ |  |  | sueldo | 1 | 1 |
| 61 | Comisiones | 170003 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 62 | Comisiones | 170003 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 63 | Viaticos | 170005 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 64 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 65 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 71 | Anticipo de Haberes | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 72 | Feriados | 110007 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 81 | Prest. Dineraria Ley 24577 (primeros 10d) | 110008 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 82 | Prest. Dineraria Ley 24577 (a cargo de la ART) | 110009 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 90 | Rectificativa por remuneración Ley 27.742 | 180000 | NO | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 101 | Dias Enfermedad | 110000 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 102 | Dias Accidente | 110008 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 103 | Dias Faltas Injustificadas | 110000 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 104 | Dias Feriados | 110007 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 105 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 106 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 107 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 108 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 109 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 110 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 111 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 112 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 113 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 114 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 115 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 116 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 117 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 118 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 119 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 120 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 121 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 122 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 123 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 124 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 125 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 126 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 127 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 128 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 129 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 130 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 201 | Jubilacion | 810000 | NO |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 202 | Ley 19032 | 810001 | NO |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 203 | Obra Social | 810002 | SI |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 204 | Obra Social Adherente | 810009 | SI | ✓ | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 205 | Anssal | 810003 | NO |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 206 | Sindicato | 810004 | SI |  | ✓ |  |  | ✓ |  | sub1_199 | 1 | 1 |
| 207 | Federaciones y Otros | 821000 | SI |  | ✓ |  |  | ✓ |  | sub1_199 | 1 | 1 |
| 208 | Impuesto a las Ganancias | 810008 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 209 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | sub1_199 | 1 | 1 |
| 210 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | sub1_199 | 1 | 1 |
| 211 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 212 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 213 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 214 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 215 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 216 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 217 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 218 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 219 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 220 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 221 | Aporte Adicional OS | 810002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 222 | Aporte Adicional OS | 810002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 223 | Salario Complementario Dec 332/2020 | 810012 | SI | ✓ | ✓ |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 226 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 227 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 228 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 229 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 230 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 231 | Adelantos de sueldo | 820000 | SI | ✓ | ✓ |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 232 | RENATEA | 810006 | SI |  | ✓ |  |  | ✓ | ✓ | importe_fijo | 1 | 1 |
| 233 | Seguro de Vida | 810005 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 234 | Pago a cuenta Asignacion Puente al Empleo | 810014 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 401 | Vacaciones no Gozadas | 520012 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 402 | S.A.C. s/ Vacaciones no Gozadas | 520018 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 403 | Preaviso | 520015 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 404 | Indemnizacion | 520011 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 405 | Gratificacion | 520010 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 406 | Indemnizacion por despido | 520014 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 407 | Integracion Mes Despido | 520016 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 408 | SAC s/ Integracion o Preaviso | 520017 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 411 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 412 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 541000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 413 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 414 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 541000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 415 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 416 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 417 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 418 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 419 | Suspension per. parc art 223 bis LCT / Res.397/20 | 550000 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 420 | Suspension art 223 bis LCT / Res. 397/20 MTEySS | 110000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 421 | Rem. habitual Dec 792/2020 | 110000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 422 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 423 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 424 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 425 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 426 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 427 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 428 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 429 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 430 | SAC No Remunerativo (Rem 4 y 8) | 560001B | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 431 | SAC No Remunerativo Prop. (Rem 4 y 8) | 560002B | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 432 | Vacaciones No Remunerativo (Rem 4 y 8) | 560003B | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 433 | SAC No Remunerativo (Rem 1, 4, 5, 8, 9) | 560001C | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 434 | SAC No Remunerativo Prop. (Rem 1, 4, 5, 8 y 9) | 560002C | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 435 | Vacaciones No Remunerativo (Rem 1, 4, 5, 8 y 9) | 560003C | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 436 | SAC No Remunerativo (Rem 4, 8 y 9) | 560001D | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 437 | SAC No Remunerativo Prop. (Rem 4, 8 y 9) | 560002D | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 438 | Vacaciones No Remunerativo (Rem 4, 8 y 9) | 560003D | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 439 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 440 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 451 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 452 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 453 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 454 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 455 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 456 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 457 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 458 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 460 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 461 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 462 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 463 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 464 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 465 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 466 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 467 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 468 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 469 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 470 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 471 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 472 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 473 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 474 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 475 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 476 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 477 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 478 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 479 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 480 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 481 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 482 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 483 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 484 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 491 | Asign. din. - Dec. 390/2021 | 560001 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 492 | Asign. din. - Dec. 390/2021 | 560002 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 493 | Asign. din. - Dec. 390/2021 | 560003 | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 494 | Asign. din. - Dec. 390/2021 | 560001 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 495 | Asign. din. - Dec. 390/2021 | 560002 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 496 | Asign. din. - Dec. 390/2021 | 560003 | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 501 | Acuerdo Sindicato | 810004 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 502 | Acuerdos Obra Social | 810002 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 503 | Acuerdos Federaciones y Otros | 821001 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 504 | RENATEA s/ no Rem | 810006 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 511 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 512 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 513 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 514 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 515 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 516 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 517 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 520 | Ajuste SIPA Dec 792/2020 | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 551 | Jubilacion s/Rem | 810000 | SI |  | ✓ |  |  | ✓ | ✓ | sub411_469 | 1 | 1 |
| 552 | Ley 19032 s/Rem | 810001 | SI |  | ✓ |  |  | ✓ | ✓ | sub411_469 | 1 | 1 |
| 553 | Obra Social s/Rem | 810002 | SI |  | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 554 | Obra Social Adherente s/Rem | 810009 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 555 | Anssal s/Rem | 810003 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 556 | Sindicato s/Rem | 810004 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 557 | Federaciones y Otros s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 558 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI |  |  |  | ✓ |  |  | sub411_469 | 1 | 1 |
| 559 | RENATEA s/Rem | 810006 | SI |  | ✓ |  |  | ✓ | ✓ | sub411_469 | 1 | 1 |
| 560 | Otros conceptos de retenciones s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 561 | Otros conceptos de retenciones s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 562 | Otros conceptos de retenciones s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 601 | Asign. no remunerativa Dec 841/2022 | 560005A | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 602 | Asign. no remunerativa Dec 841/2022 (con ART) | 560005B | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 603 | Asign. din. - Dec. 551/2022 (con ART) | 560004 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 604 | Asignacion no Remunerativa Dcto 438/2023 | 560006A | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 605 | Asignacion no Remunerativa Dcto 438/2023 (con ART) | 560006B | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 610 | Beneficios Sociales | 520000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 611 | Servicio de Comedor | 520001 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 612 | Gastos Médicos | 520002 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 613 | Provisión de ropa de trabajo | 520003 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 614 | Guardería | 520004 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 615 | Provisión de útiles escolares | 520005 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 616 | Gastos de sepelio | 520006 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 617 | Cursos de capacitación | 520007 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 618 | Becas | 520008 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 620 | ASIGNACIÓN POR HIJO/HIJO CON DISCAPACIDAD | 510002 | SI | ✓ | ✓ |  | ✓ |  |  | importe_fijo | 1 | 1 |

---

## Notas sobre los bloques de N° SOS sin asignar

Los siguientes rangos de números SOS no tienen concepto asignado:

| Rango sin asignar |
|-------------------|
| 2 |
| 44 – 50 |
| 52 – 60 |
| 66 – 70 |
| 73 – 80 |
| 83 – 89 |
| 91 – 100 |
| 131 – 200 |
| 224 – 225 |
| 235 – 400 |
| 409 – 410 |
| 441 – 450 |
| 459 |
| 485 – 490 |
| 505 – 510 |
| 518 – 519 |
| 521 – 550 |
| 563 – 600 |
| 606 – 609 |
| 619 |

---

## Conceptos nuevos detectados (no estaban en el relevamiento original)

Se detectaron **13 conceptos nuevos** que no estaban en el primer relevamiento:

| N° SOS | Nombre | N° AFIP |
|--------|--------|---------|
| 430 | SAC No Remunerativo (Rem 4 y 8) | 560001B |
| 431 | SAC No Remunerativo Prop. (Rem 4 y 8) | 560002B |
| 432 | Vacaciones No Remunerativo (Rem 4 y 8) | 560003B |
| 433 | SAC No Remunerativo (Rem 1, 4, 5, 8, 9) | 560001C |
| 434 | SAC No Remunerativo Prop. (Rem 1, 4, 5, 8 y 9) | 560002C |
| 435 | Vacaciones No Remunerativo (Rem 1, 4, 5, 8 y 9) | 560003C |
| 436 | SAC No Remunerativo (Rem 4, 8 y 9) | 560001D |
| 437 | SAC No Remunerativo Prop. (Rem 4, 8 y 9) | 560002D |
| 438 | Vacaciones No Remunerativo (Rem 4, 8 y 9) | 560003D |
| 601 | Asign. no remunerativa Dec 841/2022 | 560005A |
| 602 | Asign. no remunerativa Dec 841/2022 (con ART) | 560005B |
| 604 | Asignacion no Remunerativa Dcto 438/2023 | 560006A |
| 605 | Asignacion no Remunerativa Dcto 438/2023 (con ART) | 560006B |
