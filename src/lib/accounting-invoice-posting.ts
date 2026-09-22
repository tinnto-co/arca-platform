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
import type { comprobanteDireccion } from '@/drizzle/schema';
import {
  cerrarPorDiferencia,
  detectarTapadas,
  num,
  round2,
  seleccionarPorPrioridad,
  type AsientoArmado,
  type Base,
  type Lado,
  type LineaArmada,
  type ReglaLike,
  type ReglaLineaLike,
  type ReglaTipo,
} from './accounting-reglas';

export type Direccion = (typeof comprobanteDireccion.enumValues)[number];
// Los tipos comunes viven en `accounting-reglas`; se re-exportan porque medio
// módulo de contabilidad los importa desde acá desde antes del núcleo común.
export type {
  AsientoArmado,
  Base,
  Lado,
  LineaArmada,
  ReglaLike,
  ReglaLineaLike,
  ReglaTipo,
};

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

/**
 * ¿La regla matchea el comprobante?
 * Vocabulario soportado en `condicion`:
 *  - `direccion`: "emitido" | "recibido"
 *  - `letra`: letra del comprobante; string o array (ej. "A" o ["A","M"])
 * Una clave no soportada hace que la regla NO matchee (evita imputaciones erróneas).
 *
 * Una regla default es el fallback de su dirección: sólo mira `direccion` (si
 * la tiene) e ignora el resto. Las default viejas, sin condición, siguen
 * aplicando a ventas y compras.
 */
export function reglaMatchea(regla: ReglaLike, c: ComprobanteLike): boolean {
  const cond = regla.condicion;
  if (regla.tipo === 'default') {
    const dir = direccionDeCondicion(cond);
    return dir === null || dir === c.direccion;
  }
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

/** `direccion` de una condición, normalizada; null si no filtra por dirección. */
export function direccionDeCondicion(
  cond: Record<string, unknown> | null | undefined
): Direccion | null {
  if (!cond || typeof cond !== 'object') return null;
  const raw = Object.entries(cond).find(
    ([k]) => k.toLowerCase() === 'direccion'
  )?.[1];
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'emitido' || v === 'recibido' ? v : null;
}

/** Letras de una condición, en mayúsculas; null si no filtra por letra. */
export function letrasDeCondicion(
  cond: Record<string, unknown> | null | undefined
): string[] | null {
  if (!cond || typeof cond !== 'object') return null;
  const entry = Object.entries(cond).find(([k]) => k.toLowerCase() === 'letra');
  if (!entry) return null;
  const vals = Array.isArray(entry[1]) ? entry[1] : [entry[1]];
  return vals.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
}

/**
 * Sugiere la dirección a partir del nombre de la regla ("Compras A" → recibido).
 * Es sólo una sugerencia para el formulario: el motor nunca mira el nombre.
 */
export function direccionSugeridaPorNombre(nombre: string): Direccion | null {
  const n = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const compra =
    /\b(compra|compras|proveedor|proveedores|gasto|gastos|recibid[oa]s?)\b/.test(
      n
    );
  const venta = /\b(venta|ventas|cliente|clientes|emitid[oa]s?)\b/.test(n);
  if (compra === venta) return null; // ninguna o las dos: no adivinar
  return compra ? 'recibido' : 'emitido';
}

/** Texto corto de a qué comprobantes aplica una regla ("Compras · letra A, M"). */
export function describirAlcanceRegla(
  tipo: ReglaTipo,
  cond: Record<string, unknown> | null | undefined
): string {
  const dir = direccionDeCondicion(cond);
  const dirTxt =
    dir === 'emitido'
      ? 'Ventas'
      : dir === 'recibido'
        ? 'Compras'
        : 'Ventas y compras';
  if (tipo === 'default') return `${dirTxt} · cualquier letra (por defecto)`;
  const letras = letrasDeCondicion(cond);
  return letras?.length
    ? `${dirTxt} · letra ${letras.join(', ')}`
    : `${dirTxt} · cualquier letra`;
}

/**
 * ¿Todo comprobante que matchea `b` matchea también `a`? Si `a` va antes en la
 * cola, `b` no se aplica nunca. Sólo entiende el vocabulario de facturas: una
 * clave desconocida en `a` hace que `a` no matchee nada, así que no tapa.
 */
export function reglaCubre(
  a: Pick<ReglaLike, 'tipo' | 'condicion'>,
  b: Pick<ReglaLike, 'tipo' | 'condicion'>
): boolean {
  const dirA = direccionDeCondicion(a.condicion);
  const dirB = direccionDeCondicion(b.condicion);
  if (dirA !== null && dirA !== dirB) return false;
  if (a.tipo === 'default') return true;

  const condA = a.condicion;
  if (condA && typeof condA === 'object') {
    const claves = Object.keys(condA).map((k) => k.toLowerCase());
    if (claves.some((k) => k !== 'direccion' && k !== 'letra')) return false;
  }
  const letrasA = letrasDeCondicion(condA);
  if (letrasA === null || letrasA.length === 0) return true;
  // b default o sin letras aplica a cualquier letra: a (con letras) no la cubre.
  const letrasB = b.tipo === 'default' ? null : letrasDeCondicion(b.condicion);
  if (letrasB === null || letrasB.length === 0) return false;
  return letrasB.every((l) => letrasA.includes(l));
}

/**
 * Para cada regla activa que nunca se va a aplicar, la primera regla anterior
 * que la tapa. `reglas` en el orden de la cola (prioridad asc).
 */
export function detectarReglasTapadas(
  reglas: (Pick<ReglaLike, 'id' | 'nombre' | 'tipo' | 'condicion'> & {
    activa: boolean;
  })[]
): Map<string, { id: string; nombre: string }> {
  return detectarTapadas(reglas, reglaCubre);
}

export type EstadoCuadre =
  | 'ok'
  | 'sin_otros_tributos'
  | 'descuadra'
  | 'indeterminado';

/**
 * ¿Las líneas de la regla suman lo mismo en el Debe que en el Haber?
 *
 * Cada base es una combinación de neto, IVA y otros tributos (el total es la
 * suma de los tres), así que se puede comparar sin un comprobante concreto.
 * Con una base fija o de sueldos no se puede decidir: `indeterminado`.
 *
 * `sin_otros_tributos` no es un error: la regla no mapea percepciones, y si la
 * factura las trae la diferencia va a Pendiente de revisión.
 */
export function analizarCuadreRegla(
  lineas: Pick<ReglaLineaLike, 'lado' | 'base'>[]
): { estado: EstadoCuadre; mensaje: string | null } {
  const vec: Record<string, [number, number, number]> = {
    total: [1, 1, 1],
    neto: [1, 0, 0],
    iva: [0, 1, 0],
    otros_tributos: [0, 0, 1],
  };
  const debe = [0, 0, 0];
  const haber = [0, 0, 0];
  for (const l of lineas) {
    const v = vec[l.base];
    if (!v) return { estado: 'indeterminado', mensaje: null };
    const lado = l.lado === 'debe' ? debe : haber;
    for (let i = 0; i < 3; i++) lado[i] += v[i];
  }
  const dif = debe.map((d, i) => d - haber[i]);
  if (dif.every((x) => x === 0)) return { estado: 'ok', mensaje: null };
  if (dif[0] === 0 && dif[1] === 0) {
    return {
      estado: 'sin_otros_tributos',
      mensaje:
        'Si el comprobante trae percepciones u otros tributos, esa parte va a Pendiente de revisión. Agregá una línea con base «Otros impuestos / percepciones» para imputarla.',
    };
  }
  const etiqueta: Record<string, string> = {
    total: 'Total',
    neto: 'Neto',
    iva: 'IVA',
    otros_tributos: 'Otros tributos',
  };
  const suma = (lado: Lado) =>
    lineas
      .filter((l) => l.lado === lado)
      .map((l) => etiqueta[l.base])
      .join(' + ');
  return {
    estado: 'descuadra',
    mensaje: `La regla no cuadra: el Debe suma ${suma('debe')} y el Haber suma ${suma('haber')}. Como el Total ya incluye Neto + IVA + Otros tributos, los dos lados no dan lo mismo y la diferencia irá siempre a Pendiente de revisión. Revisá la base de cada línea.`,
  };
}

/**
 * Selecciona la primera regla aplicable por prioridad.
 * `reglas` debe venir ordenado por prioridad asc (las más específicas primero).
 */
export function seleccionarRegla(
  reglas: ReglaLike[],
  c: ComprobanteLike
): ReglaLike | null {
  return seleccionarPorPrioridad(reglas, c, reglaMatchea);
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
      reglaId: regla.id,
    });
  }

  if (lineas.length === 0) {
    return placeholder(
      'Regla sin importes — imputar manualmente',
      'La regla no produjo importes'
    );
  }

  const { cerro, motivo } = cerrarPorDiferencia(
    lineas,
    cuentaPendienteRevisionId,
    {
      descripcion: 'Diferencia a imputar (otros tributos / redondeo)',
      motivo:
        'La regla no cubre el total del comprobante (diferencia a pendiente de revisión)',
    }
  );

  return { lineas, usoPendienteRevision: cerro, motivo };
}
