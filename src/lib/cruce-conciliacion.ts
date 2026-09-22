/**
 * Qué factura se le sugiere a cada movimiento del banco (Auto-conciliar).
 *
 * No se recorre movimiento por movimiento —así la factura se la llevaba el
 * primero que apareciera, que no era el mejor—: se arman todas las parejas
 * posibles, se ordenan de la más segura a la menos segura y se asignan sin
 * repetir ni factura ni movimiento. El orden:
 *
 * 1. Misma contraparte: el cobro viene de quien figura en la factura.
 * 2. Fecha más cercana entre el movimiento y la factura.
 * 3. El movimiento posterior a la factura antes que uno anterior: primero se
 *    factura y después se cobra.
 * 4. Si todavía empatan, lo más temprano, para que el resultado sea siempre
 *    el mismo.
 *
 * La fecha, en dos niveles:
 * - hasta 5 días de diferencia (para cualquier lado), alcanza con el importe;
 * - si la factura es de 6 a 30 días ANTERIOR al movimiento (se cobró o se pagó
 *   más tarde), solo si es la misma contraparte o si es la única factura
 *   posible con ese importe: con varias, adivinar sería peligroso. Estas
 *   salen con menos seguridad (no suman por cercanía de fecha).
 *
 * Un retiro de efectivo no se propone nunca: no se paga contra una factura.
 *
 * Si la descripción nombra a otra persona que la de la factura ("Transferencia
 * realizada A montenegro horacio" contra una factura de DERMERDJIAN), se
 * propone igual pero con baja seguridad (−20%) y detrás de cualquier otra
 * factura cuyo nombre sí coincida: quien cobra no siempre es quien factura
 * (un cónyuge, un administrador), y eso lo decide una persona. De 6 a 30 días
 * con nombre distinto y sin la misma contraparte no se propone: son dos dudas
 * juntas. El nombre no se mira cuando la contraparte ya coincide por CUIT, si
 * la factura es a consumidor final (no dice a quién se le vendió) ni en
 * compras, donde la descripción nombra el producto y no a quien factura.
 *
 * Solo lectura de datos: quien llama trae los movimientos, las facturas
 * disponibles y lo descartado, y guarda el resultado.
 */

import { nombreCompatible } from './contraparte-movimiento';

/** Cuántos días de diferencia alcanzan con el importe exacto. */
export const DIAS_PROXIMIDAD = 5;

/**
 * Hasta cuántos días antes del movimiento se busca la factura cuando no está
 * cerca: solo con la misma contraparte o si es la única posible.
 */
export const DIAS_EXTENDIDO = 30;

export interface MovimientoACruzar {
  id: string;
  /** 'YYYY-MM-DD' */
  fecha: string;
  importe: number;
  direccion: 'ingreso' | 'egreso';
  contraparteId: string | null;
  descripcion?: string | null;
  categoria?: string | null;
}

export interface FacturaDisponible {
  id: string;
  /** 'YYYY-MM-DD' */
  fechaEmision: string;
  total: number;
  direccion: 'emitido' | 'recibido';
  contraparteId: string | null;
  contraparteNombre?: string | null;
}

export interface Cruce {
  movimientoId: string;
  comprobanteId: string;
  /** 0–1: 50% importe, +40% misma contraparte, hasta +10% por fecha. */
  confianza: number;
}

/** Retiros de efectivo: plata que sale a caja, nunca el pago de una factura. */
const RETIRO = /\b(retiro|extracci[oó]n|extraccion)\b/i;

function esRetiro(mov: MovimientoACruzar): boolean {
  return mov.categoria === 'efectivo' || RETIRO.test(mov.descripcion ?? '');
}

/**
 * Compras y suscripciones: la descripción nombra el producto o la marca
 * ("Compra de Escalera Madera…", "Merpago*shellbox", "Pago de suscripción
 * Universal Plus"), no la razón social que factura. Ahí el nombre no sirve
 * para descartar.
 */
const COMPRA = /^\s*(compra\b|pago de suscripci)/i;

/** La factura no dice a quién se le vendió: no hay nombre contra el cual comparar. */
function sinNombreUtil(nombre: string | null | undefined): boolean {
  return !nombre || /consumidor\s+final/i.test(nombre);
}

function dias(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T12:00:00Z`).getTime() -
      new Date(`${b}T12:00:00Z`).getTime()) /
      86_400_000
  );
}

/**
 * Si la descripción del banco nombra a otra persona que la de la factura.
 * Lo usa el cálculo (para bajar la seguridad) y la pantalla (para avisarlo).
 */
export function nombreDistinto(
  descripcion: string | null | undefined,
  contraparteNombre: string | null | undefined
): boolean {
  return (
    !sinNombreUtil(contraparteNombre) &&
    !COMPRA.test(descripcion ?? '') &&
    !nombreCompatible(descripcion ?? null, contraparteNombre ?? null)
  );
}

/** Cuánto baja la seguridad cuando el banco nombra a otra persona. */
const PENALIDAD_NOMBRE = 0.2;

/**
 * Las parejas movimiento ↔ factura, una factura por movimiento y viceversa.
 * `descartados` son pares "movimientoId|comprobanteId" que alguien rechazó y
 * no se vuelven a proponer.
 */
export function asignarCruces(
  movimientos: MovimientoACruzar[],
  facturas: FacturaDisponible[],
  descartados = new Set<string>()
): Cruce[] {
  const candidatos: {
    mov: MovimientoACruzar;
    fac: FacturaDisponible;
    mismaContraparte: boolean;
    otroNombre: boolean;
    distancia: number;
    posterior: boolean;
  }[] = [];

  for (const mov of movimientos) {
    if (esRetiro(mov)) continue;
    // Cobro contra factura emitida, pago contra factura recibida.
    const direccion = mov.direccion === 'ingreso' ? 'emitido' : 'recibido';
    const cercanos: typeof candidatos = [];
    const lejanos: typeof candidatos = [];
    for (const fac of facturas) {
      if (fac.direccion !== direccion) continue;
      if (descartados.has(`${mov.id}|${fac.id}`)) continue;
      // El importe tiene que coincidir con tolerancia de un peso.
      if (Math.abs(mov.importe - fac.total) >= 1) continue;
      const diferencia = dias(mov.fecha, fac.fechaEmision);
      const cerca = Math.abs(diferencia) <= DIAS_PROXIMIDAD;
      // Más lejos, solo facturas anteriores al movimiento: se factura y
      // después se cobra o se paga, no al revés.
      const lejos =
        diferencia > DIAS_PROXIMIDAD && diferencia <= DIAS_EXTENDIDO;
      if (!cerca && !lejos) continue;
      const mismaContraparte =
        mov.contraparteId !== null && mov.contraparteId === fac.contraparteId;
      // Si el banco nombra a otra persona: cerca, se propone con baja
      // seguridad; lejos, no (son dos dudas juntas).
      const otroNombre =
        !mismaContraparte &&
        nombreDistinto(mov.descripcion, fac.contraparteNombre);
      if (otroNombre && !cerca) continue;
      (cerca ? cercanos : lejanos).push({
        mov,
        fac,
        mismaContraparte,
        otroNombre,
        distancia: Math.abs(diferencia),
        posterior: diferencia >= 0,
      });
    }
    candidatos.push(...cercanos);
    // Lejos: con la misma contraparte siempre; sin ella, solo si no hay
    // ninguna cerca y es la única posible.
    const unica = cercanos.length === 0 && lejanos.length === 1;
    candidatos.push(...lejanos.filter((c) => c.mismaContraparte || unica));
  }

  candidatos.sort(
    (a, b) =>
      Number(b.mismaContraparte) - Number(a.mismaContraparte) ||
      Number(a.otroNombre) - Number(b.otroNombre) ||
      a.distancia - b.distancia ||
      Number(b.posterior) - Number(a.posterior) ||
      a.mov.fecha.localeCompare(b.mov.fecha) ||
      a.mov.id.localeCompare(b.mov.id) ||
      a.fac.fechaEmision.localeCompare(b.fac.fechaEmision) ||
      a.fac.id.localeCompare(b.fac.id)
  );

  const movimientosUsados = new Set<string>();
  const facturasUsadas = new Set<string>();
  const cruces: Cruce[] = [];
  for (const c of candidatos) {
    if (movimientosUsados.has(c.mov.id) || facturasUsadas.has(c.fac.id))
      continue;
    movimientosUsados.add(c.mov.id);
    facturasUsadas.add(c.fac.id);
    cruces.push({
      movimientoId: c.mov.id,
      comprobanteId: c.fac.id,
      confianza:
        0.5 +
        (c.mismaContraparte ? 0.4 : 0) -
        (c.otroNombre ? PENALIDAD_NOMBRE : 0) +
        (c.distancia <= DIAS_PROXIMIDAD
          ? // Cerca: hasta +10% por cercanía de fecha.
            (1 - c.distancia / DIAS_PROXIMIDAD) * 0.1
          : // Lejos: nada por fecha, y hasta −5% cuanto más lejos.
            (-0.05 * (c.distancia - DIAS_PROXIMIDAD)) /
            (DIAS_EXTENDIDO - DIAS_PROXIMIDAD)),
    });
  }
  return cruces;
}
