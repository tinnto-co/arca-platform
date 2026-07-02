# Actualizacion - 2026-06-02

## 1) Objetivo general del dia

Mejoras al agente de IA (`/api/agent`): se enriqueció el system prompt con ejemplos de queries frecuentes para las tablas sin tool dedicada (deudas, vencimientos, notificaciones, último scrape), y se implementó el tool `getResumenCliente` que consolida en una sola llamada el panorama completo de una empresa, evitando agotar el límite de pasos del agente en consultas de resumen.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Nuevo tool: getResumenCliente

- **Cambio:** Se agregó el tool `getResumenCliente` al agente de IA.
- **Motivo:** Cuando el usuario pedía "dame un resumen de X empresa", el agente necesitaba encadenar 4-5 llamadas a tools separados (deudas, vencimientos, facturación, notificaciones, último scrape), lo que agotaba el límite de 5 pasos y producía respuestas incompletas.
- **Impacto:** El agente ahora responde resúmenes completos en un solo paso. El tool ejecuta 5 queries en paralelo (`Promise.all`) y devuelve un objeto consolidado con: deuda AFIP total + desglose, vencimientos próximos 30 días, facturación del mes actual (ventas/compras/cantidad de comprobantes), notificaciones no leídas (hasta 5) y última actualización por tipo de job.
- **Archivos:** `src/routes/api/agent.ts`

### 2.2 Ejemplos de queries frecuentes en el system prompt

- **Cambio:** Se agregó una sección "EJEMPLOS DE QUERIES FRECUENTES" al final del schema que se inyecta en el system prompt del agente.
- **Motivo:** Las tablas `debt`, `due_date` y `notification` estaban documentadas en el schema pero sin ejemplos de queries. El modelo tenía que inferir los JOINs correctos, lo que generaba errores (especialmente el doble JOIN `client → representative` que requieren `debt` y `due_date` al no tener `representative_id` directo).
- **Impacto:** El agente ahora tiene patrones probados y listos para copiar/adaptar para deudas, vencimientos, notificaciones y último scrape exitoso. Menos errores de SQL en consultas frecuentes.
- **Archivos:** `src/routes/api/agent.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor

- **`getResumenCliente`**: busca el cliente por nombre con filtro de `orgId` (mismo patrón que los demás tools), luego ejecuta en paralelo con `Promise.all`:
  1. Query de deudas (`debt`): suma `balance + compensatory_interest + punitive_interest` como total real, ordenado por monto desc.
  2. Query de vencimientos (`due_date`): filtra `due_date >= NOW() AND due_date <= NOW() + INTERVAL '30 days'`.
  3. Query de último job exitoso (`job`): hace JOIN `job → representative → client` para obtener el `representative_id` del cliente y agrupa por `type`.
  4. Query de facturación del mes: reutiliza la misma lógica de conversión USD→ARS de `getMontosfacturacion`, acotada al mes actual con `DATE_TRUNC`.
  5. Query de notificaciones no leídas (`notification`): filtra por `client_id` y `opened = false`.
- El tool está documentado en la sección `HERRAMIENTAS DISPONIBLES` del system prompt con instrucción explícita de usarlo en lugar de encadenar tools individuales para resúmenes.

- **Sección de ejemplos en `buildSchema`**: agregada después del bloque "TRAMPAS CONOCIDAS". Incluye queries completas con JOINs correctos para:
  - Deudas de un cliente (con cálculo de total real)
  - Vencimientos próximos 30 días
  - Notificaciones no leídas (con aclaración de `client_id` nullable)
  - Último scrape exitoso por tipo

### 3.2 Frontend / UI

- Sin cambios.

### 3.3 Datos / DB / scripts

- Sin cambios de schema ni migraciones.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados

- `Actualizaciones/2026-06-02 actualizacion.md` (este documento)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados

- El tool `getResumenCliente` filtra notificaciones por `client_id` del cliente específico. Las notificaciones a nivel de representante (`client_id IS NULL`) no aparecen en el resumen — si se quieren incluir, habría que ampliar el filtro.
- El límite de 5 pasos del agente (`stopWhen: stepCountIs(5)`) sigue siendo ajustado. Si una consulta compleja requiere más pasos (ej: IVA + resumen + seguimiento), puede cortarse. Considerar subir a 7-8 si se detecta el problema en uso real.

### 5.2 Pendiente inmediato

- Monitorear en uso real si `getResumenCliente` cubre los casos de resumen frecuentes o si se necesita ajustar los campos devueltos.
- Evaluar si conviene agregar notificaciones de nivel representante al resumen.

---

## 6) Archivos principales involucrados

- `src/routes/api/agent.ts` — tool `getResumenCliente` + sección de ejemplos en `buildSchema` + instrucción en `HERRAMIENTAS DISPONIBLES`
- `Actualizaciones/2026-06-02 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
