/**
 * Motor de generación del asiento automático de sueldos (US 3.3.1).
 *
 * Funciones PURAS (no tocan la DB): dados los conceptos de todos los recibos de
 * un período y las reglas de mapeo `sourceModule='payroll'` de la empresa,
 * deciden qué regla aplica a cada concepto y construyen las líneas de UN único
 * asiento que agrupa todo el período.
 *
 * Se reusan los tipos y el contrato de salida del motor de facturas
 * (`accounting-invoice-posting.ts`) para que ambos orígenes produzcan asientos
 * indistinguibles aguas abajo.
 *
 * Garantía de diseño (igual que en facturas): el asiento SIEMPRE balancea.
 * Los conceptos sin regla aplicable y cualquier residuo por redondeo se imputan
 * a la cuenta de sistema `pending_review`, que bloquea el cierre del período
 * hasta que el contador lo corrija.
 */
import {
  tipoConceptoDesdeCodigoSos,
  type TipoConceptoSos,
} from './sos-recibo-totales';
import type {
  AsientoArmado,
  LineaArmada,
  Lado,
  ReglaLike,
} from './accounting-invoice-posting';

/** Un concepto liquidado, tal como sale de `liquidacion_import_concepto_valor`. */
export interface ConceptoLiquidadoLike {
  /** Código SOS (1–699) o LSD importado (ej. "810000"). */
  codigo: string;
  /** Tipo persistido por el motor de liquidación; puede faltar en importados. */
  tipoLiquidacion?: string | null;
  monto: string | number | null;
}

/** Concepto agregado a nivel período: un renglón por código SOS. */
export interface ConceptoAgregado {
  codigo: string;
  /** Tipo resuelto: el persistido si es válido, si no el inferido del rango SOS. */
  tipo: TipoConceptoSos | null;
  /** Suma del concepto sobre todos los recibos del período. */
  monto: number;
}

const num = (v: string | number | null | undefined): number => {
  const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
};
const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;

const TIPOS_VALIDOS: readonly string[] = [
  'remunerativo',
  'no_remunerativo',
  'descuento',
  'retencion',
];

/**
 * Resuelve el tipo contable de un concepto. Prioriza `tipoLiquidacion` (lo que
 * decidió el motor al liquidar) y cae al rango del código SOS cuando falta o no
 * es un valor conocido — el caso de los recibos importados del LSD.
 */
export function resolverTipoConcepto(
  c: ConceptoLiquidadoLike
): TipoConceptoSos | null {
  const persisted = (c.tipoLiquidacion ?? '').trim().toLowerCase();
  if (TIPOS_VALIDOS.includes(persisted)) return persisted as TipoConceptoSos;
  return tipoConceptoDesdeCodigoSos(c.codigo);
}

/**
 * Agrega los conceptos de todos los recibos del período sumando por código.
 * Descarta los que quedan en cero: no aportan líneas al asiento.
 * El orden de salida es estable (por código numérico asc, luego alfabético)
 * para que el asiento sea reproducible.
 */
export function agregarConceptosSueldos(
  conceptos: ConceptoLiquidadoLike[]
): ConceptoAgregado[] {
  const byCodigo = new Map<string, ConceptoAgregado>();
  for (const c of conceptos) {
    const codigo = String(c.codigo ?? '').trim();
    if (!codigo) continue;
    const prev = byCodigo.get(codigo);
    if (prev) {
      prev.monto = round2(prev.monto + num(c.monto));
      // Un tipo explícito gana sobre uno inferido en cualquier recibo del período.
      prev.tipo ??= resolverTipoConcepto(c);
    } else {
      byCodigo.set(codigo, {
        codigo,
        tipo: resolverTipoConcepto(c),
        monto: round2(num(c.monto)),
      });
    }
  }

  return [...byCodigo.values()]
    .filter((c) => Math.abs(c.monto) > 0.005)
    .sort((a, b) => {
      const na = parseInt(a.codigo, 10);
      const nb = parseInt(b.codigo, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.codigo.localeCompare(b.codigo);
    });
}

/**
 * ¿La regla de sueldos matchea este concepto?
 * Vocabulario soportado en `condition`:
 *  - `sosCode` / `codigo`: código exacto; string, número o array (ej. 810000 o [101, 102])
 *  - `tipo`: remunerativo | no_remunerativo | descuento | retencion; string o array
 *  - `sosCodeFrom` / `sosCodeTo`: rango numérico inclusivo de códigos SOS
 * Una clave no soportada hace que la regla NO matchee, igual que en facturas:
 * es preferible caer a pending_review que imputar a una cuenta equivocada.
 */
export function reglaMatcheaConcepto(
  rule: ReglaLike,
  concept: ConceptoAgregado
): boolean {
  if (rule.tipo === 'default') return true;
  const cond = rule.condicion;
  if (!cond || typeof cond !== 'object') return true; // condicional sin condición = comodín

  const codigoNum = parseInt(concept.codigo, 10);

  for (const [key, raw] of Object.entries(cond)) {
    const k = key.toLowerCase();
    if (k === 'soscode' || k === 'codigo') {
      const vals = (Array.isArray(raw) ? raw : [raw]).map((v) =>
        String(v).trim()
      );
      // Compara como número cuando ambos lados lo son, para que "0101" y 101 matcheen.
      const hit = vals.some((v) => {
        if (v === concept.codigo) return true;
        const vn = parseInt(v, 10);
        return !isNaN(vn) && !isNaN(codigoNum) && vn === codigoNum;
      });
      if (!hit) return false;
    } else if (k === 'tipo') {
      if (concept.tipo === null) return false;
      const vals = (Array.isArray(raw) ? raw : [raw]).map((v) =>
        String(v).trim().toLowerCase()
      );
      if (!vals.includes(concept.tipo)) return false;
    } else if (k === 'soscodefrom') {
      const from = parseInt(String(raw), 10);
      if (isNaN(from) || isNaN(codigoNum) || codigoNum < from) return false;
    } else if (k === 'soscodeto') {
      const to = parseInt(String(raw), 10);
      if (isNaN(to) || isNaN(codigoNum) || codigoNum > to) return false;
    } else {
      return false; // clave no soportada
    }
  }
  return true;
}

/**
 * Primera regla aplicable a un concepto, por prioridad.
 * `rules` debe venir ordenado por priority asc (las más específicas primero).
 */
export function seleccionarReglaConcepto(
  rules: ReglaLike[],
  concept: ConceptoAgregado
): ReglaLike | null {
  for (const r of rules) {
    if (reglaMatcheaConcepto(r, concept)) return r;
  }
  return null;
}

/** Trazabilidad concepto → regla, para el log y la UI de revisión. */
export interface MapeoConcepto {
  codigo: string;
  tipo: TipoConceptoSos | null;
  monto: number;
  reglaId: string | null;
  reglaNombre: string | null;
  /** true si el concepto terminó imputado a pending_review. */
  sinRegla: boolean;
}

export interface AsientoSueldosArmado extends AsientoArmado {
  mapeos: MapeoConcepto[];
  /** Reglas efectivamente usadas, en orden de aparición. */
  reglasUsadasIds: string[];
  /** Suma de los conceptos que no matchearon ninguna regla. */
  totalSinRegla: number;
}

/** Clave de agrupación: una línea por cuenta y lado. */
const claveLinea = (cuentaId: string, lado: Lado): string =>
  `${cuentaId}|${lado}`;

/**
 * Construye las líneas del asiento único del período.
 *
 * Para cada concepto agregado se busca su regla; las líneas-plantilla con base
 * `concept_value` toman el monto del concepto, y `fixed` un importe fijo (se
 * aplica una sola vez por regla, no por concepto, para no multiplicarlo).
 * Las bases de facturas (total/net/vat/other_taxes) no aplican a sueldos y se
 * ignoran.
 *
 * Las líneas se agrupan por cuenta+lado, de modo que N conceptos que apuntan a
 * "Sueldos y jornales" produzcan un único renglón.
 */
export function armarLineasSueldos(
  concepts: ConceptoAgregado[],
  rules: ReglaLike[],
  cuentaPendienteRevisionId: string
): AsientoSueldosArmado {
  const acc = new Map<
    string,
    {
      cuentaId: string;
      lado: Lado;
      importe: number;
      descripcion: string | null;
    }
  >();
  const mapeos: MapeoConcepto[] = [];
  const reglasUsadasIds: string[] = [];
  const fijosAplicados = new Set<string>();
  let totalSinRegla = 0;

  const add = (
    cuentaId: string,
    lado: Lado,
    importe: number,
    descripcion: string | null
  ) => {
    if (Math.abs(importe) <= 0.005) return;
    const key = claveLinea(cuentaId, lado);
    const prev = acc.get(key);
    if (prev) prev.importe = round2(prev.importe + importe);
    else
      acc.set(key, { cuentaId, lado, importe: round2(importe), descripcion });
  };

  for (const c of concepts) {
    const rule = seleccionarReglaConcepto(rules, c);
    const lineasRegla = rule?.lineas ?? [];
    // Una regla sin líneas no imputa nada: se trata como si no hubiera regla.
    const usable = lineasRegla.filter(
      (l) => l.base === 'valor_concepto' || l.base === 'fijo'
    );

    if (!rule || usable.length === 0) {
      totalSinRegla = round2(totalSinRegla + c.monto);
      add(
        cuentaPendienteRevisionId,
        c.monto >= 0 ? 'debe' : 'haber',
        Math.abs(c.monto),
        'Conceptos de sueldos sin regla aplicable'
      );
      mapeos.push({
        codigo: c.codigo,
        tipo: c.tipo,
        monto: c.monto,
        reglaId: rule?.id ?? null,
        reglaNombre: rule?.nombre ?? null,
        sinRegla: true,
      });
      continue;
    }

    if (!reglasUsadasIds.includes(rule.id)) reglasUsadasIds.push(rule.id);

    for (const rl of usable) {
      let amt: number;
      if (rl.base === 'fijo') {
        const claveFijo = `${rule.id}|${rl.cuentaId}|${rl.lado}`;
        if (fijosAplicados.has(claveFijo)) continue;
        fijosAplicados.add(claveFijo);
        amt = round2(num(rl.importeFijo));
      } else {
        amt = c.monto;
      }
      // Un concepto negativo (ajuste en contra) invierte el lado de la línea.
      const lado: Lado =
        amt >= 0 ? rl.lado : rl.lado === 'debe' ? 'haber' : 'debe';
      add(rl.cuentaId, lado, Math.abs(amt), rl.descripcion ?? null);
    }

    mapeos.push({
      codigo: c.codigo,
      tipo: c.tipo,
      monto: c.monto,
      reglaId: rule.id,
      reglaNombre: rule.nombre,
      sinRegla: false,
    });
  }

  const lineas: LineaArmada[] = [...acc.values()].map((l) => ({
    cuentaId: l.cuentaId,
    debe: l.lado === 'debe' ? l.importe : 0,
    haber: l.lado === 'haber' ? l.importe : 0,
    descripcion: l.descripcion,
  }));

  let usoPendienteRevision = totalSinRegla !== 0;
  let motivo: string | null = usoPendienteRevision
    ? 'Hay conceptos sin regla aplicable (imputados a pending_review)'
    : null;

  if (lineas.length === 0) {
    return {
      lineas: [],
      usoPendienteRevision: false,
      motivo: 'El período no tiene conceptos con importe',
      mapeos,
      reglasUsadasIds,
      totalSinRegla: 0,
    };
  }

  // Cierre por residuo: garantiza que el asiento balancee siempre.
  const sumD = round2(lineas.reduce((s, l) => s + l.debe, 0));
  const sumC = round2(lineas.reduce((s, l) => s + l.haber, 0));
  const residual = round2(sumD - sumC);
  if (Math.abs(residual) > 0.005) {
    lineas.push({
      cuentaId: cuentaPendienteRevisionId,
      debe: residual > 0 ? 0 : -residual,
      haber: residual > 0 ? residual : 0,
      descripcion: 'Diferencia a imputar (redondeo / regla incompleta)',
    });
    usoPendienteRevision = true;
    motivo =
      motivo ??
      'Las reglas no cubren el total del período (diferencia a pending_review)';
  }

  return {
    lineas,
    usoPendienteRevision,
    motivo,
    mapeos,
    reglasUsadasIds,
    totalSinRegla,
  };
}
