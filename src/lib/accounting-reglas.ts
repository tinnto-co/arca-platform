/**
 * Núcleo común de las reglas de mapeo (asientos automáticos).
 *
 * Una regla dice a qué cuentas va cada cosa y con qué importe. Hoy hay dos
 * módulos que las usan —facturas (`comprobante`) y sueldos (`recibo`)— y viene
 * un tercero, los movimientos del banco. Lo que es igual en todos vive acá:
 * la forma de la regla y de sus líneas, la elección por prioridad, el cierre
 * por diferencia contra "Pendiente de revisión" y qué bases y qué condiciones
 * tienen sentido en cada módulo.
 *
 * Lo propio de cada módulo —qué condición se entiende y de dónde sale el
 * importe— queda en su motor: `accounting-invoice-posting.ts` para facturas y
 * `accounting-payroll-posting.ts` para sueldos.
 *
 * Funciones puras: no tocan la base.
 */
import type {
  asientoLineaLado,
  reglaMapeoBase,
  reglaMapeoModulo,
  reglaMapeoTipo,
} from '@/drizzle/schema';

export type Lado = (typeof asientoLineaLado.enumValues)[number];
export type Base = (typeof reglaMapeoBase.enumValues)[number];
export type ReglaTipo = (typeof reglaMapeoTipo.enumValues)[number];
export type ModuloRegla = (typeof reglaMapeoModulo.enumValues)[number];

export interface ReglaLineaLike {
  /**
   * Null solo cuando la línea usa la cuenta del banco (`usaCuentaBanco`): ahí
   * la cuenta se resuelve al generar, con la de la cuenta bancaria del
   * movimiento.
   */
  cuentaId: string | null;
  /** Solo en el módulo de banco. Ver `accounting-bank-posting`. */
  usaCuentaBanco?: boolean;
  lado: Lado;
  base: Base;
  importeFijo?: number | string | null;
  descripcion?: string | null;
}

export interface ReglaLike {
  id: string;
  nombre: string;
  tipo: ReglaTipo;
  condicion: Record<string, unknown> | null;
  prioridad: number;
  lineas: ReglaLineaLike[];
}

export interface LineaArmada {
  cuentaId: string;
  debe: number;
  haber: number;
  descripcion: string | null;
  /** Regla que generó la línea; null en las de "Pendiente de revisión". */
  reglaId?: string | null;
}

export interface AsientoArmado {
  lineas: LineaArmada[];
  usoPendienteRevision: boolean;
  /** Motivo por el que cayó (parcial o total) a pendiente de revisión, si aplica. */
  motivo: string | null;
}

export const num = (v: string | number | null | undefined): number => {
  const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
};

export const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;

/** Menos que esto es redondeo, no una diferencia real. */
export const TOLERANCIA = 0.005;

/**
 * Bases que tienen sentido en cada módulo. Una factura tiene total, neto, IVA
 * y otros tributos; un concepto de sueldos, su propio valor; un movimiento del
 * banco, su importe (que se guarda como `total`). El importe fijo sirve en
 * todos.
 */
export const BASES_POR_MODULO: Record<ModuloRegla, readonly Base[]> = {
  comprobante: ['total', 'neto', 'iva', 'otros_tributos', 'fijo'],
  recibo: ['valor_concepto', 'fijo'],
  movimiento_bancario: ['total', 'fijo'],
};

/**
 * Qué puede filtrar la condición de cada módulo. Una clave que no esté acá
 * hace que la regla no matchee: es preferible caer a "Pendiente de revisión"
 * que imputar a una cuenta equivocada.
 */
export const CLAVES_CONDICION_POR_MODULO: Record<
  ModuloRegla,
  readonly string[]
> = {
  comprobante: ['direccion', 'letra'],
  recibo: ['soscode', 'codigo', 'tipo', 'soscodefrom', 'soscodeto'],
  movimiento_bancario: ['categoria', 'direccion', 'cuenta_bancaria_id'],
};

/**
 * El orden real en que se prueban las reglas: primero las condicionales, en el
 * orden de la cola, y al final las "por defecto".
 *
 * La pantalla siempre dijo que una regla por defecto se usa "cuando ninguna
 * otra aplica", pero el motor iba solo por prioridad: una default creada
 * primero tapaba a todas las condicionales de abajo, y las reglas nuevas se
 * agregan al final de la cola. Entre condicionales, y entre defaults, sigue
 * mandando la prioridad.
 */
export function ordenDeEvaluacion<T extends Pick<ReglaLike, 'tipo'>>(
  reglas: T[]
): T[] {
  return [
    ...reglas.filter((r) => r.tipo !== 'default'),
    ...reglas.filter((r) => r.tipo === 'default'),
  ];
}

/**
 * La primera regla que matchea, en el orden de evaluación.
 * Cada módulo pone su propia forma de matchear.
 */
export function seleccionarPorPrioridad<T>(
  reglas: ReglaLike[],
  item: T,
  matchea: (regla: ReglaLike, item: T) => boolean
): ReglaLike | null {
  for (const r of ordenDeEvaluacion(reglas)) {
    if (matchea(r, item)) return r;
  }
  return null;
}

/**
 * Para cada regla activa que nunca se va a aplicar, la primera anterior que la
 * tapa. Se mira en el orden en que el motor las prueba. `cubre(a, b)` lo pone
 * cada módulo: sabe si todo lo que matchea `b` ya lo agarró `a`.
 */
export function detectarTapadas<
  T extends Pick<ReglaLike, 'id' | 'nombre' | 'tipo' | 'condicion'> & {
    activa: boolean;
  },
>(
  reglas: T[],
  cubre: (a: T, b: T) => boolean
): Map<string, { id: string; nombre: string }> {
  const out = new Map<string, { id: string; nombre: string }>();
  const activas = ordenDeEvaluacion(reglas.filter((r) => r.activa));
  activas.forEach((b, i) => {
    const tapa = activas.slice(0, i).find((a) => cubre(a, b));
    if (tapa) out.set(b.id, { id: tapa.id, nombre: tapa.nombre });
  });
  return out;
}

/** Suma del Debe y del Haber de un conjunto de líneas. */
export function totalesDeLineas(lineas: LineaArmada[]): {
  debe: number;
  haber: number;
  residuo: number;
} {
  const debe = round2(lineas.reduce((s, l) => s + l.debe, 0));
  const haber = round2(lineas.reduce((s, l) => s + l.haber, 0));
  return { debe, haber, residuo: round2(debe - haber) };
}

/**
 * Si las líneas no cierran, agrega la diferencia contra "Pendiente de
 * revisión" y devuelve el motivo. Es la garantía de que el asiento siempre
 * balancea: la diferencia queda a la vista y bloquea el cierre del período
 * hasta que alguien la corrija.
 *
 * Muta `lineas` a propósito: los motores la llaman con su propio arreglo.
 */
export function cerrarPorDiferencia(
  lineas: LineaArmada[],
  cuentaPendienteRevisionId: string,
  textos: { descripcion: string; motivo: string }
): { cerro: boolean; motivo: string | null } {
  const { residuo } = totalesDeLineas(lineas);
  if (Math.abs(residuo) <= TOLERANCIA) return { cerro: false, motivo: null };
  lineas.push({
    cuentaId: cuentaPendienteRevisionId,
    debe: residuo > 0 ? 0 : -residuo,
    haber: residuo > 0 ? residuo : 0,
    descripcion: textos.descripcion,
    // La diferencia no sale de ninguna regla: justamente es lo que ninguna
    // cubrió.
    reglaId: null,
  });
  return { cerro: true, motivo: textos.motivo };
}
