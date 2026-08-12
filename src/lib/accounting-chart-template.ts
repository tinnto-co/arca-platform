/**
 * Generador de la plantilla Excel para importar/exportar el Plan de Cuentas.
 *
 * Dos modos:
 * - 'blank'   → esqueleto estándar de rubros (agrupaciones) para armar el plan
 *               desde cero. El contador cuelga sus cuentas imputables debajo.
 * - 'current' → el plan actual ya relleno, para agregar cuentas / editar y
 *               volver a importar ("Descargar plan actual").
 *
 * La jerarquía se define por el CÓDIGO (el padre es el código sin el último
 * segmento), así que el orden de las filas no importa al reimportar.
 * El rubro de las cuentas imputables se HEREDA de su agrupación padre, por lo
 * que la columna "Rubro" solo se completa en las agrupaciones.
 *
 * Corre en el navegador (usa `document` para disparar la descarga), igual que
 * los exports de `mayor-export.tsx`.
 */
import ExcelJSRaw from 'exceljs';
import {
  ACCOUNT_GROUP_LABELS,
  ACCOUNT_GROUP_SECTIONS,
  ACCOUNT_TYPE_LABELS,
  EXPECTED_BALANCE_LABELS,
  EXPENSE_FUNCTION_LABELS,
  type AccountGroup,
} from '@/lib/accounting-labels';
import { BASE_CHART } from '@/lib/accounting-base-chart';

/* ───────────────────────── Tipado mínimo de exceljs ───────────────────────── */

interface XLDataValidation {
  type: 'list';
  allowBlank?: boolean;
  formulae: string[];
  showErrorMessage?: boolean;
  error?: string;
  errorTitle?: string;
}
interface XLCell {
  value: unknown;
  font?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    color?: { argb: string };
  };
  numFmt?: string;
  alignment?: {
    horizontal?: 'left' | 'right' | 'center';
    vertical?: string;
    wrapText?: boolean;
  };
  fill?: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } };
  border?: Record<string, { style: string; color?: { argb: string } }>;
  dataValidation?: XLDataValidation;
}
interface XLRow {
  number: number;
  height?: number;
  getCell(col: number): XLCell;
}
interface XLColumn {
  width?: number;
}
interface XLWorksheet {
  getColumn(col: number): XLColumn;
  getRow(row: number): XLRow;
  getCell(ref: string): XLCell;
  addRow(values: unknown[]): XLRow;
  mergeCells(range: string): void;
  columns: XLColumn[];
  state?: 'visible' | 'hidden' | 'veryHidden';
}
const ExcelJS = ExcelJSRaw as unknown as {
  Workbook: new () => {
    addWorksheet(
      name: string,
      options?: {
        views?: { showGridLines?: boolean; state?: string }[];
        state?: 'visible' | 'hidden' | 'veryHidden';
      }
    ): XLWorksheet;
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Buffer> };
  };
};

/* ─────────────────────────────── Constantes ─────────────────────────────── */

const GREY = 'FFEFEFEF';
const HEADER_GREY = 'FFDDE3EA';
const BORDER_GREY = 'FFBBBBBB';
const HINT_GREY = 'FF888888';

/** Filas en blanco (con dropdowns) que se intercalan debajo de cada rubro. */
const BLANK_ROWS_PER_RUBRO = 6;
/** Filas en blanco extra al final (para rubros/grupos nuevos). */
const BLANK_ROWS_END = 15;

const HEADERS = [
  'Código',
  'Nombre',
  'Tipo',
  'Rubro',
  'Saldo esperado',
  'Función de gasto',
  'Descripción',
];
const NCOLS = HEADERS.length;
const COL_WIDTHS = [16, 42, 14, 28, 16, 20, 34];

/** Etiquetas ordenadas por sección (para el dropdown de rubros). */
const RUBRO_LABELS: string[] = ACCOUNT_GROUP_SECTIONS.flatMap((s) =>
  s.groups.map((g) => ACCOUNT_GROUP_LABELS[g])
);
const TIPO_LABELS = [ACCOUNT_TYPE_LABELS.grupo, ACCOUNT_TYPE_LABELS.imputable];
const SALDO_LABELS = [
  EXPECTED_BALANCE_LABELS.deudor,
  EXPECTED_BALANCE_LABELS.acreedor,
  EXPECTED_BALANCE_LABELS.ambos,
];
const FUNCION_LABELS = [
  EXPENSE_FUNCTION_LABELS.administracion,
  EXPENSE_FUNCTION_LABELS.comercializacion,
  EXPENSE_FUNCTION_LABELS.financiero,
  EXPENSE_FUNCTION_LABELS.otro,
];

/* ─────────────────────────────── Helpers ─────────────────────────────── */

export interface ChartTemplateAccount {
  code: string;
  name: string;
  type: 'grupo' | 'imputable';
  accountGroup?: string | null;
  expectedBalance?: 'deudor' | 'acreedor' | 'ambos' | null;
  expenseFunction?: string | null;
  description?: string | null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fillRow(row: XLRow, argb: string, cols = NCOLS) {
  for (let c = 1; c <= cols; c++) {
    row.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb },
    };
  }
}

/** ¿`code` es la agrupación `prefix` o cuelga de ella? (jerarquía por código) */
function isUnder(code: string, prefix: string): boolean {
  return code === prefix || code.startsWith(`${prefix}.`);
}

/** Compara dos códigos jerárquicos segmento a segmento (numérico). */
function compareCode(a: string, b: string): number {
  const pa = a.split('.').map((s) => Number(s));
  const pb = b.split('.').map((s) => Number(s));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Esqueleto de agrupaciones estándar (excluye la clase de sistema "0"). */
function skeletonGroups(): ChartTemplateAccount[] {
  return BASE_CHART.filter(
    (a) => a.type === 'grupo' && !a.code.startsWith('0')
  ).map((a) => ({
    code: a.code,
    name: a.name,
    type: 'grupo' as const,
    accountGroup: a.accountGroup ?? null,
    expectedBalance: null,
    expenseFunction: null,
    description: null,
  }));
}

/* ─────────────────────────── Hoja "Listas" (oculta) ─────────────────────── */

/**
 * Escribe las listas de valores en una hoja oculta y devuelve las fórmulas de
 * data validation para cada columna (referencias de rango, porque la lista de
 * rubros supera el límite de 255 caracteres de las listas embebidas).
 */
function writeListas(wb: {
  addWorksheet(
    name: string,
    options?: { state?: 'visible' | 'hidden' | 'veryHidden' }
  ): XLWorksheet;
}): {
  tipo: string;
  rubro: string;
  saldo: string;
  funcion: string;
} {
  const ws = wb.addWorksheet('Listas', { state: 'veryHidden' });

  const putColumn = (col: string, values: string[]) => {
    values.forEach((v, i) => {
      ws.getCell(`${col}${i + 1}`).value = v;
    });
    return `Listas!$${col}$1:$${col}$${values.length}`;
  };

  return {
    tipo: putColumn('A', TIPO_LABELS),
    rubro: putColumn('B', RUBRO_LABELS),
    saldo: putColumn('C', SALDO_LABELS),
    funcion: putColumn('D', FUNCION_LABELS),
  };
}

function listValidation(formula: string, error: string): XLDataValidation {
  return {
    type: 'list',
    allowBlank: true,
    formulae: [formula],
    showErrorMessage: true,
    errorTitle: 'Valor no válido',
    error,
  };
}

/* ─────────────────────────── Hoja "Plan de cuentas" ─────────────────────── */

function writePlanSheet(
  ws: XLWorksheet,
  accounts: ChartTemplateAccount[],
  lists: ReturnType<typeof writeListas>,
  markExisting: boolean
): void {
  // Encabezado.
  const head = ws.addRow(HEADERS);
  for (let c = 1; c <= NCOLS; c++) {
    head.getCell(c).font = { bold: true };
    head.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_GREY },
    };
    head.getCell(c).border = {
      bottom: { style: 'thin', color: { argb: BORDER_GREY } },
    };
  }

  // Escribe una fila de cuenta (esqueleto o plan actual).
  const writeAccount = (a: ChartTemplateAccount) => {
    const isGroup = a.type === 'grupo';
    const row = ws.addRow([
      a.code,
      a.name,
      isGroup ? ACCOUNT_TYPE_LABELS.grupo : ACCOUNT_TYPE_LABELS.imputable,
      a.accountGroup
        ? (ACCOUNT_GROUP_LABELS[a.accountGroup as AccountGroup] ?? '')
        : '',
      a.expectedBalance ? EXPECTED_BALANCE_LABELS[a.expectedBalance] : '',
      a.expenseFunction
        ? (EXPENSE_FUNCTION_LABELS[
            a.expenseFunction as keyof typeof EXPENSE_FUNCTION_LABELS
          ] ?? '')
        : '',
      a.description ?? '',
    ]);
    row.getCell(1).numFmt = '@'; // código como texto (preserva ceros / puntos)
    // Las agrupaciones (y el plan ya existente) van en gris para distinguirlas.
    if (isGroup || markExisting) {
      fillRow(row, GREY);
      if (isGroup) row.getCell(2).font = { bold: true };
    }
  };

  // Escribe N filas en blanco con dropdowns, listas para cargar cuentas.
  const writeBlanks = (n: number) => {
    for (let i = 0; i < n; i++) {
      const row = ws.addRow([]);
      row.getCell(1).numFmt = '@';
      row.getCell(3).dataValidation = listValidation(
        lists.tipo,
        'Elegí "Agrupación" o "Imputable".'
      );
      row.getCell(4).dataValidation = listValidation(
        lists.rubro,
        'Elegí un rubro. Las cuentas imputables heredan el rubro de su agrupación padre (podés dejarlo vacío).'
      );
      row.getCell(5).dataValidation = listValidation(
        lists.saldo,
        'Elegí "Deudor", "Acreedor" o "Ambos".'
      );
      row.getCell(6).dataValidation = listValidation(
        lists.funcion,
        'Elegí una función de gasto (opcional).'
      );
    }
  };

  // Recorre las cuentas en orden jerárquico; al terminar el bloque de cada
  // rubro (agrupación con accountGroup) intercala filas en blanco debajo, para
  // que el contador cargue sus cuentas imputables en contexto.
  const sorted = [...accounts].sort((a, b) => compareCode(a.code, b.code));
  let currentRubro: string | null = null;
  for (const a of sorted) {
    if (currentRubro && !isUnder(a.code, currentRubro)) {
      writeBlanks(BLANK_ROWS_PER_RUBRO);
      currentRubro = null;
    }
    writeAccount(a);
    if (a.type === 'grupo' && a.accountGroup) currentRubro = a.code;
  }
  if (currentRubro) writeBlanks(BLANK_ROWS_PER_RUBRO);

  // Espacio extra al final para rubros o grupos nuevos.
  writeBlanks(BLANK_ROWS_END);

  COL_WIDTHS.forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });
}

/* ─────────────────────────── Hoja "Instrucciones" ─────────────────────── */

function writeInstrucciones(ws: XLWorksheet): void {
  const title = ws.addRow(['Cómo completar el Plan de Cuentas']);
  title.getCell(1).font = { bold: true, size: 14 };
  ws.addRow([]);

  const paras: [string, boolean][] = [
    ['Dónde cargar tus cuentas', true],
    [
      'En la hoja "Plan de cuentas", debajo de cada rubro (las filas grises) hay filas vacías: escribí ahí tus cuentas imputables. Las columnas Tipo, Rubro y Saldo tienen listas desplegables.',
      false,
    ],
    ['1) El CÓDIGO define la jerarquía', true],
    [
      'El padre de una cuenta es su código sin el último segmento. Ej.: "1.1.01.001" cuelga de "1.1.01". No importa en qué fila la escribas: el código decide dónde va.',
      false,
    ],
    ['2) Tipo de cuenta', true],
    [
      'Agrupación = solo agrupa, no recibe movimientos. Imputable = donde se registran los asientos (las hojas del árbol).',
      false,
    ],
    ['3) El RUBRO se hereda', true],
    [
      'Solo completá el rubro en las agrupaciones. Las cuentas imputables heredan el rubro de su agrupación padre; podés dejar esa columna vacía.',
      false,
    ],
    ['4) Saldo esperado', true],
    [
      'Obligatorio en las cuentas imputables: Deudor, Acreedor o Ambos. En las regularizadoras (ej. "(-) Amortización acumulada") suele ser el contrario al del rubro.',
      false,
    ],
    ['5) Función de gasto (opcional)', true],
    [
      'Solo para cuentas de gasto: Administración, Comercialización, Financiero u Otros.',
      false,
    ],
    ['6) Códigos reservados', true],
    [
      'El rango que empieza con "9." queda reservado para cuentas propias de cada empresa. No lo uses en el plan base del estudio.',
      false,
    ],
  ];
  for (const [text, isTitle] of paras) {
    const row = ws.addRow([text]);
    ws.mergeCells(`A${row.number}:D${row.number}`);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    if (isTitle) row.getCell(1).font = { bold: true, size: 11 };
    else {
      row.getCell(1).font = { color: { argb: 'FF333333' } };
      row.height = 30;
    }
  }

  ws.addRow([]);
  const exH = ws.addRow(['Ejemplo (Caja y Bancos)']);
  exH.getCell(1).font = { bold: true, size: 11 };

  const exHeader = ws.addRow(['Código', 'Nombre', 'Tipo', 'Saldo esperado']);
  for (let c = 1; c <= 4; c++) {
    exHeader.getCell(c).font = { bold: true };
    exHeader.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_GREY },
    };
  }
  const examples: [string, string, string, string][] = [
    ['1.1.01', 'Caja y Bancos', 'Agrupación', ''],
    ['1.1.01.001', 'Caja', 'Imputable', 'Deudor'],
    ['1.1.01.002', 'Banco Galicia c/c', 'Imputable', 'Deudor'],
  ];
  for (const ex of examples) {
    const row = ws.addRow(ex);
    row.getCell(1).numFmt = '@';
    row.getCell(1).font = { color: { argb: HINT_GREY } };
  }

  [22, 32, 16, 18].forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });
}

/* ─────────────────────────────── API pública ─────────────────────────────── */

export interface ChartTemplateOptions {
  /** 'blank' = esqueleto estándar; 'current' = plan actual relleno. */
  mode: 'blank' | 'current';
  /** Requerido en modo 'current': cuentas actuales del plan. */
  accounts?: ChartTemplateAccount[];
  /** Nombre para el archivo (ej. razón social o "estudio"). */
  label?: string;
}

/**
 * Genera y descarga la plantilla del plan de cuentas en formato .xlsx.
 */
/** Construye el workbook y devuelve el buffer .xlsx (sin tocar el DOM). */
export async function buildChartTemplateBuffer(
  opts: ChartTemplateOptions
): Promise<ArrayBuffer | Buffer> {
  const wb = new ExcelJS.Workbook();
  const lists = writeListas(wb);

  const plan = wb.addWorksheet('Plan de cuentas', {
    views: [{ showGridLines: false }],
  });
  const accounts =
    opts.mode === 'current' ? (opts.accounts ?? []) : skeletonGroups();
  writePlanSheet(plan, accounts, lists, opts.mode === 'current');

  const instrucciones = wb.addWorksheet('Instrucciones', {
    views: [{ showGridLines: false }],
  });
  writeInstrucciones(instrucciones);

  return wb.xlsx.writeBuffer();
}

export async function downloadChartTemplate(
  opts: ChartTemplateOptions
): Promise<void> {
  const slug = (opts.label ?? 'plan_de_cuentas')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefix =
    opts.mode === 'current' ? 'plan_cuentas' : 'plantilla_plan_cuentas';

  const buffer = await buildChartTemplateBuffer(opts);
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${prefix}_${slug}.xlsx`
  );
}
