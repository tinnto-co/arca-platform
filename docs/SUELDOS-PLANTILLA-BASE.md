# Plantilla base del módulo Sueldos

Este documento describe la **plantilla base** del módulo de Sueldos: **conceptos** (desde el Dashboard) y **convenios** (seleccionados por cliente en la solapa Convenios).

---

## Descripción general

- **Conceptos:** Desde el Dashboard, *Cargar o actualizar plantilla base* solo crea/actualiza los **conceptos salariales** típicos (básico, antigüedad, presentismo, descuentos, etc.). No crea convenios.
- **Convenios:** Cada cliente debe tener asignado el convenio que le corresponde. Se hace desde la solapa **Convenios** → botón **"Seleccionar convenio"** → se abre una ventana con los 5 convenios disponibles; al elegir uno se crea para ese cliente con sus categorías y escalas base.

---

## Conceptos (Dashboard)

- **Pantalla:** Dashboard del módulo Sueldos (`/sueldos`, pestaña Dashboard).
- **Botón:** *"Cargar o actualizar plantilla base"* aplica solo los conceptos: crea los que falten y actualiza los existentes.
- **Implementación:** `aplicarPlantillaBaseSueldos` en `src/actions/sueldos.ts`.

---

## Convenios (solapa Convenios)

- **Pantalla:** Solapa **Convenios** del módulo Sueldos (mismo cliente seleccionado).
- **Botón:** **"Seleccionar convenio"** abre una ventana con los convenios disponibles.
- **Acción:** El usuario elige el convenio que corresponde al cliente (Comercio, Gastronomía, Pasteleros, Plásticos o Construcción). Se crea ese convenio para el cliente con sus 3 categorías y escalas. Si el cliente ya tiene ese convenio, se informa y no se duplica.
- **Implementación:** `listConveniosPlantilla` y `agregarConvenioDesdePlantilla` en `src/actions/sueldos.ts`; UI en `src/components/sueldos/SueldosConvenios.tsx`.

---

## Convenios disponibles en la plantilla

Son **5 convenios** que se pueden asignar a cada cliente desde "Seleccionar convenio". Cada uno tiene 3 categorías y una escala por categoría.

| Convenio      | Descripción (resumen) |
|---------------|------------------------|
| **Comercio**  | CCT sector Comercio (plantilla base). |
| **Gastronomía** | CCT Gastronomía (plantilla base). |
| **Pasteleros** | CCT Pasteleros (plantilla base). |
| **Plásticos** | CCT industria del Plástico (plantilla base). |
| **Construcción** | CCT Construcción (plantilla base). |

---

## Categorías y escalas por convenio

Todas las escalas tienen **vigencia desde el 1° de enero del año actual** y sin fecha de vigencia hasta (abiertas). Montos base por categoría: $ 350.000, $ 400.000 y $ 450.000 (editables después de cargar la plantilla en Convenios → seleccionar convenio → Escalas por categoría).

| Convenio      | Código | Nombre de categoría        | Orden | Monto básico |
|---------------|--------|----------------------------|-------|----------------|
| Comercio      | 1      | Empleado de comercio       | 10    | $ 350.000      |
| Comercio      | 2      | Encargado                  | 20    | $ 400.000      |
| Comercio      | 3      | Jefe de sector             | 30    | $ 450.000      |
| Gastronomía   | 1      | Ayudante de cocina         | 10    | $ 350.000      |
| Gastronomía   | 2      | Cocinero                   | 20    | $ 400.000      |
| Gastronomía   | 3      | Jefe de cocina             | 30    | $ 450.000      |
| Pasteleros    | 1      | Ayudante pastelero         | 10    | $ 350.000      |
| Pasteleros    | 2      | Pastelero                  | 20    | $ 400.000      |
| Pasteleros    | 3      | Pastelero especializado    | 30    | $ 450.000      |
| Plásticos     | 1      | Operario                   | 10    | $ 350.000      |
| Plásticos     | 2      | Operario calificado        | 20    | $ 400.000      |
| Plásticos     | 3      | Supervisor                 | 30    | $ 450.000      |
| Construcción  | 1      | Oficial                    | 10    | $ 350.000      |
| Construcción  | 2      | Oficial especializado     | 20    | $ 400.000      |
| Construcción  | 3      | Encargado / Capataz        | 30    | $ 450.000      |

---

## Conceptos incluidos

Las fórmulas utilizan las variables del motor de fórmulas (`src/lib/payroll-formula.ts`). Ver también `docs/SUELDOS-ARQUITECTURA.md`.

### Remunerativos

| Código | Nombre         | Base de cálculo | Fórmula                         | Orden |
|--------|----------------|------------------|----------------------------------|-------|
| BASICO | Sueldo básico  | basico           | `basico`                         | 10    |
| ANTIG  | Antigüedad     | basico           | `0.01 * basico * antiguedad`     | 20    |
| PRES   | Presentismo    | basico           | `0.0833 * basico`                | 30    |
| HE     | Horas extra    | custom           | `valor` (novedad)                | 40    |
| COM    | Comisiones     | custom           | `valor`                          | 50    |
| BONO   | Bonos          | custom           | `valor`                          | 60    |

### Descuentos

| Código | Nombre                    | Base de cálculo      | Fórmula                       | Orden |
|--------|---------------------------|----------------------|-------------------------------|-------|
| JUB    | Jubilación (11%)          | total_remunerativo   | `0.11 * totalRemunerativo`    | 100   |
| OS     | Obra social (3%)          | total_remunerativo   | `0.03 * totalRemunerativo`    | 110   |
| PAMI   | PAMI / Ley 19032 (3%)     | total_remunerativo   | `0.03 * totalRemunerativo`    | 120   |
| SIND   | Sindicato (2%)            | total_remunerativo   | `0.02 * totalRemunerativo`    | 130   |

- **Básico, antigüedad y presentismo:** se calculan con el básico de la escala vigente y (para antigüedad) los años desde la fecha de ingreso del empleado.
- **HE, COM, BONO:** se completan vía **Novedades** (valor/cantidad por empleado y período).
- **Descuentos:** se aplican sobre el total remunerativo ya calculado en la liquidación.

---

## Resumen técnico

| Elemento              | Ubicación / detalle |
|-----------------------|----------------------|
| Server function       | `aplicarPlantillaBaseSueldos` en `src/actions/sueldos.ts` |
| Validación de cliente | `ensureClientBelongsToUser(clientId, userId)` |
| Condición de ejecución| Ninguna: siempre se ejecuta (solo conceptos). |
| Tablas afectadas      | `payroll_concepto` (la plantilla del Dashboard no toca convenios). |
| Respuesta             | `{ ok, conveniosCreated: 0, conveniosUpdated: 0, categoriasCreated: 0, categoriasUpdated: 0, conceptosCreated, conceptosUpdated }` |

Los convenios se agregan por cliente con **Seleccionar convenio** (solapa Convenios); acciones `listConveniosPlantilla` y `agregarConvenioDesdePlantilla`.

Después de cargar la plantilla, el usuario puede modificar convenios, categorías, escalas y conceptos desde las pestañas Convenios y Conceptos del módulo Sueldos.
