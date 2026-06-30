# Actualizacion - 2026-06-24

## 1) Objetivo general del dia

Planificación e implementación completa del módulo de régimen fiscal provincial (Convenio Multilateral / Régimen Local). Se documentó el diseño, se crearon scripts de análisis y actualización masiva, se clasificaron 48 de las 60 empresas, y se implementó el selector de régimen en el dialog de edición de cliente. Quedan 12 empresas pendientes de resolución manual y el condicionamiento del tab multilateral en la ficha.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Clasificación de empresas por régimen fiscal provincial

- **Cambio:** Se setearon los flags `convenio_multilateral` y `regimen_local` en la tabla `representative` para 48 empresas, basándose en el análisis de facturas outbound importadas.
- **Motivo:** Los flags existían en el schema pero nunca se habían poblado. Sin este dato, no es posible mostrar el módulo correcto (multilateral vs. local) en la ficha de cada cliente.
- **Impacto:** Las 40 empresas que facturan a más de 1 provincia quedan marcadas como Convenio Multilateral. Las 8 que facturan a 1 sola provincia quedan marcadas como Régimen Local. Las 12 restantes permanecen sin definir hasta resolución manual.
- **Archivos:** `src/scripts/analyze-regimen-fiscal.ts`, `src/scripts/set-regimen-fiscal.ts`

### 2.2 Selector de régimen en edición de cliente

- **Cambio:** Se agregó el campo "Régimen IIBB provincial" al dialog de edición de cliente, con tres opciones excluyentes: Régimen local, Multilateral, Sin definir.
- **Motivo:** Los flags `convenio_multilateral` y `regimen_local` no estaban expuestos en la UI. El contador no tenía forma de asignar o corregir el régimen de un cliente desde la interfaz.
- **Impacto:** Ahora el contador puede ver y modificar el régimen de cualquier cliente desde su ficha. Especialmente útil para los 12 casos pendientes de clasificación manual.
- **Archivos:** `src/components/edit-client-dialog.tsx`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor

- Se identificó que el campo `direction` en la tabla `invoice` se guarda con mayúscula (`"Outbound"`, `"Inbound"`). Los scripts usan `lower(direction)` para el filtrado.
- Se identificó que el valor `"sin datos"` en `receipt_province` es un placeholder de importación (no una provincia real) y se excluye del análisis.
- Se corroboró la regla de integridad: `convenio_multilateral` y `regimen_local` son excluyentes. Pendiente validarla en `createRepresentative` y `updateRepresentative`.

### 3.2 Frontend / UI

- Se agregó el campo **Régimen IIBB provincial** al dialog de edición de cliente (`edit-client-dialog.tsx`).
- Implementado como `RadioGroup` con tres opciones excluyentes: `Régimen local`, `Multilateral`, `Sin definir`.
- El campo se muestra con highlighting visual del valor seleccionado (card-style).
- Al abrir el dialog, el valor se deriva automáticamente de los flags actuales en DB (`convenioMultilateral`/`regimenLocal`).
- Al guardar, el valor se mapea de vuelta a los dos booleans en el backend.
- No se agrega al create dialog (flujo AFIP es complejo; se define desde edición una vez creado el cliente).

### 3.3 Datos / DB / scripts

- **`src/scripts/analyze-regimen-fiscal.ts`** — Script de análisis (solo lectura). Agrupa facturas outbound por empresa, cuenta provincias distintas, clasifica en MULTILATERAL / LOCAL / SIN DATOS / BAJA CONFIANZA, y muestra el estado actual del flag en DB.

- **`src/scripts/set-regimen-fiscal.ts`** — Script de actualización. Solo toca empresas de alta confianza (> 1 provincia, o exactamente 1 con ≥ 3 facturas con provincia). Ejecutado el 2026-06-24: **48 empresas actualizadas**.

  Resultado de la ejecución:
  - Actualizadas como MULTILATERAL: **40 empresas**
  - Actualizadas como RÉGIMEN LOCAL: **8 empresas**
  - Omitidas (sin datos / baja confianza): **12 empresas**

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados

- `Documentacion Tecnica/Regimen Fiscal Provincial - Convenio Multilateral y Regimen Local.md` — Plan completo con contexto, resultados del análisis, listado de todas las empresas clasificadas y checklist de implementación.
- `Actualizaciones/2026-06-24 actualizacion.md` — Este documento.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Empresas pendientes de clasificación manual (12)

**Baja confianza — 1 sola provincia detectada pero con muy pocas facturas (4):**

| Empresa | CUIT | Facturas totales | Provincia detectada | Observación |
|---|---|---|---|---|
| Artzeinu | 20372769034 | 176 | Capital Federal | 176 facturas pero casi ninguna tiene `receipt_province`. Probablemente LOCAL. |
| Deze Construcciones Srl | 23312403129 | 4 | Capital Federal | Pocas facturas, dato consistente. Probablemente LOCAL. |
| Krakovsky Vanina | 27243142240 | 3 | Capital Federal | Mínimo de datos. Probablemente LOCAL. |
| Max Buddy SA | 20956957258 | 1 | Buenos Aires | Un solo comprobante. No concluyente. |

**Sin datos suficientes (8):**

| Empresa | CUIT | Situación |
|---|---|---|
| Adriana Cuellar | 27956661667 | Sin facturas outbound importadas |
| Classic Drinks | 30719065313 | Sin facturas outbound importadas |
| Flor de azar S.A. (empieza en diciembre) | 20125019359 | Sin facturas outbound importadas |
| Importadora del caribe RD | 27190607769 | Sin facturas outbound importadas |
| Semeca Ingenieria Srl | 30715433490 | Sin facturas outbound importadas |
| Yinrai SA | 20392685139 | Sin facturas outbound importadas |
| Cascini Claudio Agustin | 20224275650 | 18 facturas outbound, todas sin `receipt_province`. Revisar CSV fuente. |
| Casa Fortuna SACI FI | 27047032453 | 1 factura outbound sin provincia. Insuficiente. |

### 5.2 Pendiente inmediato (próximas sesiones)

- Decidir clasificación de las 4 empresas de baja confianza (ver tabla arriba) y asignarlas desde la UI
- Asignar manualmente las 8 empresas sin datos desde la UI de edición de cliente
- Condicionar visibilidad del tab "Convenio Multilateral" en la ficha del cliente según el flag

---

## 6) Archivos principales involucrados

- `src/scripts/analyze-regimen-fiscal.ts`
- `src/scripts/set-regimen-fiscal.ts`
- `src/components/edit-client-dialog.tsx`
- `Documentacion Tecnica/Regimen Fiscal Provincial - Convenio Multilateral y Regimen Local.md`
- `Actualizaciones/2026-06-24 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
