/**
 * Con quién fue un movimiento bancario (la contraparte).
 *
 * La lectura del extracto no trae la contraparte como dato aparte, así que se
 * deduce en dos niveles de confianza:
 *
 * 1. **CUIT en la descripción** → se asigna (`contraparteId`). Es un dato
 *    escrito por el banco: si el CUIT está en el padrón, es esa persona o
 *    empresa. El de la propia empresa se descarta (aparece en pagos a AFIP).
 * 2. **Importe exacto de una factura** → solo se *sugiere*. Sirve para las
 *    transferencias y cheques que no traen CUIT ("TR.NE4022353 MICA SA"), pero
 *    un importe redondo puede repetirse, así que no se asigna sin que alguien
 *    lo confirme. Tampoco se usa para puntuar la conciliación: sería contar
 *    dos veces la misma coincidencia de importe.
 *
 * La decisión es pura; las búsquedas se inyectan, para que la use igual el
 * servidor (con el contexto de la organización) y el script que completa los
 * movimientos ya importados.
 */
import {
  cuitsEnDescripcion,
  dniDeCuit,
  formatearCuit,
} from './cuit-descripcion';

/** Categorías donde un cobro o un pago puede corresponder a una factura. */
const CATEGORIAS_CON_FACTURA = new Set(['transferencias', 'cheques', 'varios']);

/** Cuántos días antes del movimiento puede estar la factura, y después. */
const DIAS_ANTES = 45;
const DIAS_DESPUES = 5;

export interface MovimientoAResolver {
  descripcion: string | null;
  importe: number;
  /** 'YYYY-MM-DD' */
  fecha: string;
  direccion: 'ingreso' | 'egreso';
  categoria: string | null;
}

export interface ContraparteDelPadron {
  id: string;
  docTipo: 'cuit' | 'dni' | 'otro';
  docNro: string;
  nombre: string | null;
}

export interface ComprobanteCandidato {
  id: string;
  total: number;
  /** 'YYYY-MM-DD' */
  fechaEmision: string;
  direccion: 'emitido' | 'recibido';
  contraparteId: string | null;
  contraparteNombre: string | null;
}

export interface ContraparteSugerida {
  contraparteId: string;
  nombre: string | null;
  motivo: 'importe_exacto';
  /** Las facturas con ese importe; todas de la misma contraparte. */
  comprobanteIds: string[];
}

export interface ContraparteResuelta {
  contraparteId: string | null;
  contraparteTexto: string | null;
  sugerida: ContraparteSugerida | null;
}

export interface BusquedasContraparte {
  /** Del padrón, por CUIT o por DNI. */
  porDocumento: (
    cuits: string[],
    dnis: string[]
  ) => Promise<ContraparteDelPadron[]>;
  /** De esas contrapartes, las que tienen algún comprobante con la empresa. */
  queOperanConLaEmpresa: (contraparteIds: string[]) => Promise<Set<string>>;
  /** Comprobantes de la empresa con alguno de esos totales, en el rango. */
  comprobantesPorImporte: (
    importes: number[],
    desde: string,
    hasta: string
  ) => Promise<ComprobanteCandidato[]>;
}

const SIN_CONTRAPARTE: ContraparteResuelta = {
  contraparteId: null,
  contraparteTexto: null,
  sugerida: null,
};

/**
 * Palabras del banco o de razón social que no identifican a nadie: si la
 * descripción solo tiene estas, no hay nombre contra el cual comparar.
 */
const PALABRAS_GENERICAS = new Set(
  (
    'TRANSFERENCIA TRANSFERENCIAS TRANSF REALIZADA RECIBIDA INMEDIATA TERCEROS ' +
    'PROPIA PROPIAS MISMO TITULAR DIF CVU CBU COE VAR VARIOS VARIAS PAGO PAGOS ' +
    'PROVEEDORES PROVEEDOR SERVICIO SERVICIOS COMPRA DEBITO CREDITO TARJETA ' +
    'DEPOSITO CHEQUE CHEQUES CAJA SUC SUCURSAL RETIRO EFVO EFECTIVO CASH POR ' +
    'CON DEL LAS LOS UNA SRL SAS SAU SAC ASOC CIA HNOS HIJOS ' +
    'CONSORCIO CONS PROP PROPIET PROPIETARIOS EDIFICIO ' +
    // Jerga del banco: las palabras más repetidas en las descripciones
    // reales que no son un nombre ("Debito transf. online banking").
    'ONLINE BANKING HOME WEB APP DEB CRED CRE REC ING IMP DEBITOS CREDIT ' +
    'ENVIADA ENVIADO RECIBIDO INMEDIATO DINERO LIQUIDACION ADELANTO ' +
    'RENDIMIENTOS COMISION TASA GENERAL GRAL RESP SOBRE NRO CTA CTE CCP ' +
    'CUENTA CUENTAS TARJ FACTURA FACTURAS EXTRACCION PERCEPCION REGIMEN ' +
    'LEY REG BRUTOS RECAU RECAUDACION IMPUESTO IIBB IVA AFIP SIRCREB ' +
    'TRANSFISC LETRA BANCO GALICIA SANTANDER MACRO RIO MERPAGO MERCADO'
  ).split(' ')
);

/** Palabras de 3+ letras, sin tildes ni signos, fuera de las genéricas. */
function palabrasPropias(texto: string | null): Set<string> {
  const normal = (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return new Set(
    (normal.match(/[A-Z]{3,}/g) ?? []).filter((p) => !PALABRAS_GENERICAS.has(p))
  );
}

/**
 * Si la descripción nombra a alguien, tiene que ser la contraparte sugerida:
 * "Transferencia realizada A montenegro horacio" no es un pago a DERMERDJIAN
 * aunque el importe coincida. Si no nombra a nadie ("TRANSFERENCIA
 * 0000123"), el importe queda como única pista.
 */
export function nombreCompatible(
  descripcion: string | null,
  nombre: string | null
): boolean {
  const enDescripcion = palabrasPropias(descripcion);
  if (enDescripcion.size === 0) return true;
  const enNombre = palabrasPropias(nombre);
  return [...enDescripcion].some((p) => enNombre.has(p));
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T12:00:00Z`).getTime() -
      new Date(`${b}T12:00:00Z`).getTime()) /
      86_400_000
  );
}

/**
 * Resuelve la contraparte de cada movimiento, en el mismo orden.
 * `cuitEmpresa` es el de la empresa dueña de la cuenta: nunca es contraparte.
 */
export async function resolverContrapartes(
  movimientos: MovimientoAResolver[],
  cuitEmpresa: string | null,
  buscar: BusquedasContraparte
): Promise<ContraparteResuelta[]> {
  const cuitsPorMov = movimientos.map((m) =>
    cuitsEnDescripcion(m.descripcion).filter((c) => c.cuit !== cuitEmpresa)
  );

  // 1. CUIT en la descripción, contra el padrón.
  const cuits = [...new Set(cuitsPorMov.flat().map((c) => c.cuit))];
  const dnis = [
    ...new Set(
      cuitsPorMov
        .flat()
        .filter((c) => c.suelto)
        .map((c) => dniDeCuit(c.cuit))
        .filter((d): d is string => d !== null)
    ),
  ];
  const padron = cuits.length > 0 ? await buscar.porDocumento(cuits, dnis) : [];
  const porCuit = new Map(
    padron.filter((p) => p.docTipo === 'cuit').map((p) => [p.docNro, p])
  );
  const porDni = new Map(
    padron.filter((p) => p.docTipo === 'dni').map((p) => [p.docNro, p])
  );
  const operan =
    padron.length > 0
      ? await buscar.queOperanConLaEmpresa(padron.map((p) => p.id))
      : new Set<string>();

  const resultado: ContraparteResuelta[] = cuitsPorMov.map((encontrados) => {
    for (const { cuit, suelto } of encontrados) {
      const dni = suelto ? dniDeCuit(cuit) : null;
      const enPadron = porCuit.get(cuit) ?? (dni ? porDni.get(dni) : undefined);
      if (!enPadron) continue;
      // Pegado a otros dígitos puede ser casualidad: además de estar en el
      // padrón, tiene que tener facturas con la empresa.
      if (!suelto && !operan.has(enPadron.id)) continue;
      return {
        contraparteId: enPadron.id,
        contraparteTexto: enPadron.nombre ?? `CUIT ${formatearCuit(cuit)}`,
        sugerida: null,
      };
    }
    // Un CUIT suelto que no está en el padrón igual dice algo útil.
    const suelto = encontrados.find((c) => c.suelto);
    return suelto
      ? {
          ...SIN_CONTRAPARTE,
          contraparteTexto: `CUIT ${formatearCuit(suelto.cuit)}`,
        }
      : SIN_CONTRAPARTE;
  });

  // 2. Importe exacto de una factura, solo como sugerencia.
  const aSugerir = movimientos
    .map((m, i) => ({ m, i }))
    .filter(
      ({ m, i }) =>
        !resultado[i].contraparteId &&
        CATEGORIAS_CON_FACTURA.has(m.categoria ?? 'varios')
    );
  if (aSugerir.length === 0) return resultado;

  const fechas = aSugerir.map(({ m }) => m.fecha).sort();
  const candidatos = await buscar.comprobantesPorImporte(
    [...new Set(aSugerir.map(({ m }) => m.importe))],
    sumarDias(fechas[0], -DIAS_ANTES),
    sumarDias(fechas[fechas.length - 1], DIAS_DESPUES)
  );

  for (const { m, i } of aSugerir) {
    // Cobro contra factura emitida, pago contra factura recibida.
    const direccion = m.direccion === 'ingreso' ? 'emitido' : 'recibido';
    const coinciden = candidatos.filter((c) => {
      const dias = diasEntre(m.fecha, c.fechaEmision);
      return (
        c.direccion === direccion &&
        Math.abs(c.total - m.importe) < 0.01 &&
        dias <= DIAS_ANTES &&
        dias >= -DIAS_DESPUES
      );
    });
    const contrapartes = new Set(coinciden.map((c) => c.contraparteId));
    // Una sola contraparte posible; si hay dos, no se adivina.
    if (coinciden.length === 0 || contrapartes.size !== 1) continue;
    const [unica] = coinciden;
    if (!unica.contraparteId) continue;
    if (!nombreCompatible(m.descripcion, unica.contraparteNombre)) continue;
    resultado[i] = {
      ...resultado[i],
      sugerida: {
        contraparteId: unica.contraparteId,
        nombre: unica.contraparteNombre,
        motivo: 'importe_exacto',
        comprobanteIds: coinciden.map((c) => c.id),
      },
    };
  }

  return resultado;
}
