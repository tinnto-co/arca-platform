# PRD: ARCAR Platform — Full Implementation (Fases 0-9)

## Introduction

ARCAR es una plataforma contable con AI para estudios contables argentinos. Este PRD cubre la implementacion completa desde normalizacion conceptual hasta modularizacion comercial, partiendo del estado actual del repo (45 tablas, 130 server functions, UI funcional para contabilidad/sueldos/IVA/notificaciones/agente AI basico).

El implementador es Claude Code (agente AI). Cada user story esta disenada para ser ejecutable en una sesion focalizada con criterios de aceptacion verificables via build + dev server.

**Stack:** React 19 + TanStack React Start + Drizzle ORM + PostgreSQL 17 + Better Auth + Tailwind CSS 4 + Bun

**Archivo schema principal:** `drizzle/schema.ts`
**Patron server functions:** `src/actions/*.tsx` con `getSessionWithOrg()` + Zod validators
**Patron UI:** File-based routes en `src/routes/_authed/` + React Query

---

## Goals

- Evolucionar ARCAR de dashboard fiscal a sistema operativo completo para estudios contables
- Implementar sistema de alertas proactivo que detecte riesgos antes que se conviertan en problemas
- Expandir el agente AI de 2 tools a 8+ tools consultivos con audit trail
- Agregar portal cliente con acceso limitado y solicitudes
- Completar modulo de sueldos con legajo, novedades y templates
- Implementar conciliacion bancaria y contabilidad formal
- Mantener multi-tenancy estricta (orgId) en todas las tablas nuevas

---

## User Stories

---

### FASE 0 — Normalizacion conceptual

---

### US-001: Agregar columnas de clasificacion a profile
**Description:** As a developer, I need profile enrichment columns so that the system can distinguish managed vs unmanaged profiles and classify profile types.

**Acceptance Criteria:**
- [ ] Add columns to `profile` in `drizzle/schema.ts`: `managed_by_study` (boolean default true), `disabled_at` (timestamp nullable), `disabled_reason` (text nullable), `profile_type` (text default 'unknown')
- [ ] Create migration script `src/scripts/ensure-profile-enrichment-columns.ts` using `ADD COLUMN IF NOT EXISTS` pattern (same as `ensure-empleado-legajo-extra-columns.ts`)
- [ ] Run migration script successfully against local DB
- [ ] `bun run build` passes

---

### US-002: Crear tabla data_source_event
**Description:** As a developer, I need an audit trail table so that every important data point can be traced to its origin (scrape job, manual entry, AI classification).

**Acceptance Criteria:**
- [ ] Add `dataSourceEvent` table to `drizzle/schema.ts` with: id (uuid PK), organization_id (text FK org), client_id (uuid FK client nullable), profile_id (uuid FK profile nullable), entity_type (text), entity_id (text), source (text: 'scraper'|'manual'|'ai'|'import'), source_job_id (uuid FK job nullable), action (text: 'created'|'updated'|'classified'), metadata (jsonb nullable), created_at (timestamp)
- [ ] Create migration script `src/scripts/ensure-data-source-event-table.ts`
- [ ] Run migration script successfully
- [ ] `bun run build` passes

---

### US-003: UI para deshabilitar perfiles no administrados
**Description:** As a studio operator, I want to mark profiles as "not managed by this studio" so that unmanaged profiles don't clutter the operational view.

**Acceptance Criteria:**
- [ ] In client detail perfiles tab (`src/components/client-detail-page.tsx`), add toggle/button per profile to set `managed_by_study = false`
- [ ] Create server function `updateProfileManagement` in `src/actions/profile.tsx` (POST, requires canWrite)
- [ ] Disabled profiles show greyed out with "No administrado" badge
- [ ] Disabled profiles are excluded from sueldos module queries
- [ ] `bun run build` passes

---

### FASE 1 — Core fiscal operativo

---

### US-004: Enriquecer tabla notification con severity y category
**Description:** As a developer, I need notification classification columns so that notifications can be prioritized by severity and filtered by category.

**Acceptance Criteria:**
- [ ] Add columns to `notification` in `drizzle/schema.ts`: `severity` (text default 'unclassified'), `category` (text nullable), `ai_summary` (text nullable), `ai_classified_at` (timestamp nullable), `assigned_to_user_id` (text FK user nullable), `resolved_at` (timestamp nullable), `resolved_by_user_id` (text FK user nullable)
- [ ] Create migration script `src/scripts/ensure-notification-enrichment-columns.ts`
- [ ] Add index `idx_notification_severity` on (client_id, severity)
- [ ] Run migration script successfully
- [ ] `bun run build` passes

---

### US-005: Clasificacion AI de notificaciones con Gemini
**Description:** As a studio operator, I want notifications automatically classified by severity and category so that critical items surface immediately.

**Acceptance Criteria:**
- [ ] Create server function `classifyNotification` in `src/actions/notification.tsx` that sends notification message to Gemini Flash with prompt to classify severity (critical/medium/low/informational) and category (requerimiento/inspeccion/deuda/intimacion/comunicacion_general/vencimiento/otro) and generate ai_summary
- [ ] Function updates notification row with severity, category, ai_summary, ai_classified_at
- [ ] Create server function `classifyUnclassifiedNotifications` that batches all unclassified notifications for an org
- [ ] Log classification to `data_source_event` with source='ai'
- [ ] `bun run build` passes

---

### US-006: UI de severity y category en notificaciones
**Description:** As a studio operator, I want to see notification severity badges and filter by category so I can focus on critical items first.

**Acceptance Criteria:**
- [ ] In `src/components/notifications-view.tsx`, show severity badge (color-coded: critical=red, medium=orange, low=blue, informational=gray, unclassified=none) next to each notification
- [ ] Add category filter dropdown (Todos, Requerimiento, Intimacion, Deuda, Vencimiento, Comunicacion, Otro)
- [ ] Sort notifications by severity (critical first) within each date group
- [ ] Show ai_summary as subtitle when available
- [ ] `bun run build` passes

---

### US-007: Workflow de asignacion y resolucion de notificaciones
**Description:** As a studio operator, I want to assign notifications to team members and mark them as resolved so that nothing falls through the cracks.

**Acceptance Criteria:**
- [ ] Create server functions `assignNotification(id, userId)` and `resolveNotification(id)` in `src/actions/notification.tsx`
- [ ] In notification detail panel (right side of `notifications-view.tsx`), add "Asignar a" dropdown with org members and "Resolver" button
- [ ] Resolved notifications show with strikethrough or muted style
- [ ] Filter option: "Solo sin resolver" toggle
- [ ] `bun run build` passes

---

### US-008: Enriquecer tabla debt con status y flags
**Description:** As a developer, I need debt enrichment columns so that debts can be tracked as open, in-plan, paid, or disputed, and flagged as intimated.

**Acceptance Criteria:**
- [ ] Add columns to `debt` in `drizzle/schema.ts`: `status` (text default 'open'), `detected_at` (timestamp default now()), `source_period` (text nullable), `is_intimated` (boolean default false)
- [ ] Create migration script `src/scripts/ensure-debt-enrichment-columns.ts`
- [ ] Run migration script successfully
- [ ] `bun run build` passes

---

### US-009: UI de status de deudas en client detail
**Description:** As a studio operator, I want to change debt status and flag intimations so I can track resolution progress.

**Acceptance Criteria:**
- [ ] In client detail debt tab (`src/components/client-detail-page.tsx`), add status dropdown per debt row: Abierta, En plan, Pagada, Disputada
- [ ] Add "Intimada" toggle/badge per debt row
- [ ] Create server function `updateDebtStatus(id, status, is_intimated)` in `src/actions/client.tsx`
- [ ] Color-code debt rows by status (red=open+overdue, orange=intimated, green=paid, gray=in_plan)
- [ ] `bun run build` passes

---

### US-010: Vencimientos completables
**Description:** As a studio operator, I want to mark due dates as completed so they become actionable tasks, not just informational dates.

**Acceptance Criteria:**
- [ ] Add columns to `due_date` in `drizzle/schema.ts`: `completed_at` (timestamp nullable), `completed_by_user_id` (text FK user nullable)
- [ ] Create migration script and run it
- [ ] Create server function `markDueDateCompleted(id)` in `src/actions/client.tsx`
- [ ] In `src/components/vencimientos-calendar.tsx`, add checkbox per event in the detail panel; completed events show with strikethrough
- [ ] In calendar grid, completed days show green dot instead of blue/red pill
- [ ] `bun run build` passes

---

### US-011: Widgets de excepciones en dashboard
**Description:** As a studio operator, I want to see critical exceptions (overdue debts, unresolved critical notifications, upcoming due dates) at the top of the dashboard so I know what needs immediate attention.

**Acceptance Criteria:**
- [ ] Create server function `getExceptionsSummary` in `src/actions/dashboard.tsx` returning: count of overdue debts, count of critical unresolved notifications, count of due dates within 3 days, count of clients with errors
- [ ] Add `ExceptionsBar` component in `src/components/dashboard/` showing 4 colored alert cards above KPI row
- [ ] Each card is clickable and navigates to the relevant page (debts, notifications, vencimientos, clients)
- [ ] Cards only appear when count > 0 (hide if no exceptions)
- [ ] Wire into `src/routes/_authed/index.tsx` between DashboardGreeting and KpiCardsRow
- [ ] `bun run build` passes

---

### US-012: Enriquecer tabla document con storage metadata
**Description:** As a developer, I need document storage metadata so that files can be migrated from public URLs to private storage in the future.

**Acceptance Criteria:**
- [ ] Add columns to `document` in `drizzle/schema.ts`: `storage_provider` (text default 'external'), `storage_key` (text nullable), `mime_type` (text nullable), `size_bytes` (integer nullable), `checksum` (text nullable)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-013: Enriquecer iva_scrape con source confidence
**Description:** As a developer, I need IVA source tracking so that manually entered vs scraped vs estimated values are distinguishable.

**Acceptance Criteria:**
- [ ] Add columns to `iva_scrape` in `drizzle/schema.ts`: `source_confidence` (text default 'unknown'), `imported_manually` (boolean default false)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### FASE 2 — AI Assistant interno

---

### US-014: Enriquecer agent_message con metadata y tool_calls
**Description:** As a developer, I need agent message enrichment so that every AI response can be audited with its tool calls, citations, and confidence level.

**Acceptance Criteria:**
- [ ] Add columns to `agent_message` in `drizzle/schema.ts`: `metadata` (jsonb nullable), `tool_calls` (jsonb nullable), `citations` (jsonb nullable), `confidence` (text nullable)
- [ ] Create migration script and run it
- [ ] In `src/routes/api/agent.ts`, update `onFinish` callback to persist tool_calls and metadata from the step results into the agent_message row
- [ ] `bun run build` passes

---

### US-015: Crear tabla agent_run
**Description:** As a developer, I need an execution tracking table so that each AI agent invocation can be audited separately from the conversation history.

**Acceptance Criteria:**
- [ ] Add `agentRun` table to `drizzle/schema.ts`: id (uuid PK), conversation_id (uuid FK agent_conversation), user_id (text FK user), organization_id (text FK organization), client_id (uuid FK client nullable), profile_id (uuid FK profile nullable), status (text default 'running'), intent (text nullable), input (text), output (text nullable), tool_trace (jsonb nullable), error (text nullable), started_at (timestamp default now()), finished_at (timestamp nullable)
- [ ] Create migration script and run it
- [ ] In `src/routes/api/agent.ts`, create an agent_run record at the start of each request and update it with output/status/tool_trace on completion
- [ ] `bun run build` passes

---

### US-016: Agent tool — get_client_summary
**Description:** As an AI agent, I need a get_client_summary tool so I can answer questions about a client's overall status without raw SQL.

**Acceptance Criteria:**
- [ ] Add `get_client_summary` tool in `src/routes/api/agent.ts` that accepts `clientName` (string)
- [ ] Tool finds client by name (ILIKE), fetches: client data, profile count, open notification count, overdue debt count + total balance, upcoming due date count (next 30 days), last scrape timestamps per job type
- [ ] Tool returns structured JSON (not raw SQL result)
- [ ] Scope enforced: only clients where `client.organizationId = orgId`
- [ ] `bun run build` passes

---

### US-017: Agent tool — get_open_notifications
**Description:** As an AI agent, I need a get_open_notifications tool so I can answer questions about unread or critical notifications.

**Acceptance Criteria:**
- [ ] Add `get_open_notifications` tool in `src/routes/api/agent.ts` that accepts `clientName` (optional), `severity` (optional), `limit` (default 10)
- [ ] Tool reuses logic from `getNotifications` in `src/actions/notification.tsx`
- [ ] Returns: id, message, severity, category, ai_summary, clientName, publicationDate, opened
- [ ] Scope enforced via orgId
- [ ] `bun run build` passes

---

### US-018: Agent tool — get_debts
**Description:** As an AI agent, I need a get_debts tool so I can answer questions about tax debts.

**Acceptance Criteria:**
- [ ] Add `get_debts` tool in `src/routes/api/agent.ts` that accepts `clientName` (optional), `status` (optional), `limit` (default 20)
- [ ] Returns: tax, concept, period, dueDate, balance, compensatoryInterest, punitiveInterest, status, is_intimated, clientName
- [ ] Calculate total_debt = balance + compensatory + punitive per row
- [ ] Scope enforced via orgId
- [ ] `bun run build` passes

---

### US-019: Agent tool — get_due_dates
**Description:** As an AI agent, I need a get_due_dates tool so I can answer questions about upcoming fiscal obligations.

**Acceptance Criteria:**
- [ ] Add `get_due_dates` tool in `src/routes/api/agent.ts` that accepts `clientName` (optional), `days_ahead` (default 30), `include_completed` (default false)
- [ ] Returns: tax, concept, dueDate, completed_at, clientName, days_until_due
- [ ] Sort by dueDate ascending
- [ ] Scope enforced via orgId
- [ ] `bun run build` passes

---

### US-020: Agent tool — get_profile_status
**Description:** As an AI agent, I need a get_profile_status tool so I can answer questions about a specific fiscal profile's health.

**Acceptance Criteria:**
- [ ] Add `get_profile_status` tool in `src/routes/api/agent.ts` that accepts `clientName`, `profileName` (optional)
- [ ] Returns: profile data, managed_by_study, profile_type, last IVA scrape summary, open notifications count, active employee count (if liquidaSueldos), last scrape dates
- [ ] Scope enforced via orgId
- [ ] `bun run build` passes

---

### US-021: Agent tool — payroll_preview_receipt
**Description:** As an AI agent, I need a payroll_preview_receipt tool so I can show a salary calculation preview without persisting anything.

**Acceptance Criteria:**
- [ ] Add `payroll_preview_receipt` tool in `src/routes/api/agent.ts` that accepts `clientName`, `employeeName`, `periodo` (YYYY-MM)
- [ ] Tool finds employee, fetches active convenio + escala, runs `calcularLiquidacion` logic from `src/actions/sueldos.ts` in dry-run mode
- [ ] Returns: basico, haberes, noRemunerativo, descuentos, retenciones, neto, concept breakdown
- [ ] Does NOT persist anything to DB
- [ ] Scope enforced via orgId
- [ ] `bun run build` passes

---

### US-022: Mostrar tool calls y citations en chat UI
**Description:** As a studio operator, I want to see what data the AI agent queried to answer my question so I can trust the response.

**Acceptance Criteria:**
- [ ] In `src/routes/_authed/chat/$id.tsx`, after each assistant message that has tool_calls in metadata, show a collapsible "Fuentes consultadas" section
- [ ] Each tool call shows: tool name, brief description of what was queried
- [ ] Style as a subtle gray box below the message content
- [ ] `bun run build` passes

---

### FASE 3 — Alertas y risk engine

---

### US-023: Crear tabla alert
**Description:** As a developer, I need a centralized alert table so that risks from different sources (debts, notifications, due dates, inactivity) can be managed in one inbox.

**Acceptance Criteria:**
- [ ] Add `alert` table to `drizzle/schema.ts`: id (uuid PK), organization_id (text FK), client_id (uuid FK client nullable), profile_id (uuid FK profile nullable), type (text), severity (text), title (text), description (text nullable), source_entity_type (text nullable), source_entity_id (text nullable), status (text default 'open'), assigned_to_user_id (text FK user nullable), due_at (timestamp nullable), resolved_at (timestamp nullable), resolved_by_user_id (text FK user nullable), metadata (jsonb nullable), created_at (timestamp), updated_at (timestamp)
- [ ] Add index on (organization_id, status)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-024: Crear tabla profile_risk_snapshot
**Description:** As a developer, I need periodic risk snapshots so that risk trends can be tracked over time.

**Acceptance Criteria:**
- [ ] Add `profileRiskSnapshot` table to `drizzle/schema.ts`: id (uuid PK), profile_id (uuid FK profile), period (text), score (numeric 5,2), risk_level (text: 'low'|'medium'|'high'|'critical'), factors (jsonb), created_at (timestamp). Unique on (profile_id, period)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-025: Crear tabla client_balance_config
**Description:** As a developer, I need a balance config table so that fiscal year end dates and alert thresholds can be stored per client.

**Acceptance Criteria:**
- [ ] Add `clientBalanceConfig` table to `drizzle/schema.ts`: id (uuid PK), client_id (uuid FK client, unique), fiscal_year_end_month (integer), fiscal_year_end_day (integer), presentation_due_days (integer nullable), alert_days_before (integer[] default ARRAY[60,30,15,7]), created_at (timestamp), updated_at (timestamp)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-026: Backend CRUD de alertas
**Description:** As a developer, I need alert server functions so that alerts can be created, listed, acknowledged, assigned, and resolved.

**Acceptance Criteria:**
- [ ] Create `src/actions/alert.tsx` with: `listAlerts(status?, severity?, clientId?, limit)`, `createAlert(...)`, `acknowledgeAlert(id)`, `assignAlert(id, userId)`, `resolveAlert(id)`, `bulkResolveAlerts(ids[])`
- [ ] All functions call `getSessionWithOrg()` and scope by orgId
- [ ] Write mutations require `assertCanWrite(role)`
- [ ] `bun run build` passes

---

### US-027: Pipeline de generacion de alertas
**Description:** As a developer, I need an alert generation pipeline so that alerts are automatically created from overdue debts, critical notifications, and approaching due dates.

**Acceptance Criteria:**
- [ ] Create `src/lib/alert-generator.ts` with function `generateAlerts(orgId)` that:
  - Scans debts with status='open' and dueDate < today → creates `overdue_debt` alert
  - Scans notifications with severity='critical' and resolved_at IS NULL → creates `critical_notification` alert
  - Scans due_dates with dueDate within 7 days and completed_at IS NULL → creates `upcoming_due_date` alert
  - Scans clients with hasErrors=true → creates `scraper_error` alert
  - Deduplicates: does not create alert if one already exists for same (type, source_entity_type, source_entity_id, status='open')
- [ ] `bun run build` passes

---

### US-028: Risk scoring engine
**Description:** As a developer, I need a risk scoring function so that each profile gets a periodic risk assessment.

**Acceptance Criteria:**
- [ ] Create `src/lib/risk-engine.ts` with function `calculateRiskScore(profileId, period)` that computes score (0-100) based on: overdue debt amount (weight 30%), critical unresolved notifications (weight 20%), upcoming due dates (weight 15%), months without invoices (weight 15%), IVA payable projected (weight 10%), scraper errors (weight 10%)
- [ ] Returns: score, risk_level (low <25, medium 25-50, high 50-75, critical >75), factors (jsonb breakdown)
- [ ] Create function `generateRiskSnapshots(orgId, period)` that runs scoring for all profiles in org and inserts into profile_risk_snapshot
- [ ] `bun run build` passes

---

### US-029: Inbox de alertas UI
**Description:** As a studio operator, I want a centralized alert inbox so I can see all risks in one place and act on them.

**Acceptance Criteria:**
- [ ] Create route `src/routes/_authed/alerts/index.tsx`
- [ ] Add "Alertas" NavItem in `src/components/app-sidebar.tsx` with alert icon and urgent count badge
- [ ] Page shows: filter bar (severity, type, status, client), alert list with severity badge, title, client name, source, time ago
- [ ] Each alert has: Assign, Resolve, View source (link to notification/debt/due_date) actions
- [ ] Use Arca design tokens (ArcaCard, StatusTag, etc.)
- [ ] `bun run build` passes

---

### US-030: Balance config UI en client detail
**Description:** As a studio operator, I want to configure fiscal year end dates per client so that balance due alerts fire at the right time.

**Acceptance Criteria:**
- [ ] In client detail Info tab, add "Cierre de ejercicio" section with month/day pickers and alert days config
- [ ] Create server functions `getBalanceConfig(clientId)` and `upsertBalanceConfig(clientId, data)` in `src/actions/client.tsx`
- [ ] Alert generator (US-027) uses this config to create `balance_due_soon` alerts
- [ ] `bun run build` passes

---

### FASE 4 — Portal cliente

---

### US-031: Crear tablas client_user_access y client_request
**Description:** As a developer, I need client portal tables so that external users (clients) can have scoped access and receive requests from the studio.

**Acceptance Criteria:**
- [ ] Add `clientUserAccess` table: id (uuid PK), client_id (uuid FK client), user_id (text FK user), role (text default 'client_viewer'), can_upload_documents (boolean default true), can_view_debts (boolean default true), can_view_iva (boolean default true), can_view_payroll (boolean default false), can_chat_ai (boolean default true), created_at (timestamp). Unique on (client_id, user_id)
- [ ] Add `clientRequest` table: id (uuid PK), organization_id (text FK org), client_id (uuid FK client), profile_id (uuid FK profile nullable), requested_by_user_id (text FK user nullable), title (text), description (text nullable), type (text), status (text default 'open'), due_at (timestamp nullable), completed_at (timestamp nullable), metadata (jsonb nullable), created_at (timestamp)
- [ ] Create migration scripts and run them
- [ ] `bun run build` passes

---

### US-032: Backend del portal cliente
**Description:** As a developer, I need client portal server functions so that client users can access their scoped data.

**Acceptance Criteria:**
- [ ] Create `src/actions/client-portal.tsx` with: `getClientPortalDashboard(clientId)` (summary stats), `getClientPortalDebts(clientId)`, `getClientPortalDueDates(clientId)`, `getClientPortalNotifications(clientId)`, `getClientPortalRequests(clientId)`, `completeClientRequest(requestId)`
- [ ] All functions validate that the calling user has a `clientUserAccess` row for the given client
- [ ] Respect permission flags (can_view_debts, can_view_iva, etc.)
- [ ] `bun run build` passes

---

### US-033: Auth guard para portal cliente
**Description:** As a developer, I need a separate auth layout for client users so that they see a limited UI and can only access their data.

**Acceptance Criteria:**
- [ ] Create route layout `src/routes/_client/route.tsx` that checks: user has session, user has clientUserAccess row, resolves clientId from access
- [ ] Client layout has simplified sidebar (no admin, no sueldos, no jobs)
- [ ] Create helper `getClientPortalSession()` in `src/actions/helpers.ts`
- [ ] `bun run build` passes

---

### US-034: Dashboard del portal cliente
**Description:** As a client user, I want a simple dashboard showing my fiscal status so I understand my situation at a glance.

**Acceptance Criteria:**
- [ ] Create route `src/routes/_client/index.tsx` with: greeting, next due dates (3), open debts summary, unread notifications count, pending requests from studio
- [ ] Use Arca design tokens
- [ ] `bun run build` passes

---

### US-035: Solicitudes del estudio al cliente
**Description:** As a studio operator, I want to send requests to clients (documentation, signatures, information) so that I can track pending items.

**Acceptance Criteria:**
- [ ] Create server functions `createClientRequest`, `listClientRequests`, `updateClientRequestStatus` in `src/actions/client-portal.tsx`
- [ ] In client detail page, add "Solicitudes" tab with list of requests + "Nueva solicitud" button
- [ ] Client portal shows pending requests with "Completar" button
- [ ] `bun run build` passes

---

### US-036: Upload de documentos para clientes
**Description:** As a client user, I want to upload documents requested by the studio so that I don't need to send them via WhatsApp.

**Acceptance Criteria:**
- [ ] In client portal requests view, add file upload for requests of type 'document'
- [ ] Store uploaded file in `document` table with `storage_provider='upload'`
- [ ] Link document to the client_request via metadata
- [ ] Studio can see uploaded documents in the request detail
- [ ] `bun run build` passes

---

### FASE 5 — Sueldos PRO

---

### US-037: Crear tabla employee_event
**Description:** As a developer, I need an employee event table so that legajo history (absences, license, category changes, notes) can be tracked with dates and audit trail.

**Acceptance Criteria:**
- [ ] Add `employeeEvent` table to `drizzle/schema.ts`: id (uuid PK), empleado_id (uuid FK liquidacion_import_empleado CASCADE), type (text: 'ausencia'|'llegada_tarde'|'licencia'|'accidente'|'enfermedad'|'cambio_categoria'|'cambio_sueldo'|'nota_legal'|'observacion'), title (text), description (text nullable), event_date (timestamp), affects_payroll (boolean default false), metadata (jsonb nullable), created_by_user_id (text FK user nullable), created_at (timestamp)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-038: Crear tabla payroll_period_novelty
**Description:** As a developer, I need a novelties table so that monthly payroll adjustments (absences, extras, bonuses) are tracked separately from the legajo history.

**Acceptance Criteria:**
- [ ] Add `payrollPeriodNovelty` table to `drizzle/schema.ts`: id (uuid PK), empleado_id (uuid FK liquidacion_import_empleado CASCADE), periodo (text), type (text), quantity (numeric 10,2 nullable), amount (numeric 14,2 nullable), description (text nullable), applied_to_recibo_id (uuid FK liquidacion_import_recibo nullable), status (text default 'pending'), created_at (timestamp)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-039: Crear tabla payroll_receipt_template
**Description:** As a developer, I need a receipt template table so that common concept configurations can be saved and reused.

**Acceptance Criteria:**
- [ ] Add `payrollReceiptTemplate` table to `drizzle/schema.ts`: id (uuid PK), profile_id (uuid FK profile CASCADE), name (text), receipt_type (text default 'sueldo'), concept_ids (jsonb: array of uuid), active (boolean default true), created_at (timestamp)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-040: Agregar fecha_antiguedad_reconocida a empleado
**Description:** As a developer, I need a recognized seniority date so that employees who changed companies but kept seniority are calculated correctly.

**Acceptance Criteria:**
- [ ] Add `fecha_antiguedad_reconocida` (timestamp nullable) to `liquidacionImportEmpleado` in `drizzle/schema.ts`
- [ ] Create migration script and run it
- [ ] In `src/actions/sueldos.ts`, update seniority calculation to prefer `fecha_antiguedad_reconocida` over `fecha_alta` when present
- [ ] `bun run build` passes

---

### US-041: CRUD de eventos de legajo
**Description:** As a studio operator, I want to register events in an employee's legajo so that absences, licenses, and notes are tracked with dates.

**Acceptance Criteria:**
- [ ] Create server functions in `src/actions/sueldos.ts`: `createEmployeeEvent(empleadoId, type, title, eventDate, description?, affectsPayroll?)`, `listEmployeeEvents(empleadoId, limit?)`
- [ ] `bun run build` passes

---

### US-042: Timeline de legajo en UI
**Description:** As a studio operator, I want to see an employee's event history as a timeline so I can understand their complete record.

**Acceptance Criteria:**
- [ ] In `src/components/sueldos/SueldosEmpleados.tsx`, add expandable section per employee showing event timeline
- [ ] Timeline shows: date, type badge (color-coded), title, description
- [ ] "Agregar evento" button opens dialog with type selector, date picker, title, description, affects_payroll toggle
- [ ] `bun run build` passes

---

### US-043: CRUD de novedades mensuales
**Description:** As a studio operator, I want to register monthly payroll novelties so that absences and adjustments impact the correct period.

**Acceptance Criteria:**
- [ ] Create server functions: `createNovelty(empleadoId, periodo, type, quantity?, amount?, description?)`, `listNovelties(empleadoId, periodo)`, `deleteNovelty(id)`
- [ ] `bun run build` passes

---

### US-044: Template de recibo y generacion desde template
**Description:** As a studio operator, I want to save and reuse receipt templates so that I don't reconfigure concepts every month.

**Acceptance Criteria:**
- [ ] Create server functions: `createReceiptTemplate(profileId, name, receiptType, conceptIds)`, `listReceiptTemplates(profileId)`, `deleteReceiptTemplate(id)`
- [ ] In `SueldosSimulador`, add "Usar template" dropdown that pre-loads concept list from template
- [ ] Add "Guardar como template" button after configuring concepts
- [ ] `bun run build` passes

---

### FASE 6 — Conciliacion bancaria

---

### US-045: Crear tablas bancarias
**Description:** As a developer, I need bank account and transaction tables so that bank statement data can be stored and reconciled against invoices.

**Acceptance Criteria:**
- [ ] Add `bankAccount` table: id (uuid PK), client_id (uuid FK client CASCADE), profile_id (uuid FK profile nullable), bank_name (text), account_number (text nullable), currency (text default 'ARS'), alias (text nullable), cbu (text nullable), active (boolean default true), created_at (timestamp)
- [ ] Add `bankTransaction` table: id (uuid PK), bank_account_id (uuid FK bankAccount CASCADE), transaction_date (timestamp), description (text nullable), amount (numeric 14,2), direction (text: 'credit'|'debit'), counterparty_name (text nullable), counterparty_identity_number (text nullable), external_id (text nullable), raw_data (jsonb nullable), created_at (timestamp)
- [ ] Add `bankInvoiceMatch` table: id (uuid PK), bank_transaction_id (uuid FK bankTransaction CASCADE), invoice_id (uuid FK invoice CASCADE), match_type (text: 'auto'|'manual'), confidence (numeric 5,2 nullable), reviewed_by_user_id (text FK user nullable), reviewed_at (timestamp nullable), created_at (timestamp)
- [ ] Add `financialMovementClassification` table: id (uuid PK), source_type (text), source_id (uuid), client_id (uuid FK client CASCADE), profile_id (uuid FK profile nullable), category (text), is_business_related (boolean default true), is_tax_relevant (boolean default true), is_cashflow_real (boolean default true), notes (text nullable), classified_by (text default 'system'), created_at (timestamp)
- [ ] Create migration scripts and run them
- [ ] `bun run build` passes

---

### US-046: Backend de conciliacion bancaria
**Description:** As a developer, I need bank reconciliation server functions so that bank accounts can be managed, transactions imported, and matched against invoices.

**Acceptance Criteria:**
- [ ] Create `src/actions/bank.tsx` with: `createBankAccount`, `listBankAccounts(clientId)`, `importBankTransactions(bankAccountId, transactions[])`, `listBankTransactions(bankAccountId, from?, to?)`, `autoMatchTransactions(bankAccountId)`, `manualMatchTransaction(transactionId, invoiceId)`, `getReconciliationSummary(clientId)`
- [ ] Auto-matching: match by amount + date proximity + counterparty CUIT vs invoice emitter/recipient CUIT
- [ ] All functions scope by orgId
- [ ] `bun run build` passes

---

### US-047: UI de conciliacion bancaria
**Description:** As a studio operator, I want a bank reconciliation module so I can see bank transactions, match them to invoices, and identify discrepancies.

**Acceptance Criteria:**
- [ ] Create route `src/routes/_authed/bank/index.tsx`
- [ ] Add "Banco" NavItem in sidebar
- [ ] Page shows: bank account selector, transaction list with matched/unmatched indicator, matching UI (click transaction → suggest invoice matches), summary (matched %, unmatched amount)
- [ ] Use Arca design tokens
- [ ] `bun run build` passes

---

### FASE 7 — Contabilidad formal

---

### US-048: Crear tablas de contabilidad
**Description:** As a developer, I need accounting tables for chart of accounts and journal entries so that formal double-entry bookkeeping can be supported.

**Acceptance Criteria:**
- [ ] Add `accountingAccount` table: id (uuid PK), client_id (uuid FK client CASCADE), code (text), name (text), type (text: 'asset'|'liability'|'equity'|'income'|'expense'), parent_id (uuid FK self nullable), active (boolean default true), created_at (timestamp). Unique on (client_id, code)
- [ ] Add `journalEntry` table: id (uuid PK), client_id (uuid FK client CASCADE), profile_id (uuid FK profile nullable), entry_date (timestamp), description (text nullable), source_type (text nullable), source_id (uuid nullable), status (text default 'draft'), created_by_user_id (text FK user nullable), created_at (timestamp)
- [ ] Add `journalEntryLine` table: id (uuid PK), journal_entry_id (uuid FK journalEntry CASCADE), account_id (uuid FK accountingAccount RESTRICT), debit (numeric 14,2 default 0), credit (numeric 14,2 default 0), description (text nullable)
- [ ] Create migration scripts and run them
- [ ] `bun run build` passes

---

### US-049: Backend de contabilidad
**Description:** As a developer, I need accounting server functions for managing chart of accounts and journal entries.

**Acceptance Criteria:**
- [ ] Create `src/actions/accounting.tsx` with: `listAccounts(clientId)`, `createAccount(clientId, code, name, type, parentId?)`, `updateAccount(id, name, active)`, `createJournalEntry(clientId, entryDate, description, lines[])`, `listJournalEntries(clientId, from?, to?)`, `getJournalEntry(id)`, `getLedger(clientId, accountId, from?, to?)` (mayor), `getTrialBalance(clientId, from, to)` (balance de sumas y saldos)
- [ ] Validate every entry: sum of debits must equal sum of credits
- [ ] All functions scope by orgId
- [ ] `bun run build` passes

---

### US-050: UI de contabilidad
**Description:** As a studio operator, I want an accounting module with chart of accounts, journal entry creation, and reports (ledger, trial balance).

**Acceptance Criteria:**
- [ ] Create route `src/routes/_authed/accounting/index.tsx`
- [ ] Add "Contabilidad" NavItem in sidebar
- [ ] Tabs: Plan de cuentas (tree view), Asientos (list + create), Mayor (account ledger), Balance (trial balance table)
- [ ] Journal entry form: date, description, dynamic lines (account picker, debit/credit), total validation
- [ ] Use Arca design tokens
- [ ] `bun run build` passes

---

### FASE 8 — Analytics

---

### US-051: Crear tabla tax_projection
**Description:** As a developer, I need a tax projection table so that estimated vs actual tax positions can be tracked over time.

**Acceptance Criteria:**
- [ ] Add `taxProjection` table to `drizzle/schema.ts`: id (uuid PK), profile_id (uuid FK profile CASCADE), period (text), tax (text), projected_amount (numeric 14,2), confidence (text nullable), factors (jsonb nullable), generated_at (timestamp default now()). Unique on (profile_id, period, tax)
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-052: Backend de analytics y proyecciones
**Description:** As a developer, I need analytics server functions for tax projections and business ratios.

**Acceptance Criteria:**
- [ ] Create `src/actions/analytics.tsx` with: `generateIvaProjection(profileId, period)` (based on recent invoice trends), `getRatios(clientId, from, to)` (facturacion mensual, variacion, compras/ventas ratio, deuda/facturacion ratio), `getClientsAtRisk(orgId)` (sorted by risk score), `getExecutiveSummary(orgId)` (aggregate KPIs across all clients)
- [ ] `bun run build` passes

---

### US-053: UI de analytics
**Description:** As a studio operator, I want an analytics dashboard with projections, ratios, and executive reports.

**Acceptance Criteria:**
- [ ] Create route `src/routes/_authed/analytics/index.tsx`
- [ ] Add "Analytics" NavItem in sidebar
- [ ] Sections: IVA projection per client (table + chart), client risk ranking, business ratios, executive summary cards
- [ ] Use Arca design tokens and Recharts
- [ ] `bun run build` passes

---

### FASE 9 — Modularizacion

---

### US-054: Feature flag system
**Description:** As a developer, I need a feature flag system so that modules can be enabled/disabled per organization for commercial packaging.

**Acceptance Criteria:**
- [ ] Add `organizationModule` table: id (uuid PK), organization_id (text FK org), module (text: 'sueldos'|'banco'|'contabilidad'|'analytics'|'portal_cliente'|'ai_agent'), enabled (boolean default false), enabled_at (timestamp nullable), created_at (timestamp). Unique on (organization_id, module)
- [ ] Create helper `isModuleEnabled(orgId, module)` in `src/actions/helpers.ts`
- [ ] Create migration script and run it
- [ ] `bun run build` passes

---

### US-055: Gate de modulos en sidebar y rutas
**Description:** As a developer, I need module gating so that disabled modules don't appear in navigation and their routes redirect.

**Acceptance Criteria:**
- [ ] In `src/components/app-sidebar.tsx`, conditionally show nav items based on enabled modules (query `organizationModule` table)
- [ ] In route `beforeLoad` for gated routes (sueldos, bank, accounting, analytics), check module is enabled; redirect to `/` if not
- [ ] Create admin UI in `/admin` settings tab to toggle modules
- [ ] `bun run build` passes

---

## Functional Requirements

- FR-1: All new tables must include `created_at` timestamp with default `now()`
- FR-2: All new tables with org-scoped data must be filterable by `organization_id` (directly or via client FK chain)
- FR-3: All server functions must call `getSessionWithOrg()` as first action
- FR-4: All write mutations must call `assertCanWrite(role)` to enforce RBAC
- FR-5: All migration scripts must use `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` for idempotency
- FR-6: Agent tools must enforce orgId scoping — no cross-org data access
- FR-7: Alert deduplication: no duplicate open alerts for the same (type, source_entity_type, source_entity_id)
- FR-8: Journal entries must validate debits = credits before persisting
- FR-9: Bank auto-matching must use confidence scores and never auto-confirm matches below 0.8
- FR-10: Client portal access must be validated via `clientUserAccess` table, not org membership

---

## Non-Goals

- No SaaS multi-study platform in this implementation (Fase 9 is internal modularization only)
- No real-time websockets — polling with React Query staleTime is sufficient
- No mobile native app — responsive web only
- No automated invoice generation (facturador) — only reading/importing invoices from AFIP
- No stock, costing, or industry-specific modules
- No automatic bank statement fetching via API — manual upload/import only
- No Ganancias or Monotributo calculation engine — only IVA position
- No employee self-service portal (only client portal)

---

## Technical Considerations

- **Migration strategy**: Use `src/scripts/ensure-*.ts` pattern (ADD COLUMN IF NOT EXISTS) instead of `bun run db:push` to avoid data-loss conflicts with unmanaged tables (agent_*, payroll_* legacy tables in production)
- **Agent schema sync**: `buildSchema()` in `src/routes/api/agent.ts` must be updated whenever new tables are added — consider generating it from Drizzle schema
- **PostgreSQL enum extension**: New job_type values require `ALTER TYPE job_type ADD VALUE` outside transactions — use separate migration script
- **Existing patterns to reuse**: `ArcaCard/ArcaCardHead/ArcaCardFoot` for cards, `StatusTag/Delta/Chip` for badges, `DataTable` for filterable tables, `SearchableSelect` for dropdowns, `PageHeader` for page titles
- **File locations**: Schema in `drizzle/schema.ts`, server functions in `src/actions/*.tsx`, routes in `src/routes/_authed/`, components in `src/components/`, migration scripts in `src/scripts/`

---

## Success Metrics

- Agent answers fiscal questions using 8+ tools without falling back to raw SQL for common queries
- Studio operator can identify all critical items (overdue debts, critical notifications, upcoming deadlines) from the alert inbox in under 30 seconds
- Notification classification runs on 100+ notifications per scrape cycle in under 60 seconds
- Client portal users can see their fiscal status and respond to studio requests without WhatsApp
- Payroll generation from template takes under 5 clicks
- Bank reconciliation auto-matches >70% of transactions with confidence >0.8
- Every journal entry balances debits = credits (enforced at DB level)

---

## Open Questions

1. Should client portal users share the same Better Auth instance (with a 'client' role) or use a separate auth mechanism?
2. What is the data retention policy for `data_source_event` and `agent_run` tables?
3. Which Argentine bank statement formats should be prioritized for the bank import parser?
4. Should the system ship with a pre-loaded Argentine standard chart of accounts?
5. Should risk score weights be configurable per organization or fixed?
6. Should `debt` and `due_date` tables get a `profile_id` column, or accept the limitation of client-level only?
