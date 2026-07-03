/**
 * Script de migración y seed para mapear catálogos SOS Contador ↔ AFIP
 * y poblar los defaults de empleador en la tabla `client`.
 *
 * Qué hace:
 *  1. Agrega columna `codigo_sos` a las tablas de catálogo AFIP existentes.
 *  2. Agrega columnas FK de defaults a `client`.
 *  3. Mapea SOS IDs → registros de catálogo (por código AFIP o texto).
 *  4. Actualiza `client` con los valores default scrapeados de SOS.
 *
 * Uso: bun run src/scripts/seed-sos-catalogo-defaults.ts
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// ── 1. Agregar columnas codigo_sos a tablas de catálogo ───────────────────────

const alterCatalogos = [
  `ALTER TABLE payroll_situacion ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
  `ALTER TABLE payroll_condicion ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
  `ALTER TABLE payroll_actividad ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
  `ALTER TABLE payroll_modalidad_contratacion ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
  `ALTER TABLE payroll_siniestrado ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
  `ALTER TABLE payroll_zona ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
  `ALTER TABLE obra_social ADD COLUMN IF NOT EXISTS codigo_sos TEXT UNIQUE`,
];

for (const stmt of alterCatalogos) {
  await sql.unsafe(stmt);
}
console.log("✓ Columnas codigo_sos agregadas a catálogos");

// ── 2. Agregar columnas FK de defaults en client ──────────────────────────────

const alterClient = [
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS situacion_default_id UUID REFERENCES payroll_situacion(id) ON DELETE SET NULL`,
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS condicion_default_id UUID REFERENCES payroll_condicion(id) ON DELETE SET NULL`,
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS actividad_default_id UUID REFERENCES payroll_actividad(id) ON DELETE SET NULL`,
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS contratacion_default_id UUID REFERENCES payroll_modalidad_contratacion(id) ON DELETE SET NULL`,
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS siniestrado_default_id UUID REFERENCES payroll_siniestrado(id) ON DELETE SET NULL`,
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS zona_default_id UUID REFERENCES payroll_zona(id) ON DELETE SET NULL`,
  `ALTER TABLE client ADD COLUMN IF NOT EXISTS obra_social_default_id UUID REFERENCES obra_social(id) ON DELETE SET NULL`,
];

for (const stmt of alterClient) {
  await sql.unsafe(stmt);
}
console.log("✓ Columnas FK de defaults agregadas a client");

// ── 3. Mapeo SOS → catálogos ──────────────────────────────────────────────────

// 3a. payroll_situacion — mapeado por codigo AFIP
// SOS IDs extraídos de cbsituacion + código AFIP LSD correspondiente
const situacionMap: Array<{ sosId: string; codigoAfip: string }> = [
  { sosId: "1070",  codigoAfip: "01" }, // Activo
  { sosId: "10205", codigoAfip: "01" }, // Activo - LSD (sin remuneración) → mismo bucket
  { sosId: "1069",  codigoAfip: "02" }, // Baja por fallecimiento
  { sosId: "1076",  codigoAfip: "03" }, // Baja por despido
  { sosId: "1071",  codigoAfip: "04" }, // Bajas otras causales
  { sosId: "3260",  codigoAfip: "05" }, // Empleado Eventual en Empresa Usuaria
  { sosId: "1074",  codigoAfip: "06" }, // Licencia por maternidad
  { sosId: "1075",  codigoAfip: "07" }, // Licencia por paternidad / adopción
  { sosId: "1083",  codigoAfip: "08" }, // Reserva de puesto
  { sosId: "1081",  codigoAfip: "09" }, // Licencia por vacaciones
  { sosId: "1079",  codigoAfip: "10" }, // Licencia por excedencia
  { sosId: "1082",  codigoAfip: "11" }, // Licencia sin goce de haberes
  { sosId: "10112", codigoAfip: "14" }, // Licencia por fuerza mayor (Art. 221 LCT)
  { sosId: "1080",  codigoAfip: "15" }, // Licencia por maternidad Down
  { sosId: "1087",  codigoAfip: "20" }, // ILT primeros DIEZ días
  { sosId: "1088",  codigoAfip: "22" }, // ILT días ONCE en adelante (ART)
  { sosId: "1084",  codigoAfip: "24" }, // E.S.E. Cese transitorio de servicios
  { sosId: "1086",  codigoAfip: "30" }, // Reingreso por disposición judicial
  { sosId: "1085",  codigoAfip: "32" }, // Personal Siniestrado de terceros
  { sosId: "1089",  codigoAfip: "33" }, // Trabajador siniestrado en nómina de A.R.T.
  { sosId: "1072",  codigoAfip: "40" }, // Activo Decreto N° 796/97
  { sosId: "1073",  codigoAfip: "41" }, // Bajas otras causales Decreto N° 796/97
  { sosId: "1077",  codigoAfip: "42" }, // Baja por despido Decreto N° 796/97
  { sosId: "10110", codigoAfip: "51" }, // Activo - Funciones en el exterior
  { sosId: "10113", codigoAfip: "05" }, // Empleado eventual en EU (ESE)
  { sosId: "10114", codigoAfip: "08" }, // Conservación del empleo por accidente
  { sosId: "10120", codigoAfip: "01" }, // Dto 792/20 - activos especiales
  { sosId: "10187", codigoAfip: "06" }, // Licencia Ley 27.674 Art. 13
];

for (const { sosId, codigoAfip } of situacionMap) {
  await sql`
    UPDATE payroll_situacion
    SET codigo_sos = ${sosId}
    WHERE codigo = ${codigoAfip} AND (codigo_sos IS NULL OR codigo_sos = ${sosId})
  `;
}
console.log("✓ payroll_situacion mapeado");

// 3b. payroll_condicion — mapeado por codigo AFIP
const condicionMap: Array<{ sosId: string; codigoAfip: string }> = [
  { sosId: "3171",  codigoAfip: "00" }, // SERVICIOS COMUNES Mayor de 18 años
  { sosId: "3172",  codigoAfip: "01" }, // Jubilado
  { sosId: "3173",  codigoAfip: "02" }, // Menor
  { sosId: "3174",  codigoAfip: "03" }, // Menor Anterior
  { sosId: "3175",  codigoAfip: "04" }, // SERVICIOS DIFERENCIADOS Mayor de 18 años
  { sosId: "3176",  codigoAfip: "05" }, // Pre-jubilables Sin relación de dependencia
  { sosId: "3177",  codigoAfip: "06" }, // MEDIDA DE NO INNOVAR SERV. COMUNES
  { sosId: "3178",  codigoAfip: "07" }, // MEDIDA DE NO INNOVAR SERV. DIFERENCIA
  { sosId: "3179",  codigoAfip: "08" }, // Jubilado Decreto N° 206/00
  { sosId: "10188", codigoAfip: "09" }, // Pensión (NO SIPA)
  { sosId: "10189", codigoAfip: "10" }, // Pensión no Contributiva (NO SIPA)
  { sosId: "10190", codigoAfip: "11" }, // Art. 8° Ley N° 27426
  { sosId: "10191", codigoAfip: "12" }, // Servicios Diferenciados no alcanzados por Dto. 633/2018
  { sosId: "10192", codigoAfip: "13" }, // Jubilado - Docentes universitarios
];

for (const { sosId, codigoAfip } of condicionMap) {
  await sql`
    UPDATE payroll_condicion
    SET codigo_sos = ${sosId}
    WHERE codigo = ${codigoAfip} AND (codigo_sos IS NULL OR codigo_sos = ${sosId})
  `;
}
console.log("✓ payroll_condicion mapeado");

// 3c. payroll_siniestrado — mapeado por codigo AFIP
const siniestradoMap: Array<{ sosId: string; codigoAfip: string }> = [
  { sosId: "1092",  codigoAfip: "00" }, // No Incapacitado
  { sosId: "1093",  codigoAfip: "01" }, // Incapacidad Laboral Temporaria (ILT)
  { sosId: "1094",  codigoAfip: "02" }, // Incapacidad Laboral Permanente Parcial Definitiva (ILPPD)
  { sosId: "1095",  codigoAfip: "03" }, // Incapacidad Laboral Permanente Total Definitiva (ILPTD)
  { sosId: "1096",  codigoAfip: "04" }, // Incapacidad Laboral Permanente Provisoria (ILPP)
  { sosId: "1099",  codigoAfip: "05" }, // Gran Invalidez
  { sosId: "1100",  codigoAfip: "06" }, // Fallecido por accidente de trabajo/EP
  { sosId: "1097",  codigoAfip: "07" }, // Capital de recomposición Art. 15
  { sosId: "1098",  codigoAfip: "08" }, // Ajuste Definitivo ILPPD de pago mensual
  { sosId: "1101",  codigoAfip: "09" }, // Cuota mensual Gran Invalidez
  { sosId: "1102",  codigoAfip: "10" }, // Cuota mensual ILPTD
  { sosId: "1103",  codigoAfip: "11" }, // ILPPD Beneficios devengados Art. 11
  { sosId: "1104",  codigoAfip: "12" }, // ILPPD Beneficios devengados Art. 11 punto 2
  { sosId: "1105",  codigoAfip: "13" }, // Ajuste por incapacidad
];

for (const { sosId, codigoAfip } of siniestradoMap) {
  await sql`
    UPDATE payroll_siniestrado
    SET codigo_sos = ${sosId}
    WHERE codigo = ${codigoAfip} AND (codigo_sos IS NULL OR codigo_sos = ${sosId})
  `;
}
console.log("✓ payroll_siniestrado mapeado");

// 3d. payroll_actividad — mapear por código AFIP extraído del texto SOS
// El texto SOS comienza con el código de 3 dígitos: "049 Actividades no clasificadas"
const actividadSosOpts: Array<{ sosId: string; text: string }> = [
  {"sosId":"1180","text":"000 Zona de Desastre. Decreto 1386/01"},
  {"sosId":"1181","text":"001 Producción Primaria"},
  {"sosId":"1182","text":"002 Producción de bienes sin comercializ"},
  {"sosId":"1183","text":"003 Industrias de transformación"},
  {"sosId":"1184","text":"004 Construcción"},
  {"sosId":"1185","text":"005 Comercio"},
  {"sosId":"1186","text":"006 Hotelería y Gastronomía"},
  {"sosId":"1187","text":"007 Transporte"},
  {"sosId":"1188","text":"008 Comunicaciones"},
  {"sosId":"1189","text":"009 Servicios públicos: Electricidad, gas"},
  {"sosId":"1190","text":"010 Servicios Financieros"},
  {"sosId":"1191","text":"011 Seguros"},
  {"sosId":"1192","text":"012 Servicios de Salud privados"},
  {"sosId":"1193","text":"013 Servicios de Salud públicos"},
  {"sosId":"1194","text":"014 Educación privada"},
  {"sosId":"1195","text":"015 Educación pública"},
  {"sosId":"1196","text":"016 Servicios domésticos"},
  {"sosId":"1197","text":"017 Administración Pública"},
  {"sosId":"1198","text":"018 Defensa y Seguridad"},
  {"sosId":"1199","text":"019 Justicia"},
  {"sosId":"1200","text":"020 Servicios personales"},
  {"sosId":"1201","text":"021 Servicios a empresas"},
  {"sosId":"1202","text":"022 Servicios inmobiliarios"},
  {"sosId":"1203","text":"023 Servicios recreativos y culturales"},
  {"sosId":"1204","text":"024 Organizaciones y órganos extratarrito"},
  {"sosId":"1205","text":"025 Actividades informáticas"},
  {"sosId":"1206","text":"026 Investigación y desarrollo"},
  {"sosId":"1207","text":"027 Minería"},
  {"sosId":"1208","text":"028 Pesca"},
  {"sosId":"1209","text":"029 Ind. Alimenticia"},
  {"sosId":"1210","text":"030 Ind. Textil"},
  {"sosId":"1211","text":"031 Ind. del Papel"},
  {"sosId":"1212","text":"032 Ind. Química y Petroquímica"},
  {"sosId":"1213","text":"033 Ind. del Caucho y Plástico"},
  {"sosId":"1214","text":"034 Ind. de Productos Minerales"},
  {"sosId":"1215","text":"035 Ind. Metalúrgica"},
  {"sosId":"1216","text":"036 Ind. de Maquinaria y Equipos"},
  {"sosId":"1217","text":"037 Ind. del Automotor"},
  {"sosId":"1218","text":"038 Ind. Maderera"},
  {"sosId":"1219","text":"039 Ind. Editorial y Gráfica"},
  {"sosId":"1220","text":"049 Actividades no clasificadas"},
  {"sosId":"10003","text":"050 Servicios temporarios de personal"},
  {"sosId":"10004","text":"051 Actividades de organizaciones empr."},
  {"sosId":"10005","text":"052 Actividades de organizaciones sind."},
  {"sosId":"10006","text":"053 Colegios, cajas y consejos profes."},
  {"sosId":"10007","text":"054 Organizaciones religiosas"},
  {"sosId":"10008","text":"055 Obras sociales y mutuales"},
  {"sosId":"10009","text":"056 Organizaciones de bien público"},
  {"sosId":"10010","text":"057 Servicio doméstico"},
  {"sosId":"10011","text":"058 Actividades no clasificadas (persona"},
  {"sosId":"10012","text":"059 Actividad Actoral"},
  {"sosId":"10013","text":"060 Deportes"},
  {"sosId":"10014","text":"100 Zona Patagónica"},
  {"sosId":"10015","text":"101 Zona Patagónica - Neuquén"},
  {"sosId":"10016","text":"102 Zona Patagónica - Rio Negro"},
  {"sosId":"10017","text":"103 Zona Patagónica - Chubut"},
  {"sosId":"10018","text":"104 Zona Patagónica - Santa Cruz"},
  {"sosId":"10019","text":"105 Zona Patagónica - Tierra del Fuego"},
  {"sosId":"10020","text":"106 Zona Patagónica - La Pampa"},
  {"sosId":"10021","text":"200 Provincias del NOA"},
  {"sosId":"10022","text":"201 NOA - Jujuy"},
  {"sosId":"10023","text":"202 NOA - Salta"},
  {"sosId":"10024","text":"203 NOA - Tucumán"},
  {"sosId":"10025","text":"204 NOA - Catamarca"},
  {"sosId":"10026","text":"205 NOA - La Rioja"},
  {"sosId":"10027","text":"206 NOA - Santiago del Estero"},
  {"sosId":"10028","text":"300 Provincias del NEA"},
  {"sosId":"10029","text":"301 NEA - Formosa"},
  {"sosId":"10030","text":"302 NEA - Chaco"},
  {"sosId":"10031","text":"303 NEA - Misiones"},
  {"sosId":"10032","text":"304 NEA - Corrientes"},
  {"sosId":"10033","text":"305 NEA - Entre Ríos"},
  {"sosId":"10034","text":"400 San Luis"},
  {"sosId":"10035","text":"500 San Juan"},
  {"sosId":"10036","text":"600 Mendoza"},
  {"sosId":"10037","text":"700 Zona Franca"},
  {"sosId":"10038","text":"800 Trabajo a domicilio"},
  {"sosId":"10039","text":"900 Sin especificar"},
  {"sosId":"10040","text":"901 Zona de Desastre. Decreto 632/00"},
  {"sosId":"10041","text":"902 Zona de Desastre - Inundaciones"},
  {"sosId":"10042","text":"903 Exportación - Actividad Primaria"},
  {"sosId":"10043","text":"904 Exportación - Actividad Ind. Manufac"},
  {"sosId":"10044","text":"905 Exportación - Servicios"},
  {"sosId":"10045","text":"906 Zona de Desastre. Decreto 1169/01"},
  {"sosId":"10046","text":"907 Zona de Desastre. Decreto 1395/01"},
  {"sosId":"10047","text":"908 Zona de Desastre. Decreto 1397/01"},
  {"sosId":"10048","text":"909 Zona de Desastre. Decreto 1397/01 F"},
  {"sosId":"10049","text":"910 Zona de Desastre. Decreto 1619/01"},
  {"sosId":"10050","text":"911 Zona de Desastre. Decreto 1619/01 F"},
  {"sosId":"10051","text":"912 Zona de Desastre. Decreto 1741/01"},
  {"sosId":"10052","text":"913 Zona de Desastre. Decreto 176/02"},
  {"sosId":"10053","text":"914 Zona de Desastre. Decreto 176/02 F"},
  {"sosId":"10054","text":"915 Zona de Desastre. Decreto 462/03"},
  {"sosId":"10055","text":"916 Zona de Desastre. Decreto 462/03 F"},
  {"sosId":"10056","text":"917 Zona Patagónica - Corredor productiv"},
  {"sosId":"10057","text":"918 Actividad Vitivinícola - Ley 25.849"},
  {"sosId":"10058","text":"919 Zona de desastre - Inundaciones 200"},
  {"sosId":"10059","text":"920 Zona de desastre - Inundaciones 200"},
  {"sosId":"10060","text":"921 Zona de desastre - Santa Fe"},
];

for (const { sosId, text } of actividadSosOpts) {
  // Extraer código AFIP: primeros 3 caracteres del texto
  const codigoAfip = text.substring(0, 3).trim();
  await sql`
    UPDATE payroll_actividad
    SET codigo_sos = ${sosId}
    WHERE codigo = ${codigoAfip} AND (codigo_sos IS NULL OR codigo_sos = ${sosId})
  `;
}
console.log("✓ payroll_actividad mapeado");

// 3e. payroll_modalidad_contratacion — mapear por texto (ILIKE)
// SOS tiene 160 opciones vs nuestras 78; priorizamos las que coinciden por texto
const contratacionSosOpts: Array<{ sosId: string; text: string }> = [
  {"sosId":"1128","text":"A Tiempo completo determinado (contrato a plazo fijo)"},
  {"sosId":"1114","text":"A Tiempo completo indeterminado/Trabajo permanente"},
  {"sosId":"1127","text":"A tiempo parcial determinado (contrato a plazo fijo)"},
  {"sosId":"1107","text":"A tiempo parcial: Indeterminado/permanente"},
  {"sosId":"1171","text":"Art. 11 inc. b Ley N° 26.476 Regularización personal no registrado"},
  {"sosId":"1172","text":"Art. 11 inc. b Ley N° 26.476. Regularización personal no reg - Bs. As."},
  {"sosId":"1173","text":"Art. 11 inc. b Ley N° 26.476. Regularización personal no reg - Zona NOA"},
  {"sosId":"1179","text":"Art. 11 Ley N° 26.476. Trabajador registrado. Rectificación"},
  {"sosId":"1174","text":"Art. 12 Ley N° 26.476 Regularización personal no registrado"},
  {"sosId":"1175","text":"Art. 12 Ley N° 26.476 Regularización personal no registrado - Bs. As."},
  {"sosId":"1176","text":"Art. 12 Ley N° 26.476 Regularización personal no registrado - Zona NOA"},
  {"sosId":"1178","text":"Art. 12 Ley N° 26.476. Trabajador registrado. Rectificación"},
  {"sosId":"1177","text":"Art. 13 Ley N° 26.476 Regularización personal no registrado"},
  {"sosId":"1115","text":"Beca"},
  {"sosId":"1116","text":"Contrato de aprendizaje"},
  {"sosId":"1117","text":"Contrato de trabajo a prueba"},
  {"sosId":"1118","text":"Contrato de trabajo eventual"},
  {"sosId":"1119","text":"Contrato de trabajo por temporada"},
  {"sosId":"1120","text":"Dependiente de empresa de servicios eventuales (ESE)"},
  {"sosId":"1121","text":"Decreto Nº 1694/06 (Pasantías universitarias)"},
  {"sosId":"1122","text":"Decreto Nº 340/92 - Jóvenes sin empleo"},
  {"sosId":"1123","text":"Empleado de casas particulares"},
  {"sosId":"1124","text":"Empleados de consorcios de prop. de inmuebles"},
  {"sosId":"1125","text":"Empleados de la marina mercante"},
  {"sosId":"1126","text":"Empleados de organismos internacionales"},
  {"sosId":"1129","text":"Incorporado por Decreto N° 796/97"},
  {"sosId":"1130","text":"Ley 22.250 - Personal de la construcción"},
  {"sosId":"1131","text":"Ley 23.737 - Infractor en régimen de trabajo"},
  {"sosId":"1132","text":"Ley 24.013 - Empleo promovido"},
  {"sosId":"1133","text":"Ley 24.465 - Contrato de trabajo formativo"},
  {"sosId":"1134","text":"Ley 24.465 - Contrato a tiempo parcial"},
  {"sosId":"1135","text":"Ley 24.467 - Contrato de trabajo para pequeñas empresas"},
  {"sosId":"1136","text":"Ley 24.557 - Trabajador siniestrado sin ILT"},
  {"sosId":"1137","text":"Ley 25.013 - Contrato de aprendizaje"},
  {"sosId":"1138","text":"Ley 25.013 - Contrato de trabajo de fomento del empleo"},
  {"sosId":"1139","text":"Personal de casas de renta"},
  {"sosId":"1140","text":"Personal de la construcción - Bs. As."},
  {"sosId":"1141","text":"Personal religioso"},
  {"sosId":"1142","text":"Propietario de empresa unipersonal"},
  {"sosId":"1143","text":"Socio de empresa societaria"},
  {"sosId":"1144","text":"Trabajo a domicilio"},
  {"sosId":"1145","text":"Trabajador del servicio doméstico"},
  {"sosId":"1146","text":"Trabajador eventual incorporado a empresa usuaria"},
  {"sosId":"1147","text":"Pasantía (Ley 26.427)"},
];

let contratMapped = 0;
for (const { sosId, text } of contratacionSosOpts) {
  // Buscar por texto exact o similar (primeros 40 chars)
  const textShort = text.substring(0, 40);
  const result = await sql`
    UPDATE payroll_modalidad_contratacion
    SET codigo_sos = ${sosId}
    WHERE (codigo_sos IS NULL OR codigo_sos = ${sosId})
      AND (
        LOWER(TRIM(nombre)) = LOWER(TRIM(${text}))
        OR LOWER(nombre) LIKE LOWER(${textShort + '%'})
      )
    RETURNING id
  `;
  if (result.length > 0) contratMapped++;
}
console.log(`✓ payroll_modalidad_contratacion: ${contratMapped} mapeados`);

// 3f. payroll_zona — mapear la opción canónica por código de zona
// SOS tiene 362 opciones históricas (un ID por periodo). Mapeamos la más reciente de cada zona.
// Formato SOS: "01 - 1995/03-1995/08 - Capital Federal (0 %)"
// Extraemos el código "01" y usamos el ID más alto (más reciente) para cada zona.
const zonaSosOpts: Array<{ sosId: string; text: string }> = [
  // Los más recientes por zona (IDs más altos = más nuevos en SOS)
  {"sosId":"2065","text":"01 - Capital Federal"},
  {"sosId":"2066","text":"02 - Buenos Aires"},
  {"sosId":"2067","text":"03 - Catamarca"},
  {"sosId":"2068","text":"04 - Córdoba"},
  {"sosId":"2069","text":"05 - Corrientes"},
  {"sosId":"2070","text":"06 - Chaco"},
  {"sosId":"2071","text":"07 - Chubut"},
  {"sosId":"2072","text":"08 - Entre Ríos"},
  {"sosId":"2073","text":"09 - Formosa"},
  {"sosId":"2074","text":"10 - Jujuy"},
  {"sosId":"2075","text":"11 - La Pampa"},
  {"sosId":"2076","text":"12 - La Rioja"},
  {"sosId":"2077","text":"13 - Mendoza"},
  {"sosId":"2078","text":"14 - Misiones"},
  {"sosId":"2079","text":"15 - Neuquén"},
  {"sosId":"2080","text":"16 - Río Negro"},
  {"sosId":"2081","text":"17 - Salta"},
  {"sosId":"2082","text":"18 - San Juan"},
  {"sosId":"2083","text":"19 - San Luis"},
  {"sosId":"2084","text":"20 - Santa Cruz"},
  {"sosId":"2085","text":"21 - Santa Fe"},
  {"sosId":"2086","text":"22 - Santiago del Estero"},
  {"sosId":"2087","text":"23 - Tierra del Fuego"},
  {"sosId":"2088","text":"24 - Tucumán"},
];

// Para zona, SOS tiene múltiples IDs históricos por el mismo código.
// Usamos el primer SOS ID de cada zona (el que vimos en el scraping: "1703" para "01").
// Actualizar mapeando por el código de 2 dígitos al inicio del texto.
const zonaSosFromScraping: Array<{ sosId: string; codigoZona: string }> = [
  { sosId: "1703", codigoZona: "01" }, // Capital Federal (el más usado, visto en scraping)
];

for (const { sosId, codigoZona } of zonaSosFromScraping) {
  await sql`
    UPDATE payroll_zona
    SET codigo_sos = ${sosId}
    WHERE codigo = ${codigoZona} AND (codigo_sos IS NULL OR codigo_sos = ${sosId})
  `;
}
console.log("✓ payroll_zona mapeado (zona 01 - Capital Federal)");

// 3g. obra_social — mapear por código RNOS (el texto del cbobrasocial ES el código RNOS)
// cbobrasocial.value = SOS internal ID; cbobrasocial.text = RNOS code (ej "126205")
// Usamos los datos del scraping de employers para construir el mapa RNOS → SOS ID
const obraSocialMap: Array<{ sosId: string; rnos: string }> = [
  { sosId: "3236", rnos: "000000" }, // Administración Recursos para Salud
  { sosId: "3051", rnos: "400800" }, // OSECAC (Ejecutivos y Personal de Comercio)
  { sosId: "2971", rnos: "126205" }, // Obra Social de Empleados de Comercio
  { sosId: "3291", rnos: "114307" }, // (Gb Bazar, Casvin)
  { sosId: "2916", rnos: "105408" }, // (Ngvs)
  { sosId: "3106", rnos: "104306" }, // (Smart Solution)
  { sosId: "3099", rnos: "116006" }, // (Toloki)
];

for (const { sosId, rnos } of obraSocialMap) {
  if (rnos === "000000") continue; // "Sin OS" — no mapear
  await sql`
    UPDATE obra_social
    SET codigo_sos = ${sosId}
    WHERE codigo = ${rnos} AND (codigo_sos IS NULL OR codigo_sos = ${sosId})
  `;
}
console.log("✓ obra_social mapeado");

// ── 4. Actualizar client con los defaults del empleador ───────────────────────
// Datos de SOS: cuit → {situacionSosId, condicionSosId, actividadSosId, contratacionSosId,
//                        siniestradoSosId, zonaSosId, obraSocialSosId}

const empleadorDefaults: Array<{
  cuit: string;
  sit: string; cond: string; act: string; cont: string;
  sin: string; zona: string; os: string | null;
}> = [
  { cuit:"30707920056", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"3051"  },
  { cuit:"30719153255", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971"  },
  { cuit:"30718726340", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"20259968012", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30719305535", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30715944029", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"20180955454", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"33717904309", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"20349758610", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"3291" },
  { cuit:"30718161394", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"20235093287", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30717554864", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"33719196239", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30718074785", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30716206404", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"3291" },
  { cuit:"30716135124", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"27388941974", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30718394682", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"33718970089", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"20249628116", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30643202812", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"23251342199", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30717679845", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30719389240", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30719184835", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30717680568", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30718524551", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30717605663", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"27175689937", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30718958934", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30718323386", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30717548767", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30718374142", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30714871087", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"33718009419", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30717679136", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30717786986", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2916" },
  { cuit:"30719105056", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30719167094", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30718922565", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30716753251", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30714955930", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30718310519", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"20127571083", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"20231269879", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30715433490", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30718149874", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:null   },
  { cuit:"30714871508", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"3106" },
  { cuit:"20308861210", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30716025752", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"2971" },
  { cuit:"30716787407", sit:"1070",cond:"3171",act:"1220",cont:"1114",sin:"1092",zona:"1703",os:"3099" },
];

// Construir lookup: codigo_sos → id de cada catálogo
const [sitRows, condRows, actRows, contRows, sinRows, zonaRows, osRows] = await Promise.all([
  sql`SELECT id, codigo_sos FROM payroll_situacion WHERE codigo_sos IS NOT NULL`,
  sql`SELECT id, codigo_sos FROM payroll_condicion WHERE codigo_sos IS NOT NULL`,
  sql`SELECT id, codigo_sos FROM payroll_actividad WHERE codigo_sos IS NOT NULL`,
  sql`SELECT id, codigo_sos FROM payroll_modalidad_contratacion WHERE codigo_sos IS NOT NULL`,
  sql`SELECT id, codigo_sos FROM payroll_siniestrado WHERE codigo_sos IS NOT NULL`,
  sql`SELECT id, codigo_sos FROM payroll_zona WHERE codigo_sos IS NOT NULL`,
  sql`SELECT id, codigo_sos FROM obra_social WHERE codigo_sos IS NOT NULL`,
]);

const sitMap  = new Map(sitRows.map(r => [r.codigo_sos, r.id]));
const condMap = new Map(condRows.map(r => [r.codigo_sos, r.id]));
const actMap  = new Map(actRows.map(r => [r.codigo_sos, r.id]));
const contMap = new Map(contRows.map(r => [r.codigo_sos, r.id]));
const sinMap  = new Map(sinRows.map(r => [r.codigo_sos, r.id]));
const zonaMap = new Map(zonaRows.map(r => [r.codigo_sos, r.id]));
const osMap   = new Map(osRows.map(r => [r.codigo_sos, r.id]));

let updClient = 0, notFoundClient = 0;

for (const emp of empleadorDefaults) {
  const sitId   = sitMap.get(emp.sit)   ?? null;
  const condId  = condMap.get(emp.cond) ?? null;
  const actId   = actMap.get(emp.act)   ?? null;
  const contId  = contMap.get(emp.cont) ?? null;
  const sinId   = sinMap.get(emp.sin)   ?? null;
  const zonaId  = zonaMap.get(emp.zona) ?? null;
  const osId    = emp.os ? (osMap.get(emp.os) ?? null) : null;

  const result = await sql`
    UPDATE client SET
      situacion_default_id    = ${sitId},
      condicion_default_id    = ${condId},
      actividad_default_id    = ${actId},
      contratacion_default_id = ${contId},
      siniestrado_default_id  = ${sinId},
      zona_default_id         = ${zonaId},
      obra_social_default_id  = ${osId}
    WHERE identity_number = ${emp.cuit}
    RETURNING name
  `;
  if (result.length > 0) {
    console.log(`  ✓ ${result[0].name} (${emp.cuit})`);
    updClient++;
  } else {
    console.log(`  ⚠ ${emp.cuit} no encontrado`);
    notFoundClient++;
  }
}

console.log(`\n✓ Resumen:`);
console.log(`  ${updClient} clientes actualizados con defaults`);
console.log(`  ${notFoundClient} CUITs no encontrados`);

// Verificación rápida
const unmapped = await sql`
  SELECT tabla, COUNT(*) as sin_sos FROM (
    SELECT 'situacion'    AS tabla FROM payroll_situacion WHERE codigo_sos IS NULL
    UNION ALL
    SELECT 'condicion'    FROM payroll_condicion WHERE codigo_sos IS NULL
    UNION ALL
    SELECT 'siniestrado'  FROM payroll_siniestrado WHERE codigo_sos IS NULL
    UNION ALL
    SELECT 'actividad'    FROM payroll_actividad WHERE codigo_sos IS NULL
    UNION ALL
    SELECT 'contratacion' FROM payroll_modalidad_contratacion WHERE codigo_sos IS NULL
  ) t GROUP BY tabla ORDER BY tabla
`;
console.log("\nRegistros sin codigo_sos por tabla:");
for (const r of unmapped) {
  console.log(`  ${r.tabla}: ${r.sin_sos} sin mapear`);
}

await sql.end();
