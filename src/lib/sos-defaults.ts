/**
 * Defaults SOS por concepto y armado del payload de guardado.
 *
 * Lógica extraída (copiada, no movida) de `SueldosSimulador.tsx` para que la
 * vista nueva de "Nuevo recibo" liquide exactamente igual que la clásica sin
 * modificar el simulador. Si se ajusta un default acá, ajustar también allá.
 */
import type {
  ConceptoImportado,
  EditsMap,
} from '@/components/sueldos/TablaReciboSos';

/**
 * Valores fijos por concepto SOS (espejo de SueldosSimulador.conceptosFilas).
 * Se aplican sobre las filas de la plantilla/copia, en cualquier modo.
 */
export function aplicarDefaultsSos(
  filas: ConceptoImportado[],
  antiguedadAnios: number | null
): ConceptoImportado[] {
  return filas.map((c) => {
    const num = parseInt(c.codigo, 10);
    if (num === 1) {
      // Sueldo básico: pre-llenar porcentaje=100 y cantidad=30 si no tienen valor.
      // El monto se calcula automáticamente cuando basicoEscala está disponible.
      return {
        ...c,
        porcentaje: c.porcentaje ?? '100',
        cantidad: c.cantidad ?? '30',
      };
    }
    if (num === 3) {
      // Antigüedad: % siempre 1, cantidad = años completos desde fecha de ingreso
      return {
        ...c,
        porcentaje: '1',
        cantidad:
          antiguedadAnios !== null ? String(antiguedadAnios) : c.cantidad,
      };
    }
    if (num === 19) return { ...c, porcentaje: '8.33', cantidad: '1' }; // SAC proporcional
    if (num === 201) return { ...c, porcentaje: '11' }; // Jubilación
    if (num === 202) return { ...c, porcentaje: '3' }; // Ley 19032
    if (num === 203) return { ...c, porcentaje: '3' }; // Obra social
    if (num === 206) return { ...c, porcentaje: c.porcentaje ?? '2' }; // Cuota sindical (empresa-específico)
    if (num === 209) return { ...c, monto: c.monto ?? '100' }; // Aporte solidario Osecac: $100 fijos (TIN-1302)
    if (num === 413) {
      // Antigüedad no remunerativa: % sobre el monto del concepto 411 (TIN-1302).
      // El % lo carga el estudio; acá solo se pre-llena la referencia.
      return {
        ...c,
        importeConceptoNumero: c.importeConceptoNumero ?? '411',
      };
    }
    if (num === 501) return { ...c, porcentaje: '2' }; // Ret. obra social
    if (num === 502) return { ...c, porcentaje: '3' }; // Ret. jubilación
    if (num === 503) return { ...c, porcentaje: '0.5' }; // Ret. ley 19032
    return c;
  });
}

/**
 * Códigos activos iniciales en modo manual (espejo del effect de SueldosSimulador).
 * En modo copia los códigos vienen del último recibo (`codigosActivosDeConceptos`).
 */
export function codigosActivosIniciales(opts: {
  esExcluidoConvenio: boolean;
  esValorHoraCat: boolean;
  plantillaBaseCodes: string[];
}): Set<string> {
  const { esExcluidoConvenio, esValorHoraCat, plantillaBaseCodes } = opts;
  if (esExcluidoConvenio) return new Set(['1']);
  if (plantillaBaseCodes.length > 0) {
    const s = new Set(plantillaBaseCodes);
    // Para empleados con valor por hora: excluir concepto 1 e incluir concepto 2
    if (esValorHoraCat) {
      s.delete('1');
      s.add('2');
    }
    return s;
  }
  return esValorHoraCat
    ? new Set(['2', '3', '201', '202', '203'])
    : new Set(['1', '3', '201', '202', '203']);
}

/** Códigos con algún dato en los conceptos de un recibo (para modo copia). */
export function codigosActivosDeConceptos(
  conceptos: {
    codigo: string;
    monto: string | null;
    cantidad: string | null;
    porcentaje: string | null;
    importe: string | null;
    importeConceptoNumero: unknown;
    importeMinimo: string | null;
    importeMaximo: string | null;
  }[]
): Set<string> {
  return new Set(
    conceptos
      .filter((c) => {
        const montoN = Number(c.monto);
        return (
          (!isNaN(montoN) && montoN !== 0) ||
          c.cantidad !== null ||
          c.porcentaje !== null ||
          c.importe !== null ||
          c.importeConceptoNumero !== null ||
          c.importeMinimo !== null ||
          c.importeMaximo !== null
        );
      })
      .map((c) => c.codigo)
  );
}

/**
 * Payload de conceptos para `guardarReciboDesdeTabla`: mergea la edición del
 * usuario sobre el valor del concepto y descarta filas sin ningún dato.
 * (Copia fiel de `buildConceptosParaGuardar` de SueldosSimulador.)
 */
export function conceptosParaGuardar(
  filas: ConceptoImportado[],
  edits: EditsMap
) {
  return filas
    .map((c) => {
      const e = edits[c.codigo];
      // La fila de edición ya viene sembrada con los valores del concepto
      // (seedEditRow): si existe, se respeta tal cual. Un campo vaciado por el
      // usuario queda vacío — no se resucita el valor precargado (TIN-1303).
      if (e) {
        return {
          codigo: c.codigo,
          monto: e.monto,
          cantidad: e.cantidad,
          porcentaje: e.porcentaje,
          importeConceptoNumero: e.importeConceptoNumero,
          importe: e.importe,
          importeMinimo: e.importeMinimo,
          importeMaximo: e.importeMaximo,
          memo: e.memo !== '' ? e.memo : undefined,
        };
      }
      // Sin fila de edición: se manda el concepto como vino.
      return {
        codigo: c.codigo,
        monto: c.monto ?? '',
        cantidad: c.cantidad ?? '',
        porcentaje: c.porcentaje ?? '',
        importeConceptoNumero: c.importeConceptoNumero ?? '',
        importe: c.importe ?? '',
        importeMinimo: c.importeMinimo ?? '',
        importeMaximo: c.importeMaximo ?? '',
        memo: c.memo ?? undefined,
      };
    })
    .filter((c) => {
      // Excluir filas sin ningún dato (monto cero y todos los campos vacíos)
      const montoN = Number(c.monto);
      if (!isNaN(montoN) && montoN !== 0) return true;
      return (
        c.cantidad !== '' ||
        c.porcentaje !== '' ||
        c.importe !== '' ||
        c.importeConceptoNumero !== '' ||
        c.importeMinimo !== '' ||
        c.importeMaximo !== ''
      );
    });
}
