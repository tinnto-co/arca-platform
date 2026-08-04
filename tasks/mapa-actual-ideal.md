# Mapa actual → ideal

**Fecha:** 30/07/2026 · Insumo del ETL y de la reescritura de app/scrapper.
Modelo destino: `tasks/modelo-ideal-db.md` (7 dominios revisados y acordados).
Fuente: NEW_DB (77 tablas, counts al 30/07).

Acciones: **RENOMBRAR** (misma estructura, otro nombre) · **PARTIR** · **FUSIONAR** ·
**REDISEÑAR** · **DESAPARECE** · **IGUAL** · **NUEVA** (no existe hoy).

---

## 1. Mapa a nivel tabla (77 → ideal)

### Auth (Better Auth — no se toca)

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| user, account, session, verification, organization, member, invitation | — | IGUAL | idem |

### Identidad fiscal

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `representative` | 63 | PARTIR | `credencial_afip` (login+contacto); flags fiscales duplicados mueren |
| `client` | 98 | PARTIR | `cliente` (delgado) + `cliente_empleador_config` + `cliente_eecc_config` + fila en `cliente_credencial` |
| — | — | NUEVA | `cliente_credencial` (N:M; se puebla desde `client.representative_id` + `afip_contribuyente_id`) |
| `fiscal_entity` | 16.158 | RENOMBRAR | `contraparte` (global) |

### Fiscal / comprobantes

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `invoice` | 73.431 | PARTIR | `comprobante` (cabecera) + `comprobante_alicuota` (filas por alícuota ≠ 0) |
| — | — | NUEVA | `comprobante_tipo` (catálogo global AFIP: letra, es_nc, discrimina_iva — seed manual) |
| `iva_scrape` | 297 | RENOMBRAR | `iva_declaracion` (periodo date ya generado) |
| `debt` | 519 | RENOMBRAR | `deuda` |
| `due_date` | 963 | RENOMBRAR | `vencimiento` |
| `notification` | 796 | RENOMBRAR | `notificacion` |
| `invoice_attachment` | 494 | RENOMBRAR | `notificacion_adjunto` (nombre heredado — hoy son adjuntos de notificaciones) |
| `iibb_liquidacion` | 1 | IGUAL | idem (ya en castellano) |

### Sueldos

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `liquidacion_import_empleado` | 241 | PARTIR | `empleado` + `empleado_afiliacion` + `empleado_lsd` |
| `liquidacion_import_recibo` | 175 | RENOMBRAR | `recibo` |
| `liquidacion_import_concepto_valor` | 2.233 | RENOMBRAR | `recibo_concepto` |
| `conceptos_completos_sos` | 233 | FUSIONAR | `concepto` (catálogo global) |
| `concepto_sos` | 37 | FUSIONAR | `concepto` / `cliente_concepto` 🟡 detalle al armar ETL |
| `concepto_sos_client` | 324 | FUSIONAR | `cliente_concepto` |
| `payroll_concepto` | 37 | FUSIONAR | `cliente_concepto` (fórmula/base) |
| `lsd_concepto_afip` | 35 | FUSIONAR | `concepto` / `cliente_concepto` 🟡 detalle al armar ETL |
| `lsd_perfil_concepto` | 349 | FUSIONAR | `cliente_concepto` 🟡 detalle al armar ETL |
| `convenios_de_trabajo` | 10 | FUSIONAR | `convenio` (catálogo global CCT) |
| `payroll_convenio` | 59 | FUSIONAR | `convenio` + relación `cliente_convenio` |
| `afip_empleadores_convenio` | 59 | RENOMBRAR | `cliente_convenio` (relación cliente↔CCT detectada por scraper) |
| `payroll_convenio_categoria` | 1.714 | RENOMBRAR | `convenio_categoria` |
| `payroll_escala` | 6.550 | RENOMBRAR | `escala_salarial` |
| `payroll_convenio_fuente` | 44 | RENOMBRAR | `convenio_fuente` |
| `payroll_lsd_presentacion` | 3 | RENOMBRAR | `lsd_presentacion` |
| `payroll_parametros_periodo` | 6 | RENOMBRAR | `parametros_periodo` |
| `empleados_categorias` | 54 | FUSIONAR | columna/relación en `empleado` 🟡 (hoy fuera de schema.ts, la manejan scripts) |
| catálogos `payroll_*` (situacion, condicion, modalidad_contratacion, actividad, zona, provincia, localidad, nacionalidad, siniestrado, tipo_empresa) | ~900 | RENOMBRAR | sin prefijo `payroll_`, forma uniforme `(id, codigo, descripcion, vigente)` |
| `obra_social` | 563 | IGUAL | idem |

### Contabilidad (bajo riesgo — solo renombres + origen tipado)

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `fiscal_year` | 0 | RENOMBRAR | `ejercicio` |
| `accounting_period` | 0 | RENOMBRAR | `periodo_contable` |
| `accounting_account` | 133 | RENOMBRAR | `cuenta` (+ `cliente_cuenta` para overrides) |
| `journal_entry` / `journal_entry_line` | 0 | REDISEÑAR | `asiento` / `asiento_linea` con `origen_tipo`+`origen_id` |
| `ledger_mapping_rule` / `_line` | 0 | RENOMBRAR | `regla_mapeo` / `regla_mapeo_linea` |
| `financial_statement` | 0 | RENOMBRAR | `eecc` |
| `cmv_annex` | 0 | RENOMBRAR | `anexo_cmv` |
| `fixed_asset` | 0 | RENOMBRAR | `bien_de_uso` |
| `accountant_signature` | 0 | REDISEÑAR | `firmante` (N por estudio, `firma_imagen_key` en R2) + `cliente_eecc_config.firmante_id` |
| `movements` | 0 | DESAPARECE | asiento manual (`origen_tipo='manual'`) |
| `account_override` | 0 | DESAPARECE | lo cubre `cliente_cuenta` |
| `accounting_log` | 0 | DESAPARECE | lo cubre `evento` |
| `representative_balance_config` | 0 | DESAPARECE | contenido a `cliente_eecc_config` |

### Bancos

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `bank_account` | 0 | RENOMBRAR | `cuenta_bancaria` (cuelga de `cliente`, no de representative) |
| `bank_transaction` | 0 | RENOMBRAR | `movimiento_bancario` |
| `bank_invoice_match` | 0 | RENOMBRAR | `conciliacion_comprobante` |

### Portal / gestión

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `document` | 531 | RENOMBRAR | `documento` |
| `alert` | 207 | RENOMBRAR | `alerta` |
| `representative_request` | 0 | RENOMBRAR | `solicitud` (por cliente) |
| `representative_user_access` | 0 | REDISEÑAR | `acceso_usuario_cliente` (granularidad cliente) |
| `client_risk_snapshot` | 0 | RENOMBRAR | `riesgo_snapshot` |
| `tax_projection` | 0 | RENOMBRAR | `proyeccion_impuesto` |

### Agentes / IA + Infra

| Actual | Filas | Acción | Destino |
|---|---|---|---|
| `agent_conversation` / `agent_message` | 59 / 205 | IGUAL | idem |
| `agent_run` | 0 | IGUAL | idem (+ lo referencian los datos `fuente='ai'`) |
| — | — | NUEVA | `agent_action` (IA propone → humano aprueba → ejecuta) |
| `data_source_event` | 0 | REDISEÑAR | `evento` (trail generalizado) |
| `job` | 17.743 | REDISEÑAR | `job.representative_id` → `credencial_id`; + `cliente_id` opcional |
| `job_log` | 97.470 | IGUAL | idem |
| `organization_module` | 2 | IGUAL | idem |

---

## 2. Nivel columna — Dominio 1 (el corazón del ETL)

### `representative` (18 cols) → `credencial_afip`

| Columna actual | Destino |
|---|---|
| id | `credencial_afip.id` (se conserva el uuid — las FKs de `job` no se rompen) |
| organization_id | org_id |
| cuit | cuit |
| afip_password | clave |
| name / email / phone | nombre / email / telefono (contacto opcional) |
| status | estado (`active` → `activa`) |
| user_id | DESCARTAR ("quién lo creó" — si interesa, es un `evento`) |
| address / image | DESCARTAR (sin uso real) |
| convenio_multilateral / regimen_local / fiscal_condition / liquida_sueldos | DESCARTAR — duplicados del cliente. Si existe `cliente` con mismo CUIT, la verdad ya vive ahí; el ETL verifica que no haya divergencias antes de descartar |
| registered_at / created_at / updated_at | created_at conserva el más viejo; verificada_at = null inicial |

### `client` (37 cols) → `cliente` + satélites

**→ `cliente` (delgado):**

| Columna actual | Destino |
|---|---|
| id | `cliente.id` (se conserva el uuid — TODAS las FKs hijas sobreviven sin tocar) |
| organization_id | org_id |
| name | razon_social |
| identity_number | cuit |
| identity_type | DESCARTAR (siempre CUIT; validar en ETL) |
| profile_type | tipo_persona (`unknown` → derivar del prefijo CUIT: 20/23/24/27 física, 30/33/34 jurídica) |
| fiscal_condition | condicion_iva |
| status | estado (`active` → `activo`) |
| disabled_at / disabled_reason | baja_at / baja_motivo |
| address / phone / email | domicilio / telefono / email |
| managed_by_study | 🟡 revisar uso real: ¿equivale a estado `pausado`? |
| scraped_at | DESCARTAR (operativo — vive en job/evento) |

**→ `cliente_credencial` (fila nueva por cada client con representante):**

| Columna actual | Destino |
|---|---|
| representative_id | credencial_id |
| afip_contribuyente_id | afip_contribuyente_id |
| — | fuente = `'discovery'`, preferida = true |

**→ `cliente_empleador_config` (solo si liquida_sueldos o tiene datos payroll):**

liquida_sueldos (la existencia de la fila ES el flag), usa_lsd_referencia,
firma_digital_empleador (base64 → subir a R2, guardar key), payroll_plantilla_empleado_id,
tipo_empresa_id, seguro_colectivo, mipyme, orden_cln, situacion_default_id,
condicion_default_id, actividad_default_id, contratacion_default_id (→ modalidad_default_id),
siniestrado_default_id, zona_default_id, obra_social_default_id.

**→ `cliente_eecc_config` (solo si tiene datos EECC):**

actividad_principal, fecha_inscripcion (→ fecha_inscripcion_rpc), numero_inscripcion
(→ numero_igj), + firmante_id (desde la ex accountant_signature del org).

---

## 3. Transformaciones de datos del ETL (reglas globales)

1. **IDs se conservan** en renombres y particiones (la PK vieja = PK nueva) → las FKs
   hijas migran sin remapeo.
2. `direction` `Inbound`/`Outbound` → `direccion` `recibido`/`emitido` (lower + traducir).
3. Períodos: usar las columnas `date` generadas en F2.3 (ya validadas al 100%); los text
   mueren.
4. `invoice` → `comprobante_alicuota`: una fila por cada par (neto, iva) distinto de 0 de
   las 10 columnas fijas. Verificación: `sum(alicuotas) = totales cabecera` por comprobante.
5. `comprobante_tipo`: seed manual con la tabla oficial AFIP (incluye tipos hoy ignorados:
   11, 13, 19, 9, 15, 21).
6. Imágenes base64 en BD (`firma_digital_empleador`, `firma_imagen`) → archivos en R2,
   columna pasa a ser la key.
7. Montos text → `numeric(15,2)`; cotización → `numeric(15,4)`.
8. Enums: crear tipo + mapear valores libres actuales; el ETL falla ruidosamente ante un
   valor no mapeado (nada de defaults silenciosos).
9. Todo lo migrado lleva `fuente` según su origen conocido (scraper/manual/import);
   trazabilidad AI-first desde el día 1.

## 4. Pendientes de detalle (se bajan a columna al escribir cada ETL)

- 🟡 Fusión de conceptos sueldos (5 tablas → 2): requiere sentarse con los datos reales
  (solapamientos de códigos entre concepto_sos / conceptos_completos_sos / lsd_*).
- 🟡 `empleados_categorias` (fuera de schema.ts): decidir si es FK en `empleado` o tabla.
- 🟡 `managed_by_study`: ¿muere, o es el estado `pausado`?
- 🟡 Columnas restantes de `liquidacion_import_empleado` (53) y `_recibo` (43): mapa
  detallado al armar el ETL de sueldos.
- 🟡 `job` histórico (17.7k) y `job_log` (97k): ¿migran completos o solo últimos N meses?
