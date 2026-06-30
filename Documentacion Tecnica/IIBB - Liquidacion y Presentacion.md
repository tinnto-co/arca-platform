# IIBB — Documento Maestro

**Creado:** 2026-06-24
**Última actualización:** 2026-06-26
**Estado:** En progreso

---

## 1) Conceptos de dominio

### 1.1 Regímenes: Régimen Local vs. Convenio Multilateral

Los dos regímenes son **excluyentes entre sí**: una empresa nunca liquida ambos al mismo tiempo.

| Régimen | Cuándo corresponde |
|---|---|
| **Régimen Local** | La empresa desarrolla actividad en una sola jurisdicción (una provincia o CABA). Tributa IIBB únicamente ante ese fisco provincial. |
| **Convenio Multilateral** | La actividad alcanza dos o más jurisdicciones. El impuesto se distribuye entre las provincias involucradas según las reglas del Convenio Multilateral. |

**Ejemplos:**
- Un comercio que solo vende y opera en Córdoba → **Régimen Local**.
- Un desarrollador de software en Buenos Aires que presta servicios desde varias provincias → **Convenio Multilateral**.
- Una empresa con sucursales en CABA y Santa Fe → **Convenio Multilateral**.

### 1.2 Proceso de liquidación (ambos regímenes)

Independientemente del régimen, siempre existe una liquidación. Lo que cambia es cómo se calcula y dónde se presenta.

1. **Determinar el régimen** — Régimen Local o Convenio Multilateral.
2. **Reunir información del período** — facturación, ingresos gravados, exentos, no gravados, retenciones, percepciones, etc.
3. **Liquidar** — calcular el impuesto:
   - Determinar la base imponible.
   - Aplicar la alícuota correspondiente.
   - Descontar retenciones, percepciones y otros créditos fiscales.
   - Obtener el saldo a pagar (o saldo a favor).
4. **Presentar la declaración jurada** — ante el organismo que corresponda.
5. **Pagar el saldo** — si corresponde, emitir el volante y cancelar.

> En un sistema de gestión, "liquidar" refiere específicamente al paso 3. Los pasos 4 y 5 son presentación y pago.

### 1.3 Dónde se presenta la declaración jurada

**Régimen Local** — en el organismo recaudador de la provincia inscripta:

| Provincia | Organismo |
|---|---|
| Buenos Aires | ARBA |
| CABA | AGIP |
| Santa Fe | API |
| Córdoba | DGR |
| Otras | Cada provincia tiene su propia agencia |

**Convenio Multilateral** — a través de **SIFERE Web**, administrado por la Comisión Arbitral. En SIFERE se cargan los ingresos, se distribuyen entre jurisdicciones, se calcula el impuesto por provincia, se presenta la DJ y se generan los volantes de pago.

---

## 2) Modelo de datos en Arca

```
representative
├── convenio_multilateral: boolean (default false)
└── regimen_local: boolean (default false)

invoice
└── receipt_province: text  ← fuente de verdad para detección automática
```

**Regla de integridad:** nunca deben ser ambos `true` al mismo tiempo. El backend debe validarlo en `createRepresentative` y `updateRepresentative`.

La tabla `invoice` tiene el campo `direction` con valores `"Outbound"` / `"Inbound"` (con mayúscula). El campo `receipt_province` con valor `"sin datos"` se excluye del análisis (es un placeholder de importación, no una provincia real).

---

## 3) Análisis y clasificación masiva (2026-06-24)

Script ejecutado: `src/scripts/analyze-regimen-fiscal.ts`

### 3.1 Resumen general

| Categoría | Empresas | Acción |
|---|---|---|
| Multilateral detectadas (> 1 provincia) | 40 | Actualizadas automáticamente ✅ |
| Régimen local — alta confianza (1 provincia, ≥ 3 facturas con provincia) | 8 | Actualizadas automáticamente ✅ |
| Régimen local — baja confianza (1 provincia, < 3 facturas con provincia) | 4 | Pendiente de decisión ⚠️ |
| Sin datos suficientes | 8 | Asignación manual pendiente ❌ |
| **Total** | **60** | |

### 3.2 Empresas MULTILATERAL (40) — actualizadas ✅

Flag seteado: `convenio_multilateral = true`, `regimen_local = false`.

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

### 3.3 Empresas RÉGIMEN LOCAL — alta confianza (8) — actualizadas ✅

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

### 3.4 Empresas RÉGIMEN LOCAL — baja confianza (4) — pendiente ⚠️

Flag NO modificado. Tienen una sola provincia detectada, pero la gran mayoría de sus facturas outbound tienen `receipt_province = null`. El dato puede ser correcto, pero no es estadísticamente confiable.

| Empresa | CUIT | Facturas totales | Facturas con provincia | Provincia detectada |
|---|---|---|---|---|
| Artzeinu | 20372769034 | 176 | 1–2 | Capital Federal |
| Deze Construcciones Srl | 23312403129 | 4 | 3–4 | Capital Federal |
| Krakovsky Vanina | 27243142240 | 3 | 3 | Capital Federal |
| Max Buddy SA | 20956957258 | 1 | 1 | Buenos Aires |

**Decisión pendiente:** ¿se clasifican como LOCAL igual, o se asignan manualmente desde la UI?

### 3.5 Empresas SIN DATOS (8) — asignación manual pendiente ❌

Flag NO modificado. Deben asignarse manualmente desde la ficha del cliente.

**Sub-caso A — sin facturas outbound importadas (6):**

| Empresa | CUIT | Motivo |
|---|---|---|
| Adriana Cuellar | 27956661667 | 0 facturas outbound |
| Classic Drinks | 30719065313 | 0 facturas outbound |
| Flor de azar S.A. (empieza en diciembre) | 20125019359 | 0 facturas outbound |
| Importadora del caribe RD | 27190607769 | 0 facturas outbound |
| Semeca Ingenieria Srl | 30715433490 | 0 facturas outbound |
| Yinrai SA | 20392685139 | 0 facturas outbound |

**Sub-caso B — facturas outbound sin `receipt_province` en ninguna (1):**

| Empresa | CUIT | Detalle |
|---|---|---|
| Cascini Claudio Agustin | 20224275650 | 18 facturas outbound, todas con `receipt_province = null`. Revisar CSV fuente. |

**Sub-caso C — una sola factura sin provincia (1):**

| Empresa | CUIT | Detalle |
|---|---|---|
| Casa Fortuna SACI FI | 27047032453 | 1 factura outbound sin provincia. Insuficiente para inferir. |

---

## 4) Lo implementado en Arca

### Paso 1 — Script de análisis ✅
**Archivo:** `src/scripts/analyze-regimen-fiscal.ts`
Clasifica todas las empresas en base a `receipt_province`. No modifica datos.

### Paso 2 — Revisión manual ✅ (parcial)
48 empresas confirmadas para actualización automática. 12 quedan pendientes.

### Paso 3 — Script de actualización masiva ✅
**Archivo:** `src/scripts/set-regimen-fiscal.ts`
- Empresas con > 1 provincia distinta → `convenio_multilateral = true`
- Empresas con 1 provincia y ≥ 3 facturas → `regimen_local = true`
- Casos sin datos o baja confianza → no tocados

40 multilateral + 8 local actualizadas (48 total).

### Paso 4 — UI: selector en edición de cliente ✅
**Archivo:** `src/components/edit-client-dialog.tsx`

Se agregó un `RadioGroup` con tres opciones excluyentes:
```
Régimen IVA provincial
  ○ Régimen local          → regimenLocal=true,  convenioMultilateral=false
  ○ Convenio multilateral  → regimenLocal=false, convenioMultilateral=true
  ○ Sin definir            → regimenLocal=false, convenioMultilateral=false
```
Mapea a los dos booleans en el schema Zod. No se agrega al create dialog (el flujo AFIP es complejo; se define desde edición).

### Paso 5 — Módulo IIBB en la barra lateral ✅ (2026-06-26)
**Archivos:**
- `src/routes/_authed/iibb/index.tsx` — nueva ruta `/iibb`
- `src/actions/client.tsx` — nueva función `getRepresentativesForIIBB()`
- `src/components/app-sidebar.tsx` — nuevo ítem "IIBB" con ícono Globe

El módulo tiene dos solapas con layout idéntico: selector de empresa → selector de perfil (si hay más de uno) → mes/año → tabla de desglose por provincia (base imponible e IVA). Reutiliza `getClientMultilateralSummary` de `src/actions/invoice.tsx`.

---

## 5) Pendientes

### 5.1 Inmediatos

- **Asignar los 12 casos pendientes** (4 baja confianza + 8 sin datos) manualmente desde la UI de edición de cliente.
- **Condicionar el tab "Convenio Multilateral"** en la ficha del cliente (`client-detail-page.tsx`): mostrarlo solo si `convenioMultilateral = true`; ocultarlo o reemplazarlo si `regimenLocal = true`.

### 5.2 Próximo ciclo — liquidación efectiva

El módulo actual muestra el desglose de facturación por provincia (insumo para la liquidación), pero no implementa todavía:

1. Cálculo de alícuotas por provincia.
2. Aplicación de retenciones y percepciones del período.
3. Cálculo del saldo a pagar (o a favor).
4. Generación de la declaración jurada.
5. Integración con SIFERE Web (Convenio Multilateral) o sistemas provinciales (Régimen Local).
