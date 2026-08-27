/**
 * Informe del auditor: plantilla con variables.
 *
 * El informe es casi todo texto normativo —RT 37, Res. C.D. 46/2021— que no
 * cambia entre empresas. Lo que cambia son datos que el sistema ya tiene: el
 * nombre de la sociedad (que en el informe del estudio aparece diez veces), el
 * CUIT, el domicilio, la fecha de cierre y el rango de notas y anexos.
 *
 * Por eso la plantilla se guarda una vez por estudio y se rellena por balance,
 * en vez de reescribir cuatro páginas por cliente. Lo rellenado queda editable:
 * hay párrafos que dependen del caso —una salvedad, el pasivo con el SIPA— y
 * ninguna plantilla los puede adivinar.
 */

export interface AuditReportVars {
  /** Razón social. */
  empresa: string;
  cuit: string;
  domicilio: string;
  /** "31 de diciembre de 2025". */
  cierre: string;
  /** Número de ejercicio económico. */
  ejercicio: string;
  /** "1 a 4", según las notas que tenga el balance. */
  notas: string;
  /** "I a III", según los anexos incluidos. */
  anexos: string;
  /** "Señores Socios" o "Señores Accionistas", según el tipo societario. */
  destinatario: string;
  /** Nombre del contador que firma. */
  contador: string;
  /** "Tomo 193 Folio 084 C.P.C.E.C.A.B.A." */
  matricula: string;
  /**
   * Lugar y fecha de emisión. No van en el cuerpo: se cargan en sus campos y
   * se imprimen al pie, así siguen al campo en vez de quedar congelados en el
   * texto al momento de aplicar la plantilla.
   */
  lugar: string;
  fecha: string;
}

/** Las variables que se pueden usar, con un ejemplo para mostrar en la UI. */
export const AUDIT_REPORT_VARS: {
  key: keyof AuditReportVars;
  label: string;
  ejemplo: string;
}[] = [
  { key: 'empresa', label: 'Razón social', ejemplo: 'ADMIP SRL' },
  { key: 'cuit', label: 'CUIT', ejemplo: '30-70792005-6' },
  { key: 'domicilio', label: 'Domicilio legal', ejemplo: 'Av. Jujuy 420' },
  {
    key: 'cierre',
    label: 'Fecha de cierre',
    ejemplo: '31 de diciembre de 2025',
  },
  { key: 'ejercicio', label: 'N° de ejercicio', ejemplo: '24' },
  { key: 'notas', label: 'Rango de notas', ejemplo: '1 a 4' },
  { key: 'anexos', label: 'Rango de anexos', ejemplo: 'I a III' },
  { key: 'destinatario', label: 'Destinatario', ejemplo: 'Señores Socios' },
  { key: 'contador', label: 'Contador', ejemplo: 'Dr. I. Gustavo Sfintzi' },
  { key: 'matricula', label: 'Matrícula', ejemplo: 'Tomo 193 Folio 084' },
  { key: 'lugar', label: 'Lugar', ejemplo: 'Ciudad Autónoma de Buenos Aires' },
  { key: 'fecha', label: 'Fecha del informe', ejemplo: '03 de mayo de 2026' },
];

/** `{{empresa}}`, tolerando espacios adentro de las llaves. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Reemplaza las variables por sus valores.
 *
 * Una variable desconocida se deja tal cual, a la vista: borrarla escondería
 * el error justo en el documento que se firma. Una conocida pero vacía también
 * queda visible, para que se note que falta cargar el dato.
 */
export function fillAuditReport(
  template: string,
  vars: Partial<AuditReportVars>
): string {
  return template.replace(PLACEHOLDER, (match, key: string) => {
    const value = vars[key as keyof AuditReportVars];
    return value != null && value !== '' ? value : match;
  });
}

/** Variables que quedaron sin reemplazar, para poder avisar antes de firmar. */
export function missingVars(
  template: string,
  vars: Partial<AuditReportVars>
): string[] {
  const out = new Set<string>();
  for (const [, key] of template.matchAll(PLACEHOLDER)) {
    const known = AUDIT_REPORT_VARS.some((v) => v.key === key);
    const value = vars[key as keyof AuditReportVars];
    if (!known || value == null || value === '') out.add(key);
  }
  return [...out];
}

/** "31 de diciembre de 2025", como se escribe en el informe. */
export function fechaLarga(d: Date): string {
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${String(d.getUTCDate()).padStart(2, '0')} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** "1 a 4" con varias, "1" con una sola, vacío sin ninguna. */
export function rangoNotas(cantidad: number): string {
  if (cantidad <= 0) return '';
  return cantidad === 1 ? '1' : `1 a ${cantidad}`;
}

const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** "I a III" con varios, "I" con uno solo. */
export function rangoAnexos(cantidad: number): string {
  if (cantidad <= 0) return '';
  if (cantidad === 1) return ROMANOS[0];
  return `${ROMANOS[0]} a ${ROMANOS[Math.min(cantidad, ROMANOS.length) - 1]}`;
}

/**
 * Plantilla por defecto — RT 37, con opinión favorable.
 * Calcada del informe que presenta el estudio: más rápido corregir que reescribir.
 */
export const AUDIT_REPORT_DEFAULT = `# INFORME DEL AUDITOR INDEPENDIENTE

{{destinatario}} de
{{empresa}}
CUIT N°: {{cuit}}
Domicilio legal: {{domicilio}}

## Informe sobre la auditoría de los estados contables

### Opinión

He auditado los estados contables adjuntos de {{empresa}}, que comprenden el estado de situación patrimonial al {{cierre}}, el estado de resultados, el estado de evolución del patrimonio neto y el estado de flujo de efectivo correspondientes al ejercicio económico terminado en dicha fecha, así como un resumen de las políticas contables significativas y otra información explicativa incluidas en las notas a los Estados Contables {{notas}} y anexos {{anexos}}.

En mi opinión, los estados contables adjuntos presentan razonablemente, en todos los aspectos significativos, la situación patrimonial de {{empresa}} al {{cierre}}, así como sus resultados, la evolución de su patrimonio neto y el flujo de su efectivo correspondientes al ejercicio finalizado en esa fecha, de conformidad con las normas contables profesionales argentinas.

### Fundamento de la opinión

He llevado a cabo mi auditoría de conformidad con las normas de auditoría establecidas en la RT N° 37 de la FACPCE adoptada por la Resolución C.D.: 46/2021 del CPCECABA. Mis responsabilidades de acuerdo con dichas normas se describen más adelante en la sección Responsabilidades del auditor en la auditoría de los estados contables.

Soy independiente de {{empresa}} y he cumplido las demás responsabilidades de ética de conformidad con los requerimientos del Código de Ética del CPCECABA y de la RT N° 37 de la FACPCE adoptada por la Resolución C.D.: N° 46/2021 del CPCECABA. Considero que los elementos de juicio que he obtenido proporcionan una base suficiente y adecuada para mi opinión.

### Responsabilidad de la dirección en relación con los estados contables

La dirección de {{empresa}} es responsable de la preparación y presentación razonable de los estados contables adjuntos de conformidad con las normas contables profesionales argentinas, y del control interno que la dirección considere necesario para permitir la preparación de estados contables libres de incorrecciones significativas.

En la preparación de los estados contables la dirección es responsable de la evaluación de la capacidad de {{empresa}} para continuar como empresa en funcionamiento y utilizando el principio contable de empresa en funcionamiento, excepto que la dirección tuviera la intención de liquidar la Sociedad o cesar sus operaciones, o bien no existiera otra alternativa realista.

### Responsabilidad del auditor en relación con la auditoría de los estados contables

Mis objetivos son obtener una seguridad razonable de que los estados contables en su conjunto están libres de incorrección significativa y emitir un informe de auditoría que contenga mi opinión. Seguridad razonable es un alto grado de seguridad, pero no garantiza que una auditoría realizada de conformidad con la RT N° 37 siempre detecte una incorrección significativa cuando exista.

Como parte de una auditoría de conformidad con la RT N° 37, aplico mi juicio profesional y mantengo una actitud de escepticismo profesional durante toda la auditoría. También:

- Identifico y evalúo los riesgos de incorrección significativa en los estados contables, diseño y aplico procedimientos de auditoría para responder a dichos riesgos y obtengo elementos de juicio suficientes y adecuados para proporcionar una base para mi opinión.
- Obtengo conocimiento del control interno relevante para la auditoría con el fin de diseñar procedimientos de auditoría que sean apropiados en función de las circunstancias y no con la finalidad de expresar una opinión sobre la eficacia del control interno de la sociedad.
- Evalúo si las políticas contables aplicadas son adecuadas, así como la razonabilidad de las estimaciones contables y la correspondiente información revelada por la dirección de {{empresa}}.
- Concluyo sobre lo adecuado de la utilización por la dirección de {{empresa}} del principio contable de empresa en funcionamiento y, basándome en los elementos de juicio obtenidos, concluyo sobre si existe o no una incertidumbre significativa relacionada con hechos o con condiciones que pueden generar dudas importantes sobre la capacidad de {{empresa}} para continuar como empresa en funcionamiento.
- Evalúo la presentación general, la estructura y el contenido de los estados contables, incluida la información revelada, y si los estados contables representan las transacciones y hechos subyacentes de un modo que logren una presentación razonable.
- Me comunico con la dirección de {{empresa}} en relación con, entre otras cuestiones, la estrategia general de la auditoría y los hallazgos significativos de la auditoría, así como cualquier deficiencia significativa del control interno identificada en el transcurso de la auditoría.

## Informe sobre otros requerimientos legales y reglamentarios

- Con base en mi examen descripto, informo que los estados contables citados surgen de registros contables llevados en sus aspectos formales de acuerdo con las normas legales.
- Según surge de los registros contables de la entidad, no existen pasivos devengados al {{cierre}} a favor del Sistema Integrado Previsional Argentino en concepto de aportes y contribuciones previsionales exigibles a la citada fecha.
- La presente Certificación no tiene validez sin la autenticación de la firma por parte del Consejo Profesional.
`;

/**
 * Plantilla RT 54 (T.O. RT 59) — para entes pequeños, con opinión favorable.
 * La diferencia con RT 37 es el marco contable citado en la opinión y en el
 * fundamento: "RT 54" reemplaza a "RT 6" como norma contable aplicable.
 */
export const AUDIT_REPORT_RT54 = `# INFORME DEL AUDITOR INDEPENDIENTE

{{destinatario}} de
{{empresa}}
CUIT N°: {{cuit}}
Domicilio legal: {{domicilio}}

## Informe sobre la auditoría de los estados contables

### Opinión

He auditado los estados contables adjuntos de {{empresa}}, que comprenden el estado de situación patrimonial al {{cierre}}, el estado de resultados, el estado de evolución del patrimonio neto y el estado de flujo de efectivo correspondientes al ejercicio económico N°{{ejercicio}} terminado en dicha fecha, así como un resumen de las políticas contables significativas y otra información explicativa incluidas en las notas a los Estados Contables {{notas}} y anexos {{anexos}}.

En mi opinión, los estados contables adjuntos presentan razonablemente, en todos los aspectos significativos, la situación patrimonial de {{empresa}} al {{cierre}}, así como sus resultados, la evolución de su patrimonio neto y el flujo de su efectivo correspondientes al ejercicio finalizado en esa fecha, de conformidad con las Normas Contables Profesionales de la FACPCE, en particular la Resolución Técnica N° 54 (T.O. RT 59) — Norma contable para entes pequeños, adoptada por la Resolución C.D. del CPCECABA.

### Fundamento de la opinión

He llevado a cabo mi auditoría de conformidad con las normas de auditoría establecidas en la RT N° 37 de la FACPCE adoptada por la Resolución C.D.: 46/2021 del CPCECABA. Mis responsabilidades de acuerdo con dichas normas se describen más adelante en la sección Responsabilidades del auditor en la auditoría de los estados contables.

Soy independiente de {{empresa}} y he cumplido las demás responsabilidades de ética de conformidad con los requerimientos del Código de Ética del CPCECABA y de la RT N° 37 de la FACPCE adoptada por la Resolución C.D.: N° 46/2021 del CPCECABA. Considero que los elementos de juicio que he obtenido proporcionan una base suficiente y adecuada para mi opinión.

### Responsabilidad de la dirección en relación con los estados contables

La dirección de {{empresa}} es responsable de la preparación y presentación razonable de los estados contables adjuntos de conformidad con la RT N° 54 (T.O. RT 59) de la FACPCE, y del control interno que la dirección considere necesario para permitir la preparación de estados contables libres de incorrecciones significativas.

En la preparación de los estados contables la dirección es responsable de la evaluación de la capacidad de {{empresa}} para continuar como empresa en funcionamiento y utilizando el principio contable de empresa en funcionamiento, excepto que la dirección tuviera la intención de liquidar la Sociedad o cesar sus operaciones, o bien no existiera otra alternativa realista.

### Responsabilidad del auditor en relación con la auditoría de los estados contables

Mis objetivos son obtener una seguridad razonable de que los estados contables en su conjunto están libres de incorrección significativa y emitir un informe de auditoría que contenga mi opinión. Seguridad razonable es un alto grado de seguridad, pero no garantiza que una auditoría realizada de conformidad con la RT N° 37 siempre detecte una incorrección significativa cuando exista.

Como parte de una auditoría de conformidad con la RT N° 37, aplico mi juicio profesional y mantengo una actitud de escepticismo profesional durante toda la auditoría. También:

- Identifico y evalúo los riesgos de incorrección significativa en los estados contables, diseño y aplico procedimientos de auditoría para responder a dichos riesgos y obtengo elementos de juicio suficientes y adecuados para proporcionar una base para mi opinión.
- Obtengo conocimiento del control interno relevante para la auditoría con el fin de diseñar procedimientos de auditoría que sean apropiados en función de las circunstancias y no con la finalidad de expresar una opinión sobre la eficacia del control interno de la sociedad.
- Evalúo si las políticas contables aplicadas son adecuadas, así como la razonabilidad de las estimaciones contables y la correspondiente información revelada por la dirección de {{empresa}}.
- Concluyo sobre lo adecuado de la utilización por la dirección de {{empresa}} del principio contable de empresa en funcionamiento y, basándome en los elementos de juicio obtenidos, concluyo sobre si existe o no una incertidumbre significativa relacionada con hechos o con condiciones que pueden generar dudas importantes sobre la capacidad de {{empresa}} para continuar como empresa en funcionamiento.
- Evalúo la presentación general, la estructura y el contenido de los estados contables, incluida la información revelada, y si los estados contables representan las transacciones y hechos subyacentes de un modo que logren una presentación razonable.
- Me comunico con la dirección de {{empresa}} en relación con, entre otras cuestiones, la estrategia general de la auditoría y los hallazgos significativos de la auditoría, así como cualquier deficiencia significativa del control interno identificada en el transcurso de la auditoría.

## Informe sobre otros requerimientos legales y reglamentarios

- Con base en mi examen descripto, informo que los estados contables citados surgen de registros contables llevados en sus aspectos formales de acuerdo con las normas legales.
- Según surge de los registros contables de la entidad, no existen pasivos devengados al {{cierre}} a favor del Sistema Integrado Previsional Argentino en concepto de aportes y contribuciones previsionales exigibles a la citada fecha.
- La presente Certificación no tiene validez sin la autenticación de la firma por parte del Consejo Profesional.
`;
