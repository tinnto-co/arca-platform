-- ============================================================================
-- BD_IDEAL — Aislamiento por organización (RLS)
-- Se aplica DESPUÉS de los 7 dominios: necesita todas las tablas creadas.
--
-- Modelo: la conexión declara de qué org es con `set local app.org_id = '<id>'`
-- dentro de la transacción, y Postgres filtra. Si NADIE lo setea,
-- current_setting(...,true) devuelve null y ninguna política da true:
-- se ven CERO filas. Falla cerrado, nunca abierto.
--
-- Quién queda sujeto a RLS:
--   arca_app    — la app (lectura/escritura). No es dueña de las tablas → aplica.
--   arca_agent  — el agente de IA (solo lectura). Idem.
--   arca        — dueño/superusuario: la BYPASSEA. Es el rol de los ETL y las
--                 migraciones, que por definición cruzan organizaciones.
-- Por eso el DATABASE_URL de la app NO debe volver a ser el de `arca`.
--
-- Las políticas de acá son `to arca_app, arca_agent` y NO `to public` a propósito:
-- las políticas permisivas se SUMAN con OR, así que una política de org abierta a
-- todos los roles le daría al portal (arca_portal, ver schema-rls-portal.sql) acceso
-- a todos los clientes del estudio. Cada rol declara lo suyo; un rol sin política
-- para una tabla no ve nada. Fail-closed también acá.
--
-- El scrapper entra por estas mismas políticas: schema-rls-scrapper.sql se suma a
-- la lista de roles de `tenant` (alter policy) en las 15 tablas que puede tocar.
-- ============================================================================

-- ---------- roles (sobreviven al drop schema; creación idempotente) ----------
-- La contraseña de acá es SOLO para el docker local. En prod se setea con
-- `alter role ... password '...'` fuera del repo.
do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'arca_app') then
    create role arca_app login password 'arca_local';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'arca_agent') then
    create role arca_agent login password 'arca_local';
  end if;
end
$do$;

grant usage on schema public to arca_app, arca_agent;
grant select, insert, update, delete on all tables in schema public to arca_app;
grant usage, select on all sequences in schema public to arca_app;
grant select on all tables in schema public to arca_agent;

-- ============================================================================
-- Políticas
-- ============================================================================

-- ---------- Nivel 1: la fila tiene org_id propio (31 tablas) ----------
do $do$
declare t text;
begin
  foreach t in array array[
    'agent_action','agent_conversation','agent_run','alerta','anexo_cmv','asiento',
    'bien_de_uso','cliente','cliente_cct','cliente_concepto','comprobante','convenio',
    'credencial_afip','cuenta','cuenta_bancaria','deuda','documento','eecc','ejercicio',
    'empleado','evento','firmante','job','liquidacion_iibb','lsd_presentacion',
    'notificacion','organization_module','recibo','regla_mapeo','solicitud','vencimiento'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      $f$create policy tenant on %I to arca_app, arca_agent
           using (org_id = current_setting('app.org_id', true))
           with check (org_id = current_setting('app.org_id', true))$f$, t);
  end loop;
end
$do$;

-- ---------- Nivel 2: la org se resuelve por el cliente (9 tablas) ----------
do $do$
declare t text;
begin
  foreach t in array array[
    'acceso_usuario_cliente','cliente_credencial','cliente_cuenta','cliente_eecc_config',
    'cliente_empleador_config','iva_declaracion','periodo_contable','proyeccion_impuesto',
    'riesgo_snapshot'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      $f$create policy tenant on %I to arca_app, arca_agent
           using (exists (select 1 from cliente c
                          where c.id = %I.cliente_id
                            and c.org_id = current_setting('app.org_id', true)))
           with check (exists (select 1 from cliente c
                          where c.id = %I.cliente_id
                            and c.org_id = current_setting('app.org_id', true)))$f$,
      t, t, t);
  end loop;
end
$do$;

-- ---------- Nivel 3: hijas — heredan del padre (12 tablas) ----------
-- Todas las FK de acá son NOT NULL, así que no hay filas huérfanas que se
-- escapen del filtro.
do $do$
declare r record;
begin
  for r in select * from (values
    ('agent_message',            'conversation_id',        'agent_conversation'),
    ('asiento_linea',            'asiento_id',             'asiento'),
    ('comprobante_alicuota',     'comprobante_id',         'comprobante'),
    ('conciliacion_comprobante', 'comprobante_id',         'comprobante'),
    ('convenio_categoria',       'convenio_id',            'convenio'),
    ('convenio_fuente',          'convenio_id',            'convenio'),
    ('job_log',                  'job_id',                 'job'),
    ('movimiento_bancario',      'cuenta_bancaria_id',     'cuenta_bancaria'),
    ('notificacion_adjunto',     'documento_id',           'documento'),
    ('recibo_concepto',          'recibo_id',              'recibo'),
    ('regla_mapeo_linea',        'regla_id',               'regla_mapeo')
  ) v(t, col, padre) loop
    execute format('alter table %I enable row level security', r.t);
    execute format(
      $f$create policy tenant on %I to arca_app, arca_agent
           using (exists (select 1 from %I p
                          where p.id = %I.%I
                            and p.org_id = current_setting('app.org_id', true)))
           with check (exists (select 1 from %I p
                          where p.id = %I.%I
                            and p.org_id = current_setting('app.org_id', true)))$f$,
      r.t, r.padre, r.t, r.col, r.padre, r.t, r.col);
  end loop;
end
$do$;

-- escala_salarial está a dos saltos: categoria → convenio → org
alter table escala_salarial enable row level security;
create policy tenant on escala_salarial to arca_app, arca_agent
  using (exists (select 1 from convenio_categoria cc
                 join convenio cv on cv.id = cc.convenio_id
                 where cc.id = escala_salarial.categoria_id
                   and cv.org_id = current_setting('app.org_id', true)))
  with check (exists (select 1 from convenio_categoria cc
                 join convenio cv on cv.id = cc.convenio_id
                 where cc.id = escala_salarial.categoria_id
                   and cv.org_id = current_setting('app.org_id', true)));

-- ============================================================================
-- Sin política, A PROPÓSITO
-- ============================================================================
-- Catálogos globales (19): actividad, base_calculo, base_calculo_concepto,
--   cct, comprobante_tipo, concepto, concepto_afip, condicion_trabajador,
--   contraparte, localidad, modalidad_contratacion, nacionalidad, obra_social,
--   parametro_periodo, provincia, siniestrado, situacion_revista, tipo_empresa, zona.
--   Son códigos AFIP y sujetos vistos en comprobantes: no pertenecen a nadie.
--   contraparte es el caso deliberado — dos estudios que le facturan al mismo
--   proveedor comparten la fila, y eso está bien: no revela nada del otro
--   estudio (quién le factura a quién vive en comprobante, que sí está aislado).
--
-- Auth (7): user, account, session, verification, member, invitation,
--   organization. Better Auth necesita leerlas ANTES de que exista un org_id
--   de sesión (en el login todavía no sabemos la org). El aislamiento acá lo
--   hace Better Auth, no Postgres.
--
-- Total: 52 tablas con política, 26 sin.

comment on schema public is
  'BD_IDEAL. Aislamiento multi-tenant por RLS: toda conexión de app/agente debe abrir transacción y hacer `set local app.org_id = ''<org>''` antes de consultar; sin eso se ven cero filas. Ver schema-rls.sql. Los catálogos globales y las tablas de auth están exentas a propósito.';
