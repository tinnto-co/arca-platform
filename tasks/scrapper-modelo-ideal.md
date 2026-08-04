# Scrapper → modelo ideal (BD_IDEAL)

Auditoría del write-surface de `../arca-scrapper` (03/08) + mapa de adaptación.
El scrapper escribe **13 de las 77 tablas** del modelo viejo, todo vía Drizzle
(sin SQL crudo libre). Conexión única por `DATABASE_URL` en `src/db/db.ts`;
schema en `src/db/schemas.ts`.

## 1. Mapa tabla a tabla

| # | Hoy (NEW_DB) | Punto de escritura | Ideal (BD_IDEAL) | Cambio |
|---|---|---|---|---|
| 1 | `invoice` (upsert por rep+CAE+tipo) | `src/arca.ts` ~990 (processDownloadedZip) | `comprobante` + `comprobante_alicuota` + `contraparte` | **Reescritura grande.** La fila se parte en cabecera + N alícuotas. `direction 'Inbound'/'Outbound'` → `direccion enum('emitido','recibido')`. `type` texto → `tipo` numérico (FK lógica a `comprobante_tipo`). Emisor/receptor → `contraparte_id` (resolver/crear por `(doc_tipo, doc_nro)`). Clave única nueva **incluye contraparte** (en recibidos el número lo pone el emisor). `amount_iva_XX`=neto / `iva_XX`=IVA → filas `(alicuota, neto, iva)`. `receipt_province` desaparece (vive en `contraparte`). id NO se conserva. |
| 2 | `iva_scrape` (upsert cliente+período) | `iva.processor.ts:652-686` | `iva_declaracion` | Renombres a castellano, `periodo date` (1º del mes, ya no "MM/YYYY" texto), `cliente_id`, `fuente='scraper'`. |
| 3 | `notification` (insert dedup externalId) | `notificaciones.processor.ts:250,346` | `notificacion` | `representative_id` → `credencial_id`; `cliente_id` nullable (notifs del CUIT del login quedan sin cliente); `message`→`mensaje`, `publicationDate`→`publicada_at`, `expirationDate`→`vence_at`, `opened`→`leida`. |
| 4 | `document` | `notificaciones.processor.ts:690-701` | `documento` | Ya escribe R2 (storage_key/mime/size/checksum). Renombres: `name`→`nombre`, `sizeBytes`→`tamano_bytes`; `credencial_id` + `cliente_id`; `fuente='scraper'`. Columna `url`/`storageProvider` desaparecen. |
| 5 | `invoice_attachment` | `notificaciones.processor.ts:703-707` | `notificacion_adjunto` | Renombre directo (notificacion_id, documento_id, external_id). |
| 6 | `fiscal_entity` (upsert por cuilCuit) | `src/arca.ts:194-207` | `contraparte` | Upsert por `(doc_tipo, doc_nro)` (ya no solo CUIT: hay DNIs de consumidor final). `province`/`province_source`/`provinceFetchedAt` → columnas equivalentes de contraparte. Catálogo global (sin org, sin RLS). |
| 7 | `client` **INSERT** (discovery) + UPDATE (`afipContribuyenteId`, `scrapedAt`) | `arca.ts` ~1000-1050, `comprobantes-full.processor.ts:912,1047` | **PROHIBIDO crear clientes.** Discovery → `evento` tipo deteccion | Decisión de modelo (30/07): el scrapper NO auto-crea clientes (origen de los ~42 espejos). Al ver una relación AFIP sin cliente → inserta `evento` y sigue. ⚠️ Decidir dónde viven `afip_contribuyente_id` y `scraped_at` (candidato: `cliente_credencial`). |
| 8 | `representative` UPDATE nombre post-login | `base.processor.ts:187-190` | `credencial_afip.nombre` | La credencial tiene contacto opcional (nombre/email/telefono). |
| 9 | `debt` (insert dedup full-row) | `src/arca.ts:496` | `deuda` | `cuit` + `credencial_id` + `cliente_id` nullable (AFIP devuelve por CUIT del login). `period` texto → `periodo date`. |
| 10 | `due_date` | `arca.ts:671` + `vencimientos.processor.ts:350` | `vencimiento` | Ídem deuda. Ojo: el CSV ni trae CUIT por fila — hoy el legacy escribe solo representativeId. |
| 11 | `job` (insert + updates de estado) | `job.service.ts:43-65` + estados | `job` | `representative_id` → `credencial_id`; `cliente_id` nullable nuevo (setearlo cuando el job es de un cliente puntual). Estados/BullMQ igual. |
| 12 | `job_log` (append-only + pruning 14d) | `job.service.ts:15-20`, delete en `base.processor.ts:164` | `job_log` | Casi igual; sin `updated_at` (append-only). |
| 13 | `alert` (insert/update dedup fingerprint) | `job.service.ts:167-385` | `alerta` | `tipo='error_scraping'` (enum; antes 'scraper_error'), `origen_tipo='job'` + `origen_id`=jobId real (no el fingerprint — el fingerprint puede ir en `detalle jsonb`), `credencial_id` + `cliente_id` nullable, severidad enum castellano. |

## 2. Decisiones de diseño pendientes (con Gastón)

1. **Rol y RLS.** Hoy conecta con el usuario del connection string sin contexto.
   Opciones: (a) rol propio `arca_scrapper` RW con las mismas políticas que
   `arca_app` + `app.org_id` derivado de `credencial_afip.org_id` al tomar el
   job; (b) rol exento de RLS (como `arca` dueño) — simple pero pierde la red de
   seguridad. Nota: `contraparte` y catálogos no tienen RLS, eso no molesta.
2. **Discovery sin crear clientes**: qué hace exactamente al encontrar una
   relación nueva (formato del `evento`, dedupe) y dónde persisten
   `afip_contribuyente_id` / `scraped_at` (propuesta: `cliente_credencial`).
3. **org_id explícito**: el scrapper escribe `org_id` desde la credencial y se
   elimina el DEFAULT `'org_estudio_blakg'` puente (tarea ya anotada en
   plan-rediseno-db.md como tarea de cutover).
4. **Upsert de comprobante**: definir el ON CONFLICT contra la clave única nueva
   (incluye contraparte) y qué pasa con re-scrapes (id no se conserva).
5. **Estrategia de repo**: rama en arca-scrapper + `DATABASE_URL` a
   `localhost:5460` para desarrollar contra BD_IDEAL local, processor por
   processor, validando con los datos ya migrados.

## 3. Orden de trabajo propuesto

1. Schema drizzle nuevo en el scrapper (solo las tablas que escribe/lee).
2. Infra transversal: conexión/rol, JobService (job/job_log/alerta), base.processor.
3. Processors por riesgo creciente: vencimientos → deuda → notificaciones
   (+documento/adjunto, R2 ya cortado) → iva → comprobantes (el grande:
   contraparte + alícuotas + discovery→evento).
4. Correr cada processor real contra BD_IDEAL local y comparar contra lo que
   dejó el ETL (misma técnica que el smoke test de la app).
