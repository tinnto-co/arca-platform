# Revisión de User Stories — Arca Platform

Documento único de revisión post-implementación. Cada US incluye estado, gaps detectados, mejoras propuestas y referencias técnicas para futuros PRDs.

---

> # ⚠️🔍 ATENCIÓN — US-017 a US-022 SIN VERIFICAR
>
> **Las user stories US-017, US-018, US-019, US-020, US-021 y US-022 todavía NO fueron validadas end-to-end.**
>
> El código está implementado y la migración (cuando aplica) corrió correctamente, pero **falta probar el comportamiento real en navegador / chat / flujo operativo** antes de darlas por cerradas.
>
> **No considerar estas US como "pasadas" hasta completar la verificación manual descrita en la sección de cada una.**

---

## Índice

- [US-003: UI to disable unmanaged profiles](#us-003-ui-to-disable-unmanaged-profiles)
- [US-005: AI notification classification with Gemini](#us-005-ai-notification-classification-with-gemini)
- [US-011a: Exceptions summary server function](#us-011a-exceptions-summary-server-function)
- [US-011b: Exception widgets on dashboard UI](#us-011b-exception-widgets-on-dashboard-ui)
- [US-014: Add metadata and tool_calls columns to agent_message](#us-014-add-metadata-and-tool_calls-columns-to-agent_message)
- [US-015: Create agent_run execution tracking table](#us-015-create-agent_run-execution-tracking-table)
- [US-016: Agent tool — get_client_summary](#us-016-agent-tool--get_client_summary)
- [🚨 US-025: Create client_balance_config table](#-us-025-create-client_balance_config-table) — corrección de modelado de dominio
- [US-027: Alert generation pipeline](#us-027-alert-generation-pipeline)
- [US-028: Risk scoring engine](#us-028-risk-scoring-engine)
- [🚨 US-030: Balance config UI in client detail](#-us-030-balance-config-ui-in-client-detail) — corrección de modelado de dominio
- [🚧 US-031–034: Portal del cliente — gap de onboarding](#-us-031034-portal-del-cliente--gap-de-onboarding)
- [US-041: Employee event CRUD server functions](#us-041-employee-event-crud-server-functions)
- [US-042: Employee legajo timeline UI](#us-042-employee-legajo-timeline-ui)
- [🚧 US-043: Monthly novelty CRUD server functions](#-us-043-monthly-novelty-crud-server-functions)
- [🚧 US-044: Receipt template CRUD and generation from template](#-us-044-receipt-template-crud-and-generation-from-template)
- [🚧 US-046/047: Conciliación bancaria — gaps de UI y modelado](#-us-046047-conciliación-bancaria--gaps-de-ui-y-modelado)

---

## US-003: UI to disable unmanaged profiles

**Phase:** 0 · **Priority:** 3 · **Status:** Parcial · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como operador del estudio, quiero marcar perfiles como no administrados por este estudio, de manera que los perfiles no administrados no saturen la vista operativa.

**Criterios de Aceptación Originales:**
- En la pestaña de perfiles del detalle de cliente (`src/components/client-detail-page.tsx`), agregar toggle/botón por perfil para setear `managed_by_study = false`.
- Crear server function `updateProfileManagement` en `src/actions/profile.tsx` (POST, requiere `canWrite`).
- Perfiles deshabilitados se muestran grisados con badge "No administrado".
- Perfiles deshabilitados se excluyen de las queries del módulo sueldos en `src/actions/sueldos.ts`.
- Typecheck pasa.
- Verificación en navegador con `dev-browser` skill.

**Notas originales:** Phase 0. Usa la columna `managed_by_study` de US-001.

### Estado de Implementación

#### ✅ Cumplido (verificado por el usuario)
- Toggle UI con icono de ojo (Eye/EyeOff) sobre cada perfil en la sección "Perfiles Asociados".
- Perfiles deshabilitados se ven grisados (50% opacity) con label "No administrado".
- Footer del perfil seleccionado muestra badge "No administrado" cuando aplica.
- Server function `updateProfileManagement` creada con validación de org y permisos `canWrite`.
- Persistencia correcta en DB: setea `managedByStudy`, `disabledAt`, `disabledReason`.
- Filtro aplicado en `listEmpleados` (sueldos) — `src/actions/sueldos.ts:1163`.
- Filtro aplicado en `src/actions/analytics.tsx:392`.

#### ⚠️ Pendiente de verificar
- Comportamiento en módulo Sueldos: el usuario aún no llegó al US correspondiente. Pendiente de validación end-to-end cuando se aborde ese flujo.

#### ❌ Gap detectado (no contemplado en el AC original)
El filtro `managedByStudy = true` **solo se aplica en 2 archivos** de los ~10 que consultan/usan `profile`. Los siguientes archivos NO filtran perfiles no administrados y pueden seguir mostrando/calculando con perfiles deshabilitados:

| Archivo | Riesgo |
|---|---|
| `src/actions/invoice.tsx` | Listado/asignación de facturas a perfiles no administrados |
| `src/actions/notification.tsx` | Notificaciones AFIP de perfiles no administrados |
| `src/actions/accounting.tsx` | Movimientos contables sobre perfiles no administrados |
| `src/actions/alert.tsx` | Alertas generadas para perfiles no administrados |
| `src/actions/bank.tsx` | Operaciones bancarias asociadas |
| `src/actions/client-portal.tsx` | Vista del portal cliente |
| `src/actions/client.tsx` | Listados de cliente que enumeran perfiles |
| `src/routes/api/agent.ts` | Endpoint del agente IA expone `managedByStudy` pero no filtra |

### Mejoras Propuestas (para futuro PRD / US derivado)

#### 1. Propagar el filtro `managedByStudy` a todo el módulo de cliente
**Regla de negocio sugerida:** si un perfil está marcado como NO administrado, no debe aparecer en:
- Cálculos agregados (totales de IVA, deuda, vencimientos, ingresos/egresos del cliente).
- Listados operativos (facturas, notificaciones, movimientos, alertas).
- Selectores/dropdowns de perfil en formularios (no se pueden asignar nuevas operaciones a un perfil no administrado).
- Dashboards y KPIs.

**Excepciones donde SÍ debe seguir apareciendo:**
- Vista histórica de auditoría (para no romper trazabilidad de datos previos).
- La propia sección "Perfiles Asociados" del detalle de cliente (donde se administra el toggle).
- Reportes exportables marcados explícitamente como "incluir no administrados".

#### 2. Decidir semántica de "inactivo" vs "no administrado"
Hoy existen los campos `disabledAt` / `disabledReason`. Conviene definir si:
- `managedByStudy = false` implica también marcar el perfil como inactivo a efectos de cálculo.
- O si son dos estados distintos (perfil activo en AFIP pero no gestionado por el estudio).

Recomendación: tratarlos como **dos dimensiones independientes** pero el filtro operativo por defecto debe excluir cualquiera de los dos casos.

#### 3. Helper centralizado para queries de perfil
Crear un wrapper tipo `getManagedProfilesForClient(clientId, orgId)` o un constante `MANAGED_PROFILE_FILTER` reutilizable, para evitar olvidar el filtro en nuevos endpoints.

#### 4. Indicador visual en otros módulos
Cuando un perfil ya tiene datos históricos (facturas, notificaciones) y se marca como no administrado, mostrar un aviso al usuario: "Este perfil tiene N facturas y M notificaciones — ¿confirmas marcarlo como no administrado? Dejará de aparecer en los listados operativos."

#### 5. Revertir filtro desde otros módulos
Si en algún módulo el usuario quiere ver "todos los perfiles incluyendo no administrados", agregar un toggle en la UI (checkbox "Incluir no administrados") que pase un flag al server function.

### Consideraciones para Futuros PRDs

- **US futuro relacionado:** definir un US específico de "Filtrado global de perfiles no administrados" que cubra los 8 archivos detectados arriba.
- Si se introduce un sistema de archivado/baja de perfil distinto a "no administrado", documentar la diferencia conceptual.
- Considerar si el agente IA (`src/routes/api/agent.ts`) debe ignorar perfiles no administrados al responder preguntas sobre el cliente.

### Referencias Técnicas

**Archivos modificados en US-003:**
- `src/actions/profile.tsx` — server function `updateProfileManagement`
- `src/actions/sueldos.ts` — filtro en `listEmpleados`
- `src/components/client-detail-page.tsx` — UI del toggle y badges

**Archivos relacionados (gap pendiente de cubrir):**
- `src/actions/invoice.tsx`
- `src/actions/notification.tsx`
- `src/actions/accounting.tsx`
- `src/actions/alert.tsx`
- `src/actions/bank.tsx`
- `src/actions/client-portal.tsx`
- `src/actions/client.tsx`
- `src/actions/analytics.tsx` (parcialmente cubierto)
- `src/routes/api/agent.ts`

**Schema relevante:**
- Columna: `profile.managed_by_study` (boolean, default true) — origen US-001
- Campos auxiliares: `profile.disabled_at`, `profile.disabled_reason`

**Aprendizajes de la implementación:**
- "Pestaña de perfiles" en realidad es la card "Perfiles Asociados" dentro de la pestaña "Resumen" del detalle de cliente (no es una pestaña dedicada).
- Errores TS preexistentes en `credential.tsx`, `sueldos.ts:1665` y `app-sidebar.tsx` no fueron introducidos por este US.

---

## US-005: AI notification classification with Gemini

**Phase:** 1 · **Priority:** 5 · **Status:** Backend OK / UI insuficiente · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como operador del estudio, quiero que las notificaciones se clasifiquen automáticamente por severidad y categoría, de modo que los items críticos surjan inmediatamente.

**Criterios de Aceptación Originales:**
- `classifyNotification` en `src/actions/notification.tsx` que envía el mensaje a Gemini Flash y clasifica severidad, categoría y genera `ai_summary`.
- Updatea la fila con `severity`, `category`, `ai_summary`, `ai_classified_at`.
- `classifyUnclassifiedNotifications` que procesa en batch todas las no clasificadas de la org.
- Loggea a `data_source_event` con `source='ai'`.
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido (backend)
- Helper `classifyWithGemini` con `responseSchema` JSON estructurado.
- `classifyNotification` y `classifyUnclassifiedNotifications` con `canWrite` y validación de org.
- Persistencia correcta de `severity`, `category`, `aiSummary`, `aiClassifiedAt`.
- Log a `data_source_event` con `source='ai'`, `action='classified'`.
- Doble guard para no re-clasificar: `severity='unclassified'` AND `aiClassifiedAt IS NULL`.

#### ⚠️ UI insuficiente (gap principal)
La clasificación funciona pero la UI no aprovecha la información generada:
- **`SeverityBadge`** (`notifications-view.tsx:56-77`) usa estilos básicos (`bg-red-100`, etc.) y devuelve `null` si está sin clasificar — no hay feedback visual de "pendiente de clasificar" en el listado.
- **Vista detallada** (`notifications-view.tsx:705+`) NO muestra: severidad, categoría, ni `aiSummary`. Solo aparece el botón "Clasificar con IA" cuando está sin clasificar y luego el mensaje crudo. La clasificación queda invisible para el usuario.
- **Listado**: el `aiSummary` se muestra pero los demás metadatos generados por IA no.

### Mejoras Propuestas

#### 1. Vista detallada de notificación
Agregar en el panel de detalle (antes o junto a "Mensaje"):
- Badge de severidad con color/icono distintivo (crítica, alta, media, baja).
- Badge de categoría (intimación, vencimiento, requerimiento, informativa, etc.).
- Bloque destacado con el `aiSummary` arriba del mensaje completo (resumen primero, detalle después).
- Timestamp de clasificación (`aiClassifiedAt`) en metadatos.
- Botón "Re-clasificar" cuando ya está clasificada (por si el usuario quiere refrescar).

#### 2. Mejora visual de badges
- Diseñar una paleta consistente con iconografía Lucide (ej: `AlertTriangle` para crítica, `Info` para informativa).
- Tamaños diferenciados según contexto (compacto en listado, expandido en detalle).
- Tooltip con descripción del nivel al hacer hover.
- Mostrar "Sin clasificar" como badge gris (no `null`) para que el usuario vea el estado.

#### 3. Información útil para el contador en vista detallada
Sumar campos relevantes que hoy no se exponen claramente:
- Plazo / deadline si Gemini lo detecta (extender el schema de clasificación).
- Acción sugerida (qué tiene que hacer el contador).
- Monto involucrado si aplica.
- Relación con otras notificaciones del mismo cliente/perfil.

#### 4. Confianza de la clasificación
Considerar que Gemini devuelva un `confidence` y mostrar un indicador visual cuando sea baja, para que el contador valide manualmente.

### Consideraciones para Futuros PRDs

- US futuro: **rediseño de vista detallada de notificación** centrado en accionabilidad para el contador.
- US futuro: **ampliar schema de clasificación** (deadline, monto, acción sugerida).
- Evaluar costo de Gemini en batch grandes — `classifyUnclassifiedNotifications` no tiene paginación ni rate-limiting.
- Considerar reclasificación automática cuando cambie el prompt o modelo (versionar `ai_classified_at` con `ai_model_version`).

### Comentario breve sobre lo implementado

Backend sólido y bien estructurado: uso correcto del `responseSchema` de Gemini, doble guard contra reclasificación, logging a `data_source_event` para auditoría. El gap está exclusivamente en UI — los datos están en la DB pero no se exponen al usuario en el detalle, lo que vuelve invisible el valor de la IA.

### Referencias Técnicas

**Archivos modificados en US-005:**
- `src/actions/notification.tsx` — `classifyWithGemini`, `classifyNotification`, `classifyUnclassifiedNotifications`

**Archivos UI a mejorar:**
- `src/components/notifications-view.tsx` — `SeverityBadge` (línea 56), vista detallada (línea 680+)
- `src/components/notifications-table.tsx` — listado

**Schema relevante:**
- Columnas: `notification.severity`, `notification.category`, `notification.ai_summary`, `notification.ai_classified_at`
- Tabla: `data_source_event` (source='ai', action='classified')

**Env:** `GEMINI_API_KEY`. Modelo: `gemini-2.0-flash`.

---

## US-011a: Exceptions summary server function

**Phase:** 1 · **Priority:** 12 · **Status:** ✅ OK · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito un endpoint de resumen de excepciones para que el dashboard pueda mostrar items críticos.

**Criterios de Aceptación Originales:**
- `getExceptionsSummary` en `src/actions/dashboard.tsx` retornando `overdueDebtCount`, `criticalNotificationCount`, `upcomingDueDateCount` (3 días), `clientErrorCount`.
- Reutilizar patrones de `getDashboardStats`, `getOverdueDebts`, `getPendingNotificationsCount`.
- Scope por `orgId`. Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- 4 queries `COUNT` en paralelo vía `Promise.all`.
- Early return cuando `userClientIds.length === 0`.
- Scope correcto por `orgId`.
- `clientErrorCount` directo sobre `client.organizationId` (sin pasar por `inArray`).

### Comentario breve

🟢 Implementación correcta y eficiente. Backend puro, sin gaps relevantes. Las 4 queries paralelas son la decisión correcta para un endpoint de dashboard.

### 🔍 Pendiente de verificación (en uso real)
- Performance con orgs que tengan muchos clientes — validar que `Promise.all` no sature el pool de Postgres si el orgId tiene 500+ clientes.

### Referencias Técnicas
- `src/actions/dashboard.tsx` — `getExceptionsSummary`
- Tablas consultadas: `debt`, `notification`, `due_date`, `client`

---

## US-011b: Exception widgets on dashboard UI

**Phase:** 1 · **Priority:** 13 · **Status:** ✅ OK con observaciones de UX · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como operador del estudio, quiero ver excepciones críticas en el tope del dashboard.

**Criterios de Aceptación Originales:**
- Componente `ExceptionsBar` en `src/components/dashboard/` con hasta 4 cards coloreadas.
- Cada card clickeable navega a la página relevante (debts, notifications, vencimientos, clients).
- Cards solo aparecen cuando `count > 0`.
- Wired entre `<DashboardGreeting>` y `<KpiCardsRow>` en `src/routes/_authed/index.tsx`.
- Typecheck + verificación en navegador.

### Estado de Implementación

#### ✅ Cumplido
- Componente creado, condicional por count, navegación funcional.
- Tokens Arca correctos (`--arca-accent-neg`, `--arca-accent-warn`).
- `staleTime: 60_000` para no spamear el endpoint.

### Comentario breve

🟢 Implementación limpia y bien integrada. Las observaciones siguientes son sobre **decisiones de UX/navegación**, no sobre defectos técnicos.

### ⚠️ Observaciones de UX que requieren decisión

#### 1. Card "Deudas vencidas" → ¿adónde lleva?
Actualmente navega a `/clients`, lo cual es ambiguo. **No existe un módulo global de deudas** (las deudas viven dentro de `/clients/$clientId`).

**Opciones a evaluar:**
- **A** — Crear un módulo global `/debts` que liste deudas de todos los clientes del estudio (recomendado si es uso frecuente del contador).
- **B** — Mantener `/clients` pero con filtro auto-aplicado tipo "ordenar por deuda vencida descendente".
- **C** — Dejar como está y aceptar que el contador navega cliente por cliente.

**Recomendación:** opción A. El contador del estudio típicamente quiere ver "todas las deudas vencidas" como vista operativa, no entrar uno por uno. Esto encajaría con la lógica del estudio multi-cliente.

#### 2. Card "Clientes con errores" → ¿/jobs o /clients filtrado?
Actualmente navega a `/clients` sin filtro. Existen 2 alternativas válidas:

**Opciones:**
- **A** — `/clients?filter=hasErrors` (el filtro `hasErrors` ya existe en `clients-table.tsx:99-109,214` — solo falta que la tabla lea el query param y lo aplique al montar).
- **B** — `/jobs` (la ruta existe) — útil si el error es de scrapper y el contador necesita ver el log/reintentar.

**Recomendación:** opción A para la card del dashboard (vista contable del cliente con error), y opcionalmente un link secundario "ver jobs fallidos" dentro del detalle del cliente. La diferencia conceptual: la card es para el contador (qué clientes están afectados), `/jobs` es para debug técnico (qué scraper falló).

#### 3. Card "Notificaciones críticas" → ¿filtra por severidad?
Navega a `/notifications` sin filtro. Validar que la vista de notificaciones tenga filtro persistente por `severity=critical` o aplicar el filtro vía query param al hacer click desde el dashboard.

#### 4. Card "Vencimientos próximos" → ¿filtra por rango?
Navega a `/vencimientos` sin filtro. Idealmente debería abrir con el filtro "próximos 3 días" pre-seleccionado para mantener coherencia con el conteo del dashboard.

### Mejoras Propuestas

- **Deep-linking con query params** en las 4 cards para que la página destino abra ya filtrada al subset que el contador venía mirando.
- **Tooltip al hover** mostrando los top 3 ejemplos del subset (ej: "Cliente X — $50.000 vencido hace 12 días").
- **Indicador de tendencia** (↑↓ vs semana pasada) si hay datos históricos.

### 🔍 Pendiente de verificación (en navegador)
- Comportamiento responsive en mobile (4 cards en fila pueden romper layout).
- Render condicional cuando 1, 2, 3 o 4 cards están activas (que el ancho se distribuya bien).

### Referencias Técnicas
- `src/components/dashboard/exceptions-bar.tsx`
- `src/routes/_authed/index.tsx`
- `src/components/clients-table.tsx:99-109,214` — filtro `hasErrors` ya existente
- Rutas relevantes: `/clients`, `/notifications`, `/vencimientos`, `/jobs`

### Consideraciones para Futuros PRDs
- **US futuro candidato:** "Módulo global de deudas (`/debts`)" — vista cross-cliente para el contador del estudio.
- **US futuro candidato:** "Deep-linking de filtros desde dashboard" — patrón reusable para que cards/widgets pasen filtros vía query params a las páginas destino.

---

## US-014: Add metadata and tool_calls columns to agent_message

**Phase:** 2 · **Priority:** 16 · **Status:** ✅ Migración OK / 🔍 Pendiente verificar chat · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito enriquecer los mensajes del agente para que las respuestas de IA puedan ser auditadas.

**Criterios de Aceptación Originales:**
- Agregar columnas a `agent_message` en `drizzle/schema.ts`: `metadata` (jsonb nullable), `tool_calls` (jsonb nullable), `citations` (jsonb nullable), `confidence` (text nullable).
- Crear migration script y correrlo.
- Actualizar `onFinish` en `src/routes/api/agent.ts` para persistir `tool_calls` y `metadata`.
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- 4 columnas agregadas al schema.
- Migration script `src/scripts/ensure-agent-message-columns.ts` con patrón `ADD COLUMN IF NOT EXISTS`.
- Migración corrida correctamente en DB.
- `onFinish` extrae tool-invocation parts y construye `metadata` con `stepCount`/`toolCallCount`.
- `getConversationMessages` actualizado para devolver las nuevas columnas.

#### 🔍 Pendiente de verificación end-to-end
**El usuario debe probar el chat manualmente** para validar que el flujo completo funciona:
- Abrir `/chat/<id>` y enviar una pregunta que dispare tool use (ej: "¿Cuánto facturó [cliente] este mes?").
- Confirmar en DB que el mensaje del assistant guardó `tool_calls` (array no vacío) y `metadata` (con `stepCount` > 0).
- Confirmar que la sección "Fuentes consultadas (N)" aparece en la UI del chat (`src/routes/_authed/chat/$id.tsx:663-678` ya consume `toolCalls`).

> ⚠️ La migración corrió correctamente, pero el flujo end-to-end del agente con tool use **aún no fue validado en navegador**. Es la verificación pendiente principal de este US.

### Comentario breve

🟢 Schema y persistencia bien implementados. La UI del chat ya estaba preparada para consumir `toolCalls` (sección "Fuentes consultadas"), así que el cambio debería ser visible apenas se pruebe.

⚠️ **`citations` y `confidence` quedaron creadas en DB pero no se persisten desde `onFinish` ni se consumen en UI** — son columnas reservadas para usos futuros. Documentar cuándo y cómo se llenarán (¿próximo US?).

### Mejoras Propuestas

#### 1. Persistir `citations` y `confidence`
Hoy quedaron como columnas vacías. Definir:
- **`citations`**: ¿qué estructura? (ej: `[{ source: 'invoice', id: '...', excerpt: '...' }]`). Útil para que el contador haga click en un dato y vea el origen.
- **`confidence`**: ¿lo emite Gemini? ¿es agregado por step? Definir el formato (text → enum `'high' | 'medium' | 'low'` o número `0-1`).

#### 2. UI para metadata auditable
La columna `metadata` con `stepCount`/`toolCallCount` no se muestra en el chat. Considerar un panel "debug/auditoría" desplegable para usuarios técnicos o admin (ya existe el patrón "Fuentes consultadas").

#### 3. Limpiar el `as any` en `getConversationMessages`
El comentario del implementador dice que es workaround aceptable, pero idealmente:
- Tipar explícitamente los jsonb con `$type<MetadataShape>()` en el schema de Drizzle.
- Esto elimina la fricción y mejora autocompletado en el cliente.

### Consideraciones para Futuros PRDs

- **US futuro candidato:** "Persistencia y UI de citations/confidence" — cierra el círculo de auditoría que este US dejó abierto.
- **US futuro candidato:** "Panel de auditoría del agente IA" — vista por conversación que muestre todos los tool calls, costos, latencia y confianza por mensaje (útil para debugging y compliance).
- Considerar versionar el modelo (`ai_model_version` en metadata) para poder filtrar respuestas generadas con prompts viejos.

### Referencias Técnicas

**Archivos modificados en US-014:**
- `drizzle/schema.ts` — columnas nuevas en `agentMessage`
- `src/scripts/ensure-agent-message-columns.ts` — migración idempotente
- `src/routes/api/agent.ts` — `onFinish` persistiendo tool_calls + metadata
- `src/actions/agent.tsx` — `getConversationMessages` con todas las columnas

**Archivos UI relevantes:**
- `src/routes/_authed/chat/$id.tsx:663-678` — ya consume `toolCalls` ("Fuentes consultadas")
- `metadata`, `citations`, `confidence` no tienen consumidor en UI todavía

**Schema relevante:**
- Tabla: `agent_message`
- Columnas nuevas: `metadata` (jsonb), `tool_calls` (jsonb), `citations` (jsonb), `confidence` (text)

---

## US-015: Create agent_run execution tracking table

**Phase:** 2 · **Priority:** 17 · **Status:** ✅ Migración OK / 🔍 Pendiente verificar chat · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito tracking de ejecución para que cada invocación del IA pueda ser auditada por separado.

**Criterios de Aceptación Originales:**
- Tabla `agentRun` en `drizzle/schema.ts` con: `id`, `conversation_id` (FK agent_conversation), `user_id`, `organization_id`, `client_id` (FK nullable), `profile_id` (FK nullable), `status` (default 'running'), `intent`, `input`, `output`, `tool_trace` (jsonb), `error`, `started_at`, `finished_at`.
- Migration script creado y corrido.
- En `src/routes/api/agent.ts`: insertar registro al iniciar y actualizar al finalizar.
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- Tabla creada con todos los campos requeridos y FKs.
- Migration script `src/scripts/ensure-agent-run-table.ts` con `CREATE TABLE IF NOT EXISTS`.
- Migración corrida correctamente en DB.
- Insert al inicio (`status='running'`), update en `onFinish` (`status='finished'` con output + toolTrace + finishedAt).
- Manejo de errores: `status='failed'` con campo `error` poblado en excepción.

#### 🔍 Pendiente de verificación end-to-end
**El usuario debe probar el chat manualmente** para validar que el flujo completo funciona:
- Abrir `/chat/<id>` y enviar un mensaje.
- Confirmar en DB: `SELECT status, input, output, tool_trace, started_at, finished_at FROM agent_run ORDER BY started_at DESC LIMIT 1` — debería devolver una fila con `status='finished'`, `output` poblado y `tool_trace` con la traza de tools usadas.
- Forzar un error (ej: pregunta que rompa el agente) y verificar que se guarde con `status='failed'` y `error` no nulo.

> ⚠️ La migración corrió correctamente, pero el flujo end-to-end del agente **aún no fue validado en navegador**. Es la verificación pendiente principal de este US.

### Comentario breve

🟢 Implementación correcta. Patrón estándar de tracking de ejecución (insert-then-update) bien aplicado, con manejo de errores que evita filas "running" huérfanas si el stream falla.

⚠️ **`intent`, `client_id` y `profile_id` se crearon nullable pero NO se llenan en el flujo actual** — son campos reservados para que un US posterior detecte contexto (ej: "el usuario está preguntando sobre cliente X" → setea `client_id` para filtrar dashboards de auditoría). Documentar cuándo se llenarán.

### Mejoras Propuestas

#### 1. Detección de contexto (`intent`, `client_id`, `profile_id`)
Hoy quedan vacíos. Definir cómo se llenan:
- **`intent`**: clasificación del tipo de pregunta (ej: `consulta_facturacion`, `consulta_deuda`, `accion_administrativa`). Podría usar Gemini Flash para clasificar.
- **`client_id` / `profile_id`**: detectar entidad mencionada en el input. Si el contador pregunta "¿cuánto facturó Acme SA?", llenar `client_id` con el ID de Acme SA.

Esto habilita filtros como "ver todas las consultas que el equipo hizo sobre cliente X esta semana".

#### 2. UI de auditoría del agente
La tabla `agent_run` no tiene consumidor visual. Considerar:
- Vista admin `/admin/agent-runs` con tabla filtrable por `status`, `userId`, `clientId`, rango de fechas.
- Métricas agregadas: % de runs `failed`, tiempo promedio (`finished_at - started_at`), tools más usados.
- Drill-down a `tool_trace` para debugging de respuestas concretas.

#### 3. Métricas de costo y latencia
Agregar (US futuro): `tokens_input`, `tokens_output`, `cost_usd`, `latency_ms`. Útil para reportes de uso por org/usuario y control de gasto en Gemini.

#### 4. Relación con `agent_message`
Hoy `agent_run` y `agent_message` viven en paralelo sin FK directa. Evaluar agregar `agent_run.assistant_message_id` para vincular cada run con el mensaje generado y poder hacer joins limpios en auditoría.

### Consideraciones para Futuros PRDs

- **US futuro candidato:** "Detección de intent y entidad en agent_run" — llena `intent`, `client_id`, `profile_id` automáticamente.
- **US futuro candidato:** "Dashboard de auditoría del agente IA" — vista admin sobre `agent_run` + `agent_message` para compliance, debugging y métricas de uso.
- **US futuro candidato:** "Tracking de costos del agente" — columnas de tokens/costo + reportes por org.
- Considerar política de retención (¿borrar runs > 90 días? ¿archivar?) para no inflar la tabla.

### Referencias Técnicas

**Archivos modificados en US-015:**
- `drizzle/schema.ts` — tabla `agentRun`
- `src/scripts/ensure-agent-run-table.ts` — migración idempotente
- `src/routes/api/agent.ts` — insert al inicio + update en `onFinish` + manejo de error

**Schema relevante:**
- Tabla nueva: `agent_run`
- FKs: `conversation_id` → `agent_conversation`, `user_id` → `user`, `organization_id` → `organization`, `client_id` → `client` (nullable), `profile_id` → `profile` (nullable)
- Campos sin consumidor todavía: `intent`, `client_id`, `profile_id`

**Aprendizajes técnicos:**
- `agentRunRow` se obtiene vía `.returning({ id: agentRun.id })` y se cierra sobre el callback `onFinish` — patrón funciona pero requiere declarar la variable antes del stream.

---

## US-016: Agent tool — get_client_summary

**Phase:** 2 · **Priority:** 18 · **Status:** ✅ Implementación OK / 🔍 No verificable hasta probar el chat · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como agente IA, necesito una herramienta `get_client_summary` para responder preguntas sobre el estado general de un cliente.

**Criterios de Aceptación Originales:**
- Tool `get_client_summary` en `src/routes/api/agent.ts` que acepte `clientName` (string).
- Búsqueda por nombre con ILIKE.
- Trae: data del cliente, conteo de perfiles, notificaciones abiertas, deudas vencidas + balance total, próximos vencimientos (30 días), timestamps del último scrape por job type.
- Retorna JSON estructurado, no SQL crudo.
- Scope por `orgId`. Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- Tool registrado en `agent.ts` con input `clientName`.
- 5 queries Drizzle en paralelo vía `Promise.all`.
- ILIKE para match parcial por nombre.
- Scope correcto a `orgId`.
- Returns estructurado: `cliente`, `perfiles`, `notificaciones`, `deudas`, `proximosVencimientos`, `ultimosScrapeos`.
- System prompt del agente actualizado para mencionar la nueva tool.

#### 🔍 No verificable hasta probar el chat
**Este US depende 100% del chat funcionando end-to-end.** No hay UI propia ni endpoint que se pueda probar de forma aislada — el tool solo se ejecuta cuando el agente decide invocarlo durante una conversación.

> ⚠️ Mientras el chat no se valide en navegador (ver US-014 y US-015), no se puede confirmar que esta tool:
> - Sea efectivamente invocada por el agente cuando el usuario pregunta por el estado de un cliente.
> - Retorne datos coherentes y completos.
> - Respete el scope de `orgId` cuando el agente la llame.

**Test mínimo cuando el chat esté operativo:**
- Preguntar: *"¿Cuál es el estado de [nombre_cliente_real]?"*
- Confirmar que el agente devuelve: cantidad de perfiles, notificaciones abiertas, deudas vencidas con monto, vencimientos próximos y últimos scrapes.
- Probar con un cliente inexistente — debería responder que no lo encuentra (no crashear).
- Probar con un cliente de OTRA organización — no debería devolver datos.

### Comentario breve

🟢 Implementación correcta a nivel código: `Promise.all` para eficiencia, scope por `orgId` aplicado, returns estructurados. La calidad real de las respuestas del agente depende de que el system prompt guíe bien cuándo invocar esta tool — eso solo se valida en uso.

### ⚠️ Observaciones / Mejoras Propuestas

#### 1. Match por nombre puede ser ambiguo
Si dos clientes del mismo estudio tienen nombres parecidos (ej: "Acme SA" y "Acme SRL"), el ILIKE puede traer múltiples matches. Definir comportamiento:
- ¿Devolver todos y que el agente pida desambiguación al usuario?
- ¿Devolver solo el primero?
- ¿Aceptar también CUIT como input alternativo (más unívoco)?

**Recomendación:** soportar también `clientCuit` como input opcional, y si el ILIKE devuelve más de un cliente, devolver la lista de candidatos con CUIT para que el agente desambigüe.

#### 2. Filtro de perfiles no administrados
**Cruce con US-003:** la tool no filtra `managedByStudy = true` al contar perfiles ni al traer datos relacionados. Si el contador pregunta por un cliente que tiene perfiles deshabilitados, el conteo va a incluirlos. Aplicar el mismo filtro que en el resto del módulo.

#### 3. Profundidad de información
La tool devuelve **conteos y agregados**, no detalles. Si el contador pregunta "¿qué notificaciones abiertas tiene Acme?", el agente solo sabrá el número, no el contenido. Considerar:
- Tool complementaria `get_client_notifications(clientName, limit)` que traiga las N más recientes/críticas.
- O devolver top-3 de cada categoría dentro del summary actual.

#### 4. Datos de IVA y facturación
El summary no incluye datos de IVA (último mes scrapeado, monto facturado, saldo a favor). Para un contador es información clave — evaluar agregarla o crear tool dedicada `get_client_iva_summary`.

#### 5. Logging del tool call
Validar que `tool_trace` en `agent_run` (US-015) capture correctamente las invocaciones de esta tool con sus argumentos y respuesta — útil para auditoría.

### Consideraciones para Futuros PRDs

- **US futuro candidato:** "Familia de tools del agente sobre cliente" — `get_client_notifications`, `get_client_invoices`, `get_client_debt_detail`, `get_client_iva_summary`. Cada una retorna detalle, no solo conteos.
- **US futuro candidato:** "Desambiguación inteligente de cliente" — soportar CUIT, alias, búsqueda fuzzy; manejar múltiples matches con respuesta estructurada.
- Aplicar filtro `managedByStudy` en todas las tools del agente (cierra el gap de US-003).

### Referencias Técnicas

**Archivos modificados en US-016:**
- `src/routes/api/agent.ts` — tool `get_client_summary` + system prompt actualizado

**Tablas consultadas:**
- `client`, `profile`, `notification`, `debt`, `due_date`, `job`

**Dependencias:**
- US-014 (tool_calls en agent_message) y US-015 (agent_run) — necesarios para auditar las invocaciones de esta tool.

**Aprendizajes técnicos:**
- FK heterogéneas: la mayoría de tablas usa columna `client` para el FK, pero `job` usa `clientId` — conviene normalizar a futuro.
- Errores TS preexistentes en `agent.ts` (imports y destructures sin uso) NO fueron introducidos por este US.

---

## US-027: Alert generation pipeline

**Phase:** 3 · **Priority:** 29 · **Status:** ✅ Cumplido / ⚠️ Volumen excesivo · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito generación automática de alertas a partir de deudas vencidas, notificaciones críticas y vencimientos próximos.

**Criterios de Aceptación Originales:**
- `src/lib/alert-generator.ts` con `generateAlerts(orgId)` que escanea: deudas open con `dueDate < today`, notificaciones críticas no resueltas, vencimientos dentro de 7 días no completados, clientes con `hasErrors=true`.
- Crea registros en `alert` por cada hallazgo.
- Deduplica: no genera alertas duplicadas para `(type, source_entity_type, source_entity_id, status='open')`.
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- `generateAlerts(orgId)` implementado con 4 fuentes de escaneo.
- Deduplicación eficiente con Set en memoria (evita N+1).
- Severidades coherentes: `overdue_debt=high`, `critical_notification=critical`, `upcoming_due_date=medium`, `scraper_error=high`.
- Returns `{ created: N }` informativo.
- Re-ejecuciones idempotentes (segundo run devuelve `created: 0`).

### Comentario breve

🟢 Implementación correcta y eficiente a nivel código. ⚠️ **El problema es de volumen y UX, no de implementación**: con datos históricos genera demasiadas alertas y se vuelve ruidoso para el contador.

### ⚠️ Problema principal: volumen excesivo de alertas

Con clientes que arrastran años de datos (deudas viejas, notificaciones acumuladas), `generateAlerts` puede crear **decenas o cientos de alertas por cliente**, saturando la vista operativa y haciendo imposible distinguir lo urgente de lo viejo.

### Mejoras Propuestas (consolidación y filtrado)

#### 1. Agrupación por cliente (recomendación principal)
**Patrón:** una **alerta-resumen por cliente** que englobe todas las alertas individuales del mismo tipo.

Ejemplo:
- Antes: 12 alertas separadas para Cliente Acme (8 deudas vencidas + 3 notificaciones críticas + 1 error de scraper).
- Después: 1 alerta-resumen "Acme SA — 12 items requieren atención" con `metadata` que liste las 12 sub-alertas (tipo + descripción + sourceEntityId).

**Implementación sugerida:**
- Nuevo `type='client_summary'` o `type='grouped'` con `clientId` poblado.
- Campo `metadata` (jsonb) ya existe en el schema — usarlo para guardar el array de sub-items.
- Severidad de la alerta-resumen = max(severidades de los items).
- UI hace expand/collapse para ver el detalle.

#### 2. Cutoff temporal para datos históricos
Hoy `dueDate < today` trae **todas las deudas vencidas históricas**, incluso de hace 5 años.

**Opciones:**
- Solo generar alertas para items vencidos en los últimos N días (ej: 90 o 180).
- Configurable por org vía settings (`alert_lookback_days`).
- Items más viejos → reporte aparte, no alerta.

#### 3. Snooze / suprimir alertas
Permitir al contador "silenciar" una alerta por X días sin marcarla como resuelta. Hoy solo hay `status='open'/'resolved'` — agregar `status='snoozed'` con `snoozedUntil` timestamp.

#### 4. Threshold de severidad mínima
Configurable por org: "no generar alertas de severidad `low`" o "solo notificaciones críticas, no medias".

#### 5. Rate limiting de generación
Si `generateAlerts` corre con cada nueva ingesta de datos, puede generar bursts. Considerar:
- Job batch nocturno único por org en vez de trigger por evento.
- O dedupe extendido para no recrear alertas resueltas en las últimas 24-48 hs.

#### 6. Auto-resolución
Cuando la condición que generó la alerta deja de cumplirse (deuda pagada, notificación resuelta, vencimiento completado), la alerta debería pasar automáticamente a `resolved` en vez de quedar abierta indefinidamente. Hoy no parece haber un proceso reverso.

### ⚠️ Gap de automatización (compartido con US-028)

Aparte del problema de volumen descrito arriba, hay un gap independiente: **nada en el repo dispara `generateAlerts(orgId)` en producción**.

**Estado actual:**
- La función está implementada como utilidad pura en `src/lib/alert-generator.ts`.
- Ningún componente la invoca: ni cron, ni endpoint HTTP, ni hook post-scrape, ni botón de UI.
- Hoy se ejecuta **únicamente vía script CLI** (`src/scripts/run-alert-generator.ts`) que sirve para validación/dev pero no resuelve la operación en producción.

**Por qué es un gap del PRD:**
- US-027 dice textual "*automatic alert generation*" pero los Acceptance Criteria se limitan a crear la función pura.
- US-028 (risk scoring engine) tiene el mismo gap — US-024 menciona "*periodic risk snapshots*" pero ninguna US se hace cargo del scheduling.
- Revisé las 55 USs del PRD (US-001 a US-055) con keywords `cron|schedule|setInterval|automat|trigger|periodic|daily|monthly|background job` — **ninguna posterior agenda estos procesos**.

**Triggers naturales recomendados:**

| Función | Cadencia ideal | Por qué |
|---|---|---|
| `generateAlerts(orgId)` | post-scrape (hook desde `arca-scrapper`) o cron diario por org | El dato cambia justo después de cada scrape — momento más fresco para regenerar |
| `generateRiskSnapshots(orgId, period)` (US-028) | cron mensual día 1 con `period` = mes anterior | Snapshot histórico, un row por (profile, mes) |

**Esfuerzo estimado:** bajo. El proyecto ya tiene el patrón de cron en `src/lib/payroll-cron.ts` (registrado desde `server.ts` con `setInterval`, día 20 mensual). Crear USs tipo "alert-cron" y "risk-cron" es ~30 líneas siguiendo ese patrón.

Para el trigger post-scrape de alertas habría que tocar el repo `arca-scrapper` (POST a un endpoint interno del platform), lo cual queda fuera de este repo.

**Implicancia operativa mientras tanto:**
- En producción las alertas y los risk snapshots **no se actualizan solos**.
- Los scripts CLI quedan como herramienta de admin para regenerar on-demand (similar a los scripts `ensure-*` y `backfill-*` ya existentes).
- **Recomendación: añadir 2 USs al backlog** ("schedule alert cron", "schedule risk snapshot cron") antes de declarar la fase 3 cerrada.

### Consideraciones para Futuros PRDs

- **US futuro candidato (recomendado):** "Consolidación de alertas por cliente con sub-items en `metadata`" — resuelve el problema de volumen sin perder detalle.
- **US futuro candidato (crítico):** "Schedule de generación automática de alertas" — cron o hook post-scrape que llame `generateAlerts(org.id)` para todas las orgs (cubre el gap de automatización compartido con US-028).
- **US futuro candidato:** "Auto-resolución de alertas" — proceso que cierra alertas cuya condición ya no aplica.
- **US futuro candidato:** "Configuración de generación de alertas por org" — lookback, thresholds, snooze, severidad mínima.
- **US futuro candidato:** "Vista de alertas con filtros operativos" (severidad, cliente, antigüedad, asignado).
- Considerar alerta de "pico anormal": si una corrida genera >X alertas para una misma org, marcar como sospechoso y revisar manualmente antes de mostrar al usuario.

### Referencias Técnicas

**Archivos modificados en US-027:**
- `src/lib/alert-generator.ts`

**Schema relevante:**
- Tabla `alert` (drizzle/schema.ts:1023):
  - `type`, `severity`, `clientId`, `profileId`, `sourceEntityType`, `sourceEntityId`, `status`, `metadata` (jsonb), `assignedToUserId`, `dueAt`, `resolvedAt`
  - Index existente: `idx_alert_org_status`
- Tipos actuales: `overdue_debt`, `critical_notification`, `upcoming_due_date`, `scraper_error`, `balance_due_soon`, `missing_activity`

**Aprendizajes técnicos:**
- FK heterogéneas: `debt.client`, `notification.client`, `dueDate.client` (no `clientId`) — patrón a normalizar.

---

## US-028: Risk scoring engine

**Phase:** 3 · **Priority:** 30 · **Status:** ✅ Cumplido / ⚠️ Sin scheduling · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito risk scoring para que cada perfil reciba una evaluación periódica.

**Criterios de Aceptación Originales:**
- `src/lib/risk-engine.ts` con `calculateRiskScore(profileId, period)` computando score 0-100 sobre 6 factores: deuda vencida (30%), notificaciones críticas (20%), vencimientos próximos (15%), meses sin facturar (15%), IVA proyectado (10%), errores de scraper (10%).
- Returns: `score`, `risk_level` (low <25, medium 25-50, high 50-75, critical >75), `factors` jsonb.
- `generateRiskSnapshots(orgId, period)` que corre el scoring para todos los profiles e inserta en `profile_risk_snapshot`.
- Re-correr para mismo período actualiza filas existentes (no duplicados).
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- `calculateRiskScore` con 6 factores ponderados y normalización 0-100.
- Risk levels coherentes con thresholds del PRD (low <25, medium 25-50, high 50-75, critical >75).
- `generateRiskSnapshots` itera todos los profiles de la org y hace upsert vía `onConflictDoUpdate` sobre `(profileId, period)`.
- `factors` jsonb almacena tanto los counts crudos (`overdueDebtCount`) como los scores ponderados (`overdueDebtScore`) — útil para auditoría posterior.
- Verificado vía script CLI: la suma de `*Score` matchea el `score` total. Re-ejecuciones para mismo período no duplican filas.

### Comentario breve

🟢 Implementación correcta y testeable. Los pesos del scoring son constantes en el archivo, lo cual facilita ajustes futuros sin migrar datos.

⚠️ **Igual que US-027, no hay quien lo dispare en producción** — ver sección "Gap de automatización" abajo.

### ⚠️ Gap de automatización (compartido con US-027)

Ver el detalle completo en US-027 → "Gap de automatización". Resumen específico para US-028:

- US-024 dijo textual "*periodic risk snapshots*" pero los Acceptance Criteria solo crearon la función — no quien la llama.
- Hoy `generateRiskSnapshots` solo se ejecuta vía script CLI (`src/scripts/run-risk-engine.ts`).
- **Cadencia natural**: cron mensual día 1 con `period` = mes anterior. Un row por (profile, mes), historial completo.
- Revisé las 55 USs del PRD (US-001 a US-055) con keywords de scheduling — ninguna se hace cargo.
- El patrón de cron ya existe en `src/lib/payroll-cron.ts` (registrado desde `server.ts`, día 20 mensual). Replicarlo para risk snapshots es trivial.

### Mejoras Propuestas

#### 1. Schedule mensual con período automático
La función toma `period` como string `YYYY-MM`. El scheduler debería computar automáticamente el período del mes anterior al ejecutarse el día 1 (ej: el 1 de mayo corre con `period='2026-04'`). Sin esa automatización, alguien tiene que decidir y pasar el período manualmente cada mes.

#### 2. Historial vs. snapshot único
Hoy la unique key es `(profile_id, period)`, lo cual permite **un row por mes histórico**. Definir si:
- Re-correr para un período pasado actualiza el row (recálculo retroactivo) — comportamiento actual.
- O si se versiona y se mantiene el snapshot original como `created_at` y se agrega `recalculated_at`.

Recomendación: para fines de auditoría, considerar agregar `created_at` y `updated_at` separados, o una tabla de versiones (`profile_risk_snapshot_history`).

#### 3. Validación de ranges de score
Hoy si un factor calcula mal y devuelve >30 para `overdueDebtScore` (que tiene tope 30), el score total puede pasar 100. Agregar `Math.min(score, 100)` defensivo en el return.

#### 4. UI/dashboard de riesgo
La tabla `profile_risk_snapshot` no tiene consumidor visual. Considerar:
- Vista por cliente: gráfico de evolución del riesgo de cada perfil mes a mes.
- Vista de org: distribución de profiles por `risk_level` para identificar el % de portfolio en estado crítico.
- Drill-down a `factors` para ver qué componente del score está empujando el riesgo.

#### 5. Alertas derivadas del score (cruce con US-027)
Cuando un perfil cambia de `medium` a `high` o `critical` entre dos snapshots consecutivos, generar una alerta tipo `risk_jump` desde US-027. Esto convierte el risk-engine en input del alert-generator y crea un puente útil entre ambas USs.

#### 6. Configuración de pesos por org
Hoy los 6 pesos son constantes globales. Distintos estudios pueden priorizar distinto (ej: estudio enfocado en notificaciones AFIP querría peso 40% en `criticalNotifications`). Considerar `org_settings.risk_weights` (jsonb) para overrides.

### Consideraciones para Futuros PRDs

- **US futuro candidato (crítico):** "Schedule mensual de risk snapshots" — cron que llame `generateRiskSnapshots(org.id, prevMonth)` para todas las orgs el día 1 de cada mes (cubre el gap de automatización compartido con US-027).
- **US futuro candidato:** "Dashboard de riesgo por cliente y por estudio" — UI que consuma `profile_risk_snapshot`.
- **US futuro candidato:** "Alertas de salto de nivel de riesgo" (`risk_jump`) — cierra el círculo con US-027.
- **US futuro candidato:** "Pesos de scoring configurables por org" — para flexibilidad por tipo de estudio.

### Referencias Técnicas

**Archivos modificados en US-028:**
- `src/lib/risk-engine.ts` — `calculateRiskScore` + `generateRiskSnapshots`

**Schema relevante (origen US-024):**
- Tabla `profile_risk_snapshot`:
  - Columnas: `profile_id` (FK), `period` (text), `score` (numeric 5,2), `risk_level` (text), `factors` (jsonb), `created_at`
  - Unique constraint: `(profile_id, period)`

**Script de validación:**
- `src/scripts/run-risk-engine.ts` — útil para regenerar snapshots on-demand mientras no exista cron.

**Aprendizajes técnicos:**
- `factors` jsonb almacena counts y scores en el mismo objeto — útil pero requiere cuidado al sumar (filtrar por sufijo `*Score` para distinguir).
- `onConflictDoUpdate` con `target: [col1, col2]` funciona en Drizzle para constraints multi-columna (patrón confirmado).
- `invoice.profile` es el FK column name (no `invoice.profileId`) — consistente con el patrón `.client` de otras tablas.
- `ivaScrape.periodoFiscal` usa el formato del scraper — pasar consistentemente el `period` que el caller espera (recomendado `YYYY-MM`).

---

## 🚨 US-025: Create client_balance_config table

**Phase:** 3 · **Priority:** 27 · **Status:** ⛔ **Modelado erróneo — requiere corrección** · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito balance config para fechas de cierre de ejercicio por cliente.

**Criterios de Aceptación Originales:**
- Agregar tabla `clientBalanceConfig`: `id` (uuid PK), `client_id` (uuid FK UNIQUE), `fiscal_year_end_month` (integer), `fiscal_year_end_day` (integer), `presentation_due_days` (integer nullable), `alert_days_before` (integer[] default `[60,30,15,7]`), `created_at`, `updated_at`.
- Crear migration script y correrlo.
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido (técnicamente)
- Tabla creada con todos los campos del AC.
- Migration script `src/scripts/ensure-client-balance-config-table.ts` con `CREATE TABLE IF NOT EXISTS`.
- Schema en `drizzle/schema.ts:986–999`.
- UNIQUE constraint sobre `client_id`.

### 🚨 Punto crítico 1 — El modelado está en el nivel equivocado

**El AC original pidió `client_id` UNIQUE, pero el modelo fiscal real del producto tiene la entidad fiscal a nivel `profile`, no `client`.**

#### Cómo funciona realmente el dominio

- **`client`** = agrupador de entidades fiscales (representante o titular CUIT genérico, ligado a `orgId`). Contiene 1+ profiles.
- **`profile`** = entidad fiscal individual (la empresa real con CUIT propio: `identity_number`, `identity_type`, dirección, email). Es donde viven los datos fiscales reales (deudas, notificaciones, IVA, sueldos por empresa).

Es decir: un `client` puede representar a 3 empresas distintas (3 profiles), cada una con su propio cierre de ejercicio (ej: 31/12, 30/06, 31/03).

#### Implicancia del UNIQUE en `client_id`

Con la tabla actual **es imposible representar la realidad**: solo se puede guardar 1 fecha de cierre por client. Si un client representa varias empresas con cierres distintos, el sistema obliga a que todas compartan el mismo cierre, lo que es fiscalmente incorrecto.

#### Lo correcto sería

Una tabla `profile_balance_config` con:
- `profile_id` (uuid FK UNIQUE → profile)
- mismos campos: `fiscal_year_end_month`, `fiscal_year_end_day`, `presentation_due_days`, `alert_days_before`

#### Migración propuesta

1. Crear `profile_balance_config` con `profile_id` UNIQUE.
2. Backfill: por cada row existente en `client_balance_config`, replicar el dato a **cada profile** del cliente (todos heredan la misma config inicial; el contador la corregirá perfil por perfil).
3. Deprecar `client_balance_config` (mantener vacía durante deprecation, eliminar luego).
4. Actualizar `getBalanceConfig`/`upsertBalanceConfig` (US-030) para operar con `profileId`.
5. Actualizar la UI de US-030: hoy el card "Cierre de ejercicio" vive en el detalle de cliente — debería moverse al detalle de profile, o el card del cliente debería iterar profiles.

### 🚨 Punto crítico 2 — Gap downstream silencioso (cadena rota)

La cadena conceptual **config → alerta → UI** está implementada de forma fragmentada:

| Eslabón | Dónde | Estado |
|---|---|---|
| Tipo de alerta `balance_due_soon` declarado | US-023 (note PRD línea 371) | ✅ Declarado |
| Generator que emite `balance_due_soon` consumiendo `client_balance_config.alert_days_before` | US-027 (`src/lib/alert-generator.ts`) | ❌ **Nunca lee la tabla** ni produce ese tipo de alerta |
| Filtro `balance_due_soon` en UI de alertas | US-029 (`src/routes/_authed/alerts/index.tsx:57,338`) | ⚠️ **Filtro inerte** — la opción existe pero siempre devuelve vacío |

Es decir: la UI de alertas declara la opción "Balance próximo", el contador la podría seleccionar, pero **el sistema nunca produce esas alertas porque US-027 no las genera**. Toda la inversión en `alert_days_before` queda muerta.

### 🚨 Punto crítico 3 — Dead columns

Dos columnas se persisten desde la UI de US-030 pero **ningún código las consume después**:

| Columna | Persistida por | Leída por |
|---|---|---|
| `presentation_due_days` | UI de US-030 | **Nadie** |
| `alert_days_before` (default `[60,30,15,7]`) | UI de US-030 | **Nadie** (US-027 no la lee) |

Son configuración huérfana. Como nadie depende todavía de los valores guardados, el costo de migrar el modelado a `profile_balance_config` es bajo: solo 1 columna útil hoy (`fiscal_year_end_*`), las demás están en estado de "reservadas pero sin consumer".

### Consideraciones para Futuros PRDs

- **US futura (crítica):** "Migrar `client_balance_config` → `profile_balance_config`" — corrige el nivel de modelado, mueve UI al detalle de profile, hace backfill.
- **US futura (depende de la migración):** "Generator de alertas tipo `balance_due_soon`" — extender US-027 para que escanee `profile_balance_config.alert_days_before` y produzca alertas cuando el cierre de ejercicio se acerca según los thresholds configurados.
- **US futura:** "UI dedicada de configuración de cierre por profile" — exposición clara dentro del detalle de cada profile, no compartida entre todos.

### Referencias Técnicas

**Archivos creados/modificados en US-025:**
- `drizzle/schema.ts:986–999` — definición de tabla `clientBalanceConfig`
- `src/scripts/ensure-client-balance-config-table.ts` — migration idempotente

**Archivos relacionados (consumen o exponen sin consumirla):**
- `src/actions/client.tsx:13,1027,1050` — server functions (US-030)
- `src/components/client-detail-page.tsx:53,54,521,540,2380+` — UI del card (US-030)
- `src/routes/_authed/alerts/index.tsx:57,338` — filtro inerte (US-029)

**Schema relevante (modelo fiscal correcto):**
- `profile.identity_number` + `profile.identity_type` (CUIT/CUIL real de la empresa)
- `profile.name`, `profile.address`, `profile.email`, `profile.phone`
- `profile.liquida_sueldos`, `profile.firma_digital_empleador`
- Las tablas `debt`, `notification`, `due_date` ya tienen ambos FK (`client_id` y `profile_id`) — el dato real vive a nivel profile.

---

## 🚨 US-030: Balance config UI in client detail

**Phase:** 3 · **Priority:** 32 · **Status:** ⛔ **Modelado heredado erróneo (ver US-025)** · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como operador del estudio, quiero configurar fechas de cierre de ejercicio por cliente.

**Criterios de Aceptación Originales:**
- En la pestaña Info del detalle de cliente, agregar sección "Cierre de ejercicio" con month/day pickers y config de días de alerta.
- Crear server functions `getBalanceConfig(clientId)` y `upsertBalanceConfig(clientId, data)` en `src/actions/client.tsx`.
- Typecheck pasa.
- Verificar en navegador.

### Estado de Implementación

#### ✅ Cumplido (técnicamente)
- `getBalanceConfig` y `upsertBalanceConfig` con scope por org.
- `upsertBalanceConfig` usa `onConflictDoUpdate` sobre `clientId` UNIQUE.
- Card "Cierre de ejercicio" como Row 3 del tab Resumen (`client-detail-page.tsx:2380+`).
- Inputs: month (1–12), day (1–31), presentation days (opcional), alert days (texto comma-separated).
- State sync vía `useEffect` desde el query result.
- Toast "Configuración guardada" al hacer submit.

### 🚨 Punto crítico — Hereda el modelado erróneo de US-025

**Esta US implementa correctamente el AC pedido, pero el AC pedía operar a nivel `client` cuando el modelo fiscal real exige nivel `profile`.** Ver `🚨 US-025` arriba para el detalle del problema, los 3 puntos críticos y la migración propuesta.

Los efectos que se ven específicamente en US-030:

1. **Card en lugar incorrecto**: el card "Cierre de ejercicio" vive en el detalle de **cliente**, lo que da a entender al usuario que la config aplica al cliente entero. Si el cliente representa varias empresas, el contador no tiene cómo configurar cierres distintos por entidad.
2. **Server functions con firma incorrecta**: `getBalanceConfig(clientId)` y `upsertBalanceConfig(clientId, data)` deberían tomar `profileId`. El refactor afecta el nombre de las funciones, los args, las queries internas y los call sites en la UI.
3. **`useEffect` de sync se hereda igual**: el patrón está bien, pero al migrar a profile habrá que disparar el query con el `profileId` activo en el detalle de profile (que aún no existe como vista dedicada en este nivel de la UI).

### Mejoras Propuestas (post-migración)

#### 1. Mover el card al detalle de profile
Cuando se cree el detalle dedicado por profile (o exista la sección de profile en el client detail), mover el card "Cierre de ejercicio" a ese contexto. El usuario va a configurar cierre por empresa, no por agrupador.

#### 2. Listar configs múltiples cuando viva en client detail
Si por UX se decide igual mostrar las configs en el detalle de cliente, listar **todas las configs de los profiles del cliente** en una tabla — no un único card. Cada row con su botón "editar" linkeando al profile correspondiente.

#### 3. Surface explícitamente "sin configurar"
Hoy si no hay config, el card aparece vacío y "guardable". Para cierres no configurados de profiles fiscales activos, debería mostrar un warning visual (porque no tener cierre definido es un agujero operativo del estudio).

#### 4. Validación del día/mes
Hoy la UI permite guardar `30/02`, `31/04`, etc. Validar combinaciones imposibles (febrero 30, abril 31, etc.) tanto en frontend como en server function.

### Consideraciones para Futuros PRDs

- **Bloqueante:** este US no se puede dar por cerrado a nivel producto hasta que se migre el modelado de US-025. Técnicamente la implementación cumple su AC original, pero a nivel funcional el estudio no puede operar correctamente con clientes que representan múltiples empresas.
- Coordinar la US de migración (`profile_balance_config`) con esta US para hacer el refactor de UI/actions en el mismo PR.

### Referencias Técnicas

**Archivos modificados en US-030:**
- `src/actions/client.tsx:13` (import) · `:1027` (`getBalanceConfig`) · `:1050` (`upsertBalanceConfig`) · `:1080` (insert) · `:1089` (`onConflictDoUpdate`)
- `src/components/client-detail-page.tsx:53–54` (imports) · `:521` (useQuery) · `:540–546` (useMutation) · `:2380+` (UI del card)

**Aprendizajes técnicos (válidos aunque el modelado migre):**
- `clientBalanceConfig.clientId` es la unique conflict target para `onConflictDoUpdate` — single column, no array. Patrón replicable cuando se migre a `profileId`.
- `jsonb()` fields devuelven `unknown` — castear el return de la server fn con shape específico, no con `as any`.
- `useEffect` syncing state desde query result es el patrón usado para popular forms desde server data en este codebase.

---

## 🚧 US-031–034: Portal del cliente — gap de onboarding

**Phase:** 4 · **Priorities:** 33–36 · **Status:** ⛔ **Portal funcional pero inalcanzable para usuarios reales** · **Implementadas:** 2026-04-24 · **Revisado:** 2026-04-27

### Resumen del stack actual

Las 4 USs entregan un portal del cliente completo y funcional **a nivel código**:

| US | Título | Qué entrega |
|---|---|---|
| **US-031** | Create client portal tables | Tablas `clientUserAccess` (permisos por user/client) y `clientRequest` (solicitudes estudio→cliente) |
| **US-032** | Client portal backend server functions | `src/actions/client-portal.tsx` con 6 server functions de lectura + `completeClientRequest` (cubierto por su sección de validación end-to-end) |
| **US-033** | Client portal auth guard layout | Layout `src/routes/_client/route.tsx` que valida sesión + presencia en `clientUserAccess` |
| **US-034** | Client portal dashboard page | Dashboard del cliente en `src/routes/_client/portal/index.tsx` con greeting, vencimientos, deudas, notifs, requests |

### 🚧 Gap principal — Falta el flujo de invitación/alta de usuario al portal

Revisé el PRD completo (US-001 a US-055) buscando keywords `invite|grant.*access|portal.*user|create.*user|onboarding` — **ninguna US implementa el alta/invitación de usuarios al portal del cliente**.

Eso significa que **hoy no hay forma de que un cliente real use el portal**, porque:

1. **Crear el `user`** del cliente: no hay UI/flujo. Mejor caso, hay que insertar manualmente con SQL (con el formato de Better Auth) o usar los endpoints de auth genéricos sin UI dedicada.
2. **Crear el `client_user_access`**: no hay UI. Hay que insertar con SQL la relación `(client_id, user_id)` + permisos.
3. **Comunicar el acceso al cliente**: tampoco hay envío de email con magic link / invitación / set-password flow.

Resultado: el portal está implementado pero solo se puede testear seedeando manualmente la DB. En producción, el estudio no tiene cómo darle acceso a un cliente real desde la UI.

### Por qué importa

- **Bloquea la salida a producción del módulo portal**. Las USs 031–034 técnicamente "pasan" sus AC pero el feature no es entregable a usuarios reales sin el alta.
- **El gap es de scope, no de implementación**. El código de US-032/033/034 es correcto y robusto: cuando exista el alta, el portal funciona end-to-end.
- **Cruce con US-035 y US-036**: estas dos USs entregan UI de gestión de solicitudes (estudio crea request, cliente sube documento), pero también dependen de que existan usuarios cliente activos. Sin el alta, esas dos también quedan inutilizadas para usuarios reales.

### Validación práctica mientras tanto

Para validar US-032 (y por extensión 033/034) hace falta:

1. **Seed manual** de `client_user_access`:
   ```sql
   INSERT INTO client_user_access (client_id, user_id, role)
   SELECT '<clientId>', u.id, 'client_viewer'
   FROM "user" u WHERE u.email='<email-existente>';
   ```
2. **Login** con ese email (el user ya tiene que existir en `user`).
3. **Navegar** a `/portal` → consume las server functions de US-032.
4. **Crear requests** desde la UI de US-035 (`/clients/<id>` → tab Solicitudes → "Nueva solicitud") — esto sí es UI nativa.
5. **Probar permisos** modificando flags en `client_user_access` con `UPDATE`.

### Mejoras Propuestas (USs futuras)

#### 1. UI de invitación de usuario cliente al portal (crítica)
En el detalle de cliente, agregar pestaña "Acceso al portal" con:
- Listado de usuarios con acceso al portal de ese cliente.
- Botón "Invitar usuario" → form con email + permisos checkboxes.
- Trigger del invite: crear `user` (Better Auth) + `client_user_access` + enviar email con link de set-password / magic link.

Patrón de referencia: el mismo invite flow ya existe para users del estudio (`organization` + `member` table de Better Auth, con `/invite/$invitationId`). Se puede replicar el patrón a nivel `client_user_access`.

#### 2. UI de gestión de permisos por usuario cliente
Permitir al estudio editar los flags (`can_view_debts`, `can_view_iva`, `can_view_payroll`, `can_chat_ai`, `can_upload_documents`) post-invitación, sin tener que recrear el access.

#### 3. UI para revocar acceso
Botón "Revocar acceso" que borra el row de `client_user_access` (sin borrar el user en sí, por si el user tiene acceso a otros clientes).

#### 4. Vista del cliente: mostrar al estudio que lo gestiona
En el portal del cliente, mostrar quién es el estudio que tiene los datos y a quién puede contactar — útil para confianza/UX.

### Consideraciones para Futuros PRDs

- **US futura (bloqueante de prod):** "Invitación de usuarios al portal con permisos" — UI en client detail + creación de `user` + `client_user_access` + envío de email de invitación.
- **US futura:** "Gestión de permisos del usuario cliente" — UI para editar flags post-alta.
- **US futura:** "Revocar acceso al portal" — UI + soft-delete vs hard-delete.
- **US futura:** "Auditoría de accesos al portal" — historial de quién accedió cuándo (cruce con `data_source_event` de US-002).

Hasta que estas USs existan, **el portal es una feature técnicamente lista pero comercialmente bloqueada** — el estudio no puede entregársela a un cliente real sin pedirle al equipo de plataforma que haga inserts manuales en DB.

### Referencias Técnicas

**Schema relevante:**
- Tabla `client_user_access` (origen US-031): UNIQUE `(client_id, user_id)`, role default `client_viewer`, 5 permission flags.
- Tabla `client_request` (origen US-031): status default `'open'`, FKs a `organization`, `client`, `profile`, `user`.

**Archivos del stack:**
- `src/actions/client-portal.tsx` — 6 server functions del portal (US-032) + 4 de gestión de requests (US-035 y US-036)
- `src/routes/_client/route.tsx` — auth guard (US-033)
- `src/routes/_client/portal/index.tsx` — dashboard (US-034)
- `src/routes/_client/portal/solicitudes/index.tsx` — vista de solicitudes (US-035)

**Patrón de invitación existente a replicar:**
- `lib/auth.tsx` + Better Auth `organization` plugin: invite a usuarios del estudio.
- Ruta pública `/invite.$invitationId` ya existe.
- El mismo modelo conceptual (invite → email → activate) se puede replicar a nivel `client_user_access`.

---

## US-041: Employee event CRUD server functions

**Phase:** 4 · **Priority:** 41 · **Status:** ✅ AC cumplido / ⚠️ CRUD incompleto · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

> 💡 Esta US entrega el **backend** del feature. El consumo desde UI vive en US-042. Los gaps de UI están documentados en la sección de US-042.

### User Story Original

> Como developer, necesito server functions de CRUD de eventos de empleado para que el legajo pueda registrar hitos de la vida laboral del empleado.

**Criterios de Aceptación Originales:**
- Agregar `createEmployeeEvent` y `listEmployeeEvents` a `src/actions/sueldos.ts`.
- Helper privado `ensureEmpleadoBelongsToOrg(empleadoId, orgId)` que valida vía JOIN: `liquidacionImportEmpleado` → `profile` → `client` → check `organizationId`.
- `createEmployeeEvent`: POST, requiere `canWrite`, valida pertenencia a la org, inserta con `createdByUserId` desde la sesión.
- `listEmployeeEvents`: GET, valida pertenencia a la org, retorna eventos ordenados por `eventDate` desc, limit default 50.
- Typecheck pasa.

### Estado de Implementación

#### ✅ Cumplido
- Las 2 server functions implementadas en `src/actions/sueldos.ts:3513` y `:3544`.
- Helper `ensureEmpleadoBelongsToOrg` en `:3494` con la cadena de JOINs correcta.
- `canWrite` validado en `createEmployeeEvent`.
- Validación end-to-end OK: crear evento desde la UI (US-042) inserta correctamente en `employee_event` con `created_by_user_id` poblado desde la sesión.

### ⚠️ Gap 1 — CRUD incompleto: faltan `updateEmployeeEvent` y `deleteEmployeeEvent`

El AC original solo pidió create + list. **No existe función para editar ni eliminar un evento ya guardado.** Si el contador crea un evento con datos erróneos (fecha equivocada, tipo incorrecto, typo en la descripción, monto mal cargado en `metadata`), las únicas opciones hoy son:
- Editar manualmente con SQL en DB.
- Crear un evento "correctivo" nuevo y dejar el erróneo, ensuciando la timeline.

**Implicancia operativa:** la timeline del legajo es append-only en la práctica. Cualquier error humano queda inmortalizado en el historial del empleado, lo cual es problemático para auditoría (parece que el empleado tuvo un evento que en realidad nunca pasó) y para data quality.

**Lo que debería existir a nivel backend:**
- `updateEmployeeEvent({ id, ...fields })` — POST, `canWrite`, valida que el evento pertenece a un empleado de la org del caller (mismo helper `ensureEmpleadoBelongsToOrg`), permite editar `type`, `title`, `description`, `eventDate`, `affectsPayroll`, `metadata`. Debe poblar `updated_at` y `updated_by_user_id` (columnas que aún no existen en el schema).
- `deleteEmployeeEvent({ id })` — POST, `canWrite`, mismo checkeo de pertenencia. **Soft-delete** preferible a hard-delete para preservar trazabilidad: agregar columna `deleted_at` al schema y filtrar en `listEmployeeEvents`.

### ⚠️ Gap 2 — `listEmployeeEvents` solo soporta consulta por empleado individual

La función requiere un `empleadoId` específico. **No hay forma de listar eventos cross-empleado** (todos los eventos de la org, filtrables por tipo/fecha/usuario), lo cual es necesario para los casos de uso operativos descritos en US-042.

**Lo que debería existir a nivel backend:**
- `listAllEmployeeEvents({ filters })` o extensión de `listEmployeeEvents` con filtros opcionales: `type`, `dateFrom`, `dateTo`, `createdByUserId`, `clientId`, `profileId`, `affectsPayroll`, `searchText` (para buscar en title/description), `limit`, `offset`.
- Si `empleadoId` no se pasa, el filtro por empleado simplemente no aplica.
- Mantener el scope por org vía JOIN (`liquidacionImportEmpleado` → `profile` → `client` → `organizationId = orgId`).
- Paginación obligatoria (`limit` + `offset`) — al ser cross-empleado puede haber miles de rows.

### Mejoras Propuestas (backend)

#### 1. Completar el CRUD (crítico)
Agregar `updateEmployeeEvent` y `deleteEmployeeEvent` (con soft-delete). Sin esto, ningún feature de UI de edición/borrado puede construirse en US-042 o futuras.

#### 2. Listado global con filtros
Extender `listEmployeeEvents` o crear `listAllEmployeeEvents` para soportar consultas cross-empleado. Habilita las vistas globales que pide US-042 (ver gap correspondiente).

#### 3. Validación de fecha en server function
Hoy `eventDate` admite cualquier string parseable. Guard server-side: rechazar fechas en el futuro lejano (>30 días adelante) o demasiado en el pasado (>10 años atrás).

#### 4. Trazabilidad cuando `affectsPayroll=true` y se edita un evento ya facturado
Si `affectsPayroll=true` y se edita el evento después de que el empleado ya tuvo recibos liquidados con esa info, la función debería retornar un warning estructurado (que la UI muestre) o forzar un flag explícito tipo `confirmAffectsLiquidatedReceipts: true`.

#### 5. Permitir adjuntar documento al evento
Eventos como "ausencia con certificado médico" o "amonestación" idealmente tienen un PDF asociado. Agregar `documentId` (FK opcional a `document`) en el schema, o usar `metadata.documentId`. Cruce con US-036 (storage).

### Consideraciones para Futuros PRDs

- **US futura (crítica):** "Edición y eliminación de eventos de empleado (backend)" — `updateEmployeeEvent` + `deleteEmployeeEvent` (soft-delete) + columnas `updated_at`, `updated_by_user_id`, `deleted_at` en el schema.
- **US futura (alta prioridad):** "Listado global de eventos con filtros (backend)" — extensión de `listEmployeeEvents` o nueva función `listAllEmployeeEvents`. Necesario para que US-042 pueda construir la vista de historial cross-empleado.
- **US futura:** "Documentos adjuntos a eventos de empleado" — FK a `document` o uso de `metadata` jsonb.
- **US futura:** "Validación temporal de eventos" — guards en server function para fechas absurdas.
- **US futura:** "Warning estructurado cuando se edita un evento ya liquidado" — protege la integridad del cálculo de sueldos histórico.

### Referencias Técnicas

**Archivos modificados en US-041:**
- `src/actions/sueldos.ts:3494` (helper `ensureEmpleadoBelongsToOrg`) · `:3513` (`createEmployeeEvent`) · `:3544` (`listEmployeeEvents`)

**Schema relevante:**
- Tabla `employee_event` (origen US-037):
  - Columnas actuales: `id`, `empleado_id` (FK), `type`, `title`, `description`, `event_date`, `affects_payroll`, `metadata` (jsonb), `created_by_user_id` (FK user), `created_at`
  - **Faltan columnas `updated_at`, `updated_by_user_id`** para soportar edición con auditoría.
  - **Falta columna `deleted_at`** para soportar soft-delete.
  - **Falta columna `document_id`** (opcional) para adjuntos.

**Aprendizajes técnicos:**
- `ensureEmpleadoBelongsToOrg` valida vía cadena JOIN: `liquidacionImportEmpleado` → `profile` (via `profileId`) → `client` (via `profile.client`) → check `client.organizationId = orgId`.
- `liquidacionImportEmpleado.profileId` usa naming `.profileId` (no `.profile`) — distinto al patrón `.client` de tablas más viejas.
- Return de funciones que incluyen jsonb en el shape requiere `as any` (mismo patrón que `credential.tsx`, `agent.tsx`).

---

## US-042: Employee legajo timeline UI

**Phase:** 4 · **Priority:** 42 · **Status:** ✅ AC cumplido / ⚠️ Sin edición ni vista global · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

> 💡 Esta US consume las server functions de US-041. Los gaps de UI listados acá **dependen** de que primero se cierren los gaps de backend de US-041 (no se puede editar desde UI sin `updateEmployeeEvent`, no se puede armar vista global sin `listAllEmployeeEvents`).

### User Story Original

> Como operador del estudio, quiero ver el historial de eventos del empleado como una timeline.

**Criterios de Aceptación Originales:**
- En `src/components/sueldos/SueldosEmpleados.tsx`, agregar sección expandible por empleado con timeline de eventos.
- Timeline muestra: fecha, badge de tipo (color-coded), título, descripción.
- Botón "Agregar evento" abre dialog con selector de tipo, date picker, título, descripción, toggle `affectsPayroll`.
- Typecheck pasa. Verificar en navegador.

### Estado de Implementación

#### ✅ Cumplido
- Sección "Historial de eventos" implementada dentro del detalle del empleado en `SueldosEmpleados.tsx:190+`.
- Botón "Agregar evento" abre modal con los 4 inputs requeridos (tipo, fecha, título, descripción) más toggle `affectsPayroll`.
- Timeline ordenada por fecha desc, con badge de tipo color-coded.
- Mutación de creación con invalidación de query — el evento aparece sin recargar.

### ⚠️ Gap 1 — La timeline no permite editar ni eliminar eventos

Si el contador crea un evento con datos erróneos (fecha equivocada, tipo incorrecto, typo, monto mal cargado), **no hay manera de corregirlo desde la UI**. La timeline actual es solo de lectura más "Agregar".

**Lo que falta a nivel UI:**
- Botones "Editar" (icono lápiz) y "Eliminar" (icono papelera) en cada item de la timeline.
- "Editar" abre el mismo modal de "Agregar evento" pero pre-poblado con los datos del evento, llamando `updateEmployeeEvent` en lugar de `createEmployeeEvent`.
- "Eliminar" abre `AlertDialog` de confirmación, llamando `deleteEmployeeEvent`. Mostrar el evento como tachado/grisado si la implementación es soft-delete.
- Diferenciación visual: si un evento tiene `affectsPayroll=true` y ya hay recibos liquidados de ese período, mostrar un banner de advertencia al editar (consume el warning estructurado del Gap 4 de US-041).

**Bloqueo:** este gap depende de que primero se implementen `updateEmployeeEvent` y `deleteEmployeeEvent` en US-041 (Gap 1 backend).

### ⚠️ Gap 2 — Falta vista global del historial de eventos

La timeline solo se ve **abriendo el detalle de cada empleado individualmente**. No existe una pantalla cross-empleado que permita filtrar por tipo/fecha/usuario.

**Casos de uso operativos que hoy no se cubren:**
- "Mostrame todos los eventos de tipo `ausencia` de los últimos 30 días" — útil para detectar patrones de ausentismo cross-empleado y reportar al cliente.
- "Mostrame todas las altas/bajas registradas este mes" — útil para reporting al estudio y conciliación con AFIP.
- "Mostrame todos los eventos creados por `<usuario>`" — útil para auditoría interna.
- "Buscá si algún empleado tiene un evento con la palabra X en la descripción" — útil para tracking de incidentes/amonestaciones.

**Lo que falta a nivel UI:**
- Ruta dedicada (ej: `/sueldos/eventos` o tab "Historial" dentro del módulo Sueldos) con:
  - Filtros: tipo, rango de fechas, cliente, profile, empleado, creado por, `affectsPayroll`, search text.
  - Tabla con columnas: empleado · cliente · profile · fecha · tipo · título · descripción · creado por · `affectsPayroll`.
  - Paginación (al ser cross-empleado puede haber miles de rows).
  - Export a CSV/Excel para compartir con el cliente o para análisis offline.

**Bloqueo:** este gap depende de que primero se implemente `listAllEmployeeEvents` en US-041 (Gap 2 backend).

### Mejoras Propuestas (UI)

#### 1. Botones de Editar/Eliminar en la timeline (crítico)
Es la corrección humana más básica. Hoy un typo se vuelve permanente.

#### 2. Vista global de eventos (alta prioridad)
Crea una "bandeja" operativa que permite al estudio gestionar eventos a escala (no uno por uno). Reutilizar el patrón de filtros de `/notifications` o `/alerts` ya existentes.

#### 3. Indicador visual de eventos editados
Si el soft-delete y la edición están implementados, mostrar visualmente cuáles eventos fueron editados (ej: marca "✏️ editado" con tooltip que muestre `updated_at` y `updated_by_user_id`). Útil para auditoría.

#### 4. Confirmación al editar evento `affectsPayroll=true` con recibos ya liquidados
Banner rojo en el modal de edición avisando que el cambio no recalcula recibos pasados, con checkbox de confirmación obligatorio.

#### 5. Filtros guardados / vistas predefinidas
"Mis ausencias del mes", "Altas/bajas del trimestre", "Eventos sin descripción" — atajos en el header de la vista global para no tener que reconfigurar filtros cada vez.

#### 6. Adjuntos visibles en la timeline
Si se agrega `documentId` al schema (Gap 5 de US-041), mostrar icono de PDF clickeable en cada item de la timeline.

### Consideraciones para Futuros PRDs

- **US futura (crítica, depende de US-041 backend):** "Edición y eliminación de eventos desde UI" — botones Editar/Eliminar en la timeline + modales de confirmación.
- **US futura (alta prioridad, depende de US-041 backend):** "Vista global del historial de eventos" — ruta dedicada con filtros, paginación y export.
- **US futura:** "Indicador visual de auditoría en eventos" — marcas de "editado" / "eliminado" con tooltip.
- **US futura:** "Filtros predefinidos en vista global de eventos" — UX de bandeja operativa.

### Referencias Técnicas

**Archivos modificados en US-042:**
- `src/components/sueldos/SueldosEmpleados.tsx:190` (consume `listEmployeeEvents` de US-041) · `:412` (consume `createEmployeeEvent` de US-041)

**Dependencia con US-041:**
- Toda mejora de UI propuesta acá depende de que US-041 entregue las funciones que faltan (`updateEmployeeEvent`, `deleteEmployeeEvent`, `listAllEmployeeEvents`). Sin eso, los botones de editar/eliminar y la vista global no son construibles.

**Aprendizajes técnicos:**
- La timeline reutiliza patrones de modal con form en `react-hook-form` + invalidación de query — mismo enfoque que las demás vistas del módulo Sueldos.

---

## 🚧 US-043: Monthly novelty CRUD server functions

**Phase:** 4 · **Priority:** 43 · **Status:** ⛔ **Sin consumer — bloqueante de prod del módulo Sueldos** · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como developer, necesito server functions de CRUD para registrar novedades mensuales del empleado.

**Criterios de Aceptación Originales:**
- `createNovelty`, `listNovelties`, `deleteNovelty` en `src/actions/sueldos.ts`.
- Scope por org vía helper `ensureEmpleadoBelongsToOrg`.
- `canWrite` requerido en mutaciones.
- Typecheck pasa.

### Distinción importante: `payroll_period_novelty` (US-043) vs `employee_event` (US-041)

Pueden parecer duplicadas pero cumplen funciones distintas:

| Eje | `employee_event` (US-041) | `payroll_period_novelty` (US-043) |
|---|---|---|
| **Propósito** | Memoria descriptiva del legajo | Insumo del cálculo de sueldo |
| **Granularidad** | Fecha exacta (`event_date`) | Mes (`periodo` text `'YYYY-MM'`) |
| **Afecta cálculo?** | No (solo informativo, `affects_payroll` es flag UX) | Sí — `quantity` y `amount` se aplican al recibo |
| **Ciclo de vida** | Inmutable (historial) | `pending` → `applied` (con `applied_to_recibo_id`) |
| **Ejemplo** | "12/04 amonestación por incumplimiento" | `type='horas_extra', quantity=12, periodo='2026-04'` |

Regla mental: ¿el sueldo va a salir distinto por este hecho? → **novedad**. ¿Solo querés recordar que pasó? → **evento**.

### Estado de Implementación

#### ✅ Cumplido
- Las 3 server functions implementadas en `src/actions/sueldos.ts:3563`, `:3594`, `:3617`.
- Reuso del helper `ensureEmpleadoBelongsToOrg` (mismo patrón que US-041).
- Scope por org y `canWrite` correctos.

### 🚧 Gap principal — Sin UI consumer (bloqueante de prod del módulo Sueldos)

A diferencia de gaps de "automatización" en otras USs (US-027, US-028) que son nice-to-have, este es un **bloqueante operativo del módulo Sueldos**:

- **Cero código** en `src/components/` o `src/routes/` consume las 3 funciones (verificado por grep).
- **Cero USs** en el PRD (US-001 a US-055) crean UI de novedades.
- El liquidador (cálculo de recibos) tampoco las consume — significa que hoy un recibo generado no integra horas extras, ausencias, adelantos, etc.

**Implicancia operativa:** sin UI para cargar novedades + sin lectura desde el liquidador, el módulo Sueldos no puede liquidar correctamente un mes real. El contador puede tener empleados cargados, fórmulas configuradas y conceptos definidos, pero no puede ingresar **lo que pasó este mes** — el insumo crítico del cálculo mensual.

### Mejoras Propuestas (USs futuras)

- **US futura (crítica):** "UI de gestión de novedades del período" — dentro del flujo de liquidación. Considerar **2 modos en la misma pantalla** porque cubren flujos distintos:
  - **Modo dialog** (entrada individual / ad-hoc): reusar el patrón del dialog de eventos de US-042 con campos `type` (selector), `quantity`, `amount`, `description`, `periodo`. Útil cuando llega una novedad puntual fuera del cierre.
  - **Modo grilla / import** (cierre de mes a escala): tabla con empleados en filas y tipos de novedad en columnas, edición inline tipo spreadsheet, **o** subida masiva desde Excel/CSV. Es el flujo real del contador en cierre — 30 empleados × 3 novedades cada uno = 90 entradas, hacerlo por dialog uno por uno es inviable.
- **US futura (crítica):** "Liquidador consume novedades" — al generar el recibo, el cálculo lee `payroll_period_novelty` del período, aplica `quantity`/`amount` a los conceptos correspondientes (ej: `type='horas_extra'` → concepto SOS de horas extras × `valor_hora`), y al finalizar marca las novedades como `status='applied'` con `applied_to_recibo_id` poblado.
- **US futura:** "Edición de novedades" — falta `updateNovelty` en el backend (mismo gap que tiene US-041 con `updateEmployeeEvent`); hoy si cargás algo mal solo podés borrar y recrear.

### Referencias Técnicas

**Archivos modificados en US-043:**
- `src/actions/sueldos.ts:3563` (`createNovelty`) · `:3594` (`listNovelties`) · `:3617` (`deleteNovelty`)

**Schema relevante (origen US-038):**
- Tabla `payroll_period_novelty`: `empleado_id`, `periodo` (text), `type`, `quantity` (numeric 10,2 nullable), `amount` (numeric 14,2 nullable), `description`, `applied_to_recibo_id` (FK nullable a `liquidacion_import_recibo`), `status` (default `'pending'`), `created_at`.
- **Falta `updated_at` y `updated_by_user_id`** para soportar edición con auditoría.

**Aprendizajes técnicos:**
- Drizzle `numeric` columns esperan `string | null`, no `number | null` — usar `String(value)` al insertar valores numéricos JS.
- `deleteNovelty` necesita fetch previo para obtener `empleadoId` antes de validar pertenencia a la org — no se puede short-circuit.

---

## 🚧 US-044: Receipt template CRUD and generation from template

**Phase:** 4 · **Priority:** 44 · **Status:** ✅ AC cumplido / ⚠️ **Feature funcionalmente inerte** · **Implementado:** 2026-04-24 · **Revisado:** 2026-04-27

### User Story Original

> Como operador del estudio, quiero guardar y reutilizar templates de recibos.

**Criterios de Aceptación Originales:**
- Server functions: `createReceiptTemplate`, `listReceiptTemplates`, `deleteReceiptTemplate` en `src/actions/sueldos.ts`.
- En `SueldosSimulador`, dropdown "Usar template" que pre-carga la lista de conceptos.
- Botón "Guardar como template" después de configurar conceptos.
- Typecheck pasa. Verificar en navegador.

### Estado de Implementación

#### ✅ Cumplido (técnicamente)
- Las 3 server functions implementadas (`sueldos.ts:3649`, `:3676`, `:3690`).
- Helper `ensureProfileBelongsToOrg` para scope de org.
- Templates atados a `profile_id` (compartidos entre todos los empleados del profile).
- UI integrada en `SueldosSimulador.tsx`: dropdown "Usar template…", botón Trash, botón "Guardar como template" con dialog.
- Persistencia correcta: `concept_ids jsonb` con array de códigos.

### 🚧 Gap principal — La feature es funcionalmente inerte

El template guarda solo la **lista de conceptos visibles**, no los valores. Eso por sí solo está bien, pero **no existe UI en el Simulador para agregar/quitar conceptos de la plantilla**:

- La tabla "Carga manual" se popula desde `listConceptosPlantillaManualSos(profileId, ...)` con un set **fijo** de conceptos.
- Cero UI en `src/components/sueldos/` para "Agregar concepto" / "Eliminar concepto" (verificado por grep).
- El filtro `conceptosFilas` (línea 272–275 de `SueldosSimulador.tsx`) solo permite que el template sea **subset** de la plantilla base, nunca un superset distinto.

**Consecuencia operativa:** la primera vez que guardás "como template" sin haber filtrado, capturás toda la plantilla base → el template es idéntico a "no usar template". Para guardar un template más chico necesitarías primero aplicar uno que filtre, pero el primero ya guardó todo. **Circular.** En la práctica, todos los templates muestran lo mismo que la plantilla base.

### Detalle adicional sobre el scope del template

- El template está atado a **profile** (no a empleado): un template "Sueldo mensual estándar" para Pahue Technologies SA aplica a sus 30 empleados, no a uno solo.
- El template guarda **qué conceptos incluir**, no los valores. Los valores se calculan por empleado en base a su categoría/escala/básico.
- Eso es semánticamente correcto, pero la falta de UI para gestionar la plantilla deja la feature sin propósito real.

### Mejoras Propuestas (USs futuras)

- **US futura (crítica):** "UI de gestión de conceptos del Simulador" — botón "Agregar concepto" (dialog con selector SOS + fórmula opcional + valor manual), botón "Eliminar" por fila. Sin esto, US-044 no entrega valor real.
- **US futura:** "Biblioteca de templates predefinidos por tipo de recibo" — `sueldo`, `aguinaldo`, `vacaciones`, `liquidación final` con sets de conceptos típicos pre-cargados. Reduce fricción de configuración inicial.
- **US futura:** "Edición de templates" — falta `updateReceiptTemplate` en backend (mismo gap recurrente que ya vimos en US-041 y US-043). Hoy si renombrás o cambiás el set hay que borrar y recrear.

### Búsqueda confirmatoria del gap

Revisé las 55 USs del PRD (US-001 a US-055) con keywords `concepto|plantilla|simulador` → **0 resultados**. Después de US-044 el backlog cambia de módulo (bancos, contabilidad, analytics, feature flags). **No hay US planeada que cierre este gap.**

### Referencias Técnicas

**Archivos modificados en US-044:**
- `src/actions/sueldos.ts:3639` (`ensureProfileBelongsToOrg`) · `:3649`, `:3676`, `:3690` (las 3 funciones)
- `src/components/sueldos/SueldosSimulador.tsx:31–33` (imports) · `:118` (state) · `:441–467` (dropdown + trash button) · `:496–520` (dialog "Guardar como template")

**Schema relevante (origen US-039):**
- Tabla `payroll_receipt_template`: `profile_id` (FK), `name`, `receipt_type` (default `'sueldo'`), `concept_ids` (jsonb — array de códigos string), `active` (bool default true), `created_at`.
- **Falta `updated_at`** para soportar edición.

**Aprendizajes técnicos:**
- `concept_ids` jsonb se almacena como `string[]` (códigos de concepto), retorno con `as any` para evitar el type `unknown` de Drizzle (mismo patrón que `employeeEvent`, `credential.tsx`).
- El UI tuvo un bug de Radix Select (`<SelectItem value="">` no permitido) — fix con sentinel `'__none__'`, mismo patrón que `notifications-view.tsx`.

---

## 🚧 US-046/047: Conciliación bancaria — gaps de UI y modelado

**Phase:** 5 · **Priorities:** 46–47 · **Status:** ✅ AC cumplido / ⚠️ 3 gaps que limitan uso productivo · **Implementadas:** 2026-04-24 · **Revisado:** 2026-04-27

### Resumen

US-046 entrega 7 server functions de conciliación bancaria. US-047 entrega la página `/bank` que consume **5 de las 7**. La validación end-to-end funciona con seed manual de transacciones, pero hay 3 gaps que bloquean uso productivo real.

### ⚠️ Gap 1 — Modelado a nivel cliente cuando la columna `profile_id` ya existe (parcial)

A diferencia de US-025/030 (donde el schema bloqueaba el modelado correcto), acá **el schema sí lo permite**:

| Tabla | `client_id` | `profile_id` |
|---|---|---|
| `bank_account` | NOT NULL | **NULLABLE** ✅ |

Pero **la UI y queries lo ignoran**:
- `listBankAccounts` filtra solo por `clientId`, mezcla cuentas de profiles distintos.
- La UI de `/bank` no tiene selector de profile; al crear cuenta, `profileId` queda siempre `NULL`.
- El resumen y el auto-match operan a nivel cliente, sin separar por entidad fiscal.

**Implicancia:** si un cliente representa 3 empresas con CUITs distintos, todas sus cuentas y conciliaciones se mezclan — riesgo de matchear transacción de Empresa A con factura de Empresa B.

**Diferencia con US-025/030:** acá el fix es menos invasivo — no requiere migrar schema, solo extender UI/queries para filtrar por `profile_id`.

### ⚠️ Gap 2 — `importBankTransactions` sin UI

La función existe en US-046 (línea 688 del PRD), pero **no hay UI para cargarle transacciones**. Sin scrapper externo y sin import CSV/Excel desde la UI, la única forma de poblar `bank_transaction` es:
- Seed manual con SQL (lo que hicimos para validar).
- `curl` con cookie de sesión.

Sin transacciones cargadas, el resto del módulo (auto-match, listado, resumen) no tiene insumo. **El feature es inutilizable productivamente sin esto.**

### ⚠️ Gap 3 — `manualMatchTransaction` sin UI (AC parcialmente incumplido)

El AC de US-047 dice textual: *"Page shows: bank account selector, transaction list with matched/unmatched indicator, **matching UI**, summary stats"*. La implementación interpretó "matching UI" como solo el botón "Auto-conciliar" + badges Auto/Manual.

**No se agregó UI para que el usuario haga match manual** (botón "Vincular factura" o similar en cada row unmatched). Resultado: las transacciones que el auto-match no resuelve quedan permanentemente unmatched desde la UI — y son justamente las que más necesitan intervención humana.

Este gap es más severo que el #1 y #2 porque **el AC original lo pedía implícitamente y no se entregó**.

### Búsqueda confirmatoria

Revisé US-001 a US-055 con keywords `importBankTransactions|manualMatchTransaction|bank|reconcil|conciliac|csv|excel.*bank`. Las funciones aparecen **solo** en US-046 (definición). **Cero USs posteriores las consumen ni cubren los 3 gaps.**

### Mejoras Propuestas (USs futuras)

- **US futura (crítica):** "Importación de transacciones bancarias desde UI" — botón "Importar transacciones" en `/bank` con upload de CSV/Excel + preview + confirmar. Llama `importBankTransactions` con dedup por `external_id` ya implementado.
- **US futura (crítica):** "Match manual de transacciones bancarias" — botón "Vincular factura" en cada row unmatched. Abre modal con buscador de invoices del cliente filtrable por monto/fecha. Llama `manualMatchTransaction` con confidence 100. Cubre el AC implícito de US-047.
- **US futura:** "Cuentas y conciliación a nivel profile" — selector de profile en `/bank`, `listBankAccounts` con filtro `profileId`, asignación de `profileId` al crear cuenta. Aprovecha el schema que ya lo soporta.
- **US futura:** "Scrapper bancario automatizado" — integración con bancos argentinos para no depender de import manual. Fase separada.

### Referencias Técnicas

**Archivos relevantes:**
- `src/actions/bank.tsx` — 7 server functions (US-046)
- `src/routes/_authed/bank/index.tsx` — UI consume 5 de 7 (US-047)

**Schema (origen US-045):**
- `bank_account.profile_id` (nullable) — listo para uso, no expuesto en UI.
- `bank_invoice_match` — match_type `'auto' | 'manual'`, confidence numeric(5,2).

**Aprendizajes técnicos:**
- Auto-match logic: `< 1 peso tolerancia` + `< 5 días proximidad` + bonus por CUIT → confidence 50–100.
- Las transacciones tipo "comisiones bancarias" (sin contraparte) son el caso de uso natural de match manual — sin UI, quedan permanentemente unmatched.

---
