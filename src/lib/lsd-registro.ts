/**
 * Anchos de los registros del Libro de Sueldos Digital.
 *
 * El archivo es de ancho fijo y ARCA lo valida línea por línea: un carácter de
 * más o de menos y rechaza todo, con errores que apuntan a los campos del final
 * ("fecha de pago inválida") en vez de al corrimiento que los causa. Por eso se
 * verifica acá antes de entregar el archivo, y no después de que el estudio lo
 * suba.
 *
 * Diseño de interfaz de liquidación de ARCA (LSDiseInterfazLiquidacion):
 *   01  35 chars — datos del envío
 *   02 115 chars — datos del trabajador
 *   03  51 chars — un concepto liquidado
 *   04 370 chars — bases imponibles para la DJ F931
 */

export const LARGO_REGISTRO_LSD: Record<string, number> = {
  '01': 35,
  '02': 115,
  '03': 51,
  '04': 370,
};

export interface ProblemaLsd {
  linea: number;
  tipo: string;
  largo: number;
  esperado: number | null;
}

/** Devuelve las líneas cuyo ancho no coincide con el diseño (vacío = archivo sano). */
export function verificarLargosLsd(lineas: string[]): ProblemaLsd[] {
  const problemas: ProblemaLsd[] = [];
  lineas.forEach((linea, i) => {
    const tipo = linea.slice(0, 2);
    const esperado = LARGO_REGISTRO_LSD[tipo] ?? null;
    if (esperado === null || linea.length !== esperado) {
      problemas.push({
        linea: i + 1,
        tipo,
        largo: linea.length,
        esperado,
      });
    }
  });
  return problemas;
}

/** Mensaje para el estudio: qué líneas salieron mal y con qué ancho. */
export function describirProblemasLsd(problemas: ProblemaLsd[]): string {
  const detalle = problemas
    .slice(0, 5)
    .map((p) =>
      p.esperado === null
        ? `línea ${p.linea}: tipo de registro desconocido ("${p.tipo}")`
        : `línea ${p.linea} (registro ${p.tipo}): ${p.largo} caracteres en vez de ${p.esperado}`
    )
    .join('; ');
  const resto =
    problemas.length > 5 ? ` y ${problemas.length - 5} líneas más` : '';
  return `El archivo para ARCA salió mal armado: ${detalle}${resto}. No se descargó para que no lo rechacen al subirlo.`;
}
