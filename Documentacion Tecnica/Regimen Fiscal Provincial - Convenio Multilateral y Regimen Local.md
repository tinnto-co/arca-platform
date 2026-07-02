# Régimen Fiscal Provincial — Convenio Multilateral y Régimen Local

**Fecha:** 2026-06-24
**Estado:** En progreso

---

## Contexto y conceptos

En Argentina, las empresas que tributan Ingresos Brutos pueden estar bajo dos regímenes:

- **Régimen local**: la empresa factura únicamente en una sola provincia. Tributa IIBB solo ante ese fisco provincial.
- **Convenio Multilateral**: la empresa ejerce actividad en más de una provincia. Distribuye su base imponible entre todas las provincias donde facturó, tributando ante cada fisco según los coeficientes unificados.

Actualmente en Arca, la tabla `representative` ya tiene dos columnas booleanas para modelar esto:
- `convenio_multilateral` (boolean, default false)
- `regimen_local` (boolean, default false)

Son **excluyentes entre sí**: una empresa no puede ser ambas cosas al mismo tiempo.

---

## Situación actual

- Los dos flags existen en el schema pero **ninguno de los dos se expone en la UI** de alta/edición de cliente.
- El tab "Convenio Multilateral" en la ficha del cliente se muestra siempre (no está condicionado al flag).
- No existía lógica que detectara automáticamente el régimen a partir de las facturas importadas.
- Las facturas tienen el campo `receipt_province` (provincia del comprobante), que es la fuente de verdad para detectar el régimen real.

**Nota técnica:** el campo `direction` en la tabla `invoice` se guarda como `"Outbound"` / `"Inbound"` (con mayúscula). El filtro en el script de análisis usa `lower(direction)` para evitar problemas de case. El valor `"sin datos"` en `receipt_province` se excluye del conteo (es un placeholder de importación, no una provincia real).

---

## Resultados del análisis (2026-06-24)

Script ejecutado: `src/scripts/analyze-regimen-fiscal.ts`

### Resumen general

| Categoría | Empresas | Acción |
|---|---|---|
| Multilateral detectadas (> 1 provincia) | 40 | Actualizar automáticamente ✅ |
| Régimen local — alta confianza (1 provincia, ≥ 3 facturas con provincia) | 8 | Actualizar automáticamente ✅ |
| Régimen local — baja confianza (1 provincia, < 3 facturas con provincia) | 4 | Pendiente de revisión ⚠️ |
| Sin datos suficientes | 8 | Asignación manual desde UI ❌ |
| **Total** | **60** | |

---

### Empresas MULTILATERAL (40) — actualizadas ✅

Facturan a más de 1 provincia. Flag seteado: `convenio_multilateral = true`, `regimen_local = false`.

| Empresa | CUIT | Provincias |
|---|---|---|
| Metagame SA | 20353232607 | 24 (todo el país) |
| Mugiwaras | 20299166849 | 24 (todo el país) |
| Multibrod SA | 20413966877 | 24 (todo el país) |
| BazarSale S.A | 27218315661 | 24 (todo el país) |
| Pinco Debora | 27219242579 | 19 |
| Chirin Srl | 23309250559 | 21 |
| Jibur SA | 20302777188 | 18 |
| Mazal Dream SA | 27377520136 | 17 |
| GB Metal | 20249667553 | 16 |
| Khiro SA | 23208917439 | 12 |
| Larsol SA | 20262813615 | 11 |
| Melman Pablo | 20240300835 | 15 |
| Produsel S.A | 20219540176 | 9 |
| Celia Lerman (presentar en 0) | 20376086497 | 7 |
| Mr Almohada Factory | 20141207238 | 7 |
| E-Presis SA | 23222352339 | 10 |
| Green Safety | 20259968012 | 5 |
| Carballo Fabian Alberto | 20180955454 | 3 |
| Alberto Uriel Jafif | 20361710534 | 3 |
| Alderete Oscar | 23165188209 | 3 |
| Díaz Miguens Fernando | 20235093287 | 4 |
| KASUR LIPAT | 20238883343 | 5 |
| Master Kids SA | 20280317315 | 5 |
| Reaj SA | 20204576859 | 5 |
| Rojot SA | 27336633619 | 5 |
| Termomecanica Valtri | 27329997354 | 4 |
| Pawan Mirpuri | 20962069291 | 5 |
| GB Bazar SA | 20277692806 | 2 |
| Alejandro Rolon | 20200123310 | 2 |
| Gomez Leonardo Nahuel | 20405459036 | 2 |
| In Arquitectura | 20391713643 | 2 |
| King Ventas SA | 20469560660 | 2 |
| Minhashamaim SA | 27170231665 | 2 |
| Momel Srl | 27238036025 | 2 |
| Ngvs SA | 27297863458 | 2 |
| Nuñez Castillejo Angelo R | 20940667497 | 2 |
| Selem Javier | 20231269879 | 2 |
| Sfintzi Gustavo | 23180855459 | 2 |
| Sigana SA | 20043687973 | 2 |
| Suc Azar Maria | 27200059382 | 2 |

---

### Empresas RÉGIMEN LOCAL — alta confianza (8) — actualizadas ✅

Flag seteado: `convenio_multilateral = false`, `regimen_local = true`.

| Empresa | CUIT | Facturas con provincia |
|---|---|---|
| Salem José | 20127571083 | 82 |
| Brique Construcciones Srl | 23312071959 | 51 |
| Zahrarh SA | 20175849913 | 25 |
| Admip Srl | 20924016869 | 19 |
| Marcelo Ergas | 20219816090 | 12 |
| Pahue Technologies SA | 20394660222 | 11 |
| Setton Jose | 20042067696 | 9 |
| Gmontajes SA | 20253994313 | 4 |

---

### Empresas RÉGIMEN LOCAL — baja confianza (4) — pendiente decisión ⚠️

Flag NO modificado. Tienen una sola provincia detectada, pero la gran mayoría de sus facturas outbound tienen `receipt_province = null` (importadas antes de que se empezara a poblar ese campo). El dato puede ser correcto, pero no es estadísticamente confiable.

| Empresa | CUIT | Facturas totales | Facturas con provincia | Provincia detectada |
|---|---|---|---|---|
| Artzeinu | 20372769034 | 176 | 1–2 | Capital Federal |
| Deze Construcciones Srl | 23312403129 | 4 | 3–4 | Capital Federal |
| Krakovsky Vanina | 27243142240 | 3 | 3 | Capital Federal |
| Max Buddy SA | 20956957258 | 1 | 1 | Buenos Aires |

**Decisión pendiente:** ¿se clasifican como LOCAL igual, o se asignan manualmente desde la UI?

---

### Empresas SIN DATOS (8) — requieren asignación manual desde UI ❌

Flag NO modificado. Deben asignarse manualmente una vez implementado el Paso 5 (UI).

**Sub-caso A — sin facturas outbound importadas (6):**

| Empresa | CUIT | Motivo |
|---|---|---|
| Adriana Cuellar | 27956661667 | 0 facturas outbound |
| Classic Drinks | 30719065313 | 0 facturas outbound |
| Flor de azar S.A. (empieza en diciembre) | 20125019359 | 0 facturas outbound |
| Importadora del caribe RD | 27190607769 | 0 facturas outbound |
| Semeca Ingenieria Srl | 30715433490 | 0 facturas outbound |
| Yinrai SA | 20392685139 | 0 facturas outbound |

**Sub-caso B — facturas outbound presentes pero sin `receipt_province` en ninguna (1):**

| Empresa | CUIT | Detalle |
|---|---|---|
| Cascini Claudio Agustin | 20224275650 | 18 facturas outbound, todas con `receipt_province = null`. Revisar CSV fuente. |

**Sub-caso C — una sola factura sin provincia (1):**

| Empresa | CUIT | Detalle |
|---|---|---|
| Casa Fortuna SACI FI | 27047032453 | 1 factura outbound sin provincia. Insuficiente para inferir. |

---

## Plan de implementación

### Paso 1 — Script de análisis (sin modificar datos)

**Archivo:** `src/scripts/analyze-regimen-fiscal.ts`
**Comando:** `bun run src/scripts/analyze-regimen-fiscal.ts`

Clasifica todas las empresas en base a `receipt_province` de facturas outbound. No modifica nada.

**Estado: completado ✅**

---

### Paso 2 — Revisión manual

Con la salida del script, el contador revisa caso por caso. Los casos `SIN DATOS` o `BAJA CONFIANZA` requieren revisión manual obligatoria.

**Resultado:** 48 empresas confirmadas para actualización automática (40 multilateral + 8 local alta confianza). 12 quedan pendientes.

**Estado: completado parcialmente ✅ (48 confirmadas, 12 pendientes)**

---

### Paso 3 — Script de actualización masiva

**Archivo:** `src/scripts/set-regimen-fiscal.ts`
**Comando:** `bun run src/scripts/set-regimen-fiscal.ts`

Lógica:
- Empresas con > 1 provincia distinta → `convenio_multilateral = true`, `regimen_local = false`
- Empresas con 1 provincia y ≥ 3 facturas con provincia → `convenio_multilateral = false`, `regimen_local = true`
- Empresas `SIN DATOS` o `BAJA CONFIANZA` → no tocar

**Estado: completado ✅ — 40 multilateral + 8 local actualizadas (48 total)**

---

### Paso 4 — Resolver casos pendientes (12 empresas)

Una vez implementada la UI del Paso 5, asignar manualmente desde la ficha de cada cliente:
- 4 empresas de baja confianza (decisión pendiente en sección de resultados)
- 8 empresas sin datos

**Estado: pendiente**

---

### Paso 5 — UI: selector exclusivo en alta/edición de cliente

**Archivos a modificar:**
- `src/components/edit-client-dialog.tsx`
- `src/components/create-client-dialog.tsx`

Cambio: agregar un campo `RadioGroup` con tres opciones excluyentes:

```
Régimen IVA provincial
  ○ Régimen local          → regimenLocal=true,  convenioMultilateral=false
  ○ Convenio multilateral  → regimenLocal=false, convenioMultilateral=true
  ○ Sin definir            → regimenLocal=false, convenioMultilateral=false
```

El campo debe ser opcional (puede quedar "Sin definir"), mapear a los dos booleans al hacer submit, y mostrarse en la sección de datos fiscales del formulario.

**Estado: completado ✅**

Implementado en `edit-client-dialog.tsx`. Se agregó:
- Campo `regimenFiscal` (`"local" | "multilateral" | "sin_definir"`) al schema Zod
- `RadioGroup` visual de 3 opciones, con highlighting del seleccionado
- Mapeo desde los dos booleans al cargar el form (`convenioMultilateral`/`regimenLocal` → `regimenFiscal`)
- Mapeo inverso al guardar (`regimenFiscal` → `convenioMultilateral` + `regimenLocal`)
- No se agrega al create dialog (el flujo AFIP es complejo; se define desde edición)

---

### Paso 6 — Condicionar el tab en la ficha del cliente

**Archivo:** `src/components/client-detail-page.tsx`

El tab "Convenio Multilateral" actualmente se muestra siempre. Condicionarlo una vez que los flags estén seteados:

- Si `convenioMultilateral = true` → mostrar tab "Convenio Multilateral"
- Si `regimenLocal = true` → no mostrar tab multilateral (el tab de Régimen Local aún no existe)
- Si ninguno → mantener comportamiento actual o mostrar aviso para definir el régimen

**Estado: pendiente**

---

## Modelo de datos

```
representative
├── convenio_multilateral: boolean (default false)
└── regimen_local: boolean (default false)

invoice
└── receipt_province: text  ← fuente de verdad para detección automática
```

**Regla de integridad:** nunca deben ser ambos `true` al mismo tiempo. El backend debe validarlo en `createRepresentative` y `updateRepresentative`.

---

## Checklist de ejecución

1. [x] Ejecutar script de análisis → `src/scripts/analyze-regimen-fiscal.ts`
2. [x] Confirmar régimen para cada empresa — 48 confirmadas, 12 pendientes
3. [x] Ejecutar script de actualización masiva → 48 empresas actualizadas
4. [ ] Decidir y resolver casos de baja confianza (4 empresas)
5. [x] Implementar UI en edición de cliente → `src/components/edit-client-dialog.tsx`
6. [ ] Asignar manualmente los 12 casos pendientes desde la UI
7. [ ] Condicionar visibilidad del tab multilateral en ficha
