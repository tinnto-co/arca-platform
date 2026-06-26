# Corrección de Categorías — Convenio CCT 389/04 (Gastronomía)
**Empresa:** FLOR DE AZAR S.A.
**Fecha de análisis:** 2026-06-03

---

## Contexto

Al importar empleados para la empresa FLOR DE AZAR S.A. desde un archivo externo, las categorías fueron cargadas como texto libre en el campo `categoria` de la tabla `liquidacion_import_empleado`. Estas cadenas de texto no fueron mapeadas al campo `categoria_id` (FK hacia `payroll_convenio_categoria`), lo que impide que el sistema pueda resolver el básico de convenio correspondiente a cada empleado.

---

## Datos relevantes

- **Cliente:** FLOR DE AZAR S.A. (`client_id: 722cf4b2-e6c5-4dff-a134-7ae2bdd12785`)
- **Convenio del cliente:** Gastronomía 389/04 (`convenio_id: e8a14396-5211-4504-bf7a-c7c3dc5767b1`)
- **Total empleados:** 8
- **Empleados sin `categoria_id`:** 8 (100%)

---

## Hallazgos

### 1. Empleados y sus categorías importadas

| Legajo | Empleado | CUIL | Categoría (texto importado) |
|--------|----------|------|-----------------------------|
| 1 | BARRERA, RUFINO MARCELO | 20175849913 | `MOZO DE SALON (CAT B` |
| 2 | CORDOBA, EMILIANO RODRIGO | 20384031634 | `LAVACOPAS (CAT B` |
| 3 | VILLALBA, RAFAEL GONZALO | 20392707426 | `AYUDANTE DE COCINA (CAT B` |
| 4 | RAMIREZ, ONOFRE DEMETREO | 20944431870 | `AYUDANTE PARRILLERO (CAT B` |
| 5 | GONZALEZ OCHOA, LUIS ALBERTO | 20944858602 | `AYUDANTE DE COCINA (CAT B` |
| 6 | SORIA, RAMON ROBERTO | 23163327589 | `AYUDANTE PARRILLERRO (CAT B` |
| 7 | QUISPE, ISMAEL CAMACHO | 23921718039 | `PEON GENERAL (CAT B` |
| 8 | ROJAS, JUANA BAUTISTA | 27103985086 | `PEON GENERAL (CAT B` |

### 2. Problemas detectados en los textos importados

1. **Paréntesis sin cerrar:** Todas las categorías terminan con `(CAT B` en lugar de `(CAT B)`. Indica que el archivo de origen tiene un problema de formato (columna truncada o exportación incompleta).
2. **Typo en `SORIA`:** La categoría dice `AYUDANTE PARRILLERRO` (doble R), siendo la correcta `AYUDANTE PARRILLERO`.
3. **Denominaciones inexistentes en el CCT:** `AYUDANTE PARRILLERO` y `AYUDANTE DE COCINA` no aparecen como categorías en la tabla `payroll_convenio_categoria` para este convenio. Requieren mapeo manual al cargo más cercano.

### 3. Estructura de categorías en `payroll_convenio_categoria`

El CCT 389/04 está modelado con **296 categorías** que combinan dos dimensiones:
- **Grupo funcional** (CAT1 a CAT7): agrupa puestos por nivel.
- **Estrellas del establecimiento** (1EST_D, 2EST_C, 3EST_B, 4EST_A, 5EST): refleja la categoría del establecimiento empleador.

El sufijo `CAT B` en los textos importados corresponde a **3 estrellas B** (`3EST_B`, orden 3 en las escalas), que es el nivel del establecimiento para FLOR DE AZAR S.A.

---

## Mapeo propuesto

| Categoría importada | Categoría en CCT | Código en BD | Observaciones |
|---------------------|------------------|--------------|---------------|
| `MOZO DE SALON (CAT B` | Mozo de Salón y de Vinos | `CAT6_3EST_B_Mozo_de_Salon_y_de_Vinos` | Mapeo directo. |
| `LAVACOPAS (CAT B` | Lavacopas | `CAT1_3EST_B_Lavacopas` | Mapeo directo. |
| `AYUDANTE DE COCINA (CAT B` | Comis de Cocina | `CAT5_3EST_B_Comis_de_Cocina` | "Ayudante de cocina" no existe en el CCT. El puesto más cercano en jerarquía y función es Comis de Cocina. **Requiere confirmacion del contador.** |
| `AYUDANTE PARRILLERO (CAT B` | Parrillero | `CAT6_3EST_B_Parrillero` | No existe "ayudante parrillero" en el CCT. Se mapea a Parrillero. **Requiere confirmacion del contador.** |
| `AYUDANTE PARRILLERRO (CAT B` | Parrillero | `CAT6_3EST_B_Parrillero` | Mismo caso que arriba + typo. |
| `PEON GENERAL (CAT B` | Peón general | `CAT1_3EST_B_Peon_general` | Mapeo directo. |

---

## Plan de corrección

### Paso 1 — Confirmar mapeos dudosos
Antes de ejecutar cualquier UPDATE, confirmar con el contador los dos casos sin equivalente exacto en el CCT:
- `AYUDANTE DE COCINA` → ¿`Comis de Cocina` o algún otro puesto?
- `AYUDANTE PARRILLERO` → ¿`Parrillero` directamente?

### Paso 2 — Obtener los UUIDs de las categorías mapeadas

```sql
SELECT id, codigo, nombre
FROM payroll_convenio_categoria
WHERE convenio_id = 'e8a14396-5211-4504-bf7a-c7c3dc5767b1'
  AND codigo IN (
    'CAT6_3EST_B_Mozo_de_Salon_y_de_Vinos',
    'CAT1_3EST_B_Lavacopas',
    'CAT5_3EST_B_Comis_de_Cocina',
    'CAT6_3EST_B_Parrillero',
    'CAT1_3EST_B_Peon_general'
  );
```

### Paso 3 — Actualizar `categoria_id` en los empleados

Una vez confirmados los UUIDs, ejecutar los UPDATE correspondientes agrupados por categoría importada:

```sql
-- Mozo de salón
UPDATE liquidacion_import_empleado
SET categoria_id = '<uuid_CAT6_3EST_B_Mozo_de_Salon_y_de_Vinos>'
WHERE client_id = '722cf4b2-e6c5-4dff-a134-7ae2bdd12785'
  AND categoria = 'MOZO DE SALON (CAT B';

-- Lavacopas
UPDATE liquidacion_import_empleado
SET categoria_id = '<uuid_CAT1_3EST_B_Lavacopas>'
WHERE client_id = '722cf4b2-e6c5-4dff-a134-7ae2bdd12785'
  AND categoria = 'LAVACOPAS (CAT B';

-- Ayudante de cocina → Comis de Cocina (pendiente confirmación)
UPDATE liquidacion_import_empleado
SET categoria_id = '<uuid_CAT5_3EST_B_Comis_de_Cocina>'
WHERE client_id = '722cf4b2-e6c5-4dff-a134-7ae2bdd12785'
  AND categoria = 'AYUDANTE DE COCINA (CAT B';

-- Ayudante parrillero → Parrillero (pendiente confirmación, incluye typo)
UPDATE liquidacion_import_empleado
SET categoria_id = '<uuid_CAT6_3EST_B_Parrillero>'
WHERE client_id = '722cf4b2-e6c5-4dff-a134-7ae2bdd12785'
  AND categoria IN ('AYUDANTE PARRILLERO (CAT B', 'AYUDANTE PARRILLERRO (CAT B');

-- Peón general
UPDATE liquidacion_import_empleado
SET categoria_id = '<uuid_CAT1_3EST_B_Peon_general>'
WHERE client_id = '722cf4b2-e6c5-4dff-a134-7ae2bdd12785'
  AND categoria = 'PEON GENERAL (CAT B';
```

### Paso 4 — Verificación post-corrección

```sql
SELECT
  e.legajo, e.nombre, e.categoria AS categoria_original,
  pcc.codigo, pcc.nombre AS categoria_resuelta
FROM liquidacion_import_empleado e
JOIN payroll_convenio_categoria pcc ON e.categoria_id = pcc.id
WHERE e.client_id = '722cf4b2-e6c5-4dff-a134-7ae2bdd12785'
ORDER BY e.legajo;
```

Resultado esperado: 8 filas, todas con `categoria_resuelta` distinto de NULL.

---

## Estado

| Tarea | Estado |
|-------|--------|
| Análisis inicial y detección del problema | Completado |
| Mapeo de categorías con match directo (4 de 6) | Completado |
| Confirmacion de mapeos dudosos con el contador | Pendiente |
| Ejecucion de los UPDATE en base de datos | Pendiente |
| Verificacion post-corrección | Pendiente |
