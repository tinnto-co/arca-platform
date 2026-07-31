/**
 * Motor de generación de asientos automáticos desde comprobantes (Fase 3.2).
 *
 * Funciones PURAS (no tocan la DB): dado un comprobante y las reglas de mapeo de
 * la empresa, deciden qué regla aplica y construyen las líneas del asiento.
 *
 * Garantía de diseño: el asiento SIEMPRE balancea. Cualquier residuo (otros
 * tributos sin línea en la regla, redondeos, o ausencia total de regla) se
 * imputa a la cuenta de sistema `pendiente de revisión`, que bloquea el cierre
 * del período hasta que el contador la corrija.
 */
import type {
  asientoLineaLado,
  comprobanteDireccion,
  reglaMapeoBase,
  reglaMapeoTipo,
} from '@/drizzle/schema';

export type Direccion = (typeof comprobanteDireccion.enumValues)[number];
export type Lado = (typeof asientoLineaLado.enumValues)[number];
export type Base = (typeof reglaMapeoBase.enumValues)[number];
export type ReglaTipo = (typeof reglaMapeoTipo.enumValues)[number];

export interface ComprobanteLike {
  direccion: Direccion;
  /** Letra del comprobante (A/B/C/M/...), del catálogo `comprobante_tipo`. */
  letra: string | null;
  total: string | number;
  ivaTotal: string | number;
  otrosTributos: string | number;
}

export interface ImportesComprobante {
  total: number;
  /** total - IVA - otros tributos (la base "neta" imputable a Ventas/Compras). */
  neto: number;
  iva: number;
  otrosTributos: number;
}

const num = (v: string | number | null | undefined): number => {
  const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
};
const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;

/**
 * Descompone los importes en total / neto / IVA / otros tributos.
 *
 * El neto se calcula restando en vez de leer `neto_gravado`: así la suma de las
 * partes da exactamente el total aunque el comprobante venga descuadrado de
 * AFIP, y el asiento nunca queda desbalanceado por culpa del dato de origen.
 */
export function calcularImportes(c: ComprobanteLike): ImportesComprobante {
  const total = round2(num(c.total));
  const iva = round2(num(c.ivaTotal));
  const otrosTributos = round2(num(c.otrosTributos));
  const neto = round2(total - iva - otrosTributos);
  return { total, neto, iva, otrosTributos };
}

/** Resuelve el importe de una línea según su base de cálculo. */
export function importeSegunBase(
  base: Base,
  importes: ImportesComprobante,
  importeFijo?: number | string | null
): number {
  switch (base) {
    case 'total':
      return importes.total;
    case 'neto':
      return importes.neto;
    case 'iva':
      return importes.iva;
    case 'otros_tributos':
      return importes.otrosTributos;
    case 'fijo':
      return round2(num(importeFijo));
    case 'valor_concepto':
      return 0; // solo aplica a sueldos, no a comprobantes
    default:
      return 0;
  }
}

export interface ReglaLineaLike {
  cuentaId: string;
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

/**
 * ¿La regla condicional matchea el comprobante?
 * Vocabulario soportado en `condicion`:
 *  - `direccion`: "emitido" | "recibido"
 *  - `letra`: letra del comprobante; string o array (ej. "A" o ["A","M"])
 * Una clave no soportada hace que la regla NO matchee (evita imputaciones erróneas).
 */
export function reglaMatchea(regla: ReglaLike, c: ComprobanteLike): boolean {
  if (regla.tipo === 'default') return true;
  const cond = regla.condicion;
  if (!cond || typeof cond !== 'object') return true; // condicional sin condición = comodín

  for (const [clave, valor] of Object.entries(cond)) {
    const k = clave.toLowerCase();
    if (k === 'direccion') {
      if (String(valor).trim().toLowerCase() !== c.direccion) return false;
    } else if (k === 'letra') {
      const tiene = (c.letra ?? '').trim().toUpperCase();
      const valores = Array.isArray(valor) ? valor : [valor];
      if (!valores.map((v) => String(v).trim().toUpperCase()).includes(tiene))
        return false;
    } else {
      return false; // clave no soportada
    }
  }
  return true;
}

/**
 * Selecciona la primera regla aplicable por prioridad.
 * `reglas` debe venir ordenado por prioridad asc (las más específicas primero).
 */
export function seleccionarRegla(
  reglas: ReglaLike[],
  c: ComprobanteLike
): ReglaLike | null {
  for (const r of reglas) {
    if (reglaMatchea(r, c)) return r;
  }
  return null;
}

export interface LineaArmada {
  cuentaId: string;
  debe: number;
  haber: number;
  descripcion: string | null;
}

export interface AsientoArmado {
  lineas: LineaArmada[];
  usoPendienteRevision: boolean;
  /** Motivo por el que cayó (parcial o total) a pendiente de revisión, si aplica. */
  motivo: string | null;
}

/**
 * Construye las líneas del asiento a partir de la regla (o sin regla).
 * Siempre devuelve un asiento balanceado. Asume importes.total > 0
 * (los comprobantes con total <= 0 se filtran antes).
 */
export function armarLineas(
  regla: ReglaLike | null,
  importes: ImportesComprobante,
  cuentaPendienteRevisionId: string
): AsientoArmado {
  const placeholder = (descripcion: string, motivo: string): AsientoArmado => ({
    lineas: [
      {
        cuentaId: cuentaPendienteRevisionId,
        debe: importes.total,
        haber: 0,
        descripcion,
      },
      {
        cuentaId: cuentaPendienteRevisionId,
        debe: 0,
        haber: importes.total,
        descripcion,
      },
    ],
    usoPendienteRevision: true,
    motivo,
  });

  if (!regla) {
    return placeholder(
      'Sin regla aplicable — imputar manualmente',
      'Sin regla aplicable'
    );
  }

  const lineas: LineaArmada[] = [];
  for (const rl of regla.lineas) {
    const importe = round2(importeSegunBase(rl.base, importes, rl.importeFijo));
    if (importe <= 0) continue; // descarta líneas en cero (ej. IVA en factura B)
    lineas.push({
      cuentaId: rl.cuentaId,
      debe: rl.lado === 'debe' ? importe : 0,
      haber: rl.lado === 'haber' ? importe : 0,
      descripcion: rl.descripcion ?? null,
    });
  }

  if (lineas.length === 0) {
    return placeholder(
      'Regla sin importes — imputar manualmente',
      'La regla no produjo importes'
    );
  }

  const sumaDebe = round2(lineas.reduce((s, l) => s + l.debe, 0));
  const sumaHaber = round2(lineas.reduce((s, l) => s + l.haber, 0));
  const residuo = round2(sumaDebe - sumaHaber);

  let usoPendienteRevision = false;
  let motivo: string | null = null;

  if (Math.abs(residuo) > 0.005) {
    lineas.push({
      cuentaId: cuentaPendienteRevisionId,
      debe: residuo > 0 ? 0 : -residuo,
      haber: residuo > 0 ? residuo : 0,
      descripcion: 'Diferencia a imputar (otros tributos / redondeo)',
    });
    usoPendienteRevision = true;
    motivo =
      'La regla no cubre el total del comprobante (diferencia a pendiente de revisión)';
  }

  return { lineas, usoPendienteRevision, motivo };
}
