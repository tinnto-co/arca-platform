# Pendiente: Gastronomía — Clasificación del Establecimiento
**Fecha:** 2026-04-24
**Estado:** Pendiente de decisión

---

## Contexto

El CCT 389/04 (UTHGRA-FEHGRA) define salarios que varían según **dos dimensiones**:

1. **Categoría del puesto** (1 a 7) — define el nivel del cargo (Categoría 1 = Lavacopas, Peón; Categoría 6 = Cocinero, Mozo de Salón, etc.)
2. **Clasificación del establecimiento** (1★ a 5★ / 1 tenedor a 5 tenedores / 1 copa a 3 copas) — define el nivel del local donde trabaja el empleado

Ambas dimensiones se combinan para determinar el sueldo básico. Ejemplo para enero 2026:

| Categoría | 1★ | 2★ | 3★ | 4★ | 5★ |
|-----------|----|----|----|----|-----|
| Cat. 1 | $863.100 | $883.005 | $904.614 | $936.102 | $1.051.572 |
| Cat. 6 | $1.125.835 | $1.165.173 | $1.206.540 | $1.246.088 | $1.328.659 |

Un Mozo de Salón (Cat. 6) en un local 1★ gana $1.125.835, pero en uno 5★ gana $1.328.659 — una diferencia de ~$200.000.

---

## Puestos por categoría (CCT 389/04)

| Cat. | Puestos |
|------|---------|
| 1 | Cadete, Groom, Peón General, Lavacopas, Portería |
| 2 | Montaplatos, Ascensorista, Sereno, Mensajero, Mozo Mostrador, Jardinero, Delivery, Auxiliar de Administración |
| 3 | Ayudante Panadero, Barman, Planchadora, Lencera, Lavadero/a, Mozo Mostrador con Atención al Público, Capataz de Peones, Cafetero |
| 4 | Medio Oficial Panadero, Mucama, Valet, Telefonista, Chofer, Oficial de Oficios Varios, Garagista, Minutero |
| 5 | Comis de Cocina, Oficial Panadero, Adicionista, Cajero, Pastelero, Guardavidas, Fiambrero, Sandwichero, DJ, Técnico de Sonido |
| 6 | Jefe de Partida, Cocinero, Mozo de Salón, Mozo de Vinos, Camarero, Gobernanta, Empleado Principal Administrativo, Barman, Postrero, Recepcionista, Chef de Fila, Parrillero, Rotisero, Conserje Principal, Masajista, Jefe de Brigada, Maestro Pastelero |
| 7 | Jefe de Brigada, Gobernanta Principal, Conserje Principal, Maitre Principal, Jefe Técnico Especial de Oficio, Jefe de Conserjería/Recepción *(solo en establecimientos 3★ a 5★)* |

---

## Situación actual en la BD

- Solo **3 perfiles** con CCT 389/04 scrapeado de AFIP: Zahrarh SA y Flor de azar S.A.
- AFIP devuelve únicamente `actividad = "GASTRONÔMICOS"` — sin dato de clasificación del establecimiento.
- No existe ninguna columna en la BD que almacene la clasificación del establecimiento.
- Las categorías actuales en `payroll_convenio_categoria` usan la nomenclatura de la fuente ("Categoría 1 - 1★ / 1 tenedor D / 1 copa") que es poco legible y no refleja los nombres reales de los puestos.

---

## Opciones de implementación

### Opción A — Campo de clasificación en `payroll_convenio`
Agregar una columna `clasificacion_establecimiento` (ej. `'1'` a `'5'`) en `payroll_convenio`. Se carga manualmente una vez por cliente. Las escalas se filtran por esa clasificación al liquidar.

**Pros:**
- Dato fijo por cliente, se carga una sola vez
- Escalas correctas automáticamente para todos los empleados del cliente
- Modelo limpio y fácil de mantener

**Contras:**
- Requiere que alguien informe la clasificación de cada establecimiento
- Si un cliente cambia de categoría hay que actualizarlo manualmente

---

### Opción B — Tarifa base (1★) como predeterminado
Usar siempre la tarifa de 1★ para todos los clientes gastronómicos hasta tener información real de clasificación.

**Pros:**
- Sin cambios en el modelo de datos
- Rápido de implementar

**Contras:**
- Sueldos incorrectos para locales de 2★ a 5★
- No escala bien si se suman más clientes gastronómicos

---

### Opción C — Elección al momento de liquidar
No almacenar la clasificación en la BD. El liquidador elige la escala correcta al momento de calcular el recibo.

**Pros:**
- Máxima flexibilidad
- No requiere dato previo del cliente

**Contras:**
- Agrega un paso manual en cada liquidación
- Mayor superficie de error humano

---

### Opción D *(recomendada a futuro)* — Clasificación por convenio + puestos por nombre
Combinar Opción A con la reestructura de categorías por nombre de puesto:

1. Agregar `clasificacion_establecimiento` en `payroll_convenio` (se carga una vez por cliente).
2. Reemplazar las categorías genéricas ("Categoría 1 - 1★") por registros individuales por puesto ("Lavacopas", "Mozo de Salón", etc.), cada uno con su número de categoría en el campo `codigo`.
3. Al liquidar, el sistema combina `codigo` del puesto + `clasificacion_establecimiento` del convenio para determinar la escala salarial correcta.

---

## Próximos pasos sugeridos

1. Decidir qué opción implementar (se recomienda D a mediano plazo).
2. Si se elige A o D: relevar la clasificación de los establecimientos de Zahrarh SA y Flor de azar con el cliente.
3. Crear los registros de `payroll_convenio_categoria` con nombres de puestos reales (reemplazando "Categoría X - Y★").
4. Actualizar las escalas para que se vinculen por categoría numérica + clasificación del establecimiento.
