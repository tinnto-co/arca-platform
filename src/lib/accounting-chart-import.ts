/**
 * Lógica pura del importador de Plan de Cuentas (sin DB ni red).
 *
 * Toma las filas parseadas del Excel + las cuentas existentes y produce un
 * "plan de import": qué crear, qué omitir (ya existe idéntico), qué está
 * modificado (mismo código, cambió algo) y los errores por fila.
 *
 * Reglas replicadas de `createBaseAccount` (validación de código, rangos
 * reservados, imputables con rubro+saldo, jerarquía código↔padre) más la
 * herencia de rubro desde la agrupación padre. La server fn aplica el resultado.
 */
import { parentCodeOf } from '@/lib/accounting-base-chart';
import {
  CUSTOM_SEGMENT_START,
  CUSTOM_CODE_PREFIX,
  ACCOUNT_GROUP_LABELS,
  ACCOUNT_TYPE_LABELS,
  EXPECTED_BALANCE_LABELS,
  EXPENSE_FUNCTION_LABELS,
} from '@/lib/accounting-labels';

export type AccountType = 'grupo' | 'imputable';
export type ExpectedBalance = 'deudor' | 'acreedor' | 'ambos';
export type ExpenseFunction =
  | 'administracion'
  | 'comercializacion'
  | 'financiero'
  | 'otro';
export type ImportTarget = 'base' | 'propia';

/** Fila cruda parseada del Excel. */
export interface ImportRow {
  /** Nº de fila del Excel (para reportar errores). */
  row: number;
  code: string;
  name: string;
  type: AccountType;
  accountGroup?: string | null;
  expectedBalance?: ExpectedBalance | null;
  expenseFunction?: ExpenseFunction | null;
  description?: string | null;
}

/** Cuenta ya existente (para dedupe / resolución de padre / diff). */
export interface ExistingAccount {
  code: string;
  name: string;
  type: AccountType;
  accountGroup: string | null;
  expectedBalance: string | null;
  expenseFunction: string | null;
  description: string | null;
}

/** Cuenta normalizada lista para insertar. */
export interface PlannedAccount {
  row: number;
  code: string;
  name: string;
  type: AccountType;
  accountGroup: string | null;
  expectedBalance: ExpectedBalance | null;
  expenseFunction: ExpenseFunction | null;
  description: string | null;
  /** Código del padre (o null si es raíz), resuelto por prefijo. */
  parentCode: string | null;
}

export interface ImportError {
  row: number;
  code: string;
  message: string;
}

export interface ModifiedAccount {
  row: number;
  code: string;
  /** Campos que cambian respecto a lo existente (etiquetas legibles). */
  changes: string[];
  planned: PlannedAccount;
}

export interface ImportDiff {
  create: PlannedAccount[];
  /** Códigos que ya existen idénticos (se omiten). */
  unchanged: string[];
  modified: ModifiedAccount[];
  errors: ImportError[];
}

const CODE_RE = /^[0-9]+(\.[0-9]+)*$/;

function lastSegment(code: string): number {
  const seg = code.slice(code.lastIndexOf('.') + 1);
  const n = parseInt(seg, 10);
  return Number.isNaN(n) ? -1 : n;
}

/** ¿El código cae en el rango reservado para cuentas propias (9.x / .900+)? */
function isReservedCode(code: string): boolean {
  return (
    code.startsWith(CUSTOM_CODE_PREFIX) ||
    lastSegment(code) >= CUSTOM_SEGMENT_START
  );
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export interface PlanImportOptions {
  rows: ImportRow[];
  target: ImportTarget;
  /** Valores válidos del enum accountGroup. */
  validGroups: Set<string>;
  /** Cuentas visibles para resolver padres y heredar rubro (base ∪ custom según scope). */
  existingForParents: ExistingAccount[];
  /** Cuentas del scope destino: cuentan para dedupe y para detectar modificaciones. */
  destination: ExistingAccount[];
}

/**
 * Construye el plan de import (create / unchanged / modified / errors) a partir
 * de las filas del Excel y las cuentas existentes. Función pura.
 */
export function planChartImport(opts: PlanImportOptions): ImportDiff {
  const { target, validGroups } = opts;

  // 1. Normalizar filas y descartar las totalmente vacías.
  const rows: ImportRow[] = opts.rows
    .map((r) => ({
      ...r,
      code: norm(r.code),
      name: norm(r.name),
      accountGroup: r.accountGroup ? norm(r.accountGroup) : null,
      description: r.description ? norm(r.description) : null,
    }))
    .filter((r) => r.code !== '' || r.name !== '');

  const destByCode = new Map(opts.destination.map((a) => [a.code, a]));
  const parentLookup = new Map<string, ExistingAccount>();
  for (const a of opts.existingForParents) parentLookup.set(a.code, a);

  // Mapa de las filas del propio archivo (para resolver padres dentro del import).
  const importedByCode = new Map<string, ImportRow>();
  const dupErrors: ImportError[] = [];
  for (const r of rows) {
    if (!r.code) continue;
    if (importedByCode.has(r.code)) {
      dupErrors.push({
        row: r.row,
        code: r.code,
        message: `El código "${r.code}" aparece más de una vez en el archivo`,
      });
      continue;
    }
    importedByCode.set(r.code, r);
  }

  // 2. Herencia de rubro: una imputable sin rubro hereda el de su ancestro
  //    (agrupación con rubro) más cercano, buscando en el archivo y en la BD.
  const resolveInheritedGroup = (code: string): string | null => {
    let parent = parentCodeOf(code);
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const inFile = importedByCode.get(parent);
      if (inFile?.accountGroup) return norm(inFile.accountGroup);
      const inDb = parentLookup.get(parent);
      if (inDb?.accountGroup) return inDb.accountGroup;
      parent = parentCodeOf(parent);
    }
    return null;
  };

  const parentExists = (code: string): ExistingAccount | ImportRow | null => {
    return parentLookup.get(code) ?? importedByCode.get(code) ?? null;
  };

  const create: PlannedAccount[] = [];
  const unchanged: string[] = [];
  const modified: ModifiedAccount[] = [];
  const errors: ImportError[] = [...dupErrors];
  const dupCodes = new Set(dupErrors.map((e) => e.code));

  for (const r of rows) {
    // Las filas con código duplicado ya reportaron error (salvo la 1ra).
    if (dupCodes.has(r.code) && importedByCode.get(r.code)?.row !== r.row)
      continue;

    const err = (message: string) =>
      errors.push({ row: r.row, code: r.code, message });

    if (!r.code) {
      err('Falta el código de la cuenta');
      continue;
    }
    if (!CODE_RE.test(r.code)) {
      err('El código solo admite números separados por puntos (ej. "1.1.07")');
      continue;
    }
    if (!r.name) {
      err('Falta el nombre de la cuenta');
      continue;
    }

    // Rangos reservados según el scope destino.
    if (target === 'base' && isReservedCode(r.code)) {
      err('El rango "9.x" / ".900+" está reservado para cuentas propias');
      continue;
    }
    if (target === 'propia' && !isReservedCode(r.code)) {
      err('Las cuentas propias deben ir en el rango reservado "9.x" o ".900+"');
      continue;
    }

    // Rubro: heredado si es imputable y no lo trae.
    let accountGroup = r.accountGroup ?? null;
    if (r.type === 'imputable' && !accountGroup) {
      accountGroup = resolveInheritedGroup(r.code);
    }
    if (accountGroup && !validGroups.has(accountGroup)) {
      err(`Rubro inválido: "${accountGroup}"`);
      continue;
    }

    if (r.type === 'imputable') {
      if (!accountGroup) {
        err('Falta el rubro (no se pudo heredar de la agrupación padre)');
        continue;
      }
      if (!r.expectedBalance) {
        err('Las cuentas imputables requieren saldo esperado');
        continue;
      }
    }

    // Jerarquía: el padre debe existir (archivo o BD) y ser agrupación.
    const parentCode = parentCodeOf(r.code);
    if (parentCode) {
      const parent = parentExists(parentCode);
      if (!parent) {
        err(`Falta la agrupación padre "${parentCode}" (agregala al archivo)`);
        continue;
      }
      if (parent.type !== 'grupo') {
        err(`El padre "${parentCode}" no es una agrupación`);
        continue;
      }
    }

    const planned: PlannedAccount = {
      row: r.row,
      code: r.code,
      name: r.name,
      type: r.type,
      accountGroup,
      expectedBalance: r.expectedBalance ?? null,
      expenseFunction: r.expenseFunction ?? null,
      description: r.description ?? null,
      parentCode,
    };

    // 3. Clasificar contra el scope destino.
    const existing = destByCode.get(r.code);
    if (!existing) {
      create.push(planned);
      continue;
    }
    const changes = diffFields(existing, planned);
    if (changes.length === 0) unchanged.push(r.code);
    else modified.push({ row: r.row, code: r.code, changes, planned });
  }

  return { create, unchanged, modified, errors };
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  type: 'Tipo',
  accountGroup: 'Rubro',
  expectedBalance: 'Saldo esperado',
  expenseFunction: 'Función de gasto',
  description: 'Descripción',
};

/** Devuelve las etiquetas de los campos que difieren entre existente y planeado. */
function diffFields(a: ExistingAccount, b: PlannedAccount): string[] {
  const changed: string[] = [];
  const cmp = (
    key: keyof typeof FIELD_LABELS,
    x: string | null,
    y: string | null
  ) => {
    if ((x ?? '') !== (y ?? '')) changed.push(FIELD_LABELS[key]);
  };
  cmp('name', a.name, b.name);
  cmp('type', a.type, b.type);
  cmp('accountGroup', a.accountGroup, b.accountGroup);
  cmp('expectedBalance', a.expectedBalance, b.expectedBalance);
  cmp('expenseFunction', a.expenseFunction, b.expenseFunction);
  cmp('description', a.description, b.description);
  return changed;
}

/* ─────────────────── Parseo de la matriz del Excel ─────────────────── */

/** Convierte una celda (string/number/bool) a string; el resto → ''. */
function toStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** minúsculas, sin acentos (para matchear encabezados y valores de enum). */
function normText(v: unknown): string {
  return toStr(v)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const reverseLabels = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [normText(v), k]));

const TIPO_MAP = reverseLabels(ACCOUNT_TYPE_LABELS);
const RUBRO_MAP = reverseLabels(ACCOUNT_GROUP_LABELS);
const SALDO_MAP = reverseLabels(EXPECTED_BALANCE_LABELS);
const FUNCION_MAP = reverseLabels(EXPENSE_FUNCTION_LABELS);

const HEADER_ALIASES: Record<string, string> = {
  codigo: 'code',
  nombre: 'name',
  tipo: 'type',
  rubro: 'accountGroup',
  'saldo esperado': 'expectedBalance',
  saldo: 'expectedBalance',
  'funcion de gasto': 'expenseFunction',
  funcion: 'expenseFunction',
  descripcion: 'description',
};

const POS: Record<string, number> = {
  code: 0,
  name: 1,
  type: 2,
  accountGroup: 3,
  expectedBalance: 4,
  expenseFunction: 5,
  description: 6,
};

/**
 * Convierte la matriz de celdas del Excel (fila 0 = encabezado) en filas de
 * import, mapeando columnas por encabezado (con fallback posicional) y las
 * etiquetas en español a valores de enum. Descarta filas totalmente vacías.
 * Función pura (el `XLSX.read` vive en el dialog).
 */
export function parseChartMatrix(matrix: unknown[][]): ImportRow[] {
  if (matrix.length === 0) return [];
  const header = (matrix[0] ?? []).map((c) => normText(c));
  const colOf: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && colOf[key] === undefined) colOf[key] = i;
  });
  const col = (k: string) => colOf[k] ?? POS[k];
  const cell = (r: unknown[], k: string) => toStr(r[col(k)]).trim();

  const rows: ImportRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const code = cell(r, 'code');
    const name = cell(r, 'name');
    if (!code && !name) continue;

    const typeRaw = normText(cell(r, 'type'));
    const rubroRaw = normText(cell(r, 'accountGroup'));
    const saldoRaw = normText(cell(r, 'expectedBalance'));
    const funcRaw = normText(cell(r, 'expenseFunction'));

    rows.push({
      row: i + 1, // fila real del Excel (encabezado = fila 1)
      code,
      name,
      type: (TIPO_MAP[typeRaw] as AccountType) ?? 'imputable',
      accountGroup: rubroRaw ? (RUBRO_MAP[rubroRaw] ?? rubroRaw) : null,
      expectedBalance: saldoRaw
        ? ((SALDO_MAP[saldoRaw] as ExpectedBalance | undefined) ?? null)
        : null,
      expenseFunction: funcRaw
        ? ((FUNCION_MAP[funcRaw] as ExpenseFunction | undefined) ?? null)
        : null,
      description: cell(r, 'description') ? cell(r, 'description') : null,
    });
  }
  return rows;
}

/**
 * Ordena cuentas planeadas por profundidad de código (padres antes que hijos),
 * para insertarlas respetando la jerarquía.
 */
export function sortByDepth<T extends { code: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.code.split('.').length;
    const db = b.code.split('.').length;
    if (da !== db) return da - db;
    return a.code.localeCompare(b.code);
  });
}
