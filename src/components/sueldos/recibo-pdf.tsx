'use client';

import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import { dateAPeriodo } from '@/lib/periodo';
import { tipoReciboLabel, quincenaLabel } from '@/lib/sueldos-labels';

// ─── Types ───────────────────────────────────────────────────────────────────

type TipoCol = 'remunerativo' | 'no_remunerativo' | 'descuento' | 'retencion';

interface DetalleRow {
  detalle: {
    id: string;
    codigo: string;
    monto: string | null;
    cantidad: string | null;
    porcentaje: string | null;
    activo?: boolean | null;
    memo?: string | null;
  };
  concepto: { nombre?: string | null; tipo?: string | null; numeroSos?: number | null } | null;
  conceptoAfip: { descripcion?: string | null } | null;
  conceptoSos: { nombre?: string | null; codigo?: string | null } | null;
  tipoColumna: TipoCol;
}

export interface ReciboDetallePdf {
  liquidacion: {
    id: string;
    periodo: string;
    tipo: string | null;
    quincena: number | null;
    basico: string | null;
    fechaPago: string | null;
    lugarPago: string | null;
    banco: string | null;
    formaPago: string | null;
    cbu: string | null;
    observacionRecibo: string | null;
  };
  empleado: {
    id: string;
    nombre: string;
    legajo: string | null;
    cuil: string | null;
    fechaAlta: string | null;
    tipoJornada: string | null;
    categoriaTexto: string | null;
    formaPago: string | null;
    cbu: string | null;
    banco: string | null;
  };
  convenio: { nombre: string | null; cctCodigo: string | null } | null;
  categoria: { nombre: string | null } | null;
  obraSocial: { codigo: string | null; nombre: string | null } | null;
  basicoCalculado: number;
  basicoEscalaCategoria: number;
  detalles: DetalleRow[];
}

/**
 * Datos de la empresa que encabezan el recibo. En el modelo nuevo el cliente
 * ya no tiene `name`/`address`/`identityNumber`: la única razón social es
 * `razonSocial` y el CUIT vive en `cuit`.
 */
export interface ClientDataPdf {
  razonSocial: string | null;
  domicilio: string | null;
  cuit: string | null;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function moneyFmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateFmt(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

function legajoParaMostrar(raw: string | null | undefined): string {
  if (!raw) return '—';
  const s = String(raw).trim();
  if (!s) return '—';
  if (/^\d+$/.test(s)) {
    const sinCeros = s.replace(/^0+/, '');
    return sinCeros === '' ? '0' : sinCeros;
  }
  return s;
}

function formaPagoLabel(v: string | null | undefined): string {
  if (!v) return '—';
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'efectivo') return 'Efectivo';
  if (s === '2' || s === 'deposito' || s === 'acreditacion' || s === 'acreditación')
    return 'Depósito en cuenta';
  if (s === 'transferencia') return 'Transferencia';
  if (s === '3' || s === 'cheque') return 'Cheque';
  if (s === '4' || s === 'otro' || s === 'otros') return 'Otro';
  return String(v);
}

function bancoLabel(v: string | null | undefined): string {
  if (!v) return '—';
  if (v.trim() === '_otro banco') return 'Otro banco';
  return v;
}

function strU(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

function valorCabeceraLegible(v: unknown): string | null {
  const s = strU(v);
  if (!s) return null;
  if (s === '—' || s === '-' || s === '–') return null;
  const lower = s.toLowerCase();
  if (lower === 'n/a' || lower === 's/d' || lower === 's.d.') return null;
  return s;
}

function sumaMontosDetalle(rows: DetalleRow[]): number {
  return rows.reduce((acc, r) => {
    const n = Number(r.detalle.monto ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function redondearPesos(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function esCategoriaGerente(v: string | null | undefined): boolean {
  if (!v) return false;
  return v.trim().toLowerCase().includes('gerente');
}

function basicoDesdeDetalle(rows: DetalleRow[]): number {
  for (const r of rows) {
    const numSos = r.concepto?.numeroSos ?? null;
    const codDet = (r.detalle.codigo ?? '').trim();
    const codSos = (r.conceptoSos?.codigo ?? '').trim();
    const nombre = `${r.concepto?.nombre ?? ''} ${r.conceptoSos?.nombre ?? ''}`.trim().toLowerCase();
    const esBasico =
      numSos === 1 || codDet === '1' || codSos === '1' ||
      nombre.includes('sueldo basico') || nombre.includes('sueldo básico');
    if (!esBasico) continue;
    const monto = Number(r.detalle.monto ?? 0);
    if (Number.isFinite(monto) && monto > 0) return monto;
  }
  return 0;
}

function clasificarTipo(tipo: string | null | undefined): TipoCol {
  if (tipo === 'remunerativo') return 'remunerativo';
  if (tipo === 'no_remunerativo') return 'no_remunerativo';
  if (tipo === 'retencion') return 'retencion';
  return 'descuento';
}

function columnaConcepto(d: DetalleRow): TipoCol {
  if (
    d.tipoColumna === 'remunerativo' ||
    d.tipoColumna === 'no_remunerativo' ||
    d.tipoColumna === 'descuento' ||
    d.tipoColumna === 'retencion'
  ) return d.tipoColumna;
  return clasificarTipo(d.concepto?.tipo ?? null);
}

function pickCabecera(liq: ReciboDetallePdf['liquidacion']) {
  return {
    lugarPago: valorCabeceraLegible(liq.lugarPago),
    banco: valorCabeceraLegible(liq.banco),
    formaPago: valorCabeceraLegible(liq.formaPago),
    cbu: valorCabeceraLegible(liq.cbu),
    fechaPago: liq.fechaPago ?? null,
  };
}

// ─── Número a letras ──────────────────────────────────────────────────────────

const UNIDADES = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
const DECENAS = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CENTENAS = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

function cientos(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const parteC = CENTENAS[c] ?? '';
  if (resto === 0) return parteC;
  if (resto < 20) return `${parteC} ${UNIDADES[resto]}`.trim();
  const d = Math.floor(resto / 10);
  const u = resto % 10;
  return `${parteC} ${DECENAS[d] ?? ''}${u > 0 ? ` y ${UNIDADES[u]}` : ''}`.trim();
}

function miles(n: number): string {
  if (n < 1000) return cientos(n);
  const m = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteM = m === 1 ? 'mil' : `${cientos(m)} mil`;
  return resto === 0 ? parteM : `${parteM} ${cientos(resto)}`;
}

function millones(n: number): string {
  if (n < 1_000_000) return miles(n);
  const m = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const parteM = m === 1 ? 'un millón' : `${miles(m)} millones`;
  return resto === 0 ? parteM : `${parteM} ${miles(resto)}`;
}

function pesoEnLetras(valor: number): string {
  if (!valor) return 'cero pesos';
  const n = Number(valor);
  if (isNaN(n) || n < 0) return '—';
  const entero = Math.floor(n);
  const cents = Math.round((n - entero) * 100);
  const parteEntera = entero === 0 ? 'cero' : millones(entero);
  const sufijo = entero === 1 ? 'peso' : 'pesos';
  if (cents === 0) return `${parteEntera} ${sufijo}`;
  return `${parteEntera} ${sufijo} con ${cents}/100`;
}

function capitalizarPrimero(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// A4 = 595 × 842 pt  |  padding 18pt each side  |  content width = 559pt

const BORDER = '#d1d5db';
const MUTED  = '#6b7280';
const MUTED_BG = '#f3f4f6';
const DARK   = '#111827';

const S = StyleSheet.create({
  // ── Page ──────────────────────────────────────────────────────────────────
  page: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 18,
    paddingRight: 18,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: DARK,
    backgroundColor: '#ffffff',
    flexDirection: 'column',
  },

  // ── Badge ─────────────────────────────────────────────────────────────────
  copyBadge: {
    alignSelf: 'flex-end',
    fontSize: 6,
    color: MUTED,
    borderWidth: 0.5,
    borderColor: BORDER,
    paddingTop: 1.5,
    paddingBottom: 1.5,
    paddingLeft: 5,
    paddingRight: 5,
    marginBottom: 4,
    letterSpacing: 0.5,
  },

  // ── Header box ────────────────────────────────────────────────────────────
  headerBox: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: BORDER,
  },
  // Left column: empresa (50%)
  headerCompany: {
    flex: 1,
    padding: 8,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  // Right column: título + grilla de pago (50%)
  headerRight: {
    flex: 1,
    flexDirection: 'column',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  headerPayRow: {
    flexDirection: 'row',
  },
  headerPayRowSep: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
  },

  // ── Info rows (grilla de datos del empleado) ──────────────────────────────
  infoRow: {
    flexDirection: 'row',
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
  },

  // Celda genérica con borde derecho (divisor de columna)
  cell: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  // Última celda de la fila — sin borde derecho (lo da el infoRow)
  cellLast: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 6,
    paddingRight: 6,
  },
  cellLabel: {
    fontSize: 6,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  cellValue: {
    fontSize: 8.5,
    color: DARK,
  },

  // ── Tabla de conceptos ────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: MUTED_BG,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
    paddingTop: 3,
    paddingBottom: 3,
  },
  tableRow: {
    flexDirection: 'row',
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.3,
    borderColor: BORDER,
    minHeight: 14,
  },

  // Columnas de la tabla
  colCode: { width: 44, paddingLeft: 5, paddingRight: 3 },
  colDesc: { flex: 1, paddingLeft: 4, paddingRight: 4 },
  colNum:  { width: 40, paddingLeft: 3, paddingRight: 3 },
  colMoney: {
    width: 74,
    paddingLeft: 3,
    paddingRight: 5,
    borderLeftWidth: 0.5,
    borderLeftColor: BORDER,
  },

  thText: {
    fontSize: 6,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.2,
  },
  thTextRight: {
    fontSize: 6,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.2,
    textAlign: 'right',
  },

  tdCode:  { fontSize: 7,   color: MUTED, paddingTop: 2, paddingBottom: 2 },
  tdDesc:  { fontSize: 7.5, color: DARK,  paddingTop: 2, paddingBottom: 2 },
  tdNum:   { fontSize: 7,   color: MUTED, paddingTop: 2, paddingBottom: 2, textAlign: 'right' },
  tdMoney: { fontSize: 7.5, color: DARK,  paddingTop: 2, paddingBottom: 2, textAlign: 'right' },
  tdMoneyBold: {
    fontSize: 7.5,
    color: DARK,
    fontFamily: 'Helvetica-Bold',
    paddingTop: 2,
    paddingBottom: 2,
    textAlign: 'right',
  },

  // ── Fila de totales ───────────────────────────────────────────────────────
  totalsRow: {
    flexDirection: 'row',
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderTopWidth: 1.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: MUTED_BG,
    paddingTop: 3,
    paddingBottom: 3,
  },

  // ── Neto ──────────────────────────────────────────────────────────────────
  netoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
  },

  // ── Observación ──────────────────────────────────────────────────────────
  obsRow: {
    flexDirection: 'row',
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 6,
    paddingRight: 6,
  },

  // ── Firmas ────────────────────────────────────────────────────────────────
  firmasBox: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: BORDER,
    marginTop: 8,
    minHeight: 78,
  },
  firmaCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 8,
    paddingBottom: 10,
    paddingLeft: 20,
    paddingRight: 20,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  firmaCellLast: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 8,
    paddingBottom: 10,
    paddingLeft: 20,
    paddingRight: 20,
  },
  firmaLine: {
    width: '70%',
    borderTopWidth: 0.5,
    borderTopColor: '#555555',
    paddingTop: 3,
    alignItems: 'center',
  },
  firmaLabel: {
    fontSize: 6,
    color: MUTED,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});

// Estilo inline para celdas con ancho fijo en la fila del empleado.
// NO usar el shorthand `flex: 0` porque en Yoga establece flexBasis:0,
// lo que invalida el width declarado y genera superposición visual.
const FIXED_CELL = {
  paddingTop: 4, paddingBottom: 4,
  paddingLeft: 6, paddingRight: 6,
  borderRightWidth: 0.5, borderRightColor: BORDER,
  flexGrow: 0, flexShrink: 0,
} as const;

// ─── Celda de info (label + value) ───────────────────────────────────────────

function InfoCell({
  label,
  value,
  style,
  last,
}: {
  label: string;
  value: string;
  style?: object;
  last?: boolean;
}) {
  const base = last ? S.cellLast : S.cell;
  return (
    <View style={style ? { ...base, ...(style as object) } : base}>
      <Text style={S.cellLabel}>{label.toUpperCase()}</Text>
      <Text style={S.cellValue}>{value || '—'}</Text>
    </View>
  );
}

// ─── Página del recibo (una copia) ───────────────────────────────────────────

function ReciboPdfPage({
  recibo,
  clientData,
  firmaEmpleadorUrl,
  copia,
}: {
  recibo: ReciboDetallePdf;
  clientData: ClientDataPdf | null;
  firmaEmpleadorUrl: string | null;
  copia: 'empleado' | 'empleador';
}) {
  const { liquidacion, empleado, convenio, categoria, obraSocial, basicoCalculado, basicoEscalaCategoria, detalles } = recibo;

  // Básico a mostrar (misma lógica que ReciboDocumento)
  const basicoCalculadoNum    = Number(basicoCalculado ?? 0);
  const basicoEscalaNum       = Number(basicoEscalaCategoria ?? 0);
  const basicoLiquidacionNum  = Number(liquidacion.basico ?? 0);
  const basicoDetalleNum      = basicoDesdeDetalle(detalles);
  const esGerente             = esCategoriaGerente(categoria?.nombre) || esCategoriaGerente(empleado.categoriaTexto);
  const mostrarBasicoEscalaGerente = esGerente && basicoCalculadoNum <= 0 && basicoEscalaNum > 0;
  const basicoMostrado = mostrarBasicoEscalaGerente
    ? basicoEscalaNum
    : esGerente && basicoCalculadoNum <= 0
      ? basicoLiquidacionNum > 0 ? basicoLiquidacionNum
        : basicoDetalleNum > 0 ? basicoDetalleNum
        : basicoCalculadoNum
      : basicoCalculadoNum;

  // Clasificar conceptos activos
  const conceptosActivos = detalles.filter((d) => d.detalle.activo !== false);
  const haberesCon  = conceptosActivos.filter((d) => columnaConcepto(d) === 'remunerativo');
  const haberesSin  = conceptosActivos.filter((d) => columnaConcepto(d) === 'no_remunerativo');
  const descuentos  = conceptosActivos.filter((d) => columnaConcepto(d) === 'descuento');
  const retenciones = conceptosActivos.filter((d) => columnaConcepto(d) === 'retencion');

  const totalHaberes    = redondearPesos(sumaMontosDetalle(haberesCon));
  const totalDescuentos = redondearPesos(sumaMontosDetalle(descuentos));
  const totalRetenciones = redondearPesos(sumaMontosDetalle(retenciones));
  const totalNoRem      = redondearPesos(sumaMontosDetalle(haberesSin));
  const netoRaw = redondearPesos(totalHaberes + totalNoRem - totalDescuentos - totalRetenciones);
  const redondeo = netoRaw > 0 && netoRaw % 1 > 0.001 ? Math.ceil(netoRaw) - netoRaw : 0;
  const neto = redondeo > 0 ? Math.ceil(netoRaw) : netoRaw;

  // Filas de la tabla ordenadas globalmente por código ascendente
  const filas = [
    ...haberesCon.map((d)  => ({ ...d, col: 'hab'   as const })),
    ...descuentos.map((d)  => ({ ...d, col: 'desc'  as const })),
    ...retenciones.map((d) => ({ ...d, col: 'ret'   as const })),
    ...haberesSin.map((d)  => ({ ...d, col: 'noRem' as const })),
  ].sort((a, b) => Number(a.detalle.codigo) - Number(b.detalle.codigo));

  // Datos de cabecera de pago
  const cab       = pickCabecera(liquidacion);
  // `empleado.lugarPago` desapareció: el lugar de pago vive solo en el recibo.
  const lugarPago = cab.lugarPago;
  const banco     = cab.banco     ?? valorCabeceraLegible(empleado.banco);
  const formaPago = cab.formaPago ?? valorCabeceraLegible(empleado.formaPago);
  const cbu       = cab.cbu       ?? valorCabeceraLegible(empleado.cbu);

  // Datos de empresa
  const empresaNombre   = toTitleCase(clientData?.razonSocial) || '—';
  const empresaCUIT     = clientData?.cuit || '—';
  const empresaDirec    = clientData?.domicilio || null;

  return (
    <Page size="A4" style={S.page}>

      {/* ── Badge copia ─────────────────────────────────────────────────────── */}
      <Text style={S.copyBadge}>
        {copia === 'empleado' ? 'COPIA EMPLEADO' : 'COPIA EMPLEADOR'}
      </Text>

      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <View style={S.headerBox}>

        {/* Empresa (izquierda, 50%) */}
        <View style={S.headerCompany}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', lineHeight: 1.2 }}>
            {empresaNombre}
          </Text>
          {empresaDirec ? (
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 3 }}>{empresaDirec}</Text>
          ) : null}
          <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>CUIT: {empresaCUIT}</Text>
        </View>

        {/* Título + grilla de pago (derecha, 50%) */}
        <View style={S.headerRight}>

          {/* Título */}
          <View style={S.headerTitleRow}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 }}>
              RECIBO DE HABERES
            </Text>
            <Text style={{ fontSize: 7.5, color: MUTED, marginLeft: 6 }}>
              — {tipoReciboLabel(liquidacion.tipo)}
            </Text>
          </View>

          {/* Fila de pago 1 */}
          <View style={S.headerPayRow}>
            {/* `recibo.periodo` es date ('YYYY-MM-01'): se muestra como 'YYYY-MM'. */}
            <InfoCell label="Período a pagar" value={liquidacion.periodo ? dateAPeriodo(liquidacion.periodo) : '—'} />
            <InfoCell label="Fecha de pago"   value={dateFmt(cab.fechaPago)} />
            <InfoCell label="Lugar de pago"   value={lugarPago ?? '—'} last />
          </View>

          {/* Fila de pago 2 */}
          <View style={S.headerPayRowSep}>
            <InfoCell label="Banco"        value={bancoLabel(banco)} />
            <InfoCell label="Forma de pago" value={formaPagoLabel(formaPago)} />
            <InfoCell label="CBU / Cuenta" value={cbu ?? '—'} last />
          </View>

        </View>
      </View>

      {/* ── Fila: Categoría | Tipo de liquidación ───────────────────────────── */}
      <View style={S.infoRow}>
        <InfoCell label="Categoría" value={empleado.categoriaTexto ? toTitleCase(empleado.categoriaTexto) : (categoria?.nombre ?? '—')} />
        <InfoCell
          label="Tipo de liquidación"
          value={`${tipoReciboLabel(liquidacion.tipo)} — ${quincenaLabel(liquidacion.quincena)}`}
          last
        />
      </View>

      {/* ── Fila: Legajo | Apellido y Nombres | Ingreso | CUIL | Básico ────── */}
      <View style={S.infoRow}>
        {/* LEGAJO — ancho fijo con flexBasis (no flex:0 para evitar flexBasis:0) */}
        <View style={{ ...FIXED_CELL, flexBasis: 62 }}>
          <Text style={S.cellLabel}>LEGAJO</Text>
          <Text style={S.cellValue}>{legajoParaMostrar(empleado.legajo)}</Text>
        </View>
        {/* NOMBRE — flex proporcional */}
        <View style={{ ...FIXED_CELL, flexGrow: 2, flexShrink: 1, flexBasis: 0 }}>
          <Text style={S.cellLabel}>APELLIDO Y NOMBRES</Text>
          <Text style={S.cellValue}>{toTitleCase(empleado.nombre)}</Text>
        </View>
        {/* FECHA DE INGRESO — ancho fijo */}
        <View style={{ ...FIXED_CELL, flexBasis: 84 }}>
          <Text style={S.cellLabel}>FECHA DE INGRESO</Text>
          <Text style={S.cellValue}>{dateFmt(empleado.fechaAlta)}</Text>
        </View>
        {/* CUIL — ancho fijo */}
        <View style={{ ...FIXED_CELL, flexBasis: 108 }}>
          <Text style={S.cellLabel}>CUIL</Text>
          <Text style={S.cellValue}>{empleado.cuil ?? '—'}</Text>
        </View>
        {/* SUELDO BÁSICO — flex restante */}
        <View style={S.cellLast}>
          <Text style={S.cellLabel}>SUELDO BÁSICO</Text>
          <Text style={S.cellValue}>${moneyFmt(basicoMostrado)}</Text>
        </View>
      </View>

      {/* ── Fila: Convenio | Modalidad | Obra Social ────────────────────────── */}
      <View style={S.infoRow}>
        <InfoCell
          label="Convenio"
          value={
            convenio
              ? convenio.cctCodigo
                ? `${(convenio.nombre ?? '').replace(convenio.cctCodigo, '').trim()} (CCT ${convenio.cctCodigo})`
                : (convenio.nombre ?? '—')
              : '—'
          }
        />
        <InfoCell
          label="Modalidad"
          value={empleado.tipoJornada === 'full_time' ? 'Tiempo completo' : 'Tiempo parcial'}
        />
        <InfoCell
          label="Obra social"
          value={
            obraSocial
              ? `${obraSocial.codigo ?? ''} ${obraSocial.nombre ?? ''}`.trim()
              : '—'
          }
          last
        />
      </View>

      {/* ── Tabla de conceptos ───────────────────────────────────────────────── */}
      {/* Cabecera de tabla */}
      <View style={S.tableHeaderRow}>
        <View style={S.colCode}><Text style={S.thText}>CÓDIGO</Text></View>
        <View style={S.colDesc}><Text style={S.thText}>CONCEPTO</Text></View>
        <View style={S.colNum}> <Text style={S.thTextRight}>CANT.</Text></View>
        <View style={S.colNum}> <Text style={S.thTextRight}>%</Text></View>
        <View style={S.colMoney}><Text style={S.thTextRight}>HABERES</Text></View>
        <View style={S.colMoney}><Text style={S.thTextRight}>DESCUENTOS</Text></View>
        <View style={S.colMoney}><Text style={S.thTextRight}>RETENCIONES</Text></View>
        <View style={S.colMoney}><Text style={S.thTextRight}>NO REM.</Text></View>
      </View>

      {/* Filas de conceptos */}
      {filas.length === 0 ? (
        <View style={[S.tableRow, { borderBottomWidth: 0.5 }]}>
          <View style={{ flex: 1, paddingTop: 6, paddingBottom: 6 }}>
            <Text style={{ fontSize: 7, color: MUTED, textAlign: 'center' }}>Sin conceptos</Text>
          </View>
        </View>
      ) : (
        filas.map(({ detalle: det, concepto, conceptoAfip, conceptoSos, col }) => (
          <View key={det.id} style={S.tableRow}>
            <View style={S.colCode}>
              <Text style={S.tdCode}>{det.codigo}</Text>
            </View>
            <View style={S.colDesc}>
              <Text style={S.tdDesc}>
                {(det.memo && !det.memo.startsWith('source=') && !det.memo.includes('calc_error='))
                  ? det.memo
                  : (concepto?.nombre ?? conceptoAfip?.descripcion ?? conceptoSos?.nombre ?? det.codigo)}
              </Text>
            </View>
            <View style={S.colNum}>
              <Text style={S.tdNum}>{det.cantidad ? moneyFmt(det.cantidad) : ''}</Text>
            </View>
            <View style={S.colNum}>
              <Text style={S.tdNum}>{det.porcentaje ? moneyFmt(det.porcentaje) : ''}</Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoney}>{col === 'hab'   ? moneyFmt(det.monto) : ''}</Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoney}>{col === 'desc'  ? moneyFmt(det.monto) : ''}</Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoney}>{col === 'ret'   ? moneyFmt(det.monto) : ''}</Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoney}>{col === 'noRem' ? moneyFmt(det.monto) : ''}</Text>
            </View>
          </View>
        ))
      )}

      {/* ── Fila de totales ──────────────────────────────────────────────────── */}
      <View style={S.totalsRow}>
        <View style={S.colCode} />
        <View style={S.colDesc}>
          <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: MUTED, letterSpacing: 0.5 }}>
            TOTALES
          </Text>
        </View>
        <View style={S.colNum} />
        <View style={S.colNum} />
        <View style={S.colMoney}><Text style={S.tdMoneyBold}>{moneyFmt(totalHaberes)}</Text></View>
        <View style={S.colMoney}><Text style={S.tdMoneyBold}>{moneyFmt(totalDescuentos)}</Text></View>
        <View style={S.colMoney}><Text style={S.tdMoneyBold}>{moneyFmt(totalRetenciones)}</Text></View>
        <View style={S.colMoney}><Text style={S.tdMoneyBold}>{moneyFmt(totalNoRem)}</Text></View>
      </View>

      {/* ── Neto sin redondeo / Redondeo / Total neto (solo cuando hay centavos) */}
      {redondeo > 0 && (
        <>
          {/* Neto sin redondeo */}
          <View style={[S.totalsRow, { borderTopWidth: 0.5 }]}>
            <View style={{ flex: 1, paddingLeft: 5, paddingRight: 5 }}>
              <Text style={{ fontSize: 6.5, color: MUTED, textAlign: 'right' }}>NETO SIN REDONDEO</Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoneyBold}>{moneyFmt(netoRaw)}</Text>
            </View>
          </View>
          {/* Redondeo */}
          <View style={[S.totalsRow, { borderTopWidth: 0.5 }]}>
            <View style={{ flex: 1, paddingLeft: 5, paddingRight: 5 }}>
              <Text style={{ fontSize: 6.5, color: MUTED, textAlign: 'right' }}>REDONDEO</Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoney}>+{moneyFmt(redondeo)}</Text>
            </View>
          </View>
          {/* Total neto */}
          <View style={[S.totalsRow, { borderTopWidth: 1.5 }]}>
            <View style={{ flex: 1, paddingLeft: 5, paddingRight: 5 }}>
              <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right', letterSpacing: 0.5 }}>
                TOTAL NETO
              </Text>
            </View>
            <View style={S.colMoney}>
              <Text style={S.tdMoneyBold}>{moneyFmt(neto)}</Text>
            </View>
          </View>
        </>
      )}

      {/* ── Neto ─────────────────────────────────────────────────────────────── */}
      <View style={S.netoRow}>
        <Text style={{ fontSize: 7.5, color: MUTED, flex: 1, paddingRight: 8 }}>
          Son {capitalizarPrimero(pesoEnLetras(neto))}
        </Text>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>
          Total neto: ${moneyFmt(neto)}
        </Text>
      </View>

      {/* ── Observación (opcional) ───────────────────────────────────────────── */}
      {liquidacion.observacionRecibo ? (
        <View style={S.obsRow}>
          <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: MUTED, marginRight: 4 }}>
            Observación:
          </Text>
          <Text style={{ fontSize: 7.5, flex: 1 }}>{liquidacion.observacionRecibo}</Text>
        </View>
      ) : null}

      {/* ── Firmas ───────────────────────────────────────────────────────────── */}
      <View style={S.firmasBox}>
        <View style={S.firmaCell}>
          {firmaEmpleadorUrl ? (
            <Image src={firmaEmpleadorUrl} style={{ height: 40, marginBottom: 6 }} />
          ) : (
            <View style={{ height: 40, marginBottom: 6 }} />
          )}
          <View style={S.firmaLine}>
            <Text style={S.firmaLabel}>FIRMA Y SELLO DEL EMPLEADOR</Text>
          </View>
        </View>
        <View style={S.firmaCellLast}>
          <View style={{ height: 40, marginBottom: 6 }} />
          <View style={S.firmaLine}>
            <Text style={S.firmaLabel}>FIRMA DEL EMPLEADO</Text>
          </View>
        </View>
      </View>

    </Page>
  );
}

// ─── Documento PDF de un empleado ────────────────────────────────────────────
// Orden: por cada recibo → copia empleado, luego copia empleador.

import React from 'react';
import { toTitleCase } from '@/lib/format-name';

function EmpleadoPdfDocument({
  recibos,
  clientData,
  firmaEmpleadorUrl,
}: {
  recibos: ReciboDetallePdf[];
  clientData: ClientDataPdf | null;
  firmaEmpleadorUrl: string | null;
}) {
  return (
    <Document>
      {recibos.map((recibo) => (
        <React.Fragment key={recibo.liquidacion.id}>
          <ReciboPdfPage recibo={recibo} clientData={clientData} firmaEmpleadorUrl={firmaEmpleadorUrl} copia="empleado" />
          <ReciboPdfPage recibo={recibo} clientData={clientData} firmaEmpleadorUrl={firmaEmpleadorUrl} copia="empleador" />
        </React.Fragment>
      ))}
    </Document>
  );
}

// ─── Utilidades de descarga ───────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50);
}

// ─── API pública ─────────────────────────────────────────────────────────────

export async function generarPdfBlobEmpleado(
  recibos: ReciboDetallePdf[],
  clientData: ClientDataPdf | null,
  firmaEmpleadorUrl: string | null
): Promise<Blob> {
  const instance = pdf(
    <EmpleadoPdfDocument
      recibos={recibos}
      clientData={clientData}
      firmaEmpleadorUrl={firmaEmpleadorUrl}
    />
  );
  return instance.toBlob();
}

export async function generarYDescargar({
  recibosAgrupados,
  clientData,
  firmaEmpleadorUrl,
  ano,
  mes,
  onProgress,
}: {
  recibosAgrupados: Array<{ empleadoNombre: string; recibos: ReciboDetallePdf[] }>;
  clientData: ClientDataPdf | null;
  firmaEmpleadorUrl: string | null;
  ano: string;
  mes: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<void> {
  if (recibosAgrupados.length === 0) {
    throw new Error('Sin recibos para imprimir');
  }

  const periodoLabel = mes ? `${ano}_${mes}` : ano;

  if (recibosAgrupados.length === 1) {
    const { empleadoNombre, recibos } = recibosAgrupados[0]!;
    onProgress?.(0, 1);
    const blob = await generarPdfBlobEmpleado(recibos, clientData, firmaEmpleadorUrl);
    onProgress?.(1, 1);
    triggerDownload(blob, `recibos_${sanitizeFilename(empleadoNombre)}_${periodoLabel}.pdf`);
    return;
  }

  // Múltiples empleados → ZIP (un PDF por empleado)
  const JSZip = (await import('jszip')).default;
  const zip   = new JSZip();
  const total = recibosAgrupados.length;

  for (let i = 0; i < recibosAgrupados.length; i++) {
    const { empleadoNombre, recibos } = recibosAgrupados[i]!;
    onProgress?.(i, total);
    const blob = await generarPdfBlobEmpleado(recibos, clientData, firmaEmpleadorUrl);
    zip.file(`${sanitizeFilename(empleadoNombre)}.pdf`, blob);
  }

  onProgress?.(total, total);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `recibos_${periodoLabel}.zip`);
}
