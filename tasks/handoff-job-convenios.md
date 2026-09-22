# Handoff → scrapper: convertir el scrapeo de convenios en un job

## El problema que se ve en la app

El estudio da de alta una empresa, le carga los empleados, entra a **Sueldos →
Convenios → "Seleccionar convenio"** y el diálogo dice *"Todavía no se trajeron
convenios de ARCA para este cliente"*. No hay forma de que se traigan: la app
lee `cliente_cct` y nada la llena.

Las 80 filas que hay en `cliente_cct` (staging) se crearon **todas entre el
2026-03-20 y el 2026-04-01**, en una corrida manual. Toda empresa dada de alta
después quedó sin CCT.

**Alcance hoy**: de 34 empresas con empleados cargados, **12 no tienen ningún
CCT de ARCA**. Las más grandes: Ngvs (51 empleados), BESOROT TOVOT (10), Smart
Solution (4), Toloki SA (3, la que reportó el estudio), Momel (3), SELEM DAVID
(3).

## Lo que ya existe y hay que reusar

`src/scripts/run-convenios-simplificacion-empleadores-all-profiles.ts` en ese
repo ya resuelve **la parte difícil**: login, entrar a
`MiSimplificacion/app/Contribuyente/DatosBasicos.aspx`, manejar el selector
`select#ddlCUIT` + `input#btnAceptar`, seguir el link
`a#ctl00_ContentPlaceHolder1_lnkConvenios` y extraer, por fila, **CCT,
actividad, signatarios y fecha de novedad**. De ahí salió la carga de marzo.

Dos cosas lo dejaron inservible hoy:

1. **No es un job**: no está en el enum `job_type`, no tiene processor ni cron.
   Alguien lo corría a mano.
2. **Está escrito contra el esquema viejo**: usa `client`, `representative` y
   `afipEmpleadoresConvenio`. Hoy esas tablas son `cliente`, `credencial_afip`
   y `cliente_cct`.

## Lo que pedimos

Un job `convenios` que, dada una credencial, recorra sus empresas y haga
upsert en `cliente_cct`.

### Destino: `cliente_cct`

```
id            uuid pk
cliente_id    uuid  → cliente(id)
org_id        text  → organization(id)      ← multi-tenant, no olvidarlo
cct_codigo    text                          ← el CCT tal como lo muestra ARCA
actividad     text
signatarios   text
fecha_novedad text
created_at / updated_at
```

Idempotente por `(cliente_id, cct_codigo)`: si existe, actualizar actividad,
signatarios, fecha_novedad y `updated_at`; si no, insertar. Es lo que ya hace
el script, solo cambia la tabla.

### Delegación: el estado que falta

El servicio es **"Simplificación Registral - Empleadores"**. Como con Mis
Comprobantes y Cuentas Tributarias, si el estudio no lo tiene delegado la
navegación no llega a ninguna parte, y hoy eso se vería como "no hay
convenios" en vez de "falta la delegación".

Cuando la empresa no aparezca en `ddlCUIT` (o el link de Convenios no exista),
escribir en `cliente_credencial.delegaciones_afip` la clave
**`simplificacion_empleadores`** con la forma que ya usamos:

```json
{ "simplificacion_empleadores": { "estado": "sin_delegacion", "at": "<iso>" } }
```

y `{"estado": "ok", "at": ...}` cuando sí se pudo leer. Del lado de la app ya
hay badges y franja de aviso que leen ese jsonb: agregar la clave alcanza para
que el caso se vea solo.

### Enum

`job_type += 'convenios'`. **El ALTER lo aplicamos nosotros** (arca-platform es
dueño del schema, `schema-dominio*.sql` + migración idempotente), igual que con
`libro_iva`. Avisamos cuando esté aplicado en staging; mientras, el processor
puede quedar detrás del enum sin despacharse.

### Cron

Semanal alcanza: los CCT cambian poco y la tabla tiene `fecha_novedad` para
detectar novedades. Junto a `escalas` (lunes 05:00 AR) está bien. El disparo
puntual lo hace la app (ver abajo).

## Lo que hacemos nosotros (arca-platform)

- `job_type += 'convenios'` en `schema-dominio*.sql` + migración idempotente
  aplicada en staging.
- Despacho del job desde tres lugares: cuando la empresa queda vinculada a una
  credencial, cuando tiene empleados y ningún CCT, y a pedido desde el diálogo
  "Seleccionar convenio" (botón **"Buscar en ARCA"**), que sigue el job por
  `getJobs()` como el resto de la app.
- Estados honestos en ese diálogo: sin delegación (con el aviso que ya
  tenemos), scraping en pausa, y "ARCA no informa convenios para esta empresa"
  cuando el job terminó bien y no trajo filas — que no es lo mismo que "todavía
  no se trajeron".
- La carga manual (`Nuevo convenio`) se queda como salida siempre.

## Por qué no se dispara en el alta de la empresa

Porque al crearla todavía no tiene credencial de ARCA asociada ni delegación:
el job fallaría siempre y el estudio vería un error en cada alta. El momento
útil es cuando ya hay credencial, o cuando el estudio pide los convenios.

## Para probar

- **Toloki SA** (CUIT 30716787407, cliente `70da78a9-ce14-4b63-b81a-db2b2aac0f14`):
  3 empleados, 0 CCT, es el caso que reportó el estudio.
- **Ngvs**: 51 empleados, 0 CCT — el de mayor impacto.
- Una de las 69 empresas que sí tienen CCT, para confirmar que el upsert no
  duplica lo cargado en marzo.
