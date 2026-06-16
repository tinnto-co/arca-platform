# Actualizacion - 2026-06-13

## 1) Objetivo general del dia

Correcciones visuales en el módulo de sueldos: formato del convenio en recibo de sueldo y etiqueta CCT en la solapa Convenios.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Recibo de sueldo — formato del campo "Convenio" ✅

- **Problema:** El campo Convenio en el recibo (HTML y PDF) mostraba el nombre duplicando el número CCT. Ejemplo: `"Comercio 130/75 (CCT 130/75)"`.
- **Causa:** El campo `nombre` en la BD incluye el número CCT (ej. `"Comercio 130/75"`) y se le concatenaba `(CCT 130/75)` por separado.
- **Corrección:** Antes de armar el string de display, se stripea el `cctCodigo` del `nombre`. Resultado: `"Comercio (CCT 130/75)"`.
- **Regla visual aplicada:** `[nombre sin CCT] (CCT [codigo])`. Si no hay `cctCodigo`, se muestra solo el nombre.

### 2.2 Solapa Convenios — regla visual confirmada (sin cambios) ✅

- El título de cada card muestra `convenio.nombre` completo (ej. "Comercio 130/75").
- Debajo, badge con `CCT: {convenio.cctCodigo}`.
- Esta regla se mantiene tal cual — no se modificó.

---

## 3) Cambios técnicos (implementación)

### 3.1 `src/components/sueldos/SueldosRecibo.tsx` (línea ~876)

```tsx
// Antes
`${convenio.nombre} (CCT ${convenio.cctCodigo})`

// Después
`${(convenio.nombre ?? '').replace(convenio.cctCodigo, '').trim()} (CCT ${convenio.cctCodigo})`
```

### 3.2 `src/components/sueldos/recibo-pdf.tsx` (línea ~706)

```tsx
// Antes
`${convenio.nombre} (CCT ${convenio.cctCodigo})`

// Después
`${(convenio.nombre ?? '').replace(convenio.cctCodigo, '').trim()} (CCT ${convenio.cctCodigo})`
```

---

## 4) Checklist de cierre

- [x] Recibo HTML muestra "Comercio (CCT 130/75)" en lugar de "Comercio 130/75 (CCT 130/75)".
- [x] PDF muestra el mismo formato corregido.
- [x] Solapa Convenios sin cambios — sigue mostrando nombre completo + badge CCT.
