'use client';

/**
 * Representación imprimible de un comprobante.
 *
 * No es el PDF de AFIP: el scrapeo de "Mis Comprobantes" trae los datos, no el
 * archivo, y la tabla `comprobante` no guarda ninguno. Esto arma la
 * representación desde lo que hay, con la disposición de una factura para que
 * se lea como tal, y lo dice en el pie para que nadie la confunda con el
 * original.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';

export interface ComprobantePdfData {
  letra: string | null;
  tipoDescripcion: string | null;
  puntoVenta: number | string | null;
  numero: number | string | null;
  fechaEmision: string | Date | null;
  direccion: string | null;
  moneda: string | null;
  cotizacion: string | null;
  cae: string | null;
  clienteRazonSocial: string | null;
  clienteCuit?: string | null;
  contraparteNombre: string | null;
  contraparteDocTipo: string | null;
  contraparteDocNro: string | null;
  contraparteProvincia: string | null;
  netoGravado: string | null;
  netoNoGravado: string | null;
  exento: string | null;
  otrosTributos: string | null;
  ivaTotal: string | null;
  total: string | null;
  alicuotas: {
    alicuota: string | null;
    neto: string | null;
    iva: string | null;
  }[];
}

const TINTA = '#12131A';
const BORDE = '#B9B6AE';
const SUAVE = '#6E7079';

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, color: TINTA, fontFamily: 'Helvetica' },
  marco: { borderWidth: 1, borderColor: BORDE },
  cabecera: { flexDirection: 'row', borderBottomWidth: 1, borderColor: BORDE },
  mitad: { flex: 1, padding: 10 },
  // La letra va en un recuadro centrado sobre la línea divisoria, como en el
  // formato de AFIP.
  letra: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -17,
    width: 34,
    height: 40,
    borderWidth: 1,
    borderColor: BORDE,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letraTexto: { fontSize: 22, fontFamily: 'Helvetica-Bold' },
  cod: { fontSize: 6, color: SUAVE },
  emisor: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  titulo: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  label: {
    fontSize: 6.5,
    color: SUAVE,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  valor: { fontSize: 9, marginBottom: 5 },
  bloque: { padding: 10, borderBottomWidth: 1, borderColor: BORDE },
  fila: { flexDirection: 'row' },
  col: { flex: 1 },
  th: {
    flexDirection: 'row',
    backgroundColor: '#F2F0EA',
    borderBottomWidth: 1,
    borderColor: BORDE,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  td: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderColor: '#E4E1D9',
  },
  cel: { fontSize: 8 },
  der: { textAlign: 'right' },
  totales: { alignItems: 'flex-end', padding: 10 },
  totalFila: {
    flexDirection: 'row',
    width: 230,
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  totalFinal: {
    flexDirection: 'row',
    width: 230,
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: BORDE,
    paddingTop: 5,
    marginTop: 3,
  },
  granTotal: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  pie: { marginTop: 10, fontSize: 6.5, color: SUAVE, textAlign: 'center' },
});

const pesos = (v: string | null): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fecha = (f: string | Date | null): string => {
  if (!f) return '—';
  const d = typeof f === 'string' ? new Date(f) : f;
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
};

/** `0006-00000123`, como se numera un comprobante. */
const numeroLargo = (pv: number | string | null, nro: number | string | null) =>
  `${String(pv ?? 0).padStart(4, '0')}-${String(nro ?? 0).padStart(8, '0')}`;

function Campo({ label, children }: { label: string; children: string }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <Text style={s.valor}>{children}</Text>
    </View>
  );
}

export function ComprobantePdf({ d }: { d: ComprobantePdfData }) {
  // Emitida: la empresa factura y la contraparte recibe. Recibida: al revés.
  const emitida = d.direccion === 'emitido';
  const emisor = emitida ? d.clienteRazonSocial : d.contraparteNombre;
  const emisorDoc = emitida ? d.clienteCuit : d.contraparteDocNro;
  const receptor = emitida ? d.contraparteNombre : d.clienteRazonSocial;
  const receptorDoc = emitida ? d.contraparteDocNro : d.clienteCuit;

  return (
    <Document
      title={`${d.tipoDescripcion ?? 'Comprobante'} ${numeroLargo(d.puntoVenta, d.numero)}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.marco}>
          <View style={s.cabecera}>
            <View style={s.mitad}>
              <Text style={s.emisor}>{emisor ?? 'Sin datos'}</Text>
              <Text style={{ fontSize: 8, color: SUAVE, marginTop: 3 }}>
                {emisorDoc ? `CUIT ${emisorDoc}` : ' '}
              </Text>
            </View>
            <View style={[s.mitad, { borderLeftWidth: 1, borderColor: BORDE }]}>
              <Text style={s.titulo}>{d.tipoDescripcion ?? 'Comprobante'}</Text>
              <Text style={{ fontSize: 10, marginTop: 3 }}>
                N° {numeroLargo(d.puntoVenta, d.numero)}
              </Text>
              <Text style={{ fontSize: 8, color: SUAVE, marginTop: 3 }}>
                Fecha de emisión: {fecha(d.fechaEmision)}
              </Text>
            </View>
            <View style={s.letra}>
              <Text style={s.letraTexto}>{d.letra ?? '—'}</Text>
              <Text style={s.cod}>{d.direccion ?? ''}</Text>
            </View>
          </View>

          <View style={s.bloque}>
            <View style={s.fila}>
              <View style={s.col}>
                <Campo label="Receptor">{receptor ?? 'Sin datos'}</Campo>
              </View>
              <View style={s.col}>
                <Campo label={d.contraparteDocTipo ?? 'Identificación'}>
                  {receptorDoc ?? 'Sin datos'}
                </Campo>
              </View>
              <View style={s.col}>
                <Campo label="Provincia">
                  {d.contraparteProvincia ?? 'Sin datos'}
                </Campo>
              </View>
            </View>
          </View>

          {d.alicuotas.length > 0 && (
            <View>
              <View style={s.th}>
                <Text style={[s.cel, { flex: 1 }]}>Alícuota IVA</Text>
                <Text style={[s.cel, { width: 120 }, s.der]}>Neto</Text>
                <Text style={[s.cel, { width: 120 }, s.der]}>IVA</Text>
              </View>
              {d.alicuotas.map((a, i) => (
                <View style={s.td} key={i}>
                  <Text style={[s.cel, { flex: 1 }]}>
                    {a.alicuota ? `${a.alicuota}%` : '—'}
                  </Text>
                  <Text style={[s.cel, { width: 120 }, s.der]}>
                    {pesos(a.neto)}
                  </Text>
                  <Text style={[s.cel, { width: 120 }, s.der]}>
                    {pesos(a.iva)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={s.totales}>
            {[
              ['Neto gravado', d.netoGravado],
              ['Neto no gravado', d.netoNoGravado],
              ['Exento', d.exento],
              ['Otros tributos', d.otrosTributos],
              ['IVA', d.ivaTotal],
            ]
              // Las líneas en cero sólo agregan ruido a una factura.
              .filter(([, v]) => Number(v ?? 0) !== 0)
              .map(([label, v]) => (
                <View style={s.totalFila} key={label}>
                  <Text style={s.cel}>{label}</Text>
                  <Text style={s.cel}>{pesos(v)}</Text>
                </View>
              ))}
            <View style={s.totalFinal}>
              <Text style={s.granTotal}>Total</Text>
              <Text style={s.granTotal}>
                {pesos(d.total)} {d.moneda ?? 'ARS'}
              </Text>
            </View>
          </View>

          <View style={{ padding: 10, borderTopWidth: 1, borderColor: BORDE }}>
            <View style={s.fila}>
              <View style={s.col}>
                <Campo label="CAE">{d.cae ?? 'Sin datos'}</Campo>
              </View>
              <View style={s.col}>
                <Campo label="Moneda">
                  {`${d.moneda ?? 'ARS'}${
                    d.cotizacion && Number(d.cotizacion) !== 1
                      ? ` · cotización ${d.cotizacion}`
                      : ''
                  }`}
                </Campo>
              </View>
            </View>
          </View>
        </View>

        <Text style={s.pie}>
          Representación generada por Arca a partir de los datos de AFIP. No
          reemplaza al comprobante original.
        </Text>
      </Page>
    </Document>
  );
}

/** Genera el PDF y dispara la descarga. */
export async function descargarComprobantePdf(d: ComprobantePdfData) {
  const blob = await pdf(<ComprobantePdf d={d} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.tipoDescripcion ?? 'comprobante'}-${numeroLargo(d.puntoVenta, d.numero)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
