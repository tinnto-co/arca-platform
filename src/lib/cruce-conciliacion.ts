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
 * Solo lectura de datos: quien llama trae los movimientos, las facturas
 * disponibles y lo descartado, y guarda el resultado.
 */

/** Cuántos días de diferencia puede haber entre movimiento y factura. */
export const DIAS_PROXIMIDAD = 5;

export interface MovimientoACruzar {
  id: string;
  /** 'YYYY-MM-DD' */
  fecha: string;
  importe: number;
  direccion: 'ingreso' | 'egreso';
  contraparteId: string | null;
}

export interface FacturaDisponible {
  id: string;
  /** 'YYYY-MM-DD' */
  fechaEmision: string;
  total: number;
  direccion: 'emitido' | 'recibido';
  contraparteId: string | null;
}

export interface Cruce {
  movimientoId: string;
  comprobanteId: string;
  /** 0–1: 50% importe, +40% misma contraparte, hasta +10% por fecha. */
  confianza: number;
}

function dias(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T12:00:00Z`).getTime() -
      new Date(`${b}T12:00:00Z`).getTime()) /
      86_400_000
  );
}

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
    distancia: number;
    posterior: boolean;
  }[] = [];

  for (const mov of movimientos) {
    // Cobro contra factura emitida, pago contra factura recibida.
    const direccion = mov.direccion === 'ingreso' ? 'emitido' : 'recibido';
    for (const fac of facturas) {
      if (fac.direccion !== direccion) continue;
      if (descartados.has(`${mov.id}|${fac.id}`)) continue;
      // El importe tiene que coincidir con tolerancia de un peso.
      if (Math.abs(mov.importe - fac.total) >= 1) continue;
      const diferencia = dias(mov.fecha, fac.fechaEmision);
      if (Math.abs(diferencia) > DIAS_PROXIMIDAD) continue;
      candidatos.push({
        mov,
        fac,
        mismaContraparte:
          mov.contraparteId !== null && mov.contraparteId === fac.contraparteId,
        distancia: Math.abs(diferencia),
        posterior: diferencia >= 0,
      });
    }
  }

  candidatos.sort(
    (a, b) =>
      Number(b.mismaContraparte) - Number(a.mismaContraparte) ||
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
        (c.mismaContraparte ? 0.4 : 0) +
        (1 - c.distancia / DIAS_PROXIMIDAD) * 0.1,
    });
  }
  return cruces;
}
