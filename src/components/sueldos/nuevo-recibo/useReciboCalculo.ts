/**
 * Cálculo del recibo en vivo para la vista "Nuevo recibo".
 *
 * Replica el pipeline de la grilla (TablaReciboSos) y del server
 * (`guardarReciboDesdeTabla`): seed de edits desde los conceptos →
 * relleno de bases implícitas (basico/divCantidad) → applySubtotalCascade →
 * montoLiquidadoDesdeEditsSos por fila activa → totalesReciboSosDesdeMontos.
 * Usa exactamente las mismas funciones exportadas, así el aside muestra al
 * centavo lo mismo que va a persistir el server.
 */
import { useMemo } from 'react';
import {
  applySubtotalCascade,
  baseColumnaDe,
  canApplyFormula,
  EMPTY_EDIT_ROW,
  type ConceptoImportado,
  type EditsMap,
} from '@/components/sueldos/TablaReciboSos';
import {
  limpiarDecimalesSos,
  montoLiquidadoDesdeEditsSos,
  parseDecimalSos,
  totalesReciboSosDesdeMontos,
} from '@/lib/sos-recibo-totales';

export interface ReciboCalculoInput {
  /** Filas del recibo (plantilla/copia con defaults ya aplicados). */
  conceptos: ConceptoImportado[];
  /** Códigos SOS activos (participan del cálculo y de los subtotales). */
  activeCodigos: Set<string>;
  /** Ediciones del usuario, pisan el seed por código. */
  edits: EditsMap;
  /** Básico de escala del empleado para el período (0 si no cargó). */
  basicoEscala?: number;
  /** Básico jornada completa (base OS). */
  basicoJornadaCompleta?: number;
  mejorSueldoSemestre?: number;
  diasSemestre?: number;
  brutoMesAnterior?: number;
}

export interface ReciboCalculoResult {
  /** Edits post-cascade: montos calculados por código (para grilla/drawer). */
  editsCalculados: EditsMap;
  /** Monto liquidado por código activo. */
  montoByCodigo: Record<string, number>;
  totales: {
    haberes: number;
    descuentos: number;
    retenciones: number;
    noRemunerativo: number;
    neto: number;
  };
}

/** Seed de una fila de edición desde el concepto (espejo de initialEdits de la grilla). */
export function seedEditRow(c: ConceptoImportado): EditsMap[string] {
  return {
    monto: limpiarDecimalesSos(c.monto),
    montoFijo: '',
    cantidad: limpiarDecimalesSos(c.cantidad),
    porcentaje: limpiarDecimalesSos(
      c.porcentaje ?? (c.pctFijo != null ? String(c.pctFijo) : '')
    ),
    importeConceptoNumero: c.importeConceptoNumero ?? '',
    importe: limpiarDecimalesSos(c.importe),
    importeMinimo: limpiarDecimalesSos(c.importeMinimo),
    importeMaximo: limpiarDecimalesSos(c.importeMaximo),
    memo: c.memo ?? '',
  };
}

/**
 * Versión pura del cálculo (sin hook), para flush de autosave y tests manuales.
 */
export function calcularRecibo(input: ReciboCalculoInput): ReciboCalculoResult {
  const {
    conceptos,
    activeCodigos,
    edits,
    basicoEscala = 0,
    basicoJornadaCompleta = 0,
    mejorSueldoSemestre = 0,
    diasSemestre = 180,
    brutoMesAnterior = 0,
  } = input;

  // 1. Seed + overlay de ediciones del usuario.
  let next: EditsMap = {};
  for (const c of conceptos) {
    next[c.codigo] = edits[c.codigo] ?? seedEditRow(c);
  }

  // 2. Bases implícitas (basico/divCantidad, valor hora): espejo del effect de
  //    la grilla que rellena montos vacíos cuando el básico está disponible.
  if (basicoEscala > 0) {
    for (const c of conceptos) {
      if (!activeCodigos.has(c.codigo)) continue;
      const row = next[c.codigo] ?? EMPTY_EDIT_ROW;
      const currentMonto = parseDecimalSos(row.monto);
      if (currentMonto !== null && currentMonto !== 0) continue; // ya tiene valor, no pisar
      const bc = baseColumnaDe(c);
      let implicitBase: number | null = null;
      if (bc === 'sueldo' || bc === 'sueldoLegajo') {
        implicitBase = basicoEscala / Math.max(1, c.divCantidad ?? 1);
      } else if (bc === 'valHora') {
        const divHs = c.divHsNorm ? 200 : 1;
        implicitBase = basicoEscala / divHs / Math.max(1, c.divCantidad ?? 1);
      }
      if (implicitBase == null || implicitBase <= 0) continue;
      const hasPct = (row.porcentaje ?? '').trim() !== '';
      const noUsaPct = c.tienePct === false;
      if (!hasPct && !noUsaPct) continue;
      const rowParaFormula = {
        ...row,
        importe: String(implicitBase),
        ...(noUsaPct && !hasPct ? { porcentaje: '100' } : {}),
      };
      if (!canApplyFormula(rowParaFormula)) continue;
      const m = montoLiquidadoDesdeEditsSos(rowParaFormula, {
        forceFormula: true,
      }).toFixed(2);
      next = {
        ...next,
        [c.codigo]: { ...row, importe: String(implicitBase), monto: m },
      };
    }
  }

  // 3. Cascade de subtotales (misma función que usa la grilla).
  next = applySubtotalCascade(
    next,
    conceptos,
    activeCodigos,
    basicoJornadaCompleta,
    mejorSueldoSemestre,
    diasSemestre,
    brutoMesAnterior,
    basicoEscala
  );

  // 4. Monto liquidado por fila activa + totales (mismo pipeline que el server).
  const montoByCodigo: Record<string, number> = {};
  for (const c of conceptos) {
    if (!activeCodigos.has(c.codigo)) continue;
    const row = next[c.codigo] ?? EMPTY_EDIT_ROW;
    montoByCodigo[c.codigo] = montoLiquidadoDesdeEditsSos(row);
  }
  const totales = totalesReciboSosDesdeMontos(montoByCodigo);

  return { editsCalculados: next, montoByCodigo, totales };
}

export function useReciboCalculo(
  input: ReciboCalculoInput
): ReciboCalculoResult {
  const {
    conceptos,
    activeCodigos,
    edits,
    basicoEscala = 0,
    basicoJornadaCompleta = 0,
    mejorSueldoSemestre = 0,
    diasSemestre = 180,
    brutoMesAnterior = 0,
  } = input;

  return useMemo(
    () =>
      calcularRecibo({
        conceptos,
        activeCodigos,
        edits,
        basicoEscala,
        basicoJornadaCompleta,
        mejorSueldoSemestre,
        diasSemestre,
        brutoMesAnterior,
      }),
    [
      conceptos,
      activeCodigos,
      edits,
      basicoEscala,
      basicoJornadaCompleta,
      mejorSueldoSemestre,
      diasSemestre,
      brutoMesAnterior,
    ]
  );
}
