-- ============================================================================
-- BD_IDEAL — Dominio 3: Sueldos (tasks/modelo-ideal-db.md §6)
-- Depende de schema-dominio1.sql (cliente) y schema-dominio2.sql (dato_fuente).
-- ============================================================================

create type concepto_tipo as enum ('remunerativo', 'no_remunerativo', 'descuento', 'retencion');

-- Cómo se determina el importe de un concepto en el recibo.
-- Reemplaza el enum de SOS (concepto_base_columna: 'sub1_199', 'valHora',
-- 'os_base'...) donde las bases eran rangos de la numeración SOS.
create type concepto_modo_calculo as enum (
  'importe_manual',          -- lo carga el usuario, no se calcula (ex importe_fijo)
  'pct_sobre_base',          -- porcentaje sobre una base_calculo (requiere base_calculo_id)
  'pct_sobre_concepto',      -- porcentaje sobre otra línea del recibo (recibo_concepto.concepto_ref)
  'sueldo_basico',           -- el sueldo mensual de la escala/legajo (ex sueldo/sueldoLegajo)
  'valor_hora',              -- valor hora del empleado × cantidad de horas (ex valHora)
  'sac',                     -- mejor remuneración del semestre / 2 (ex sac_normal)
  'sac_proporcional',        -- ídem, proporcional a los meses trabajados del semestre
  'dia_vacaciones',          -- bruto del mes anterior / 25 × días (ex bruto_anterior_div25)
  'promedio_anual_concepto'  -- concepto de referencia / 12 (ex concepto_401_div12)
);

create type tipo_jornada as enum ('full_time', 'part_time', 'reducida');
create type sexo as enum ('masculino', 'femenino');
create type forma_pago as enum ('efectivo', 'deposito', 'transferencia', 'cheque');
-- Los 5 primeros son los únicos presentes en los datos migrados; los 4 últimos
-- ya los ofrece la app al liquidar (anticipo, comisiones, fondo de desempleo, varios).
create type recibo_tipo as enum (
  'mensual', 'quincenal', 'sac', 'liquidacion_final', 'vacaciones',
  'anticipo', 'comisiones', 'fondo_desempleo', 'otros'
);

-- ============================================================================
-- CATÁLOGOS LSD/AFIP (globales, sin dueño: los códigos los publica AFIP)
-- Forma uniforme a propósito: (codigo, nombre, codigo_sos). Un agente que
-- aprende a leer uno los lee todos.
-- ============================================================================

create table situacion_revista (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table situacion_revista is
  'Situación de revista del trabajador en el período (códigos AFIP de 2 dígitos "01".."51"). Un recibo puede declarar hasta 3 con su día de inicio.';
comment on column situacion_revista.codigo_sos is
  'Código equivalente en el sistema SOS, del que se importaron los legajos. Null = no tiene equivalencia conocida.';

create table condicion_trabajador (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table condicion_trabajador is 'Condición del trabajador para AFIP (códigos "00".."14"): jubilado, menor, etc.';

create table modalidad_contratacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table modalidad_contratacion is 'Modalidad de contratación AFIP (códigos "001".."998"): tiempo indeterminado, plazo fijo, etc.';

create table actividad (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table actividad is 'Actividad económica del trabajador según AFIP (códigos "000".."921").';

create table zona (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table zona is
  'Zona geográfica con reducción de contribuciones. El nombre incluye la vigencia y el porcentaje porque AFIP versiona la zona por período (ej. "20 - 1994/07-1995/02 - Corrientes (60 %)").';

create table provincia (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table localidad (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nacionalidad (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table siniestrado (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table siniestrado is 'Tipo de siniestro ART declarado en el período (códigos "00".."13"). "00" = no incapacitado.';

create table tipo_empresa (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column tipo_empresa.codigo is 'Código de tipo de empresa del archivo LSD (1 dígito).';

create table obra_social (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  codigo_sos text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table obra_social is 'Padrón de obras sociales (RNOS). El código es el número de 6 dígitos que se declara en F931/LSD.';

-- ============================================================================
-- CONCEPTOS
-- ============================================================================

create table concepto_afip (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[0-9]{6}$'),
  codigo_hasta text check (codigo_hasta ~ '^[0-9]{6}$'),
  tipo concepto_tipo not null check (tipo <> 'retencion'),
  descripcion text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (codigo_hasta is null or codigo_hasta > codigo)
);
comment on table concepto_afip is
  'Grilla oficial de conceptos del Libro de Sueldos Digital. Base: "Detalle de conceptos de sueldo ARCA" (afip.gob.ar/librodesueldosdigital/documentos/nuevos/LSDetalleConceptos.pdf). CUIDADO: ese PDF NO es exhaustivo ni se actualiza con cada norma — ARCA estrena códigos en las Guías numeradas y recién después (o nunca) los agrega al detalle. Caso comprobado: 181000 (Ley 27.802 / PER) existe desde la Guía Nº 58 y no figura en el detalle. Regla: un código que no está acá no se corrige ni se inventa, se busca en las Guías antes de tocar nada. La escribe este archivo, nunca el ETL.';
comment on column concepto_afip.codigo is
  'Código de 6 dígitos. Sin letras ni sufijos: SOS Contador inventaba variantes tipo "560001B" que AFIP rechaza.';
comment on column concepto_afip.codigo_hasta is
  'Null = código fijo definido por AFIP. Con valor = rango "a ingresar por el contribuyente": AFIP reserva el bloque y el empleador elige el código de adentro (por eso 821000 es válido y no figura en ninguna lista).';
comment on column concepto_afip.tipo is
  'Tipo oficial. AFIP maneja SOLO tres: remunerativo, no_remunerativo y descuento — no distingue retención (Ganancias y cuota sindical son ambos descuento para el LSD). El cuarto valor del enum es nuestro y vive en concepto.tipo, para el recibo impreso; acá está prohibido.';

insert into concepto_afip (codigo, codigo_hasta, tipo, descripcion) values
  ('110000', null, 'remunerativo', 'Sueldo'),
  ('110001', null, 'remunerativo', 'Preaviso'),
  ('110002', null, 'remunerativo', 'Remuneraciones en especie'),
  ('110003', null, 'remunerativo', 'Comida'),
  ('110004', null, 'remunerativo', 'Habitación'),
  ('110005', null, 'remunerativo', 'Licencias por estudio'),
  ('110006', null, 'remunerativo', 'Donación de sangre'),
  ('110007', null, 'remunerativo', 'Feriado'),
  ('110008', null, 'remunerativo', 'Prest. Dineraria Ley 24577 (primeros 10d)'),
  ('110009', null, 'remunerativo', 'Prest. Dineraria Ley 24577 (a cargo de ART)'),
  ('110010', null, 'remunerativo', 'Sueldo - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('110011', null, 'remunerativo', 'Incremento solidario - Dec. 14/2020'),
  ('111000', '119999', 'remunerativo', 'A ingresar por el contribuyente'),
  ('120000', null, 'remunerativo', 'Sueldo anual complementario'),
  ('120001', null, 'remunerativo', 'SAC 1er semestre'),
  ('120002', null, 'remunerativo', 'SAC 2do semestre'),
  ('120003', null, 'remunerativo', 'SAC proporcional'),
  ('120004', null, 'remunerativo', 'SAC - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('121000', '129999', 'remunerativo', 'A ingresar por el contribuyente - SAC uso libre'),
  ('130000', null, 'remunerativo', 'Horas extras'),
  ('130001', null, 'remunerativo', 'Horas extras al 50 %'),
  ('130002', null, 'remunerativo', 'Horas extras al 100 %'),
  ('130003', null, 'remunerativo', 'Horas extras al 200 %'),
  ('130004', null, 'remunerativo', 'Horas extras - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('131000', '139999', 'remunerativo', 'A ingresar por contribuyente - Horas extras - De uso libre'),
  ('140000', null, 'remunerativo', 'Zona desfavorable'),
  ('140001', null, 'remunerativo', 'Zona desfavorable - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('141000', '149999', 'remunerativo', 'A ingresar por el contribuyente - Zona desfavorable - De uso libre'),
  ('150000', null, 'remunerativo', 'Adelanto vacacional'),
  ('150001', null, 'remunerativo', 'Adelanto vacacional - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('151000', '159999', 'remunerativo', 'A ingresar por el contribuyente - Adelanto vacacional - De uso libre'),
  ('160000', null, 'remunerativo', 'Adicionales'),
  ('160001', null, 'remunerativo', 'Adicional por antigüedad'),
  ('160002', null, 'remunerativo', 'Adicional por título'),
  ('160003', null, 'remunerativo', 'Adicional por tarea'),
  ('160004', null, 'remunerativo', 'Adicional por desarraigo'),
  ('160005', null, 'remunerativo', 'Adicionales - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('161000', '169999', 'remunerativo', 'A ingresar por el contribuyente - Adicionales - De uso libre'),
  ('170000', null, 'remunerativo', 'Gratificaciones y/o Premios'),
  ('170001', null, 'remunerativo', 'Premio por presentismo'),
  ('170002', null, 'remunerativo', 'Premio por producción'),
  ('170003', null, 'remunerativo', 'Comisiones'),
  ('170004', null, 'remunerativo', 'Accesorios'),
  ('170005', null, 'remunerativo', 'Viáticos sin comprobante'),
  ('170006', null, 'remunerativo', 'Propinas habituales no prohibidas'),
  ('170007', null, 'remunerativo', 'Gratificaciones y/o Premios - Uso para aplicación RG 2252 - Actividades simultáneas'),
  ('171000', '179999', 'remunerativo', 'A ingresar por el contribuyente - Gratificaciones y/o Premios - De uso libre'),
  ('180000', null, 'remunerativo', 'Rectificativa por remuneración Ley 27.742'),
  -- No figura en LSDetalleConceptos.pdf; sale de la Guía Nº 58 (PER, RG 5862/2026).
  ('181000', null, 'remunerativo', 'Rectificativa por remuneración Ley 27.802'),
  ('499999', null, 'remunerativo', 'Redondeo (Remunerativo)'),
  ('510000', null, 'no_remunerativo', 'Asignaciones Familiares'),
  ('510001', null, 'no_remunerativo', 'Ayuda escolar'),
  ('510002', null, 'no_remunerativo', 'Asignación por hijo/hijo con discapacidad'),
  ('510003', null, 'no_remunerativo', 'Asignación por maternidad'),
  ('510004', null, 'no_remunerativo', 'Asignación por maternidad down'),
  ('510005', null, 'no_remunerativo', 'Asignación por matrimonio'),
  ('510006', null, 'no_remunerativo', 'Asignación por nacimiento / adopción'),
  ('510007', null, 'no_remunerativo', 'Asignación por prenatal'),
  ('511000', '519999', 'no_remunerativo', 'A ingresar por el contribuyente - Asignaciones Familiares - De uso libre'),
  ('520000', null, 'no_remunerativo', 'Beneficios sociales'),
  ('520001', null, 'no_remunerativo', 'Servicio de comedor'),
  ('520002', null, 'no_remunerativo', 'Gastos médicos'),
  ('520003', null, 'no_remunerativo', 'Provisión de ropa de trabajo'),
  ('520004', null, 'no_remunerativo', 'Guardería'),
  ('520005', null, 'no_remunerativo', 'Provisión de útiles escolares'),
  ('520006', null, 'no_remunerativo', 'Gastos de sepelio'),
  ('520007', null, 'no_remunerativo', 'Cursos de capacitación'),
  ('520008', null, 'no_remunerativo', 'Becas (art. 7 Ley 24.241 y modif.)'),
  ('520009', null, 'no_remunerativo', 'Desempleo (art. 7 Ley 24.241 y modif.)'),
  ('520010', null, 'no_remunerativo', 'Gratificación por cese laboral (art. 7 Ley 24.241 y modif.)'),
  ('520011', null, 'no_remunerativo', 'Indemnización por extinción del contrato de trabajo (art. 7 Ley 24.241 y modif.)'),
  ('520012', null, 'no_remunerativo', 'Vacaciones no gozadas (art. 7 Ley 24.241 y modif.)'),
  ('520013', null, 'no_remunerativo', 'Incapacidad permanente (art. 7 Ley 24.241 y modif.)'),
  ('520014', null, 'no_remunerativo', 'Indemnización por despido'),
  ('520015', null, 'no_remunerativo', 'Indemnización sustitutiva del preaviso'),
  ('520016', null, 'no_remunerativo', 'Integración mes de despido'),
  ('520017', null, 'no_remunerativo', 'SAC sobre integración o preaviso'),
  ('520018', null, 'no_remunerativo', 'SAC sobre vacaciones no gozadas'),
  ('521000', '529999', 'no_remunerativo', 'A ingresar por el contribuyente - Beneficios sociales - De uso libre'),
  ('530000', null, 'no_remunerativo', 'Incrementos no remunerativos (con aportes OS)'),
  ('531000', '539999', 'no_remunerativo', 'A ingresar por el contribuyente - Incrementos no remunerativos (con aportes OS) - De uso libre'),
  ('540000', null, 'no_remunerativo', 'Incrementos no remunerativos (con aportes y contribuciones OS)'),
  ('541000', '549999', 'no_remunerativo', 'A ingresar por el contribuyente - Incrementos no remunerativos (con aportes y contribuciones OS) - De uso libre'),
  ('550000', null, 'no_remunerativo', 'Importes no remunerativos especiales'),
  ('551000', '559999', 'no_remunerativo', 'A ingresar por el contribuyente - Importes no remunerativos especiales - De uso libre'),
  ('560000', null, 'no_remunerativo', 'Mensual - PPC y CCT Especiales'),
  ('560001', null, 'no_remunerativo', 'SAC - PPC y CCT Especiales'),
  ('560002', null, 'no_remunerativo', 'SAC Proporcional - PPC y CCT Especiales'),
  ('560003', null, 'no_remunerativo', 'Vacaciones - PPC y CCT Especiales'),
  ('560004', null, 'no_remunerativo', 'Asign. dineraria progr. sociales, educativos o empleo - Dec. 551/2022'),
  ('560005', null, 'no_remunerativo', 'Asign. No remunerativa Dec 841/2022'),
  ('560006', null, 'no_remunerativo', 'Asignación no Remunerativa Dcto 438/2023'),
  ('570000', null, 'no_remunerativo', 'Mensual - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'),
  ('570001', null, 'no_remunerativo', 'SAC - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'),
  ('570002', null, 'no_remunerativo', 'SAC Proporcional - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'),
  ('570003', null, 'no_remunerativo', 'Vacaciones - Remuneración No Contributiva al Régimen Nacional de Seguridad Social'),
  ('799999', null, 'no_remunerativo', 'Redondeo (No Remunerativo)'),
  ('810000', null, 'descuento', 'Sistema previsional'),
  ('810001', null, 'descuento', 'INSSJyP'),
  ('810002', null, 'descuento', 'Obra Social'),
  ('810003', null, 'descuento', 'Fondo Solidario de Redistribución (ex ANSSAL)'),
  ('810004', null, 'descuento', 'Cuota Sindical'),
  ('810005', null, 'descuento', 'Seguro de Vida'),
  ('810006', null, 'descuento', 'RENATEA (ex RENATRE)'),
  ('810007', null, 'descuento', 'Préstamos'),
  ('810008', null, 'descuento', 'Impuesto a las Ganancias'),
  ('810009', null, 'descuento', 'Obra Social - Adherentes'),
  ('810010', null, 'descuento', 'Fondo Solidario de Redistribución (ex ANSSAL) - Adherentes'),
  ('810011', null, 'descuento', 'Ajuste Aporte Dec. 561/2019'),
  ('810012', null, 'descuento', 'Salario complementario. Dec 332/2020'),
  ('810013', null, 'descuento', 'SAC - Ajuste Bases imponibles'),
  ('810014', null, 'descuento', 'Pago a cuenta Asign. dineraria progr. sociales, educativos o empleo - Dec. 551/2022'),
  ('810015', null, 'descuento', 'Sistema previsional no nacional'),
  ('810016', null, 'descuento', 'Obra Social provincial'),
  ('820000', null, 'descuento', 'Otros descuentos'),
  ('821000', '829999', 'descuento', 'A ingresar por el contribuyente - Otros descuentos - De uso libre');

-- Qué fila del catálogo gobierna un código dado. No alcanza con `= codigo`:
-- 821001 no es una fila, cae DENTRO del rango libre 821000-829999. Un match
-- exacto siempre gana sobre un rango.
create function concepto_afip_de(p_codigo text)
returns concepto_afip language sql stable as $$
  select ca.* from concepto_afip ca
   where ca.codigo = p_codigo
      or (ca.codigo_hasta is not null and p_codigo between ca.codigo and ca.codigo_hasta)
   order by (ca.codigo_hasta is not null)
   limit 1
$$;
comment on function concepto_afip_de(text) is
  'Resuelve un código de 6 dígitos contra la grilla de AFIP, contemplando los 13 rangos "a ingresar por el contribuyente". Devuelve null si el código no es declarable en el LSD.';

create table base_calculo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table base_calculo is
  'Montos del recibo sobre los que se calculan porcentajes (la base de jubilación, de presentismo, etc.). Reemplaza los rangos de numeración de SOS ("sub1_199" = suma de los conceptos 1 a 199): acá cada base dice QUÉ es, y qué conceptos la integran es una lista explícita en base_calculo_concepto — el número del concepto ya no decide nada. Catálogo global sembrado por este archivo; el ETL solo carga la membership.';

-- Fundamento legal: las bases del recibo NO las define AFIP. Los descuentos de
-- ley fijan porcentaje y base en su propia ley (citadas abajo, texto en
-- infoleg.gob.ar); los adicionales (presentismo, antigüedad) los fija cada CCT.
-- AFIP solo define las bases imponibles del F931/LSD, que van aparte: son los
-- flags aportes_*/contribuciones_* de cliente_concepto (perfil LSD, por concepto).
insert into base_calculo (codigo, nombre, descripcion) values
  ('sueldo_y_adicionales', 'Sueldo y adicionales', 'Básico, horas normales, antigüedad y otros haberes directos. Base típica de presentismo y antigüedad — porcentaje y base los fija cada CCT (ej. CCT 130/75 comercio: antigüedad art. 38 = 1% por año sobre el básico; presentismo art. 40 = 8,33%). Ex sub1_9 de SOS. Verificado contra recibos reales: presentismo 8,33% cierra en 94/97 casos.'),
  ('remunerativo_habitual', 'Remunerativo habitual', 'Sueldo y adicionales más feriados y presentismo. Escalón intermedio que usan algunos CCT como base de adicionales propios. Ex sub1_19 de SOS.'),
  ('total_remunerativo', 'Total remunerativo', 'Todos los conceptos de tipo remunerativo — "remuneración" según art. 103 LCT (Ley 20.744) y art. 6 Ley 24.241. Base de los aportes de ley: jubilación 11% (art. 11 Ley 24.241), INSSJyP/PAMI 3% (art. 8 Ley 19.032), obra social 3% (art. 16 inc. b Ley 23.660) y cuota sindical según CCT (art. 38 Ley 23.551). La membership sale del tipo, no del número (ex sub1_199 de SOS). Verificado: jubilación 11% cierra en todos los recibos con importe calculado.'),
  ('total_no_remunerativo', 'Total no remunerativo', 'Las SUMAS no remunerativas del recibo: las de acuerdos salariales homologados y las de decretos (390/2021, 841/2022, 438/2023...). NO integran esta base otros conceptos tipo no_remunerativo que no son sumas: indemnizatorios (preaviso, vacaciones no gozadas), beneficios sociales del art. 103 bis LCT (comedor, guardería) y asignaciones familiares (las paga ANSES). Ex sub411_469 de SOS, que además dejaba afuera por numeración a las sumas por decreto.'),
  ('bruto', 'Bruto', 'Total remunerativo + total no remunerativo. Ex sub1_199_plus_411_469 de SOS.'),
  ('no_remunerativo_con_os', 'No remunerativo con aportes OS', 'Sumas no remunerativas que tributan aportes y contribuciones de obra social porque el acuerdo homologado que las crea así lo dispone (excepción al art. 103 bis LCT pactada en cada acuerdo). Ex sub411_414 / os_norem_base de SOS.'),
  ('base_obra_social', 'Base de obra social', 'Total remunerativo + no remunerativo con aportes de OS: sobre esto se calcula el aporte de obra social del 3% (art. 16 inc. b Ley 23.660) más 1,5% por adherente. Ex os_base de SOS.');
-- Los escalones sub1_26/sub1_39 de SOS NO se migran: solo existían para las
-- "asignaciones complementarias" 30/43 (0 usos), que pasan a importe_manual.

create table concepto (
  id uuid primary key default gen_random_uuid(),
  numero smallint not null unique,
  nombre text not null,
  codigo_afip text not null check (codigo_afip ~ '^[0-9]{6}$'),
  tipo concepto_tipo not null,
  modo concepto_modo_calculo not null,
  base_calculo_id uuid references base_calculo(id),
  pct_fijo numeric(7, 4),
  div_hs_norm integer not null default 1,
  div_cantidad integer not null default 1,
  usa_memo boolean not null default false,
  usa_cantidad boolean not null default false,
  usa_pct boolean not null default false,
  usa_concepto_ref boolean not null default false,
  usa_importe boolean not null default false,
  usa_importe_min boolean not null default false,
  usa_importe_max boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((modo = 'pct_sobre_base') = (base_calculo_id is not null))
);
comment on table concepto is
  'Catálogo global de conceptos de liquidación (numeración heredada de SOS 1..620). Es el vocabulario común: un cliente no inventa conceptos, habilita los de acá vía cliente_concepto.';
comment on column concepto.numero is
  'Número heredado de SOS Contador. Hoy solo define el orden de impresión en el recibo — ya NO decide el tipo ni qué suma a qué base (eso está explícito en tipo y base_calculo_concepto).';
comment on column concepto.modo is
  'Cómo se determina el importe: manual, % sobre una base, % sobre otra línea, o los cálculos especiales (SAC, vacaciones, valor hora).';
comment on column concepto.base_calculo_id is
  'Sobre qué base calcula el porcentaje. Solo (y obligatorio) cuando modo = pct_sobre_base. OJO: calcular SOBRE una base no es integrarla — jubilación calcula sobre el total remunerativo pero no lo integra (es descuento).';
comment on column concepto.usa_memo is
  'Los usa_* dicen qué campos de recibo_concepto tienen sentido para este concepto — son la definición del formulario, no una validación opcional.';
comment on column concepto.codigo_afip is
  'Código que se declara en el LSD. Sin FK porque puede caer dentro de un rango libre (821001 no es una fila del catálogo); lo valida trg_concepto_afip_valido vía concepto_afip_de().';
comment on column concepto.tipo is
  'Tipo para el RECIBO IMPRESO, donde conviene separar aportes de retenciones. AFIP no hace esa distinción: para el LSD, retencion colapsa a descuento. El trigger garantiza que coincida con concepto_afip.tipo salvo por ese colapso — nunca puede haber un remunerativo colgado de un código 810xxx. La distinción aporte/retención se decide POR CONCEPTO acá y no en concepto_afip, porque el código no alcanza para deducirla: 31 de nuestros conceptos cuelgan del rango libre 821000-829999, donde AFIP dice literalmente "a ingresar por el contribuyente" y no opina sobre qué son. Criterio: retención = plata que se le saca al empleado para un tercero (sindicato art. 38 Ley 23.551, seguro de vida, Ganancias, préstamos, embargos); descuento a secas = aporte a un subsistema declarado en el F931 (SIPA, INSSJyP, obra social, FSR, RENATEA). El ETL siembra el valor inicial (82xxxx + 810004/810005/810008 = retención); a partir de ahí se edita por fila.';

create function chk_concepto_afip_valido() returns trigger language plpgsql as $$
declare ca concepto_afip;
begin
  ca := concepto_afip_de(new.codigo_afip);
  if ca is null then
    raise exception
      'concepto %: el código AFIP "%" no existe en la grilla del Libro de Sueldos Digital (ni como código fijo ni dentro de un rango libre)',
      new.numero, new.codigo_afip;
  end if;
  -- retencion es un refinamiento nuestro de descuento; el resto tiene que ser igual
  if ca.tipo <> (case when new.tipo = 'retencion' then 'descuento'::concepto_tipo else new.tipo end) then
    raise exception
      'concepto %: tipo "%" incompatible con el código AFIP % ("%"), que es "%"',
      new.numero, new.tipo, ca.codigo, ca.descripcion, ca.tipo;
  end if;
  return new;
end
$$;

create trigger trg_concepto_afip_valido
  before insert or update of codigo_afip, tipo on concepto
  for each row execute function chk_concepto_afip_valido();

create table base_calculo_concepto (
  base_calculo_id uuid not null references base_calculo(id) on delete cascade,
  concepto_id uuid not null references concepto(id) on delete cascade,
  primary key (base_calculo_id, concepto_id)
);
comment on table base_calculo_concepto is
  'Qué conceptos INTEGRAN cada base (el total remunerativo se arma sumando estas líneas). En SOS esto era implícito en la numeración ("conceptos 1 a 199"); acá es una lista explícita: un concepto nuevo declara a qué bases suma, tenga el número que tenga.';

create table cliente_concepto (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  concepto_id uuid not null references concepto(id) on delete cascade,
  habilitado boolean not null default true,
  codigo_propio text,
  nombre_propio text,
  concepto_afip_id uuid references concepto_afip(id),
  tipo concepto_tipo,
  modo concepto_modo_calculo,
  base_calculo_id uuid references base_calculo(id),
  importe_fijo numeric(15, 2),
  orden integer,
  importe_min numeric(15, 2),
  importe_max numeric(15, 2),
  div_cantidad numeric(10, 4),
  div_hs_norm boolean not null default false,
  vigencia_desde date,
  vigencia_hasta date,
  repetible boolean not null default false,
  aportes_sipa boolean not null default false,
  contribuciones_sipa boolean not null default false,
  aportes_inssjyp boolean not null default false,
  contribuciones_inssjyp boolean not null default false,
  aportes_obra_social boolean not null default false,
  contribuciones_obra_social boolean not null default false,
  aportes_fsr boolean not null default false,
  contribuciones_fsr boolean not null default false,
  aportes_renatea boolean not null default false,
  contribuciones_renatea boolean not null default false,
  contribuciones_aaff boolean not null default false,
  contribuciones_fne boolean not null default false,
  contribuciones_lrt boolean not null default false,
  aportes_diferenciales boolean not null default false,
  aportes_especiales boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, concepto_id)
);
create index idx_cliente_concepto_cliente on cliente_concepto(cliente_id);
create index idx_cliente_concepto_concepto on cliente_concepto(concepto_id);
create trigger trg_set_updated_at before update on cliente_concepto for each row execute function set_updated_at();

comment on table cliente_concepto is
  'Qué conceptos usa cada cliente y cómo. Fusiona tres tablas del modelo viejo que decían lo mismo desde ángulos distintos: concepto_sos_client (habilitación), payroll_concepto (fórmula y vigencia) y lsd_perfil_concepto (código propio y bases de aporte para el LSD).';
comment on column cliente_concepto.codigo_propio is
  'Código con el que el empleador nombra el concepto en su recibo. Se declara así en el LSD; suele coincidir con concepto.numero pero no está obligado.';
comment on column cliente_concepto.modo is
  'Pisa concepto.modo solo para este cliente. Null = manda el catálogo. Ídem base_calculo_id.';
comment on column cliente_concepto.importe_fijo is
  'Importe por defecto cuando el concepto es de importe manual (ej. asignación no remunerativa de un acuerdo: $120.000 para todos los empleados del cliente). Reemplaza a la columna `formula` del modelo viejo: era texto libre evaluable y el 100% de las fórmulas reales eran constantes.';
comment on column cliente_concepto.aportes_sipa is
  'Los aportes_* / contribuciones_* dicen si este concepto forma la base imponible de cada subsistema. Es lo que AFIP exige declarar en el perfil LSD del empleador; de acá salen las bases del F931.';
comment on column cliente_concepto.repetible is
  'El concepto puede aparecer más de una vez en el mismo recibo (ej. varios descuentos de uso libre con memo distinto).';

-- ============================================================================
-- CONVENIOS COLECTIVOS
-- ============================================================================

create table cct (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  signatarios text,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table cct is
  'Catálogo de convenios colectivos de trabajo por número oficial (ej. "130/75" = Comercio). Global: el CCT no es de nadie, los clientes se adhieren.';

create table cct_fuente (
  id uuid primary key default gen_random_uuid(),
  cct_codigo text not null references cct(codigo) on delete cascade,
  url text not null,
  extractor text not null,
  activo boolean not null default true,
  ultimo_intento_at timestamptz,
  ultimo_ok_at timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cct_codigo, url)
);
create trigger trg_set_updated_at before update on cct_fuente for each row execute function set_updated_at();

comment on table cct_fuente is
  'De dónde saca el scrapper la escala de un CCT. Global como cct: la escala del convenio es la misma para todos los estudios, lo que cambia por cliente es a qué categorías se aplica. Agregar un convenio al scrapeo automático es una fila acá, no un deploy.';
comment on column cct_fuente.extractor is
  'Qué rutina sabe leer esta página (ej. "vilaplana-tabla"). No se infiere de la URL: un sitio puede publicar dos formatos distintos.';
comment on column cct_fuente.ultimo_intento_at is
  'Última vez que el scrapper abrió esta página, haya salido bien o mal. Comparada con ultimo_ok_at dice si el cron corre: si esta se mueve y la otra no, la fuente está fallando; si no se mueve ninguna, el cron no está corriendo.';
comment on column cct_fuente.ultimo_ok_at is
  'Última corrida que trajo escalas. Si se queda vieja, la fuente cambió de forma y el extractor dejó de matchear — es la señal de alarma.';
comment on column cct_fuente.ultimo_error is
  'Error de la última corrida fallida, en texto. Se limpia cuando una corrida vuelve a salir bien.';
-- Las filas las siembra etl-dominio3.ts: acá todavía no existe el catálogo `cct` al que apuntan.

create table cct_categoria (
  id uuid primary key default gen_random_uuid(),
  cct_codigo text not null references cct(codigo) on delete cascade,
  codigo text not null,
  nombre text not null,
  orden integer,
  es_valor_hora boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cct_codigo, codigo)
);
create index idx_cct_categoria_cct on cct_categoria(cct_codigo);
create trigger trg_set_updated_at before update on cct_categoria for each row execute function set_updated_at();

comment on table cct_categoria is
  'Grilla oficial de categorías de un CCT (Maestranza A, Administrativo B…). Global, como el CCT: la publica la cámara, no la arma cada empleador. Es lo que faltaba para que el scrapeo de escalas tenga dónde escribir sin depender de que algún cliente ya se haya adherido.';

create table cct_escala (
  id uuid primary key default gen_random_uuid(),
  cct_categoria_id uuid not null references cct_categoria(id) on delete cascade,
  vigencia_desde date not null,
  vigencia_hasta date,
  monto_basico numeric(15, 2) not null,
  monto_no_remunerativo numeric(15, 2) not null default 0,
  periodo_label text,
  fuente text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cct_categoria_id, vigencia_desde)
);
create index idx_cct_escala_categoria on cct_escala(cct_categoria_id);
create trigger trg_set_updated_at before update on cct_escala for each row execute function set_updated_at();

comment on table cct_escala is
  'Escala publicada del convenio, por categoría y vigencia. Es el dato nacional: el básico de Maestranza A de agosto vale lo mismo para todos los empleadores. Acá escribe el job "escalas" del scrapper — en una sola fila por categoría, no una copia por cliente.';
comment on column cct_escala.fuente is
  'URL de donde salió, o "MANUAL". La misma trazabilidad que escala_salarial.';
comment on column cct_escala.vigencia_hasta is
  'Null = vigente hasta que aparezca una escala posterior.';

create table convenio (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  cct_codigo text references cct(codigo),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nombre)
);
create index idx_convenio_cliente on convenio(cliente_id);
create trigger trg_set_updated_at before update on convenio for each row execute function set_updated_at();

comment on table convenio is
  'Adhesión de un cliente a un CCT, con sus categorías y escalas propias. Es por cliente y no global porque cada empleador arma su propia grilla de categorías sobre el mismo convenio.';
comment on column convenio.cct_codigo is
  'Null cuando el convenio no corresponde a un CCT del catálogo (ej. personal fuera de convenio).';

create table convenio_categoria (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references convenio(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  orden integer,
  es_valor_hora boolean not null default false,
  cct_categoria_id uuid references cct_categoria(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convenio_id, codigo)
);
create index idx_convenio_categoria_convenio on convenio_categoria(convenio_id);
create trigger trg_set_updated_at before update on convenio_categoria for each row execute function set_updated_at();

comment on column convenio_categoria.cct_categoria_id is
  'A qué categoría oficial del CCT corresponde esta. Con el vínculo, la liquidación toma el básico publicado sin que nadie lo cargue; sin él (categoría propia del empleador, o fuera de convenio) hay que cargar la escala a mano en escala_salarial.';
comment on column convenio_categoria.es_valor_hora is
  'true = la escala publica un valor hora, no un básico mensual. Cambia cómo se liquida el sueldo de esa categoría.';

create table escala_salarial (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references convenio_categoria(id) on delete cascade,
  vigencia_desde date not null,
  vigencia_hasta date,
  monto_basico numeric(15, 2) not null,
  monto_no_remunerativo numeric(15, 2) not null default 0,
  periodo_label text,
  fuente text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categoria_id, vigencia_desde)
);
create index idx_escala_categoria on escala_salarial(categoria_id);
create trigger trg_set_updated_at before update on escala_salarial for each row execute function set_updated_at();

comment on table escala_salarial is
  'Escala PROPIA del empleador para una de sus categorías: la excepción, no la regla. La escala publicada del convenio vive en cct_escala, que es global y la escribe el job "escalas" del scrapper. Acá va lo que este empleador paga distinto — por encima del convenio, o una categoría que no existe en la grilla oficial. Si hay fila acá, manda sobre cct_escala.';
comment on column escala_salarial.fuente is 'URL de donde salió la escala, o "MANUAL". Es la trazabilidad de un dato que no cargó una persona.';
comment on column escala_salarial.vigencia_hasta is 'Null = vigente hasta que aparezca una escala posterior.';

create table convenio_fuente (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references convenio(id) on delete cascade,
  fuente text not null,
  detalle text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convenio_id, fuente)
);
create index idx_convenio_fuente_convenio on convenio_fuente(convenio_id);
create trigger trg_set_updated_at before update on convenio_fuente for each row execute function set_updated_at();

comment on table convenio_fuente is 'De dónde se saca la escala de este convenio: una URL, "AFIP" (detectado del padrón de empleadores) o "MANUAL".';

create table cliente_cct (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  cct_codigo text not null,
  actividad text,
  signatarios text,
  fecha_novedad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, cct_codigo)
);
create index idx_cliente_cct_cliente on cliente_cct(cliente_id);
create trigger trg_set_updated_at before update on cliente_cct for each row execute function set_updated_at();

comment on table cliente_cct is
  'Convenios que AFIP tiene declarados para este empleador (scrapeado del padrón). Es un hecho externo: no se edita, se compara contra los convenio que el estudio cargó. "9999/99" = excluido de convenio.';
comment on column cliente_cct.fecha_novedad is 'Texto tal cual lo devuelve AFIP; no se parsea porque no siempre es una fecha válida.';

-- ============================================================================
-- EMPLEADOS Y RECIBOS
-- ============================================================================

create table empleado (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  cuil text not null,
  legajo text not null,
  nombre text not null,
  sexo sexo,
  fecha_nacimiento date,
  nacionalidad_id uuid references nacionalidad(id),
  domicilio text,
  localidad_id uuid references localidad(id),
  provincia_id uuid references provincia(id),
  codigo_postal text,
  fecha_alta date not null,
  fecha_baja date,
  activo boolean not null default true,
  convenio_id uuid references convenio(id) on delete set null,
  categoria_id uuid references convenio_categoria(id) on delete set null,
  categoria_texto text,
  tarea text,
  tipo_jornada tipo_jornada not null default 'full_time',
  horas_mensuales_normales integer not null default 0,
  dias_mensuales_normales integer not null default 0,
  valor_hora numeric(15, 2),
  valor_sueldo numeric(15, 2),
  obra_social_id uuid references obra_social(id),
  conyuge integer not null default 0,
  hijos integer not null default 0,
  forma_pago forma_pago,
  banco text,
  cbu text,
  situacion_id uuid not null references situacion_revista(id),
  condicion_id uuid not null references condicion_trabajador(id),
  actividad_id uuid not null references actividad(id),
  modalidad_contratacion_id uuid references modalidad_contratacion(id),
  siniestrado_id uuid not null references siniestrado(id),
  zona_id uuid references zona(id),
  observaciones text,
  fuente dato_fuente not null default 'import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, cuil)
);
create index idx_empleado_cliente on empleado(cliente_id);
create index idx_empleado_cuil on empleado(cuil);
create trigger trg_set_updated_at before update on empleado for each row execute function set_updated_at();

comment on table empleado is
  'Legajo del trabajador. Una sola tabla: en el modelo viejo cada código LSD estaba guardado dos veces (texto + FK) y la mitad de las columnas nunca se usó — acá queda solo la FK al catálogo.';
comment on column empleado.categoria_texto is
  'Categoría escrita a mano en el legajo importado. Convive con categoria_id: cuando el convenio todavía no está cargado en el sistema, esto es lo único que hay.';
comment on column empleado.valor_hora is 'Se usa cuando la categoría cobra por hora (convenio_categoria.es_valor_hora). Si no, manda la escala.';
comment on column empleado.valor_sueldo is 'Sueldo pactado por fuera de la escala de convenio. Null = se liquida por escala.';
comment on column empleado.conyuge is '0 o 1. Es el dato de cargas de familia que pide el LSD, no un booleano por herencia del formato.';
comment on column empleado.zona_id is 'Zona con reducción de contribuciones. Null = zona general, sin reducción.';
comment on column empleado.fuente is 'De dónde salió el legajo: import = migrado del sistema SOS del estudio.';

create table recibo (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  empleado_id uuid not null references empleado(id) on delete cascade,
  periodo date not null,
  tipo recibo_tipo not null,
  quincena smallint not null default 0,
  fecha date,
  fecha_pago date,
  lugar_pago text,
  forma_pago forma_pago,
  banco text,
  cbu text,
  basico numeric(15, 2),
  haberes numeric(15, 2) not null default 0,
  no_remunerativo numeric(15, 2) not null default 0,
  descuentos numeric(15, 2) not null default 0,
  retenciones numeric(15, 2) not null default 0,
  neto numeric(15, 2) not null default 0,
  obra_social_id uuid references obra_social(id),
  periodo_cargas date,
  fecha_deposito_cargas date,
  situacion_revista_1_id uuid references situacion_revista(id),
  situacion_revista_1_dia_inicio smallint,
  situacion_revista_2_id uuid references situacion_revista(id),
  situacion_revista_2_dia_inicio smallint,
  situacion_revista_3_id uuid references situacion_revista(id),
  situacion_revista_3_dia_inicio smallint,
  dias_trabajados integer,
  horas_trabajadas integer,
  importe_a_detraer_ley27430 numeric(15, 2),
  importe_maternidad_art13 numeric(15, 2),
  contribucion_tarea_diferencial numeric(15, 2),
  contribucion_adicional_os numeric(15, 2),
  remuneracion_4y8_override numeric(15, 2),
  remuneracion_9_override numeric(15, 2),
  observacion_recibo text,
  observacion_interna text,
  confirmado boolean not null default false,
  calculado_at timestamptz,
  fuente dato_fuente not null default 'calculo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empleado_id, periodo, tipo, quincena, fuente)
);
create index idx_recibo_cliente_periodo on recibo(cliente_id, periodo);
create index idx_recibo_empleado on recibo(empleado_id);
create trigger trg_set_updated_at before update on recibo for each row execute function set_updated_at();

comment on table recibo is
  'Liquidación de un empleado en un período. Solo se puede liquidar el mes anterior (src/lib/payroll-period-rules.ts).';
comment on column recibo.periodo is 'Primer día del mes liquidado. Fecha real, no texto: los agentes no tienen que parsear "2026-03".';
comment on column recibo.fuente is
  'calculo = lo liquidó la app, import = vino del sistema SOS. Está en la clave única porque existen los dos para el mismo período y no son el mismo recibo: hay 5 casos migrados donde el importado y el calculado difieren, y esa diferencia es justamente lo que hay que revisar.';
comment on column recibo.quincena is '0 = liquidación mensual completa. 1 o 2 = quincena, cuando el convenio paga quincenal.';
comment on column recibo.periodo_cargas is 'Período al que se imputan las cargas sociales, cuando difiere del período liquidado.';
comment on column recibo.situacion_revista_1_id is
  'AFIP admite hasta 3 situaciones de revista en el mismo mes (ej. activo del 1 al 10, licencia del 11 al 30). El día de inicio va en el campo _dia_inicio de cada una.';
comment on column recibo.importe_a_detraer_ley27430 is 'Detracción de la base de contribuciones patronales (Ley 27430 art. 4). Se declara en el F931.';
comment on column recibo.remuneracion_4y8_override is
  'Pisa el cálculo de las remuneraciones 4 y 8 del F931. Escape hatch para casos que la app no sabe liquidar; si está seteado, gana sobre el cálculo.';

create table recibo_concepto (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references recibo(id) on delete cascade,
  concepto_id uuid not null references concepto(id),
  tipo concepto_tipo,
  monto numeric(15, 2) not null,
  cantidad numeric(12, 4),
  porcentaje numeric(9, 4),
  importe numeric(15, 2),
  importe_min numeric(15, 2),
  importe_max numeric(15, 2),
  concepto_ref smallint,
  memo text,
  pct_usado numeric(9, 4),
  base_usada numeric(15, 2),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recibo_id, concepto_id, memo)
);
create index idx_recibo_concepto_recibo on recibo_concepto(recibo_id);
create index idx_recibo_concepto_concepto on recibo_concepto(concepto_id);
create trigger trg_set_updated_at before update on recibo_concepto for each row execute function set_updated_at();

comment on table recibo_concepto is
  'Línea del recibo. Apunta al concepto por FK: en el modelo viejo guardaba un código de texto suelto y el concepto_id estaba vacío en 2218 de 2233 filas.';
comment on column recibo_concepto.monto is 'Importe final que sale impreso. Los demás campos son cómo se llegó a él.';
comment on column recibo_concepto.pct_usado is
  'Porcentaje y base efectivamente aplicados al liquidar. Se guardan para poder reconstruir el cálculo aunque después cambien la fórmula o la escala.';
comment on column recibo_concepto.tipo is
  'Pisa concepto.tipo solo para este recibo (ej. un concepto que este mes se paga como no remunerativo). Null = manda el catálogo.';
comment on column recibo_concepto.concepto_ref is 'Número del concepto sobre el que se calcula, cuando concepto.modo = pct_sobre_concepto o promedio_anual_concepto.';

-- ============================================================================
-- LIBRO DE SUELDOS DIGITAL Y PARÁMETROS
-- ============================================================================

create table lsd_presentacion (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references organization(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  periodo date not null,
  numero smallint not null default 1,
  filename text not null,
  empleados integer not null,
  conceptos integer not null,
  contenido text not null,
  generado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, periodo, numero)
);
create index idx_lsd_presentacion_cliente on lsd_presentacion(cliente_id);
create trigger trg_set_updated_at before update on lsd_presentacion for each row execute function set_updated_at();

comment on table lsd_presentacion is
  'Archivo del Libro de Sueldos Digital generado y presentado en AFIP. Se guarda el contenido completo porque es el comprobante de lo que se declaró.';
comment on column lsd_presentacion.numero is 'Número de presentación del período: 1 = original, 2+ = rectificativas.';
comment on column lsd_presentacion.contenido is 'Archivo LSD de ancho fijo, tal cual se subió. Registros 01 (empleador), 02 (empleados), 03 (conceptos), 04 (datos del F931).';

create table parametro_periodo (
  periodo date primary key,
  tope_maximo_imponible numeric(15, 2),
  salario_minimo numeric(15, 2),
  fuente text,
  actualizado_por_cron boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_set_updated_at before update on parametro_periodo for each row execute function set_updated_at();

comment on table parametro_periodo is
  'Parámetros previsionales del mes, iguales para todo el país. Global a propósito: los publica ANSES, no dependen del cliente.';
comment on column parametro_periodo.tope_maximo_imponible is 'Tope de la base imponible para aportes (MOPRE/SIPA). Se aplica al calcular los descuentos del recibo.';
