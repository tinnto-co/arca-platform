/**
 * Aritmética del extracto bancario (TIN-1634) — nuestra, no de la IA.
 *
 * El control de cuadre es la red de seguridad de la importación: si
 *   saldo inicial + ingresos − egresos ≠ saldo final
 * la lectura perdió movimientos (o leyó mal un importe) y hay que revisar
 * antes de guardar. Nunca un descuadre silencioso.
 */
import { aLatino } from './texto-latino';

export interface MovimientoExtraido {
  fecha: string;
  descripcion: string;
  importe: number;
  direccion: 'ingreso' | 'egreso';
  saldoPosterior?: number | null;
}

export interface Cuadre {
  totalIngresos: number;
  totalEgresos: number;
  saldoCalculado: number;
  /** saldo final informado − saldo calculado. 0 (±tolerancia) = cuadra. */
  diferencia: number;
  cuadra: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Un peso de tolerancia: los bancos redondean por movimiento. */
const TOLERANCIA = 1;

export function cuadreExtracto(
  saldoInicial: number,
  saldoFinal: number,
  movimientos: MovimientoExtraido[]
): Cuadre {
  const totalIngresos = round2(
    movimientos
      .filter((m) => m.direccion === 'ingreso')
      .reduce((a, m) => a + Math.abs(m.importe), 0)
  );
  const totalEgresos = round2(
    movimientos
      .filter((m) => m.direccion === 'egreso')
      .reduce((a, m) => a + Math.abs(m.importe), 0)
  );
  const saldoCalculado = round2(saldoInicial + totalIngresos - totalEgresos);
  const diferencia = round2(saldoFinal - saldoCalculado);
  return {
    totalIngresos,
    totalEgresos,
    saldoCalculado,
    diferencia,
    cuadra: Math.abs(diferencia) <= TOLERANCIA,
  };
}

/**
 * Los extractos escriben la moneda como la muestran ("CC $", "U$S"), no con
 * el código ISO de tres letras que espera la columna.
 */
export function monedaIso(valor: string): string {
  const limpio = valor.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(limpio)) return limpio;
  if (limpio.includes('U$S') || limpio.includes('US$')) return 'USD';
  if (limpio.includes('€')) return 'EUR';
  return 'ARS';
}

export type SemaforoIncongruencia = 'ok' | 'atencion' | 'alerta';

/** Cuándo una brecha amerita aviso. Cada estudio puede correr el número. */
export interface UmbralControlBancario {
  /** Diferencia sobre lo facturado, en puntos porcentuales. */
  porcentaje: number;
  /** Diferencia en pesos. */
  monto: number;
}

/**
 * El umbral con el que arrancan todos los estudios. Sale de la reunión del
 * 23/9: el estudio quería mirar varias empresas antes de fijar un número, así
 * que se dejó el que ya usaba la pantalla.
 */
export const UMBRAL_CONTROL_BANCARIO_DEFAULT: UmbralControlBancario = {
  porcentaje: 20,
  monto: 1_000_000,
};

/**
 * Semáforo de Banco vs Facturación. La brecha es significativa cuando pasa
 * el porcentaje Y el monto a la vez (una brecha de 25% sobre $40.000 no
 * amerita rojo; una de $2M sobre $200M tampoco). Un solo umbral superado
 * queda en atención.
 */
export function semaforoBancoVsFacturacion(
  ingresosBancarios: number,
  ventasFacturadas: number,
  umbral: UmbralControlBancario = UMBRAL_CONTROL_BANCARIO_DEFAULT
): { diferencia: number; porcentaje: number; nivel: SemaforoIncongruencia } {
  const diferencia = round2(ingresosBancarios - ventasFacturadas);
  const base = Math.max(Math.abs(ventasFacturadas), 1);
  const porcentaje = Math.round((Math.abs(diferencia) / base) * 100);
  const pasaPct = porcentaje > umbral.porcentaje;
  const pasaMonto = Math.abs(diferencia) > umbral.monto;
  const nivel: SemaforoIncongruencia =
    pasaPct && pasaMonto ? 'alerta' : pasaPct || pasaMonto ? 'atencion' : 'ok';
  return { diferencia, porcentaje, nivel };
}

/**
 * Identificador estable de un movimiento de PDF, para que reimportar el
 * mismo extracto no duplique (el PDF no trae id como una API). Dos
 * movimientos idénticos el mismo día se distinguen por su ocurrencia.
 */
export function idExternoDeMovimiento(
  m: MovimientoExtraido,
  ocurrencia: number
): string {
  // `aLatino`: la IA puede escribir la misma descripción con letras
  // cirílicas que se ven latinas, y la huella tiene que salir igual.
  const limpio = (s: string) =>
    aLatino(s).toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 60);
  return [
    'pdf',
    m.fecha,
    m.direccion,
    Math.abs(m.importe).toFixed(2),
    limpio(m.descripcion),
    ocurrencia,
  ].join('|');
}
