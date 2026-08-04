/**
 * Estructura del documento de Estados Contables: qué secciones lo componen, en
 * qué orden y con qué número.
 *
 * El disparador fue un choque concreto. El bloque que genera el sistema se
 * llamaba «Nota 3 — Composición de los principales rubros», con el número
 * escrito en duro, mientras las notas del contador se numeraban solas 1, 2,
 * 3… Con tres notas cargadas el documento tenía dos cosas llamadas «Nota 3».
 *
 * La salida es dejar de escribir números: la composición de rubros pasa a ser
 * una nota más dentro de la secuencia, y el número de cada una sale de su
 * posición. Mover una nota renumera todo solo.
 *
 * Los anexos van por otro camino. En el balance del estudio se llaman «Anexo
 * I» al costo de mercadería vendida y «Anexo II» a los gastos por función,
 * mientras el de bienes de uso va sin número —«Anexo de Bienes de Uso»—. No
 * hay una regla para deducirlo: el rótulo lo pone el contador.
 */

/** Secciones fijas que el sistema genera. */
export type SystemSectionKey =
  | 'esp'
  | 'er'
  | 'eepn'
  | 'efe'
  | 'composicion'
  | 'anexo_i'
  | 'anexo_ii'
  | 'anexo_cmv';

/** Una entrada del documento: una sección del sistema o una nota del contador. */
export type LayoutEntry = SystemSectionKey | `note:${string}`;

export const SYSTEM_SECTION_ORDER: SystemSectionKey[] = [
  'esp',
  'er',
  'eepn',
  'efe',
  'composicion',
  'anexo_i',
  'anexo_ii',
  'anexo_cmv',
];

/**
 * Rótulos por defecto. Los de los anexos son solo una propuesta: el balance
 * del estudio numera distinto y por eso son editables.
 */
export const DEFAULT_SECTION_LABELS: Record<SystemSectionKey, string> = {
  esp: 'Estado de Situación Patrimonial',
  er: 'Estado de Resultados',
  eepn: 'Estado de Evolución del Patrimonio Neto',
  efe: 'Estado de Flujo de Efectivo y sus Equivalentes',
  composicion: 'Composición de los principales rubros',
  anexo_i: 'Anexo I · Bienes de uso',
  anexo_ii: 'Anexo II · Gastos por función',
  anexo_cmv: 'Anexo CMV · Costo de la mercadería vendida',
};

/** Secciones que se numeran como nota. Hoy solo la composición de rubros. */
export const NUMBERED_AS_NOTE: SystemSectionKey[] = ['composicion'];

export interface NoteLike {
  id: string;
  title: string;
}

/** Una nota ya numerada, lista para mostrar o imprimir. */
export interface NumberedNote {
  /** `note:<id>` o la clave de la sección del sistema. */
  entry: LayoutEntry;
  /** Número correlativo dentro del documento: 1, 2, 3… */
  number: number;
  /** Título tal como se expone, sin el número. */
  title: string;
  /** Las del sistema no se editan ni se borran. */
  isSystem: boolean;
}

/**
 * Orden de las notas cuando el contador todavía no lo tocó: las suyas en el
 * orden en que las cargó y la composición de rubros al final, que es donde
 * estaba antes de que se pudiera mover.
 */
export function defaultNoteLayout(notes: NoteLike[]): LayoutEntry[] {
  return [
    ...notes.map((n): LayoutEntry => `note:${n.id}`),
    ...NUMBERED_AS_NOTE,
  ];
}

/**
 * Numera las notas según el orden guardado.
 *
 * Tolera que el layout haya quedado viejo, que es lo normal: una nota borrada
 * desaparece y una nota nueva se agrega al final en vez de perderse. Así el
 * orden guardado nunca hace desaparecer contenido.
 */
export function numberNotes(
  layout: LayoutEntry[],
  notes: NoteLike[],
  labels: Partial<Record<SystemSectionKey, string>> = {}
): NumberedNote[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: NumberedNote[] = [];

  const push = (entry: LayoutEntry) => {
    if (seen.has(entry)) return; // el layout no puede duplicar una nota
    if (entry.startsWith('note:')) {
      const id = entry.slice(5);
      const note = byId.get(id);
      if (!note) return; // se borró: el layout viejo no la resucita
      seen.add(entry);
      out.push({
        entry,
        number: out.length + 1,
        title: note.title,
        isSystem: false,
      });
      return;
    }
    const key = entry as SystemSectionKey;
    if (!NUMBERED_AS_NOTE.includes(key)) return; // no es una nota
    seen.add(entry);
    out.push({
      entry,
      number: out.length + 1,
      title: labels[key] ?? DEFAULT_SECTION_LABELS[key],
      isSystem: true,
    });
  };

  for (const entry of layout) push(entry);
  // Lo que el layout no menciona va al final, en su orden natural.
  for (const n of notes) push(`note:${n.id}`);
  for (const key of NUMBERED_AS_NOTE) push(key);

  return out;
}

/** Número de una sección numerada como nota, para poder referenciarla. */
export function noteNumberOf(
  numbered: NumberedNote[],
  entry: LayoutEntry
): number | null {
  return numbered.find((n) => n.entry === entry)?.number ?? null;
}

/** Rótulo efectivo de una sección: el que puso el contador o el propuesto. */
export function sectionLabel(
  key: SystemSectionKey,
  labels: Partial<Record<SystemSectionKey, string>> = {}
): string {
  const custom = labels[key]?.trim();
  return custom && custom.length > 0 ? custom : DEFAULT_SECTION_LABELS[key];
}

/* ──────────────── Referencias desde los estados a notas y anexos ──────────────── */

/**
 * Anexo al que remite cada rubro. En el balance del estudio el Estado de
 * Situación Patrimonial dice «Bienes de Uso … s/Anexo de Bienes de Uso» y el
 * de Resultados «Gastos de Comercialización (S/Anexo II)».
 */
export const ANEXO_REFERENCE_BY_GROUP: Record<string, SystemSectionKey> = {
  bienes_uso: 'anexo_i',
  costo_ventas: 'anexo_cmv',
  gastos_administracion: 'anexo_ii',
  gastos_comercializacion: 'anexo_ii',
  gastos_financieros: 'anexo_ii',
};

export interface ReferenceContext {
  /** Rubros que expone la composición de rubros, en el orden en que salen. */
  composicionGroups: string[];
  /** Número que le tocó a la composición; null si no está en el documento. */
  composicionNumber: number | null;
  labels: Partial<Record<SystemSectionKey, string>>;
  /** Anexos que el documento realmente incluye: sin datos no se referencian. */
  anexosPresentes?: SystemSectionKey[];
}

/**
 * Referencia que se imprime al lado de un rubro: «(Nota 3.1)» o «(s/Anexo II)».
 *
 * La subnumeración de la composición no se configura: sale del orden en que la
 * propia nota expone los rubros, así que nunca puede apuntar a la línea
 * equivocada. Devuelve null cuando el rubro no tiene a dónde remitir.
 */
export function referenceForGroup(
  group: string,
  ctx: ReferenceContext
): string | null {
  const anexo = ANEXO_REFERENCE_BY_GROUP[group];
  if (anexo) {
    const presentes = ctx.anexosPresentes;
    if (presentes && !presentes.includes(anexo)) return null;
    return `s/${sectionLabelShort(anexo, ctx.labels)}`;
  }
  if (ctx.composicionNumber == null) return null;
  const i = ctx.composicionGroups.indexOf(group);
  if (i < 0) return null;
  return `Nota ${ctx.composicionNumber}.${i + 1}`;
}

/**
 * Rótulo corto para la referencia: en el cuerpo del estado no entra
 * «Anexo I · Bienes de uso», alcanza con «Anexo I».
 */
function sectionLabelShort(
  key: SystemSectionKey,
  labels: Partial<Record<SystemSectionKey, string>> = {}
): string {
  return sectionLabel(key, labels).split('·')[0].trim();
}
