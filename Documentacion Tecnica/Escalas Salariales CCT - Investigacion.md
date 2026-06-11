# Escalas Salariales CCT — Investigación de Convenios Pendientes

> Documento generado: 2026-06-08
> Fuentes consultadas: sitios web oficiales de los sindicatos, CAMARCO, publicaciones de estudios contables.

---

## Checklist de Tareas

### Carga en el sistema (Arca)
- [ ] **CCT 272/96 Pastelería** — Cargar categorías y escala de marzo 2026
- [ ] **CCT 167/91 Reposteros MDP (STARP)** — Cargar categorías y escala de diciembre 2025
- [ ] **CCT 76/75 Construcción (UOCRA)** — Cargar categorías y escala mensual (confirmar zona geográfica primero)
- [ ] **CCT 459/06 Emergencias Médicas (Sanidad)** — Cargar categorías y escala de febrero 2026

### Por confirmar / investigar
- [ ] Confirmar zona geográfica de las empresas de construcción (Zona A / B / C) — afecta directamente los valores horarios de UOCRA
- [ ] Confirmar si los empleados de STARP son Mar del Plata o corresponde CCT nacional Pasteleros (272/96)
- [ ] Buscar actualización de CCT 167/91 para 2026 (la última encontrada es diciembre 2025)
- [ ] Buscar escalas CCT 459/06 para mayo–agosto 2026 (el acuerdo de feb 2026 cubre hasta abril)
- [ ] Confirmar si la asignación no remunerativa de CCT 272/96 (abril–septiembre 2026) se liquida como concepto NR separado o ya está absorbida en el básico
- [ ] Asignar categorías a los empleados de cada empresa antes de liquidar
- [ ] Generar recibos de prueba una vez asignadas las categorías

### LSD / Validación (E-presis Mayo 2026)
- [x] Actualizar `rem4y8Override` para CUIL 23400741824: base OS = $1.378.940,11 — corregido (era centavos, ahora pesos)
- [x] Códigos OS de 3 empleados corregidos a OSECAC (126205): Sanchez, Gigio, Gonzalez
- [x] Padding R04 header corregido (`lsdAlpha`) — sin ceros a la izquierda, space-padded
- [x] Descargar y comparar LSD contra referencia — R03 9/9 OK, R04 monetario 9/9 OK
- [ ] Enviar LSD a AFIP (Simplificación Registral) y verificar aceptación sin errores
- [ ] Investigar R01 pos 26-27 (`GEN='00'` vs `REF='13'`)

### Credenciales AFIP
- [ ] Actualizar credenciales para representante Jafif
- [ ] Actualizar credenciales para representante Mirpuri
- [ ] Actualizar credenciales para Admip

---

## CCT 272/96 — Pastelería

**Sindicato:** Sindicato Trabajadores Pasteleros, Servicios Rápidos, Confiteros, Pizzeros, Heladeros y Alfajoreros (Buenos Aires)
**Ámbito:** CABA y Provincia de Buenos Aires — Rama Pastelería
**Fuente:** https://pasteleros.org/convenios/lista-de-escalas-rama-pasteleria/

### Estructura de jornadas

El convenio prevé tres jornadas horarias con distintos básicos:
- **7 hs/día** (jornada reducida)
- **8 hs/día** (jornada completa)
- **9 hs 36'/día** (jornada extendida)

### Escala Marzo 2026 (básicos remunerativos)

| Categoría | 7 hs/mes | 8 hs/mes | 9h36'/mes |
|---|---:|---:|---:|
| Maestro Pastelero / Encargado de Cocina | $2.047.639 | $2.415.258 | $2.661.545 |
| Cocinero / Segundo Pastelero / Maestro Facturero / Hornero / Turnante / Jefe Sandwichero / Saladitero / Fiambrero / Encargado Servicios y Eventos / Chofer | $1.606.311 | $1.895.530 | $2.087.312 |
| Oficial de Sección / Oficial Mantenimiento / Encargado Vendedores-Expedición-Cristalería / Empleado Servicios y Eventos / Segundo Cocinero | $1.449.704 | $1.710.654 | $1.884.601 |
| Oficial de Mesa / 1° Vendedor/a / Saladitero / Sandwichero / Empleado Administrativo / Cajero | $1.399.297 | $1.650.224 | $1.818.731 |
| Medio Oficial / 2° Vendedor/a / Oficial Bañador/a Bombones / Minutero | $1.299.512 | $1.535.612 | $1.691.117 |
| Ayudante Pastelero / Ayudante Sandwichero / Ayudante Cocina / Ayudante Vajillas / Ayudante Chofer / Operario Mantenimiento / Ayudante Servicios y Eventos / Dependiente de Salón / Camarera | $1.224.028 | $1.444.937 | $1.592.385 |
| Suplente de Ventas / Medio Oficial Bañador/a Bombones / Preparador Caja Bombones | $1.224.028 | $1.444.937 | $1.592.385 |
| Peón de Limpieza / Carga y Descarga / Aprendiz Inicial / Repartidor a Domicilio | $1.199.037 | $1.415.837 | $1.558.869 |
| Aprendiz (a los 10 meses) | $1.224.028 | $1.444.937 | $1.592.385 |
| Aprendiz (a los 24 meses → pasa a Medio Oficial) | $1.299.512 | $1.535.612 | $1.691.117 |

### Asignaciones No Remunerativas — Abril a Septiembre 2026

Desde abril 2026 se mantienen **los mismos básicos de marzo** y se acumula una ANR mensual creciente:

| Mes | ANR Maestro Pastelero (8hs) | ANR Peón (8hs) |
|---|---:|---:|
| Abril 2026 | $60.381 | $35.396 |
| Mayo 2026 | $122.212 | — |
| Junio 2026 | $185.733 | — |
| Julio 2026 | $250.704 | — |
| Agosto 2026 | $317.365 | — |
| Septiembre 2026 | $385.717 | — |

> En octubre 2026 las ANR se incorporan al básico remunerativo.

### Nuevos básicos Octubre 2026 (post incorporación ANR)

| Categoría | 7 hs/mes | 8 hs/mes | 9h36'/mes |
|---|---:|---:|---:|
| Maestro Pastelero / Encargado de Cocina | $2.374.647 | $2.800.975 | $3.086.594 |

### Adicionales del convenio

- **Antigüedad (Art. 44):** 2% (1–2 años) / 4% (2–5) / 9% (5–10) / 11% (10–15) / 14% (15–20) / 17% (20–25) / 19% (25–30)
- **Capacitación (Art. 85):** 10% del básico de categoría (cursos aprobados del sindicato o Cámara de Confiterías)

### Salarios por eventos (D.N.R.T. 1096/92) — Marzo 2026

| Categoría | Jornada 7 hs | Jornada 9h36' |
|---|---:|---:|
| Encargado de Servicios y Eventos | $87.035 | $117.777 |
| Empleado de Servicios y Eventos | $75.646 | $103.642 |
| Ayudante de Servicios y Eventos | $71.983 | $94.359 |

---

## CCT 167/91 — Reposteros, Alfajoreros, Pizzeros y Heladeros (Mar del Plata)

**Sindicato:** S.T.A.R.P. y H. — Sindicato Trabajadores Alfajoreros, Reposteros, Pizzeros y Heladeros
**Sede:** España 1555, Mar del Plata — Tel. 473-5521
**Ámbito:** Zona de actuación de Mar del Plata
**Fuente:** https://starpyhmdp.com.ar (sección descargas)

### Establecimientos comprendidos

Panaderías con Confiterías, Fábricas de Repostería, Fábricas de Churros, Sandwiches, Empanadas y/o Pasteles, Discos de Hojaldre, Pre-Pizzas, Bizcochos y casas similares.

### Escala Diciembre 2025

> Los básicos publicados ya incluyen el **+10% de Convenio** (Anexo N°3, Expte. 247551/05).

**a) Personal de Elaboración / Expedición / Mantenimiento:**

| Categoría | Básico Dic 2025 |
|---|---:|
| Encargado General (30% más que Oficial) | $2.090.173 |
| Maestro (Repostero / Heladero / Bombonero / Saladitero / Chocolatero) (20% más que Oficial) | $1.929.390 |
| Encargado de Sección | $1.755.021 |
| Segundo Maestro / Facturero / Sandwichero | $1.755.021 |
| Oficial Especializado (Hornero / Repostero / Saladitero / Sandwichero) | $1.653.116 |
| Oficial (Facturero / Bizcochero) | $1.607.825 |
| Medio Oficial | $1.528.566 |
| Calificado/a | $1.449.307 |
| Ayudante | $1.426.662 |

**b) Personal de Categorías Complementarias:**

| Categoría | Básico Dic 2025 |
|---|---:|
| Supervisor / Adicionista | $1.449.307 |
| Chofer / Repartidor / Delivery | $1.426.662 |
| Sereno / Control / Recepcionista | $1.415.339 |

**c) Personal de Administración y Ventas:**

| Categoría | Básico Dic 2025 |
|---|---:|
| Encargado General (30% más que Administrativo) | $2.016.575 |
| Encargado de Sección | $1.641.794 |
| Administrativo | $1.551.212 |
| Cajero | $1.517.244 |
| Auxiliar Administrativo/a | $1.415.339 |
| Vendedor (desde 7° mes) / Camarera / Dependiente Mostrador / Cafetero / Barman / Telemarketer | $1.404.017 |
| Inicial en Ventas (hasta 6° mes) | $1.132.271 |

### Adicionales del convenio

- **Antigüedad (Art. 70):** 2% acumulativo del año 1 al 5; luego 1% anual acumulativo desde el 6°
- **Ascensos retributivos (Art. 68):** 4% más al cumplir 36 meses en la misma categoría (categorías marcadas en el convenio)
- **Equipo de ropa (Art. 59):** compensación económica
- **Vacaciones (Art. 49):** bonificadas en días
- **Títulos (Art. 66):** compensación económica
- **Responsabilidad por caja (Arts. 30 y 67):** compensación económica

> **Pendiente:** No se encontró actualización para 2026. Última disponible: diciembre 2025. Verificar en el sitio del sindicato o contactar al (0223) 473-5521.

---

## CCT 76/75 — Construcción (UOCRA)

**Sindicato:** UOCRA — Unión Obrera de la Construcción de la República Argentina
**Fuente:** https://jorgevega.com.ar/laboral/384-uocra-escalas-2026-marzo.html / CAMARCO (camarco.org.ar)

### Zonas geográficas

| Zona | Provincias |
|---|---|
| **Zona A** | CABA, Buenos Aires, Córdoba, Santa Fe, Mendoza, Salta, Tucumán, Entre Ríos, Catamarca, San Juan, Chaco, Corrientes, La Rioja, Formosa, Jujuy, Misiones, Santiago del Estero |
| **Zona B** | La Pampa, Neuquén, Río Negro, Chubut |
| **Zona C** | Santa Cruz |
| **Zona C Austral** | Tierra del Fuego |

### Escala 2026 — Zona A (valor por hora, excepto Sereno que es mensual)

| Categoría | Mar'26 | Abr'26 | May'26 | Jun'26 | Jul'26 | Ago'26 |
|---|---:|---:|---:|---:|---:|---:|
| Oficial Especializado ($/h) | $5.579 | $6.011 | $6.119 | $6.666 | $6.800 | $7.420 |
| Oficial ($/h) | $4.773 | $5.142 | $5.235 | $5.703 | $5.817 | $6.348 |
| Medio Oficial ($/h) | $4.411 | $4.752 | $4.837 | $5.270 | $5.375 | $5.866 |
| Ayudante ($/h) | $4.060 | $4.374 | $4.452 | $4.851 | $4.948 | $5.399 |
| Sereno ($/mes) | $737.493 | $794.575 | $808.877 | $881.193 | $898.817 | $980.858 |

### Escala 2026 — Zona B (La Pampa, Neuquén, Río Negro, Chubut)

| Categoría | Mar'26 | Abr'26 | May'26 | Jun'26 | Jul'26 | Ago'26 |
|---|---:|---:|---:|---:|---:|---:|
| Oficial Especializado ($/h) | $6.193 | $6.672 | $6.792 | $7.400 | $7.548 | $8.237 |
| Oficial ($/h) | $5.300 | $5.711 | $5.813 | $6.333 | $6.460 | $7.049 |
| Medio Oficial ($/h) | $4.889 | $5.267 | $5.362 | $5.842 | $5.958 | $6.502 |
| Ayudante ($/h) | $4.527 | $4.877 | $4.965 | $5.409 | $5.517 | $6.020 |
| Sereno ($/mes) | $821.599 | $885.191 | $901.124 | $981.688 | $1.001.322 | $1.092.719 |

### Escala 2026 — Zona C (Santa Cruz)

| Categoría | Mar'26 | Abr'26 | May'26 | Jun'26 | Jul'26 | Ago'26 |
|---|---:|---:|---:|---:|---:|---:|
| Oficial Especializado ($/h) | $8.565 | $9.228 | $9.394 | $10.234 | $10.439 | $11.392 |
| Oficial ($/h) | $8.030 | $8.652 | $8.808 | $9.595 | $9.787 | $10.680 |
| Medio Oficial ($/h) | $7.749 | $8.349 | $8.499 | $9.259 | $9.444 | $10.306 |
| Ayudante ($/h) | $7.524 | $8.107 | $8.252 | $8.990 | $9.170 | $10.007 |
| Sereno ($/mes) | $1.232.928 | $1.328.356 | $1.352.267 | $1.473.164 | $1.502.627 | $1.639.782 |

### Escala 2026 — Zona C Austral (Tierra del Fuego)

| Categoría | Mar'26 | Abr'26 | May'26 | Jun'26 | Jul'26 | Ago'26 |
|---|---:|---:|---:|---:|---:|---:|
| Oficial Especializado ($/h) | $11.158 | $12.022 | $12.238 | $13.333 | $13.599 | $14.841 |
| Oficial ($/h) | $9.545 | $10.284 | $10.469 | $11.405 | $11.633 | $12.695 |
| Medio Oficial ($/h) | $8.821 | $9.504 | $9.675 | $10.540 | $10.750 | $11.732 |
| Ayudante ($/h) | $8.119 | $8.747 | $8.905 | $9.701 | $9.895 | $10.798 |
| Sereno ($/mes) | $1.474.985 | $1.589.149 | $1.617.754 | $1.762.386 | $1.797.634 | $1.961.716 |

### Estructura de incrementos 2026

| Mes | Incremento aplicado |
|---|---|
| Enero 2026 | +2,0% sobre dic 2025 |
| Febrero 2026 | +1,8% sobre ene 2026 |
| Marzo 2026 | +2,0% sobre feb 2026 |
| Abril 2026 | +1,9% sobre mar 2026 |
| Mayo 2026 | +1,8% sobre abr 2026 |
| Junio 2026 | +2,1% sobre may 2026 |
| Julio 2026 | +2,0% sobre jun 2026 |
| Agosto 2026 | +1,9% sobre jul 2026 |

> **Importante:** UOCRA liquida **por hora trabajada**, no básico mensual fijo. El básico del recibo = `valor_hora × horas_trabajadas_en_el_mes`. El Sereno es el único con valor mensual fijo.

---

## CCT 459/06 — Emergencias Médicas, Medicina Domiciliaria y Traslado de Pacientes

**Sindicato:** FATSA — Federación de Asociaciones de Trabajadores de la Sanidad Argentina
**Fuente:** https://www.sanidad.org.ar/acciongremial/cct/c459.aspx

### Categorías (I-A a VI)

El convenio define 8 categorías. Los puestos específicos de cada categoría están en el texto completo del CCT 459/06 disponible en sanidad.org.ar. Pendiente: mapear los puestos de los empleados a cada categoría.

### Escala Agosto–Octubre 2025 (acuerdo 01/02/2025–31/01/2026)

| Categoría | Ago 2025 | Sep 2025 | Oct 2025 |
|---|---:|---:|---:|
| I A | $1.383.831 | $1.407.356 | $1.429.874 |
| I B | $1.097.843 | $1.116.507 | $1.134.371 |
| II A | $1.061.456 | $1.079.501 | $1.096.773 |
| II B | $1.020.998 | $1.038.355 | $1.054.969 |
| III | $1.002.291 | $1.019.329 | $1.035.639 |
| IV | $963.536 | $979.916 | $995.594 |
| V | $868.653 | $883.420 | $897.555 |
| VI | $816.780 | $830.665 | $843.956 |

Adicionales del período:
- Intangibilidad salarial NR: $60.000 (mantenido de acuerdo anterior)
- Día de la Sanidad (sep 2025): $56.706 NR, pago único
- Contribución extraordinaria: $10.665/trabajador/mes (ago–oct 2025)
- Cuota solidaridad: 1% de la remuneración integral mensual

### Escala Febrero–Abril 2026 (nuevo acuerdo, vigencia 01/02/2026–31/01/2027)

Incremento: +1,8% + $80.000 NR en febrero, con ajuste mensual acumulativo:

| Categoría | Feb 2026 | Mar 2026 | Abr 2026 |
|---|---:|---:|---:|
| I A | $1.522.102 | $1.547.977 | $1.572.745 |
| I B | $1.207.538 | $1.228.067 | $1.247.716 |
| II A | $1.167.515 | $1.187.363 | $1.206.361 |
| II B | $1.123.015 | $1.142.106 | $1.160.380 |
| III | $1.102.438 | $1.121.179 | $1.139.118 |
| IV | $1.059.811 | $1.077.828 | $1.095.073 |
| V | $955.447 | $971.690 | $987.237 |
| VI | $898.392 | $913.664 | $928.283 |

Adicionales del período:
- Día de la Sanidad (sep 2026): $63.369,91 NR, pago único
- Cuota solidaridad: 1% de la remuneración integral mensual (retención al trabajador)

> **Escalas mayo 2026 en adelante:** No publicadas al momento de esta investigación. Pendiente revisión paritaria prevista en el acuerdo.

---

## Notas para la carga en Arca

1. **UOCRA paga por hora** — definir el básico en el sistema como `valor_hora × horas_del_mes`. No hay "sueldo básico mensual" excepto para el Sereno.
2. **CCT 272/96 Pastelería** — hay 3 básicos por categoría (7/8/9h36'). Definir la jornada contractual de cada empleado antes de asignar la categoría.
3. **CCT 167/91 STARP** — los básicos publicados ya incluyen el +10% de Convenio (Anexo 3). No sumar ese porcentaje nuevamente al cargar.
4. **CCT 459/06 Sanidad** — las ANR (intangibilidad, Día de la Sanidad) se liquidan como conceptos no remunerativos separados. La cuota solidaridad es una retención al trabajador del 1% del total remunerativo.
5. Para todos los convenios: verificar si las empresas pagan adicionales propios más allá del convenio (plus empresa, adicionales voluntarios, etc.) y cargarlos como conceptos adicionales.
