# PRD: Provincia del receptor vía Padrón AFIP (WSAA) con trazabilidad y override manual

## Introducción

Hoy el scrapper (`arca-scrapper`) resuelve la provincia del receptor de cada factura outbound consultando Nosis por CUIT, y cachea el resultado para siempre en `fiscal_entity.province`. Se detectó un caso real (CUIT 20416260584, Montenegro) donde Nosis devuelve "Cordoba" pero el domicilio fiscal oficial según el padrón de AFIP es CABA. Como la provincia alimenta la vista de **Convenio Multilateral** (distribución de IIBB por jurisdicción), un dato erróneo distorsiona la liquidación y no es corregible desde la UI.

Solución: usar el WS oficial de AFIP **`ws_sr_constancia_inscripcion`** (padrón A5, autenticación WSAA con certificado) como fuente primaria, mantener Nosis como fallback logueando discrepancias, guardar el domicilio fiscal completo con trazabilidad (fuente + fecha) y TTL de 6 meses, permitir re-enriquecimiento bajo demanda, y agregar override manual desde la UI.

La integración WSAA + padrón ya fue **validada end-to-end** el 2026-07-20 con el certificado `arca-scrapper` (CUIT 20420779292): ver script de referencia en Consideraciones Técnicas.

## Goals

- La provincia del receptor sale del padrón oficial de AFIP (misma fuente que la constancia de inscripción) — cero discrepancias defendibles ante el cliente.
- Nosis queda solo como fallback; cada discrepancia padrón vs Nosis queda logueada.
- `fiscal_entity` guarda domicilio fiscal completo + fuente + fecha de obtención; el cache expira a los 6 meses.
- El contador puede corregir manualmente la provincia de una entidad desde la UI, y esa corrección nunca es pisada por el proceso automático.
- Existe un mecanismo bajo demanda para re-resolver la provincia de facturas ya guardadas (por CUIT).

## User Stories

### US-001: Migración de esquema `fiscal_entity`
**Description:** Como desarrollador, necesito ampliar `fiscal_entity` para guardar el domicilio completo y la trazabilidad del dato.

**Acceptance Criteria:**
- [ ] Nuevas columnas en `fiscal_entity` (repos scrapper y platform, misma BD): `direccion` (text, null), `cod_postal` (text, null), `province_source` (text: `padron | nosis | manual`, null), `province_fetched_at` (timestamptz, null)
- [ ] Backfill: filas existentes con `province` no nula quedan con `province_source = 'nosis'` y `province_fetched_at = updated_at`
- [ ] Migración Drizzle generada y aplicada sin romper la cadena de numeración (ver convención de renumeración del repo)
- [ ] Typecheck/lint pasa en ambos repos

### US-002: Cliente WSAA en arca-scrapper
**Description:** Como desarrollador, necesito un módulo que obtenga y cachee el Ticket de Acceso (token+sign) de WSAA para el servicio `ws_sr_constancia_inscripcion`.

**Acceptance Criteria:**
- [ ] Módulo `src/afip/wsaa.ts` (o similar): genera TRA, firma CMS con openssl (o lib nativa), llama `https://wsaa.afip.gov.ar/ws/services/LoginCms`, parsea token/sign
- [ ] El TA se cachea en memoria y se reutiliza hasta su expiración (dura 12 hs); se renueva automáticamente antes de vencer
- [ ] Config por env: `AFIP_WS_CUIT`, `AFIP_WS_CERT_PATH`, `AFIP_WS_KEY_PATH` (arranca con cert de Gastón, migrable al de la empresa cambiando solo estas 3 vars)
- [ ] Manejo de error explícito si WSAA rechaza (cert vencido, clock skew, "TA en curso"): log claro y el enriquecimiento cae al fallback
- [ ] Typecheck/lint pasa

### US-003: Cliente padrón A5 (`getPersona_v2`)
**Description:** Como desarrollador, necesito consultar el domicilio fiscal de un CUIT contra el padrón oficial.

**Acceptance Criteria:**
- [ ] Función `fetchDomicilioFromPadron(cuit)` que llama `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5` (`getPersona_v2`) con token/sign de WSAA
- [ ] Devuelve `{ direccion, codPostal, provincia }` desde `domicilioFiscal` (usar `descripcionProvincia`)
- [ ] Normaliza la provincia al mismo formato que usa hoy `invoice.receiptProvince` (ej. "CIUDAD AUTONOMA BUENOS AIRES" → el label que ya agrupa la vista de Convenio Multilateral)
- [ ] CUIT inexistente o sin domicilio fiscal → devuelve null sin lanzar excepción
- [ ] Rate limiting/backoff análogo al existente para Nosis
- [ ] Typecheck/lint pasa

### US-004: Nueva cadena de resolución de provincia
**Description:** Como sistema, al enriquecer una factura outbound quiero resolver la provincia con: manual → cache vigente → padrón → Nosis (fallback), logueando discrepancias.

**Acceptance Criteria:**
- [ ] `resolveReceiptProvinceForOutbound` usa este orden: (1) `fiscal_entity` con `province_source = 'manual'` → siempre gana, nunca se re-consulta; (2) `fiscal_entity` con `province_fetched_at` < 6 meses → cache válido; (3) padrón AFIP; (4) Nosis como fallback solo si el padrón falló (error de red/WSAA), no si devolvió null limpio
- [ ] Cuando el padrón responde, se consulta también Nosis en modo comparación (best-effort) y si difieren se loguea `[province-mismatch] cuit=... padron=... nosis=...` — sin afectar el resultado
- [ ] El resultado se upserta en `fiscal_entity` con `direccion`, `cod_postal`, `province`, `province_source` (`padron` o `nosis`) y `province_fetched_at = now()`
- [ ] Cache en memoria del worker sigue funcionando igual (por CUIT, dentro del proceso)
- [ ] Typecheck/lint pasa

### US-005: TTL de 6 meses
**Description:** Como sistema, quiero re-consultar la fuente cuando el dato cacheado es viejo, porque los contribuyentes se mudan de jurisdicción.

**Acceptance Criteria:**
- [ ] Si `province_fetched_at` > 6 meses (y `province_source != 'manual'`), el enriquecimiento re-consulta padrón en lugar de usar `fiscal_entity`
- [ ] Si la re-consulta falla, se usa el valor viejo (no se borra) y se loguea
- [ ] Filas con `province_fetched_at` null (datos pre-migración sin backfill preciso) se tratan como vencidas
- [ ] Typecheck/lint pasa

### US-006: Re-enriquecimiento bajo demanda por CUIT
**Description:** Como operador, quiero re-resolver la provincia de una entidad y propagarla a sus facturas outbound ya guardadas, para corregir casos como Montenegro.

**Acceptance Criteria:**
- [ ] Script en `arca-scrapper` (ej. `src/scripts/reenrich-province.ts`) que recibe uno o más CUITs: fuerza re-consulta al padrón (ignora TTL, respeta `manual`), actualiza `fiscal_entity` y hace `UPDATE invoice SET receipt_province = ... WHERE direction = 'Outbound' AND recipient_identity_number = <cuit>`
- [ ] Flag `--dry-run` que muestra qué cambiaría sin escribir
- [ ] Log resumen: entidades actualizadas, facturas afectadas, discrepancias encontradas
- [ ] Typecheck/lint pasa

### US-007: Override manual desde la UI (arca-platform)
**Description:** Como contador, quiero ver de dónde salió la provincia de un receptor y corregirla manualmente, para que el Convenio Multilateral refleje la jurisdicción correcta.

**Acceptance Criteria:**
- [ ] En el modal de drill-down por provincia (`convenio-multilateral-tab.tsx`), cada comprobante muestra la fuente de la provincia del receptor (padrón / Nosis / manual) y la fecha del dato
- [ ] Acción "Corregir provincia" sobre el receptor: abre un selector de provincia (mismo catálogo de labels que usa la vista) y guarda vía server function
- [ ] Server function `updateFiscalEntityProvince` en `src/actions/`: valida sesión con `getSessionWithOrg()`, setea `province`, `province_source = 'manual'`, `province_fetched_at = now()` en `fiscal_entity`, y actualiza `invoice.receipt_province` de las outbound de ese CUIT **pertenecientes a la org** (scoping por `representative_id` de la org)
- [ ] Tras guardar, se invalidan las queries de la vista (`clientMultilateralInvoices`, resumen por provincia) y la tabla refleja el cambio
- [ ] Typecheck/lint pasa
- [ ] Verificar en browser con dev-browser skill

## Functional Requirements

- FR-1: La fuente primaria de provincia del receptor debe ser el WS `ws_sr_constancia_inscripcion` de AFIP (getPersona_v2, campo `domicilioFiscal.descripcionProvincia`), autenticado vía WSAA.
- FR-2: Nosis se usa como fallback únicamente ante fallo técnico del padrón (WSAA caído, timeout), nunca como primera opción.
- FR-3: Cuando ambas fuentes responden, toda discrepancia padrón≠Nosis debe loguearse con CUIT y ambos valores.
- FR-4: `fiscal_entity` debe registrar `direccion`, `cod_postal`, `province`, `province_source` (`padron|nosis|manual`) y `province_fetched_at`.
- FR-5: El dato cacheado expira a los 6 meses; `manual` no expira nunca ni es sobrescrito por procesos automáticos.
- FR-6: Debe existir un script de re-enriquecimiento por CUIT que actualice entidad + facturas outbound existentes, con dry-run.
- FR-7: La UI de Convenio Multilateral debe mostrar la fuente del dato y permitir corrección manual (rol member+; viewer solo lectura), propagando a las facturas de la org.
- FR-8: La credencial WSAA (CUIT, cert, key) debe ser configurable por env vars para migrar del certificado personal al de la empresa sin cambios de código.
- FR-9: La provincia devuelta por el padrón debe normalizarse al mismo conjunto de labels que hoy agrupa la vista (evitar duplicar "Cordoba" vs "CORDOBA", etc.).

## Non-Goals (Out of Scope)

- No se parsean PDFs de facturas para extraer domicilios impresos.
- No se corrige masivamente el histórico de facturas de forma automática (solo bajo demanda por CUIT — US-006 — o vía override manual — US-007).
- No se resuelve provincia para facturas inbound.
- No se implementa multi-jurisdicción por receptor (un CUIT = una provincia).
- No incluye la migración del certificado al CUIT de la empresa (operativo, no de código).
- No se elimina la integración Nosis (queda como fallback y comparador).

## Technical Considerations

- **Implementación validada (2026-07-20)**: script de referencia probado end-to-end — TRA con `generationTime = now-5min` / `expirationTime = now+10min`, firma `openssl cms -sign -nodetach -outform DER` + base64, SOAP `loginCms` a `https://wsaa.afip.gov.ar/ws/services/LoginCms`, luego SOAP `getPersona_v2` a `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5` con `token`, `sign`, `cuitRepresentada`, `idPersona`. Respuesta trae `domicilioFiscal` estructurado.
- **WSAA**: un TA por servicio dura ~12 hs; pedir uno nuevo mientras hay uno vigente da error ("El CEE ya posee un TA válido") → cachear obligatorio. Cuidado con clock skew del server.
- **Certificado actual**: emitido por CUIT 20420779292 (Gastón), alias `arca-scrapper`. Guardar cert/key fuera del repo (env paths); nunca commitearlos.
- **Punto de integración**: reemplazar/extender `resolveReceiptProvinceForOutbound` y `fetchProvinceFromNosisForDoc` en `arca-scrapper/src/arca.ts` (hoy ~líneas 63–230). El flujo de enriquecimiento (`enrichReceiptProvince` en `processDownloadedZip`) no cambia.
- **Normalización de provincia**: revisar los valores existentes en `invoice.receipt_province` y el mapeo de labels de `convenio-multilateral-tab.tsx` antes de definir la función de normalización.
- **Schema compartido**: `fiscal_entity` está definida en ambos repos (`arca-scrapper/drizzle/schema.ts` y `arca-platform/drizzle/schema.ts`) sobre la misma BD — mantener ambos en sync; aplicar la migración una sola vez.
- **Permisos UI**: usar `lib/permissions.ts`; la corrección manual escribe en una tabla global (`fiscal_entity` no tiene orgId) pero la propagación a `invoice` sí se scopea por org.

## Success Metrics

- El caso Montenegro (20416260584) muestra CABA en la vista de Convenio Multilateral tras el re-enriquecimiento.
- 0 discrepancias sin loguear entre padrón y Nosis en facturas nuevas.
- El contador puede corregir una provincia en menos de 3 clicks desde el modal de drill-down.
- Ninguna corrección manual es pisada por el proceso automático.

## Open Questions

- ¿Qué formato canónico de provincia usar? (¿el de AFIP `descripcionProvincia`, el actual de Nosis, o el catálogo `payroll_provincia` ya existente en la BD?)
- ¿La corrección manual desde la UI debería también disparar el update en facturas de otras orgs que le facturaron al mismo CUIT? (hoy `fiscal_entity` es global pero `invoice` es por org — propuesta: solo la org actual)
- ¿Conviene sumar `estadoClave` (CUIT activo/inactivo) del padrón a `fiscal_entity` ya que viene gratis en la misma respuesta?
- Volumen: ¿cuántos CUITs nuevos por día se enriquecen? (para dimensionar rate limiting contra el padrón)
