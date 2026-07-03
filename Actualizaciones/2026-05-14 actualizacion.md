# Actualizacion - 2026-05-14

## 1) Objetivo general del dia

Foco en correcciones visuales y de flujo en el módulo de Sueldos, la vista de detalle de clientes, y la vista de notificaciones. Se resolvieron siete puntos: la barra de solapas en ambos módulos mostraba scroll vertical; al editar un recibo no era posible agregar ni quitar conceptos; al cambiar de solapa durante la edición de un recibo el estado de edición no se limpiaba al volver; las líneas de firma en la tabla de conceptos estaban desalineadas cuando había una firma digital cargada; la vista de notificaciones mostraba el nombre del cliente en lugar del perfil fiscal correcto; `getNotification` no devolvía todos los campos del perfil ni de metadata de la notificación; y `listConvenios` no filtraba los CCTs por perfil activo.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Barra de solapas sin scroll vertical (clientes y sueldos)
- **Cambio:** La barra de solapas ya no genera scroll vertical en la página ni dentro del contenedor sticky.
- **Motivo:** El `overflow-x-auto` del `TabsList` generaba una scrollbar horizontal que ocupaba espacio vertical; además el `top-px` del tab activo filtraba 1px fuera del contenedor causando desbordamiento.
- **Impacto:** La barra de solapas se muestra compacta y sin desplazamiento vertical involuntario en ambos módulos.
- **Archivos:** `src/routes/_authed/sueldos/index.tsx`, `src/components/client-detail-page.tsx`

### 2.2 Agregar y quitar conceptos al editar un recibo
- **Cambio:** Al acceder a la edición de un recibo existente desde la solapa "Recibo", la tabla de conceptos ahora permite agregar conceptos con el botón "+" por sección y eliminar filas individuales con el ícono de papelera.
- **Motivo:** El bloque de edición usaba `variant="importado"` sin pasar los handlers `onAddConcepto`/`onRemoveConcepto` ni el catálogo completo, por lo que los controles de alta/baja de conceptos no aparecían.
- **Impacto:** El usuario puede editar libremente los conceptos de un recibo existente, igual que al crear uno nuevo.
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`

### 2.3 Limpieza del estado de edición al cambiar de solapa
- **Cambio:** Al cambiar a cualquier solapa que no sea "Nuevo recibo" mientras se está editando un recibo, el estado de edición se limpia. Al volver a "Nuevo recibo" se muestra el formulario en blanco en lugar del recibo que se estaba editando.
- **Motivo:** `editReciboData` persistía en el estado del padre y se re-inyectaba como `initialData` cada vez que el componente remontaba (al volver a la solapa).
- **Impacto:** El flujo de edición queda aislado: si el usuario abandona la solapa "Nuevo recibo", al volver siempre encuentra el formulario vacío.
- **Archivos:** `src/routes/_authed/sueldos/index.tsx`, `src/components/sueldos/SueldosSimulador.tsx`

### 2.4 Alineación de líneas de firma con firma digital cargada
- **Cambio:** Las líneas "Firma y sello del empleador" y "Firma del trabajador / Acuse de recibo" ahora se alinean horizontalmente en el borde inferior de la sección, independientemente de si hay imagen de firma digital cargada.
- **Motivo:** Cuando existía una imagen de firma (h-16), la columna del empleador era más alta que la del trabajador, haciendo que la línea del empleador quedara más abajo visualmente.
- **Impacto:** El recibo en pantalla muestra las dos líneas de firma al mismo nivel, con la imagen de firma digital posicionada encima de la línea del empleador.
- **Archivos:** `src/components/sueldos/TablaReciboSos.tsx`

### 2.5 Vista de notificaciones muestra el perfil fiscal en lugar del cliente
- **Cambio:** En la lista de notificaciones y en el panel de detalle, el nombre principal ahora muestra el perfil fiscal (`profileName` o `profileIdentityNumber`) en vez del nombre del cliente. Si el perfil tiene nombre y también existe cliente, el nombre del cliente se muestra como subtítulo secundario.
- **Motivo:** Las notificaciones están ligadas a perfiles (entidades fiscales con CUIT), no al agrupador cliente. Mostrar solo el nombre del cliente era ambiguo cuando un cliente tiene múltiples perfiles.
- **Impacto:** El usuario puede identificar rápidamente qué CUIT/empresa generó cada notificación.
- **Archivos:** `src/components/notifications-view.tsx`

### 2.6 `getNotification` devuelve campos completos del perfil y la notificación
- **Cambio:** La server function `getNotification` ahora incluye en su respuesta: `profileId`, `profileName`, `profileIdentityNumber`, `severity`, `category`, `aiSummary`, `assignedToUserId`, `resolvedAt`, `resolvedByUserId`.
- **Motivo:** El panel de detalle de notificaciones necesitaba estos campos para mostrar el perfil correcto y los metadatos de severidad/categoría, pero la query no los seleccionaba ni hacía JOIN con `profile`.
- **Impacto:** El detalle de notificación dispone de toda la información necesaria para futuras acciones (asignación, resolución, filtros por severidad).
- **Archivos:** `src/actions/notification.tsx`

### 2.7 `listConvenios` filtra CCTs por perfil activo
- **Cambio:** Cuando se invoca `listConvenios` con `profileId`, la consulta filtra los CCTs registrados en AFIP (`afip_empleadores_convenio`) solo para ese perfil. Si el perfil ya tiene CCTs en AFIP, se devuelven únicamente los convenios cuyo código coincide; si el perfil aún no tiene CCTs scrapeados, se devuelven todos los convenios del cliente (estado inicial).
- **Motivo:** Un cliente puede tener varios perfiles (empresas) con distintos CCTs; mostrar todos los CCTs del cliente mezclados generaba confusión al operar sobre un perfil específico.
- **Impacto:** La solapa de Convenios en Sueldos muestra solo los CCTs relevantes para el perfil seleccionado.
- **Archivos:** `src/actions/sueldos.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / server functions

- **`getNotification` (notification.tsx):** Se agregó `.leftJoin(profile, eq(notification.profile, profile.id))` y se extendió el `select` con los campos `profile.name`, `profile.identityNumber`, `notification.severity`, `notification.category`, `notification.aiSummary`, `notification.assignedToUserId`, `notification.resolvedAt`, `notification.resolvedByUserId`.
- **`listConvenios` (sueldos.ts):** La cláusula `where` del join con `afip_empleadores_convenio` es ahora condicional: si `ctx.data.profileId` está presente usa `eq(afipEmpleadoresConvenio.profileId, ctx.data.profileId)`, de lo contrario filtra por `eq(profile.client, ctx.data.clientId)`. Después del mapeo, si el perfil tiene filas AFIP, se aplica `.filter((c) => c.afipUpdatedAt !== null)` para retornar solo los convenios que coinciden.

### 3.2 Frontend / UI

- **Barra de solapas:** Se agregó `overflow-hidden` al `div` sticky contenedor para clipear el `top-px` del tab activo. En `TabsList` se combinó `overflow-y-hidden` con `[&::-webkit-scrollbar]:hidden [scrollbar-width:none]` para suprimir la scrollbar horizontal sin impedir el scroll táctil. Padding horizontal de tabs aumentado de `px-[14px]` a `px-[18px]`.

- **Agregar/quitar conceptos en edición:** En el bloque `showImportadoTable` de `SueldosSimulador`, se reemplazó `conceptos={ultimoRecibo.conceptos}` por `conceptos={conceptosFilas}` (plantilla completa mergeada con valores del último recibo). Se pasaron las props `activeCodigos`, `catalogoCompleto`, `onAddConcepto` y `onRemoveConcepto`. Se agregó `key` al componente para que se resetee correctamente al cambiar de empleado/período.

- **Limpieza de estado de edición:** En `Tabs onValueChange` del padre, si el tab destino no es `simulador` se llama `setEditReciboData(undefined)`. Se agregó prop `onReset` a `SueldosSimulador` que también limpia el estado al hacer click en el botón "Nuevo recibo" interno.

- **Alineación de firmas:** Se reemplazaron los spacers `<div className="h-10" />` por `mt-auto` en los `div` de etiqueta de firma de ambas columnas. Al usar `flex flex-col` en cada columna del grid, `mt-auto` empuja las etiquetas al fondo independientemente de si la columna del empleador tiene imagen.

### 3.3 Datos / DB / scripts
- Sin migraciones. No se modificó el schema de Drizzle.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados
- `Actualizaciones/2026-05-14 actualizacion.md` (este archivo)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados
- El `[scrollbar-width:none]` es CSS nativo y puede no estar en el purge de Tailwind si se usa como clase arbitraria en algunos setups. En caso de no aplicar, agregar la regla manualmente al CSS global.
- Al limpiar `editReciboData` en el `onValueChange`, si en el futuro se quiere preservar el estado de edición al cambiar de tab, habrá que revisar esta lógica.

### 5.2 Pendiente inmediato
- Verificar comportamiento de la barra de solapas en pantallas pequeñas (mobile) para confirmar que el scroll táctil horizontal sigue funcionando con el scrollbar oculto.
- Evaluar si el modo de edición de recibo debería también pre-cargar los datos del recibo en los campos del formulario (fecha de liquidación, forma de pago, etc.) y no solo los conceptos.
- Verificar que el filtrado de convenios por perfil en `listConvenios` funcione correctamente en el caso edge donde un perfil tiene CCTs en AFIP pero ningún convenio creado manualmente con ese código (lista vacía esperada vs. lista vacía inesperada).
- El panel de detalle de notificación ahora recibe `profileName` pero los tipos TypeScript del componente pueden requerir actualización para evitar los casteos `(selectedNotification as any)`.

---

## 6) Archivos principales involucrados

- `src/routes/_authed/sueldos/index.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/TablaReciboSos.tsx`
- `src/components/client-detail-page.tsx`
- `src/components/notifications-view.tsx`
- `src/actions/notification.tsx`
- `src/actions/sueldos.ts`
- `Actualizaciones/2026-05-14 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
