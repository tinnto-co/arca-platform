-- ============================================================================
-- BD_IDEAL — Portal del cliente: aislamiento por CLIENTE (RLS, segundo eje)
-- Se aplica después de schema-rls.sql (necesita los roles y las tablas).
--
-- El problema que resuelve: un usuario del portal se loguea y su sesión pertenece
-- a la organización del ESTUDIO. Con el solo `app.org_id` vería los 97 clientes.
-- El portal filtra por otra coordenada:
--
--   set local app.cliente_id = '<cliente al que ese usuario tiene acceso>'
--
-- `app.org_id` NO hace falta acá: cliente_id es un uuid, ya identifica al cliente
-- sin ambigüedad, y filtrar además por org sería redundante.
--
-- Quién resuelve ese valor: la app, ANTES de abrir esta transacción, leyendo
-- `acceso_usuario_cliente` con el pool de arca_app. Por eso esa tabla no está en
-- la lista de abajo: el portal nunca la consulta por sí mismo, y por lo tanto no
-- puede llegar a un cliente que no le fue asignado.
--
-- REGLA DE ORO de este archivo: acá se enumera, tabla por tabla, TODO lo que un
-- cliente puede ver de sí mismo. Lo que no está enumerado no se ve — no porque
-- alguien se acordó de filtrarlo, sino porque no existe el permiso. Agregar una
-- tabla al portal es un acto explícito y revisable en un diff.
-- Así, `credencial_afip` (la clave fiscal), `job`, `evento`, `alerta`, `firmante`,
-- `cliente_credencial` y la contabilidad interna del estudio son invisibles por
-- construcción.
--
-- Los flags de `acceso_usuario_cliente` (puede_ver_iva, puede_ver_sueldos…) son
-- una capa de PRODUCTO encima de esto: deciden qué se muestra en la UI. El piso
-- duro lo pone este archivo. Si falla un flag, el cliente ve un menú de más; si
-- fallara el RLS, vería otra empresa. Son riesgos de distinto orden y por eso
-- viven en capas distintas.
-- ============================================================================

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'arca_portal') then
    create role arca_portal login password 'arca_local';
  end if;
end
$do$;

grant usage on schema public to arca_portal;

-- ---------- lo que el cliente puede LEER de sí mismo ----------
grant select on
  cliente,
  deuda, vencimiento, notificacion, notificacion_adjunto,
  documento, solicitud,
  comprobante, comprobante_alicuota, iva_declaracion,
  empleado, recibo, recibo_concepto
to arca_portal;

-- catálogos globales necesarios para que esas filas signifiquen algo
-- (el nombre del proveedor, el tipo de comprobante, el concepto del recibo)
grant select on contraparte, comprobante_tipo, concepto, provincia to arca_portal;

-- ---------- lo único que el cliente puede ESCRIBIR ----------
-- Sube un archivo cuando el estudio se lo pide, y marca la solicitud completada.
grant insert on documento to arca_portal;
grant update on solicitud to arca_portal;

-- ============================================================================
-- Políticas
-- ============================================================================

-- ---------- la fila apunta al cliente directamente ----------
-- Ojo con deuda/vencimiento/notificacion/documento: su cliente_id es NULLABLE
-- (son las filas que AFIP devuelve por el CUIT del login y no corresponden a
-- ningún cliente). `cliente_id = <x>` con null da null, no true: quedan fuera
-- del portal solas, que es exactamente lo que queremos.
do $do$
declare t text;
begin
  foreach t in array array[
    'deuda','vencimiento','notificacion','documento','solicitud',
    'comprobante','iva_declaracion','empleado','recibo'
  ] loop
    execute format(
      $f$create policy portal on %I to arca_portal
           using (cliente_id = current_setting('app.cliente_id', true)::uuid)
           with check (cliente_id = current_setting('app.cliente_id', true)::uuid)$f$, t);
  end loop;
end
$do$;

-- el cliente se ve a sí mismo, y a nadie más
create policy portal on cliente to arca_portal
  using (id = current_setting('app.cliente_id', true)::uuid);

-- ---------- hijas: heredan del padre ya filtrado ----------
do $do$
declare r record;
begin
  for r in select * from (values
    ('notificacion_adjunto', 'notificacion_id', 'notificacion'),
    ('comprobante_alicuota', 'comprobante_id',  'comprobante'),
    ('recibo_concepto',      'recibo_id',       'recibo')
  ) v(t, col, padre) loop
    execute format(
      $f$create policy portal on %I to arca_portal
           using (exists (select 1 from %I p
                          where p.id = %I.%I
                            and p.cliente_id = current_setting('app.cliente_id', true)::uuid))$f$,
      r.t, r.padre, r.t, r.col);
  end loop;
end
$do$;

-- ---------- catálogos globales: visibles enteros, como para todos ----------
-- No tienen RLS (ver schema-rls.sql); el grant de arriba alcanza.

-- ---------- arranque de la sesión del portal ----------
-- Huevo y gallina: la app necesita leer esta tabla para saber qué cliente ve el
-- usuario, pero un usuario del portal no tiene organización activa, así que la
-- política de org (schema-rls.sql) le da cero filas. Se agrega una segunda vía
-- para arca_app: con `set local app.user_id`, cada quien ve SOLO sus propias
-- filas de acceso. Las políticas permisivas se suman con OR, así que esto no le
-- saca nada a la política por organización.
create policy portal_bootstrap on acceso_usuario_cliente to arca_app
  using (user_id = current_setting('app.user_id', true));

comment on table acceso_usuario_cliente is
  'Qué cliente ve un usuario del portal y qué puede hacer. Granularidad cliente (no login de AFIP): un login puede tener varias empresas y no siempre las maneja la misma persona. La app la lee con el rol arca_app al armar la sesión del portal, y de ahí sale el `app.cliente_id` que se setea en la transacción; el rol arca_portal NO tiene permiso sobre esta tabla — no puede descubrir a qué otros clientes accede nadie.';
