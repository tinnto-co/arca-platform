-- ============================================================================
-- BD_IDEAL — El scrapper: rol propio, permisos mínimos, mismo aislamiento por org
-- Se aplica después de schema-rls.sql (necesita las políticas `tenant` ya creadas).
--
-- El scrapper (../arca-scrapper) escribe datos de AFIP: comprobantes, IVA, deudas,
-- vencimientos, notificaciones y sus adjuntos, más su propia infraestructura de
-- jobs y alertas. No lee sueldos, ni contabilidad, ni bancos, ni auth.
--
-- Se le da un rol propio (no reusa arca_app) por dos razones:
--   1. Superficie: lo que no está enumerado abajo da `permission denied`, así que
--      un bug del scrapper no puede tocar un recibo de sueldo.
--   2. Diagnóstico: en pg_stat_activity se ve quién está escribiendo.
--
-- El aislamiento por organización es EL MISMO que el de la app: `set local
-- app.org_id` (acá, como parámetro de arranque de la conexión: un pool por org).
-- Por eso este archivo no crea políticas nuevas de org — SUMA el rol a las que ya
-- existen. Crear una política paralela sería un error grave: las políticas
-- permisivas se combinan con OR, así que una `using (true)` le abriría todo el
-- estudio a cualquier rol (lección aprendida en schema-rls-portal.sql).
-- ============================================================================

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'arca_scrapper') then
    create role arca_scrapper login password 'arca_local';
  end if;
end
$do$;

grant usage on schema public to arca_scrapper;

-- ---------- lo que el scrapper ESCRIBE ----------
grant select, insert, update, delete on
  comprobante, comprobante_alicuota,   -- comprobantes + su desglose por alícuota
  iva_declaracion,                     -- F2051
  deuda, vencimiento,                  -- CCMA y calendario de AFIP
  notificacion, notificacion_adjunto,  -- e-Ventanilla
  documento,                           -- adjuntos (el binario va a R2)
  contraparte,                         -- catálogo global: el sujeto del otro lado
  job, job_log, alerta,                -- su propia infraestructura
  evento                               -- discovery: CUITs vistos que no son cliente
to arca_scrapper;

-- ---------- lo que el scrapper TOCA con pinzas (columna por columna) ----------
-- De la credencial solo puede completar el contacto y marcar el último login OK.
-- La clave fiscal (columna `clave`) es de solo lectura para él: la escribe la app.
grant select on credencial_afip to arca_scrapper;
grant update (nombre, email, telefono, estado, ultimo_login_ok) on credencial_afip to arca_scrapper;

-- Del vínculo cliente↔credencial solo cachea el índice posicional de AFIP.
-- No puede crear vínculos: un CUIT desconocido va a `evento`, nunca a una fila acá.
grant select on cliente_credencial to arca_scrapper;
grant update (afip_contribuyente_id) on cliente_credencial to arca_scrapper;

-- De las escalas salariales solo agrega/pisa el básico de convenio. Las categorías
-- y los convenios los arma el estudio: el scrapper los lee para saber a quién aplicar.
grant select, insert, update on escala_salarial to arca_scrapper;
-- El tope imponible SIPA lo trae un job mensual (decisión D17, 11/08): upsert
-- sobre parametro_periodo. Sin este grant el job muere con permission denied.
grant select, insert, update on parametro_periodo to arca_scrapper;
grant select on convenio, convenio_categoria to arca_scrapper;
grant select on cct to arca_scrapper;
grant update (ultimo_intento_at, ultimo_ok_at, ultimo_error) on cct_fuente to arca_scrapper;

-- ---------- lo que el scrapper solo LEE ----------
grant select on cliente, organization, comprobante_tipo, cct_fuente to arca_scrapper;

-- Ninguna de las tablas de arriba usa secuencias hoy (todas las PK son uuid), pero
-- el grant evita un fallo silencioso si mañana alguna las usa.
grant usage, select on all sequences in schema public to arca_scrapper;

-- ============================================================================
-- Políticas: el scrapper entra por la MISMA puerta que la app
-- ============================================================================
-- Solo las tablas que puede tocar. Las demás quedan sin política para este rol
-- (y además sin grant): doble cierre.
do $do$
declare t text;
begin
  foreach t in array array[
    -- org_id propio
    'alerta','cliente','comprobante','credencial_afip','deuda','documento',
    'evento','job','notificacion','vencimiento',
    -- org vía cliente
    'cliente_credencial','iva_declaracion',
    -- hijas, heredan del padre
    'comprobante_alicuota','job_log','notificacion_adjunto',
    -- escalas salariales: convenio tiene org_id, categoria y escala cuelgan de él
    'convenio','convenio_categoria','escala_salarial'
  ] loop
    execute format('alter policy tenant on %I to arca_app, arca_agent, arca_scrapper', t);
  end loop;
end
$do$;

-- `contraparte`, `cct` y `cct_fuente` no tienen RLS (catálogos globales, ver
-- schema-rls.sql): con el grant alcanza.

-- ---------- arranque del job ----------
-- Huevo y gallina: el worker recibe un credencialId y necesita leer esa credencial
-- (org, cuit, clave) para SABER de qué organización es y recién ahí abrir el pool
-- con app.org_id. Se le da una segunda vía, tan angosta como se puede: puede leer
-- UNA credencial, la que declare en `app.credencial_id`, y solo leerla.
-- El uuid ya es inequívoco; no hace falta el org para identificarla.
-- Sin ese set, current_setting devuelve null y no ve ninguna.
-- (drop previo: este archivo se puede re-aplicar solo, sin recrear el schema)
drop policy if exists scrapper_bootstrap on credencial_afip;
create policy scrapper_bootstrap on credencial_afip for select to arca_scrapper
  using (id = current_setting('app.credencial_id', true)::uuid);

comment on policy scrapper_bootstrap on credencial_afip is
  'Única lectura del scrapper sin app.org_id, y por eso está acotada a una sola fila: el worker resuelve la organización del job leyendo su credencial. Todo lo demás que hace pasa por la política tenant.';
