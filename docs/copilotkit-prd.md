# PRD — Aprovechar CopilotKit al máximo en Arca

> Documento técnico-funcional. Mapea las features de CopilotKit (v1.57) que la plataforma todavía no usa, propone casos de uso concretos para el dominio contable argentino, y entrega un set de criterios para evaluar caso por caso si vale la pena adoptarlas.

---

## 1. Estado actual

### Stack instalado
- `@copilotkit/react-core` ^1.57.0
- `@copilotkit/react-ui` ^1.57.0
- `@copilotkit/runtime` ^1.57.0
- Backend: Gemini 2.5 Flash via `GoogleGenerativeAIAdapter`
- Endpoint: `/api/copilotkit` (POST/GET)

### Hooks ya implementados
| Hook | Dónde se usa | Función |
|---|---|---|
| `useCopilotAction` | `CopilotActions.tsx` | 8 tools registradas (IVA, KPIs, vencimientos, scrape, notif, escaneo PDF, salud cliente, resumen liquidación) |
| `useCopilotReadable` | `client-detail-page`, `profile-detail-page`, `notifications-view`, `clients-table`, `sueldos/index` | Contexto pasivo: cliente activo, perfil, tab, mes liquidable |
| `useCopilotChat` | `CopilotBottomPanel`, `AgentInput` (parcial) | `appendMessage` para enviar mensajes desde el AgentInput externo |
| `useCopilotChatSuggestions` | `copilot/CopilotSuggestions.tsx` | Sugerencias por pantalla (US-001, feb 2026) |
| `useFrontendTool` | `copilot/FrontendTools.tsx` | 4 tools de navegación + tab control (US-002, feb 2026) |
| `useCopilotAdditionalInstructions` | `copilot/AdditionalInstructions.tsx` | System-prompt augmentation por pantalla (US-003, feb 2026) |
| `<CopilotChat>` | `CopilotBottomPanel` | Renderiza la conversación + generative UI dentro del panel inferior |

### UX implementada
- **Panel inferior** con chat embebido (no sidebar lateral)
- **AgentInput flotante** que abre el panel y mantiene contexto al cerrar/reabrir
- **AttachmentBar** con paperclip integrado al input (para upload de PDFs)
- **Generative UI** con container queries (responsive en sidebar y dashboard)
- Página `/chat` separada con threads persistidos (sistema independiente — Vercel AI SDK)

### Sistemas de chat coexistentes
| Sistema | Uso | Persistencia |
|---|---|---|
| CopilotKit (panel inferior) | Consultas rápidas en contexto | Memoria browser, se pierde al refrescar |
| `/chat/$id` (Vercel AI SDK) | Sesiones largas, históricas | DB (`agentConversation`, `agentMessage`) |

---

## 2. Features de CopilotKit no aprovechadas

A continuación, **9 features** que existen en la versión instalada y que la plataforma todavía no usa. Cada una incluye descripción, casos de uso concretos para Arca, esfuerzo de implementación, y pros/cons.

---

### 2.1. `useCopilotChatSuggestions` — Sugerencias contextuales

> ✅ **ADOPTADO** en feb 2026 — ver [US-001](../scripts/ralph/prd.json) (Sprint CopilotKit Phase 2). Implementado en `src/components/copilot/CopilotSuggestions.tsx`.

**Qué hace:**
Genera y muestra prompts sugeridos arriba del input del chat. El modelo decide qué sugerencias son relevantes según el contexto activo (los `useCopilotReadable` que estén montados).

**Casos de uso en Arca:**

| Pantalla | Sugerencias propuestas |
|---|---|
| `/clients` (lista) | "Clientes con deuda crítica", "Ranking de facturación", "Buscar por múltiples criterios" |
| `/clients/$id` | "Cómo está este cliente", "Resumen IVA del trimestre", "Disparar scrape de notificaciones" |
| `/sueldos` con cliente seleccionado | "Resumen del mes pasado", "Comparar con anterior", "Detectar anomalías" |
| `/sueldos/conceptos` | "Validar todas mis fórmulas", "Empleados sin convenio asignado" |

**Esfuerzo:** S (1–2 horas)

**Pros:**
- Reduce fricción cognitiva — el contador no tiene que pensar qué preguntar
- Educa sobre las capacidades del agente (descubrimiento)
- Aumenta tasa de uso del agente

**Cons:**
- Requiere prompts bien escritos para que las sugerencias sean útiles
- Si el modelo es flojo en sugerencias, puede saturar visualmente

**Requisitos PRD:**
- [ ] Sugerencias deben aparecer SOLO cuando el panel está abierto y el chat está vacío
- [ ] Máximo 4 sugerencias visibles a la vez
- [ ] Click en sugerencia → envía la pregunta automáticamente
- [ ] Sugerencias deben ser específicas a la pantalla (usar `useCopilotReadable` activos)
- [ ] No debe aparecer si el módulo IA está deshabilitado para la org

---

### 2.2. `useFrontendTool` — Tools que ejecutan en el browser

> ✅ **ADOPTADO** en feb 2026 — ver [US-002](../scripts/ralph/prd.json) (Sprint CopilotKit Phase 2). Implementado en `src/components/copilot/FrontendTools.tsx` (4 tools: `navegarA`, `abrirCliente`, `cambiarTabClienteDetalle`, `cambiarTabSueldos`).

**Qué hace:**
Define una tool que el modelo invoca, pero cuyo handler corre en el **cliente** (no hace fetch al server). Útil para acciones puramente UI: navegar, abrir modales, scroll, manipular state local.

**Casos de uso en Arca:**

| Tool | Qué hace |
|---|---|
| `navegarAClienteX` | "llevame a Admip Srl" → invoca `navigate({ to: '/clients/$id' })` con el id que matchea |
| `abrirEditorConcepto` | "editame el concepto bonificación" → abre el dialog de edición directo |
| `cambiarTabAFacturas` | "mostrame las facturas" → invoca `setActiveTab('facturas')` |
| `aplicarFiltroDeudas` | "filtrá deudas vencidas" → setea `debtFilter='vencidas'` |
| `scrollearAGrafico` | "subí al gráfico de ventas" → scroll into view |

**Esfuerzo:** S (30 min por tool)

**Pros:**
- Sin round-trip al server → más rápido
- No expone server fns innecesarias
- Habilita "acciones de navegación" naturales

**Cons:**
- Limitado a operaciones que no requieren datos frescos
- El estado de UI debe estar accesible (a veces requiere context o store global)

**Requisitos PRD:**
- [ ] Cada tool del frontend debe estar tipada y documentada
- [ ] No deben ejecutar lógica destructiva sin HITL
- [ ] El nombre debe ser intuitivo para el modelo (verbos en imperativo)
- [ ] Respetan el RBAC: si el usuario es viewer, no debe ejecutar acciones de write

---

### 2.3. `useCoAgent` + `useCoAgentStateRender` — CoAgents (LangGraph)

**Qué hace:**
Conecta CopilotKit con un agente backend LangGraph, compartiendo estado bidireccional. La UI puede leer y escribir el estado del agente, y el agente puede modificar el estado de la app. `useCoAgentStateRender` renderiza el estado intermedio del agente mientras procesa (tipo "Plan", "Step 2/5: ejecutando...").

**Casos de uso en Arca (con LangGraph backend):**

| Workflow | Beneficio de usar CoAgent |
|---|---|
| **Liquidación masiva con preview** | El agente recorre N empleados, calcula, valida, y muestra progreso paso a paso. El user puede pausar/cancelar |
| **Validación cruzada de IVA** | Compara declaración del cliente vs scrape AFIP, detecta diferencias, sugiere ajustes con razonamiento expuesto |
| **Auditoría de empleados** | Recorre toda la nómina, detecta anomalías por empleado, presenta hallazgos con severidad |
| **Onboarding de cliente nuevo** | Wizard multi-step: validar CUIT → crear credencial → primer scrape → resumen — todo con visibilidad del progreso |

**Esfuerzo:** L (2–4 semanas por workflow, implica setup LangGraph en backend)

**Pros:**
- Workflows complejos con visibilidad total
- Permite agent steering (corregir al agente mid-execution)
- Estado intermedio renderizado → no hay "loading screen" sin info
- Patrón industry-standard para agentic apps

**Cons:**
- Requiere migrar workflows a LangGraph (Python o JS)
- Mayor complejidad de deploy (otro runtime)
- Curva de aprendizaje del equipo
- Solo justificable para flows realmente complejos

**Requisitos PRD:**
- [ ] El workflow debe tener al menos 3 pasos secuenciales con lógica
- [ ] Debe agregar valor el "ver el agente trabajando" (transparencia importa al user)
- [ ] El agente debe poder pausarse / corregirse / abortarse
- [ ] Debe haber checkpoints recuperables (no perder progreso si falla)
- [ ] Setup de LangGraph backend acordado con el equipo

---

### 2.4. `useCopilotAdditionalInstructions` — Inyectar prompt según contexto

> ✅ **ADOPTADO** en feb 2026 — ver [US-003](../scripts/ralph/prd.json) (Sprint CopilotKit Phase 2). Implementado en `src/components/copilot/AdditionalInstructions.tsx` (4 instructions: `/clients/$id`, `/clients`, `/sueldos`, `/notifications`).

**Qué hace:**
Agrega instrucciones específicas al system prompt del modelo que solo aplican cuando un componente está montado. Permite "instructions per-screen" sin contaminar el system prompt global.

**Casos de uso en Arca:**

| Pantalla / contexto | Instrucción adicional |
|---|---|
| `/sueldos` | "Cuando hables de períodos de liquidación, usá YYYY-MM. Solo el mes anterior es liquidable según `mesLiquidable`." |
| `/clients/$id/iva` | "El IVA se publica el 5to día hábil. Si el período actual no tiene datos, sugerí esperar hasta entonces o disparar scrape manual." |
| Cliente con deudas vencidas | "Recordá al usuario que tiene N deudas vencidas. Sugerí prioridad por monto y fecha." |
| Vista de notificaciones | "Categorizá notificaciones AFIP por urgencia: penalización > rechazo > informativa." |

**Esfuerzo:** S (15 min por instrucción)

**Pros:**
- System prompt global más limpio
- Instrucciones contextuales dinámicas
- Mejora calidad de respuestas en pantallas específicas

**Cons:**
- Si abusás, el modelo recibe demasiadas instrucciones y se confunde
- Puede haber conflictos entre instrucciones de pantallas anidadas

**Requisitos PRD:**
- [ ] Cada instrucción adicional debe ser concisa (<200 caracteres)
- [ ] Solo aplicar cuando agreguen valor real (no cosmético)
- [ ] No deben contradecir el system prompt global
- [ ] Documentadas en un mismo archivo de fácil consulta

---

### 2.5. Intermediate State Streaming — Progreso en vivo

**Qué hace:**
Permite que una server function emita eventos "intermedios" (ej. "Calculando 5/30 empleados...") que el frontend renderiza en tiempo real, antes de la respuesta final. Especialmente útil para tools que tardan varios segundos.

**Casos de uso en Arca:**

| Tool actual | Estado intermedio recomendado |
|---|---|
| `getResumenSaludCliente` | "Calculando deudas vencidas... Notificaciones... Último scrape..." |
| `dispararScrape` | "Scrape encolado... Iniciando... 30%... 70%... Listo." |
| `escanearExtractoBancario` | "Extrayendo texto del PDF... Detectando movimientos (3/15)... Validando..." |
| `compararLiquidaciones` (futura) | "Cargando período A... B... Calculando diferencias..." |

**Esfuerzo:** M (varía por tool — refactorear handler + render)

**Pros:**
- Reduce sensación de "está colgado"
- Genera confianza en operaciones largas
- Educa al usuario sobre lo que pasa por dentro

**Cons:**
- Requiere streaming (SSE o similar) en el server
- Más complejo que un simple `await`
- No vale la pena para tools que tardan <1s

**Requisitos PRD:**
- [ ] Solo aplicar a tools que tardan >2 segundos en p50
- [ ] Estados intermedios deben ser informativos, no decorativos ("procesando..." no aporta)
- [ ] Manejar errores intermedios sin perder los datos parciales

---

### 2.6. `useCopilotAuthenticatedAction` — Actions con gate de auth

**Qué hace:**
Variante de `useCopilotAction` que requiere autenticación adicional antes de ejecutarse (ej. password re-prompt, 2FA, biometric). Útil para acciones críticas que ya están autenticadas pero merecen un step extra.

**Casos de uso en Arca:**

| Action | Por qué requiere auth extra |
|---|---|
| `eliminarCliente` (futura) | Operación destructiva irreversible |
| `actualizarCredencialAFIP` | Modifica credenciales sensibles |
| `confirmarLiquidacionMasiva` | Genera recibos legales con consecuencias contables |
| `exportarLSDFinal` | Genera archivo oficial para AFIP |

**Esfuerzo:** M (2–3 días con setup de re-auth)

**Pros:**
- Capa extra de seguridad para operaciones críticas
- Audit trail más fuerte ("este user re-confirmó X a las HH:mm")

**Cons:**
- Fricción para el usuario
- Solo justificable si la action es muy crítica
- Hay que tener un flow de re-auth implementado

**Requisitos PRD:**
- [ ] Identificar las 3-5 actions más críticas que merecen auth extra
- [ ] Definir el método de re-auth (password, OTP, etc.)
- [ ] Audit log de cada confirmación

---

### 2.7. `useMakeCopilotDocumentReadable` — Exponer documentos al modelo

**Qué hace:**
Expone el contenido de un documento (PDF, archivo, factura, etc.) al contexto del modelo para que pueda razonar sobre él en preguntas futuras.

**Casos de uso en Arca:**

| Documento | Beneficio |
|---|---|
| Factura abierta en pantalla | "esta factura tiene IVA correcto?" — el modelo lee la estructura completa |
| Recibo de sueldo en visor | "explicame este descuento" — el modelo accede a las líneas SOS |
| Notificación AFIP en detalle | "qué tengo que hacer con esto?" — el modelo lee el texto completo |
| Convenio CCT cargado | "cuáles son las categorías disponibles?" — sin invocar tool |

**Esfuerzo:** S (1 hora por tipo de documento)

**Pros:**
- Permite preguntas zero-shot sobre documentos visibles
- Reduce necesidad de tools específicas para "leer" documentos
- UX más natural ("hablame de esto")

**Cons:**
- Si el documento es grande, infla el contexto y aumenta costo
- Hay que tener cuidado con datos sensibles (CUITs, montos)

**Requisitos PRD:**
- [ ] Solo exponer documentos que el user ya tiene visibles en pantalla
- [ ] Limitar tamaño del documento expuesto (truncar si >10K tokens)
- [ ] Sanitizar campos sensibles si aplica

---

### 2.8. Multi-thread y persistencia de chat (CopilotKit-side)

**Qué hace:**
CopilotKit permite manejar múltiples threads de conversación con `setMessages` y persistirlos. Hoy en Arca eso se hace con un sistema separado (`/chat/$id` con Vercel AI SDK).

**Casos de uso en Arca:**

| Caso | Beneficio |
|---|---|
| Que el panel inferior **persista la conversación** entre refreshes | Hoy se pierde al recargar |
| Permitir que el user "guarde" un chat del panel a `/chat` | Hoy son sistemas separados, no se puede "promover" |
| Threads por cliente: "este chat es sobre Admip Srl" | Recuperás contexto del último análisis del cliente |

**Esfuerzo:** L (1–2 semanas — implica unificar dos sistemas)

**Pros:**
- Un solo sistema de chat coherente
- Conversaciones recuperables → más valor por sesión
- Cierra el loop entre consulta rápida y sesión larga

**Cons:**
- Implica deprecar el sistema actual (`/chat` con Vercel AI SDK)
- Migración de threads existentes
- Riesgo de pérdida de funcionalidad si CopilotKit no cubre todos los casos

**Requisitos PRD:**
- [ ] Decidir si vale la pena unificar (o mantener dos sistemas)
- [ ] Si sí: migración de threads existentes a la nueva tabla
- [ ] Mantener `/chat/$id` como vista de threads persistidos
- [ ] Backward compat con conversaciones viejas

---

### 2.9. Headless UI completo con `useCopilotChat`

**Qué hace:**
En lugar de usar `<CopilotChat>` o `<CopilotPopup>`, construir el chat desde cero con `useCopilotChat()` controlando todo: messages, input, layout, theming. Hoy en Arca lo usamos parcialmente (panel inferior usa `<CopilotChat>` pero con CSS custom).

**Casos de uso en Arca:**

| Caso | Beneficio |
|---|---|
| Branded chat completamente Arca-style | Más control sobre branding y UX |
| Variantes del chat por contexto (mini-chat en card de cliente, full-chat en /chat) | Diferentes formatos para diferentes pantallas |
| Embeddings inline ("preguntale sobre este cliente" como botón en cualquier card) | Chat ad-hoc sin ir al panel |

**Esfuerzo:** L (varía mucho según alcance)

**Pros:**
- Control total sobre UX
- Sin "fightear" con CSS de la lib
- Variantes contextuales fáciles

**Cons:**
- Más código a mantener
- Bugs más fáciles de introducir
- Pérdida de actualizaciones automáticas de UX que vengan de la lib

**Requisitos PRD:**
- [ ] Solo justificable si la lib no permite el grado de customización deseado
- [ ] El chat actual del panel ya cubre 80% de los casos — evaluar si vale la pena
- [ ] Considerar componentes reusables (atom design)

---

## 3. Criterios de evaluación

Para decidir si una feature de las anteriores **vale la pena adoptar** en Arca, usar este checklist. Una feature "pasa" si ✅ en al menos 5 de los 7 criterios.

### Checklist de evaluación

- [ ] **C1. Resuelve un dolor concreto del contador.** No basta con "es interesante". Se mapea a un workflow tedioso, repetitivo o propenso a errores.
- [ ] **C2. Esfuerzo de implementación es razonable vs valor.** Una S/M con alto valor pasa; una L sin valor claro no.
- [ ] **C3. Encaja con la arquitectura actual.** No requiere refactors masivos ni migraciones de datos críticas (a menos que el valor lo justifique).
- [ ] **C4. Mantenible por el equipo.** El equipo entiende la feature y puede sostenerla. Si depende de conocimiento de un solo dev, mal.
- [ ] **C5. Tiene métrica de éxito clara.** Sabemos cómo medir si funcionó (uso, tiempo ahorrado, tasa de error, etc.).
- [ ] **C6. Compatible con permisos y multi-tenancy.** Respeta `orgId`, RBAC, RLS. No expone datos cross-org.
- [ ] **C7. Compatible con el modelo Gemini Flash.** Algunas features requieren modelos más potentes — si Gemini Flash es flojo, mejor esperar al upgrade.

### Matriz de evaluación rápida

| Feature | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Total | Recomendación |
|---|---|---|---|---|---|---|---|---|---|
| 2.1 Suggestions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 7/7 | **✅ Adoptado feb 2026** (US-001) |
| 2.2 Frontend tools | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | 6/7 | **✅ Adoptado feb 2026** (US-002) |
| 2.3 CoAgents (LangGraph) | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | 4/7 | **Postergar** |
| 2.4 Additional instructions | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | 6/7 | **✅ Adoptado feb 2026** (US-003) |
| 2.5 Intermediate streaming | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | 6/7 | **Adoptar selectivo** (solo tools >2s) |
| 2.6 Authenticated actions | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | 5/7 | **Postergar hasta tener actions destructivas** |
| 2.7 Document readable | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | 4/7 | **Evaluar caso por caso** |
| 2.8 Multi-thread CopilotKit | ⚠️ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ✅ | 4/7 | **Postergar** (ya hay `/chat`) |
| 2.9 Headless UI completo | ⚠️ | ❌ | ⚠️ | ⚠️ | ❌ | ✅ | ✅ | 3/7 | **No** (overkill) |

---

## 4. Roadmap propuesto

### ✅ Adoptado en feb 2026
- ✅ **2.1 Suggestions** — sugerencias contextuales por pantalla. Implementado en US-001 (`CopilotSuggestions.tsx`); 6 rutas con instructions específicas + default `available: 'disabled'`.
- ✅ **2.2 Frontend tools** — Implementado en US-002 (`FrontendTools.tsx`); 4 tools no destructivas: `navegarA`, `abrirCliente`, `cambiarTabClienteDetalle`, `cambiarTabSueldos`. Tab tools usan `CustomEvent` bridge para evitar prop drilling entre subárboles.
- ✅ **2.4 Additional instructions** — Implementado en US-003 (`AdditionalInstructions.tsx`); 4 instructions per-screen (≤200 chars) que enseñan al modelo a usar el contexto readable existente sin hardcodear datos.

### Sprint inmediato (1–2 semanas)
*Sin items pendientes en este bucket — los 3 quick-wins ya fueron adoptados arriba.*

### Sprint medio (3–4 semanas)
- ⚠️ **2.5 Intermediate streaming** — para `dispararScrape` y `escanearExtractoBancario` que ya tardan varios segundos.
- ⚠️ **2.7 Document readable** — pilot con factura abierta en visor. Medir uso real.

### Postergado (evaluar en Q3)
- ⏸️ **2.3 CoAgents** — solo si aparece un workflow realmente complejo que lo justifique (liquidación masiva, auditoría completa).
- ⏸️ **2.6 Authenticated actions** — cuando haya actions destructivas reales.
- ⏸️ **2.8 Multi-thread** — si hay decisión estratégica de unificar `/chat` con el panel.

### No recomendado por ahora
- ❌ **2.9 Headless UI completo** — el actual cubre 80%, refactor masivo no aporta.

---

## 5. Métricas de éxito (por feature)

Para validar adopción de cada feature, instrumentar:

| Feature | KPI principal | Target inicial |
|---|---|---|
| Suggestions | % chats que arrancan desde una sugerencia | >30% en primer mes |
| Frontend tools | Tools de navegación invocadas / total invocaciones | >15% |
| Intermediate streaming | Cancelaciones de chat durante long-running tools | -50% vs baseline |
| Additional instructions | Tasa de respuesta correcta en pantallas específicas | +10% en evals |
| Document readable | Preguntas zero-shot sobre documentos | >5/día por usuario activo |

Cada métrica se mide vs el comportamiento sin la feature (A/B o pre/post).

---

## 6. Reglas transversales

Cualquier feature adoptada debe respetar:

1. **Multi-tenancy estricto.** Toda action que toca DB filtra por `orgId` derivado de la sesión. Sin excepciones.
2. **RBAC respetado.** Actions de write requieren `member` o `owner`. `assertCanWrite(role)` en cada handler.
3. **HITL para acciones destructivas.** Cualquier delete, escritura masiva o operación irreversible requiere `renderAndWaitForResponse` con preview.
4. **Container queries en componentes UI.** Generative UI components deben funcionar en cualquier ancho de contenedor (panel, dashboard, modal).
5. **Descriptions claras.** Cada action y readable tiene `description` que el modelo entiende. Inversión obligatoria en prompt engineering.
6. **Resilencia a UUIDs alucinados.** Actions que aceptan IDs deben aceptar también nombres como fallback (lección aprendida con Produsel S.A.).
7. **Sin dependencias del modelo específico.** Diseño que funcione tanto con Gemini Flash como con upgrade futuro a Pro/Opus.
8. **Documentado en `docs/agent-roadmap-modules.md`** o `docs/copilotkit-prd.md` (este doc).

---

## 7. Decisiones pendientes

Cosas que necesitan input del equipo antes de avanzar:

- [ ] ¿Se unifica el sistema de chat (`/chat` Vercel AI SDK + CopilotKit) o se mantienen separados? (Bloquea 2.8)
- [ ] ¿Se invierte en setup de LangGraph para CoAgents? (Bloquea 2.3)
- [ ] ¿Hay presupuesto/voluntad para upgrade de Gemini Flash a Pro o a Claude? (Afecta calidad de varias features)
- [ ] ¿Tracking analytics está montado para medir las métricas de adopción? (Bloquea evaluación post-adopción)

---

## 8. Aprendizajes del Sprint 1 (feb 2026)

Notas de implementación recogidas mientras adoptábamos 2.1, 2.2 y 2.4. Apuntan a gotchas no obvios que vale la pena tener a mano antes de tocar este código de nuevo.

### Patrón "registrar component"

Las 3 features (`useCopilotChatSuggestions`, `useFrontendTool`, `useCopilotAdditionalInstructions`) terminaron compartiendo exactamente la misma forma:

- Componente client-only que retorna `null`.
- Montado dentro del `<CopilotKit>` provider en `src/routes/_authed/route.tsx`, gateado por `aiAgentEnabled`.
- Lee la pantalla activa con `useRouterState({ select: (s) => s.location.pathname })` y registra reactivamente según la ruta.
- Pasar `[instructions]` (o equivalente) como dependency array es **crítico**: sin él, la primera registración se queda pegada y no se actualiza al navegar.

Hoy hay 3 instancias inline (`CopilotSuggestions`, `FrontendTools`, `AdditionalInstructions`). Si nace una 4ta, conviene extraer un helper compartido (`useRoutePathname()` + tipo Pattern → Config), pero por ahora la repetición es legible.

### Custom-event bridge para tab control entre subárboles

El frontend tool `cambiarTabClienteDetalle` y `cambiarTabSueldos` necesitaban mutar estado que vive en `client-detail-page.tsx` y `/sueldos/index.tsx`. Esos componentes están en otra rama del árbol que `<FrontendTools />` (que cuelga del `<CopilotKit>` provider directamente bajo `_authed/route.tsx`).

Resolución: `window.dispatchEvent(new CustomEvent('arca:set-client-tab', { detail: { tab } }))` desde el handler, y `useEffect` en cada page que escucha y llama `setActiveTab(e.detail.tab)`. Detalles que importan:

- Exportar el nombre del evento como `const` desde `FrontendTools.tsx` para que el listener importe el mismo string (evitar drift).
- Augmentar `WindowEventMap` en el mismo archivo del tool — así el listener obtiene `e.detail.tab` correctamente tipado sin cast.
- Si en el futuro un tool necesita mutar estado persistido (no solo UI in-memory), ir a `useCopilotAction` con server fn, NO frontend tool.

### `useFrontendTool` + `enum` parameters narrowing trampa

Cuando declarás `parameters: [{ name: 'tab', type: 'string', enum: ['a', 'b'] }]`, el handler recibe `tab` con tipo `'a' | 'b'`. Si validás runtime con un type guard que retorna `false`, TypeScript narrows a `never` — y un template literal sobre `never` (`return \`${tab} no válida\``) trips `@typescript-eslint/restrict-template-expressions`.

Workaround: coercionar a `String(tab)` antes del guard y operar sobre el string. La validación adicional sigue siendo útil porque algunos modelos (Gemini Flash, especialmente) ignoran enums y mandan strings off-spec.

### `navigate()` en handlers no-async

`useNavigate()` de TanStack Router retorna `Promise<void>`. Si tu handler de `useFrontendTool` no es async y dropeás la promesa, `no-floating-promises` te flaggea. Solución: `void navigate({ to: ... })` o convertir el handler en `async`. Optamos por `void` para mantener el handler síncrono (el modelo no espera respuesta de la navegación).

### `useCopilotChatSuggestions` `available` field

El field acepta `'enabled' | 'disabled' | 'always' | 'before-first-message' | 'after-first-message'`. `'enabled'` mapea internamente a `'always'`. Para suprimir suggestions en ciertas rutas:

- ❌ `if (!instructions) return null` — viola rules of hooks si lo combinás con conditional.
- ✅ Llamar siempre al hook y togglear via `available: instructions ? 'enabled' : 'disabled'`.

Mismo patrón aplicó a `useCopilotAdditionalInstructions` (toggle via `available` en lugar de conditional call).

### Tab-level instructions sin URL search params

`useCopilotAdditionalInstructions` corre en el árbol de `<CopilotKit>`, NO dentro de cada page. Eso significa que no tiene acceso al `activeTab` que vive en `useState` local de `client-detail-page.tsx`. No registramos instructions tab-específicas (ej. "tab=iva" vs "tab=deudas"), aunque la PRD original las contemplaba.

Caminos para soportarlo en el futuro:
1. Mover el tab a `useSearch()` (`?tab=iva`) — entonces `useRouterState` lo ve.
2. Montar un segundo `<AdditionalInstructions />` adentro de la page que lea su `activeTab` local.
3. Dejar como está y aceptar que tab-level se queda fuera del scope.

Para Sprint 1 elegimos (3) y collapseamos a una sola instruction por path. La limitación está documentada en el JSDoc del componente.

### Hard-limit en cantidad de instructions

`useCopilotAdditionalInstructions` se acumula en el system prompt mientras los componentes están montados. Más de ~6 instructions y el modelo empieza a confundirse — registra reglas que no aplican a la pantalla actual o ignora algunas. Sprint 1 cerró con 4 (clients/$id, clients lista, sueldos, notifications). Antes de agregar la 5ta, evaluá fusionar con alguna existente.

### Lint baseline (operativa)

El proyecto tiene ~576 errores de eslint pre-existentes en `.claude/skills/`, `src/scripts/` y archivos sueltos. `bun run lint` siempre exitea 1 y es ruido. La verificación correcta para los 3 stories del sprint fue `npx eslint <archivos-modificados>` y confirmar 0 NUEVOS errores en esos archivos. Documentar esto en futuros PRDs/sprints para no perder tiempo persiguiendo el baseline.

---

## 9. Apéndice: hooks instalados (ref técnica)

Listado completo de hooks de `@copilotkit/react-core` v1.57:

```
useCopilotAction              ← en uso
useCopilotReadable            ← en uso
useCopilotChat                ← en uso
useCopilotChatSuggestions     ← ✅ en uso (US-001, feb 2026)
useFrontendTool               ← ✅ en uso (US-002, feb 2026)
useCoAgent                    ← propuesta 2.3
useCoAgentStateRender         ← propuesta 2.3
useCopilotAdditionalInstructions ← ✅ en uso (US-003, feb 2026)
useCopilotAuthenticatedAction ← propuesta 2.6
useMakeCopilotDocumentReadable ← propuesta 2.7
useHumanInTheLoop             (alias del flow HITL — ya cubierto con renderAndWaitForResponse)
useLanggraphInterrupt         (solo aplica con CoAgents)
useFlatCategoryStore          (interno de la lib)
useTree                       (interno de la lib)
```

Componentes UI:
```
<CopilotKit>     ← en uso (provider)
<CopilotChat>    ← en uso (panel inferior)
<CopilotPopup>   ← descartado al cambiar a panel inferior
<CopilotSidebar> ← descartado al cambiar a panel inferior
```
