/**
 * Exportes del Libro Mayor a Excel (exceljs) y PDF (@react-pdf/renderer).
 * Formato "Libro Mayor" con disclaimer de valores históricos (PRD §6.11).
 */
import ExcelJSRaw from 'exceljs';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { MONTH_NAMES, JOURNAL_ORIGIN_LABELS } from '@/lib/accounting-labels';

interface XLBorderLine {
  style: string;
  color?: { argb: string };
}
interface XLCell {
  value: unknown;
  font?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    color?: { argb: string };
  };
  numFmt?: string;
  alignment?: { horizontal?: 'left' | 'right' | 'center'; vertical?: string };
  fill?: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } };
  border?: { top?: XLBorderLine; bottom?: XLBorderLine };
}
interface XLRow {
  number: number;
  height?: number;
  getCell(col: number): XLCell;
}
interface XLWorksheet {
  getColumn(col: number): { width?: number };
  getRow(row: number): XLRow;
  addRow(values: unknown[]): XLRow;
  mergeCells(range: string): void;
  columns: { width?: number }[];
}
const ExcelJS = ExcelJSRaw as unknown as {
  Workbook: new () => {
    addWorksheet(
      name: string,
      options?: { views?: { showGridLines?: boolean }[] }
    ): XLWorksheet;
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Buffer> };
  };
};

const GREY = 'FFEFEFEF';
const BORDER_GREY = 'FFBBBBBB';
const MONEY_FMT = '#,##0.00';
/** Saldo numérico con sufijo D (positivo) / H (negativo). */
const SALDO_FMT = '#,##0.00" D";#,##0.00" H";"0,00"';

export interface MayorRow {
  entryDate: string | Date;
  number: number;
  description: string | null;
  lineDescription: string | null;
  origin: string;
  debit: number;
  credit: number;
  balance: number;
}
export interface MayorSection {
  code: string;
  name: string;
  saldoInicial: number;
  rows: MayorRow[];
  totalDebit: number;
  totalCredit: number;
  saldoFinal: number;
}
export interface MayorExportData {
  empresaName: string;
  fiscalYearNumber: number | null;
  from: string | Date;
  to: string | Date;
  sections: MayorSection[];
}

const DISCLAIMER =
  'Valores históricos sin ajuste por inflación (RT 6). Uso interno / presentación informal.';

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function fmtMoney(n: number): string {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function saldoLabel(n: number): string {
  if (Math.abs(n) < 0.005) return '0,00';
  return `${fmtMoney(Math.abs(n))} ${n >= 0 ? 'D' : 'H'}`;
}
function sanitizeSheet(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Mayor';
}
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

/* ─────────────────────────────── Excel ─────────────────────────────── */

const HEADERS = [
  'Fecha',
  'N° Asiento',
  'Descripción',
  'Origen',
  'Debe',
  'Haber',
  'Saldo',
];
const NCOLS = 7;

function setBold(row: XLRow, cols = NCOLS) {
  for (let c = 1; c <= cols; c++) row.getCell(c).font = { bold: true };
}
function fillRow(row: XLRow, argb: string, cols = NCOLS) {
  for (let c = 1; c <= cols; c++) {
    row.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb },
    };
  }
}
function rightAlignAmounts(row: XLRow) {
  for (const c of [5, 6, 7]) row.getCell(c).alignment = { horizontal: 'right' };
}

function writeSection(ws: XLWorksheet, section: MayorSection) {
  // Encabezado de cuenta (merge A:G, fondo gris).
  const accRow = ws.addRow([`${section.code} · ${section.name}`]);
  ws.mergeCells(`A${accRow.number}:G${accRow.number}`);
  accRow.getCell(1).font = { bold: true, size: 11 };
  fillRow(accRow, GREY);

  // Columnas.
  const head = ws.addRow(HEADERS);
  setBold(head);
  fillRow(head, 'FFF8F8F8');
  rightAlignAmounts(head);
  for (let c = 1; c <= NCOLS; c++) {
    head.getCell(c).border = {
      bottom: { style: 'thin', color: { argb: BORDER_GREY } },
    };
  }

  // Saldo inicial.
  const ini = ws.addRow([
    '',
    '',
    'Saldo inicial',
    '',
    null,
    null,
    section.saldoInicial,
  ]);
  ini.getCell(3).font = { italic: true, color: { argb: 'FF888888' } };
  ini.getCell(7).numFmt = SALDO_FMT;
  ini.getCell(7).alignment = { horizontal: 'right' };

  // Movimientos.
  for (const r of section.rows) {
    const row = ws.addRow([
      fmtDate(r.entryDate),
      r.number,
      r.description ?? r.lineDescription ?? '',
      JOURNAL_ORIGIN_LABELS[r.origin] ?? r.origin,
      r.debit > 0 ? r.debit : null,
      r.credit > 0 ? r.credit : null,
      r.balance,
    ]);
    row.getCell(5).numFmt = MONEY_FMT;
    row.getCell(6).numFmt = MONEY_FMT;
    row.getCell(7).numFmt = SALDO_FMT;
    rightAlignAmounts(row);
  }

  // Totales.
  const tot = ws.addRow([
    '',
    '',
    'Totales',
    '',
    section.totalDebit,
    section.totalCredit,
    section.saldoFinal,
  ]);
  setBold(tot);
  tot.getCell(5).numFmt = MONEY_FMT;
  tot.getCell(6).numFmt = MONEY_FMT;
  tot.getCell(7).numFmt = SALDO_FMT;
  rightAlignAmounts(tot);
  for (let c = 1; c <= NCOLS; c++) {
    tot.getCell(c).border = {
      top: { style: 'thin', color: { argb: BORDER_GREY } },
    };
  }
  ws.addRow([]); // separación
}

function writeTitle(ws: XLWorksheet, data: MayorExportData) {
  const t1 = ws.addRow([data.empresaName]);
  t1.getCell(1).font = { bold: true, size: 14 };
  const t2 = ws.addRow([
    `Libro Mayor · Ejercicio N°${data.fiscalYearNumber ?? ''} · ${fmtDate(data.from)} a ${fmtDate(data.to)}`,
  ]);
  t2.getCell(1).font = { color: { argb: 'FF555555' } };
  const t3 = ws.addRow([DISCLAIMER]);
  t3.getCell(1).font = { italic: true, size: 8, color: { argb: 'FF999999' } };
  ws.addRow([]);
}

function setWidths(ws: XLWorksheet) {
  [13, 11, 42, 16, 15, 15, 16].forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });
}

export async function exportMayorExcel(
  data: MayorExportData,
  opts: { sheetPerAccount: boolean }
): Promise<void> {
  const wb = new ExcelJS.Workbook();

  if (opts.sheetPerAccount && data.sections.length > 1) {
    for (const section of data.sections) {
      const ws = wb.addWorksheet(
        sanitizeSheet(`${section.code} ${section.name}`),
        {
          views: [{ showGridLines: false }],
        }
      );
      writeTitle(ws, data);
      writeSection(ws, section);
      setWidths(ws);
    }
  } else {
    const ws = wb.addWorksheet('Mayor', { views: [{ showGridLines: false }] });
    writeTitle(ws, data);
    for (const section of data.sections) writeSection(ws, section);
    setWidths(ws);
  }

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `mayor_${Date.now()}.xlsx`
  );
}

/* ─────────────────────────────── PDF ─────────────────────────────── */

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1a1a' },
  empresa: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, marginTop: 2, color: '#444' },
  disclaimer: { fontSize: 7, marginTop: 4, color: '#888', fontStyle: 'italic' },
  acctHead: {
    marginTop: 12,
    marginBottom: 2,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#f0f0f0',
    padding: 3,
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e5e5',
    paddingVertical: 2,
  },
  th: {
    flexDirection: 'row',
    borderBottom: '1pt solid #999',
    paddingVertical: 2,
    fontFamily: 'Helvetica-Bold',
  },
  totalRow: {
    flexDirection: 'row',
    borderTop: '1pt solid #999',
    paddingVertical: 2,
    fontFamily: 'Helvetica-Bold',
  },
  cFecha: { width: '11%' },
  cNum: { width: '8%' },
  cDesc: { width: '37%' },
  cOrig: { width: '14%' },
  cDebe: { width: '10%', textAlign: 'right' },
  cHaber: { width: '10%', textAlign: 'right' },
  cSaldo: { width: '10%', textAlign: 'right' },
});

function MayorPdfDoc({ data }: { data: MayorExportData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page} wrap>
        <Text style={s.empresa}>{data.empresaName}</Text>
        <Text style={s.sub}>
          Libro Mayor · Ejercicio N°{data.fiscalYearNumber ?? ''} ·{' '}
          {fmtDate(data.from)} a {fmtDate(data.to)}
        </Text>
        <Text style={s.disclaimer}>{DISCLAIMER}</Text>

        {data.sections.map((section) => (
          <View key={section.code} wrap={false}>
            <Text style={s.acctHead}>
              {section.code} · {section.name}
            </Text>
            <View style={s.th}>
              <Text style={s.cFecha}>Fecha</Text>
              <Text style={s.cNum}>Asiento</Text>
              <Text style={s.cDesc}>Detalle</Text>
              <Text style={s.cOrig}>Origen</Text>
              <Text style={s.cDebe}>Debe</Text>
              <Text style={s.cHaber}>Haber</Text>
              <Text style={s.cSaldo}>Saldo</Text>
            </View>
            <View style={s.row}>
              <Text style={s.cFecha} />
              <Text style={s.cNum} />
              <Text style={s.cDesc}>Saldo inicial</Text>
              <Text style={s.cOrig} />
              <Text style={s.cDebe} />
              <Text style={s.cHaber} />
              <Text style={s.cSaldo}>{saldoLabel(section.saldoInicial)}</Text>
            </View>
            {section.rows.map((r, i) => (
              <View key={i} style={s.row}>
                <Text style={s.cFecha}>{fmtDate(r.entryDate)}</Text>
                <Text style={s.cNum}>{r.number}</Text>
                <Text style={s.cDesc}>
                  {r.description ?? r.lineDescription ?? ''}
                </Text>
                <Text style={s.cOrig}>
                  {JOURNAL_ORIGIN_LABELS[r.origin] ?? r.origin}
                </Text>
                <Text style={s.cDebe}>{r.debit ? fmtMoney(r.debit) : ''}</Text>
                <Text style={s.cHaber}>
                  {r.credit ? fmtMoney(r.credit) : ''}
                </Text>
                <Text style={s.cSaldo}>{saldoLabel(r.balance)}</Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={s.cFecha} />
              <Text style={s.cNum} />
              <Text style={s.cDesc}>Totales</Text>
              <Text style={s.cOrig} />
              <Text style={s.cDebe}>{fmtMoney(section.totalDebit)}</Text>
              <Text style={s.cHaber}>{fmtMoney(section.totalCredit)}</Text>
              <Text style={s.cSaldo}>{saldoLabel(section.saldoFinal)}</Text>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function exportMayorPdf(data: MayorExportData): Promise<void> {
  const blob = await pdf(<MayorPdfDoc data={data} />).toBlob();
  triggerDownload(blob, `mayor_${Date.now()}.pdf`);
}

/* MONTH_NAMES re-export para evitar tree-shaking accidental si se usa en el futuro. */
export { MONTH_NAMES };

/* ═══════════════ Balance de sumas y saldos — exports (US 2.2.3) ═══════════════ */

export interface BalanceExportRow {
  code: string;
  name: string;
  sumaDebe: number;
  sumaHaber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}
export interface BalanceExportData {
  empresaName: string;
  fiscalYearNumber: number | null;
  asOf: string | Date;
  rows: BalanceExportRow[];
  totals: {
    sumaDebe: number;
    sumaHaber: number;
    saldoDeudor: number;
    saldoAcreedor: number;
  };
  balanced: boolean;
}

const BAL_HEADERS = [
  'Código',
  'Cuenta',
  'Suma Debe',
  'Suma Haber',
  'Saldo Deudor',
  'Saldo Acreedor',
];

export async function exportBalanceExcel(
  data: BalanceExportData
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Balance', { views: [{ showGridLines: false }] });

  const t1 = ws.addRow([data.empresaName]);
  t1.getCell(1).font = { bold: true, size: 14 };
  const t2 = ws.addRow([
    `Balance de sumas y saldos · Ejercicio N°${data.fiscalYearNumber ?? ''} · al ${fmtDate(data.asOf)}`,
  ]);
  t2.getCell(1).font = { color: { argb: 'FF555555' } };
  const t3 = ws.addRow([DISCLAIMER]);
  t3.getCell(1).font = { italic: true, size: 8, color: { argb: 'FF999999' } };
  ws.addRow([]);

  const head = ws.addRow(BAL_HEADERS);
  for (let c = 1; c <= 6; c++) {
    head.getCell(c).font = { bold: true };
    head.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GREY },
    };
    head.getCell(c).border = {
      bottom: { style: 'thin', color: { argb: BORDER_GREY } },
    };
    if (c >= 3) head.getCell(c).alignment = { horizontal: 'right' };
  }

  for (const r of data.rows) {
    const row = ws.addRow([
      r.code,
      r.name,
      r.sumaDebe,
      r.sumaHaber,
      r.saldoDeudor || null,
      r.saldoAcreedor || null,
    ]);
    for (let c = 3; c <= 6; c++) {
      row.getCell(c).numFmt = MONEY_FMT;
      row.getCell(c).alignment = { horizontal: 'right' };
    }
  }

  const tot = ws.addRow([
    '',
    'Totales',
    data.totals.sumaDebe,
    data.totals.sumaHaber,
    data.totals.saldoDeudor,
    data.totals.saldoAcreedor,
  ]);
  for (let c = 1; c <= 6; c++) {
    tot.getCell(c).font = { bold: true };
    tot.getCell(c).border = {
      top: { style: 'thin', color: { argb: BORDER_GREY } },
    };
    if (c >= 3) {
      tot.getCell(c).numFmt = MONEY_FMT;
      tot.getCell(c).alignment = { horizontal: 'right' };
    }
  }

  if (!data.balanced) {
    ws.addRow([]);
    const warn = ws.addRow([
      '⚠ El balance NO cuadra: revisar antes de cerrar.',
    ]);
    warn.getCell(1).font = { bold: true, color: { argb: 'FFB00020' } };
  }

  [12, 40, 16, 16, 16, 16].forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `balance_sumas_saldos_${Date.now()}.xlsx`
  );
}

const bs = StyleSheet.create({
  th: {
    flexDirection: 'row',
    borderBottom: '1pt solid #999',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e5e5',
    paddingVertical: 2.5,
  },
  totalRow: {
    flexDirection: 'row',
    borderTop: '1pt solid #999',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
  },
  cCode: { width: '13%' },
  cName: { width: '37%' },
  cNum: { width: '12.5%', textAlign: 'right' },
  warn: { marginTop: 10, color: '#b00020', fontFamily: 'Helvetica-Bold' },
});

function BalancePdfDoc({ data }: { data: BalanceExportData }) {
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Text style={s.empresa}>{data.empresaName}</Text>
        <Text style={s.sub}>
          Balance de sumas y saldos · Ejercicio N°{data.fiscalYearNumber ?? ''}{' '}
          · al {fmtDate(data.asOf)}
        </Text>
        <Text style={s.disclaimer}>{DISCLAIMER}</Text>

        <View style={bs.th}>
          <Text style={bs.cCode}>Código</Text>
          <Text style={bs.cName}>Cuenta</Text>
          <Text style={bs.cNum}>Suma Debe</Text>
          <Text style={bs.cNum}>Suma Haber</Text>
          <Text style={bs.cNum}>S. Deudor</Text>
          <Text style={bs.cNum}>S. Acreedor</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.code} style={bs.row}>
            <Text style={bs.cCode}>{r.code}</Text>
            <Text style={bs.cName}>{r.name}</Text>
            <Text style={bs.cNum}>{fmtMoney(r.sumaDebe)}</Text>
            <Text style={bs.cNum}>{fmtMoney(r.sumaHaber)}</Text>
            <Text style={bs.cNum}>
              {r.saldoDeudor ? fmtMoney(r.saldoDeudor) : ''}
            </Text>
            <Text style={bs.cNum}>
              {r.saldoAcreedor ? fmtMoney(r.saldoAcreedor) : ''}
            </Text>
          </View>
        ))}
        <View style={bs.totalRow}>
          <Text style={bs.cCode} />
          <Text style={bs.cName}>Totales</Text>
          <Text style={bs.cNum}>{fmtMoney(data.totals.sumaDebe)}</Text>
          <Text style={bs.cNum}>{fmtMoney(data.totals.sumaHaber)}</Text>
          <Text style={bs.cNum}>{fmtMoney(data.totals.saldoDeudor)}</Text>
          <Text style={bs.cNum}>{fmtMoney(data.totals.saldoAcreedor)}</Text>
        </View>
        {!data.balanced && (
          <Text style={bs.warn}>
            El balance NO cuadra: revisar antes de cerrar el período.
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function exportBalancePdf(data: BalanceExportData): Promise<void> {
  const blob = await pdf(<BalancePdfDoc data={data} />).toBlob();
  triggerDownload(blob, `balance_sumas_saldos_${Date.now()}.pdf`);
}

/* ═══════════════ Libro Diario — export PDF (US 2.3.1) ═══════════════ */

export interface LibroDiarioLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
}
export interface LibroDiarioEntry {
  number: number;
  entryDate: string | Date;
  description: string | null;
  origin: string;
  isVoided: boolean;
  voidReason: string | null;
  lines: LibroDiarioLine[];
}
export interface LibroDiarioData {
  empresaName: string;
  cuit: string;
  fiscalYearNumber: number;
  from: string | Date;
  to: string | Date;
  entries: LibroDiarioEntry[];
}

const ds = StyleSheet.create({
  asiento: {
    marginTop: 8,
    paddingBottom: 4,
    borderBottom: '0.5pt solid #e5e5e5',
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  num: { fontFamily: 'Helvetica-Bold', width: '8%' },
  fecha: { width: '13%', color: '#444' },
  desc: { flex: 1, fontFamily: 'Helvetica-Bold' },
  descVoid: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
    textDecoration: 'line-through',
    color: '#999',
  },
  origin: { fontSize: 7, color: '#888' },
  voidTag: {
    fontSize: 7,
    color: '#b00020',
    fontFamily: 'Helvetica-Bold',
    marginLeft: 6,
  },
  lineRow: { flexDirection: 'row', paddingVertical: 1, paddingLeft: '8%' },
  lAcct: { flex: 1 },
  lAcctVoid: { flex: 1, color: '#999', textDecoration: 'line-through' },
  lDebe: { width: '15%', textAlign: 'right' },
  lHaber: { width: '15%', textAlign: 'right' },
  colhead: {
    flexDirection: 'row',
    paddingLeft: '8%',
    borderBottom: '0.5pt solid #ccc',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: '#666',
    marginBottom: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
  },
});

function LibroDiarioDoc({ data }: { data: LibroDiarioData }) {
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Text style={s.empresa}>{data.empresaName}</Text>
        <Text style={s.sub}>
          CUIT {data.cuit} · Libro Diario · Ejercicio N°{data.fiscalYearNumber}{' '}
          · {fmtDate(data.from)} a {fmtDate(data.to)}
        </Text>
        <Text style={s.disclaimer}>{DISCLAIMER}</Text>

        <View style={ds.colhead}>
          <Text style={ds.lAcct}>Cuenta</Text>
          <Text style={ds.lDebe}>Debe</Text>
          <Text style={ds.lHaber}>Haber</Text>
        </View>

        {data.entries.map((e) => (
          <View key={e.number} style={ds.asiento} wrap={false}>
            <View style={ds.head}>
              <Text style={ds.num}>N°{e.number}</Text>
              <Text style={ds.fecha}>{fmtDate(e.entryDate)}</Text>
              <Text style={e.isVoided ? ds.descVoid : ds.desc}>
                {e.description ?? '(sin descripción)'}
              </Text>
              <Text style={ds.origin}>
                {JOURNAL_ORIGIN_LABELS[e.origin] ?? e.origin}
              </Text>
              {e.isVoided && <Text style={ds.voidTag}>ANULADO</Text>}
            </View>
            {e.lines.map((l, i) => (
              <View key={i} style={ds.lineRow}>
                <Text style={e.isVoided ? ds.lAcctVoid : ds.lAcct}>
                  {l.accountCode} {l.accountName}
                  {l.description ? ` · ${l.description}` : ''}
                </Text>
                <Text style={ds.lDebe}>{l.debit ? fmtMoney(l.debit) : ''}</Text>
                <Text style={ds.lHaber}>
                  {l.credit ? fmtMoney(l.credit) : ''}
                </Text>
              </View>
            ))}
            {e.isVoided && e.voidReason && (
              <Text style={[ds.lineRow, ds.origin] as never}>
                Motivo de anulación: {e.voidReason}
              </Text>
            )}
          </View>
        ))}

        <View style={ds.footer} fixed>
          <Text>
            {data.empresaName} · Libro Diario · Ejercicio N°
            {data.fiscalYearNumber}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function exportLibroDiarioPdf(
  data: LibroDiarioData
): Promise<void> {
  const blob = await pdf(<LibroDiarioDoc data={data} />).toBlob();
  triggerDownload(blob, `libro_diario_${Date.now()}.pdf`);
}

/* ═══════════════ Anexo I — Bienes de uso (US 4.2.1) ═══════════════ */

export interface AnexoIExportAsset {
  name: string;
  originalValue: number;
  accumStart: number;
  amortYear: number;
  accumEnd: number;
  residualEnd: number;
}
export interface AnexoIExportCategory {
  category: string;
  assets: AnexoIExportAsset[];
  totals: {
    originalValue: number;
    accumStart: number;
    amortYear: number;
    accumEnd: number;
    residualEnd: number;
  };
}
export interface AnexoIExportData {
  empresaName: string;
  fiscalYearNumber: number;
  periodLabel: string;
  categories: AnexoIExportCategory[];
  grandTotals: AnexoIExportCategory['totals'];
  priorResidualEnd?: number | null;
  priorNumber?: number | null;
}

const ANEXO_HEADERS = [
  'Bien',
  'Valor origen',
  'Amort. acum. inicio',
  'Amort. ejercicio',
  'Amort. acum. cierre',
  'Valor residual cierre',
];

export async function exportAnexoIExcel(data: AnexoIExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Anexo I', { views: [{ showGridLines: false }] });

  const t1 = ws.addRow([data.empresaName]);
  t1.getCell(1).font = { bold: true, size: 14 };
  const t2 = ws.addRow([
    `Anexo I · Bienes de uso · Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`,
  ]);
  t2.getCell(1).font = { color: { argb: 'FF555555' } };
  const t3 = ws.addRow([DISCLAIMER]);
  t3.getCell(1).font = { italic: true, size: 8, color: { argb: 'FF999999' } };
  ws.addRow([]);

  const head = ws.addRow(ANEXO_HEADERS);
  for (let c = 1; c <= 6; c++) {
    head.getCell(c).font = { bold: true };
    head.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GREY },
    };
    head.getCell(c).border = {
      bottom: { style: 'thin', color: { argb: BORDER_GREY } },
    };
    if (c >= 2) head.getCell(c).alignment = { horizontal: 'right' };
  }

  const numRow = (
    label: string,
    t: AnexoIExportCategory['totals'],
    opts?: { bold?: boolean; fill?: boolean }
  ) => {
    const row = ws.addRow([
      label,
      t.originalValue,
      t.accumStart,
      t.amortYear,
      t.accumEnd,
      t.residualEnd,
    ]);
    for (let c = 1; c <= 6; c++) {
      if (opts?.bold) row.getCell(c).font = { bold: true };
      if (opts?.fill)
        row.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: GREY },
        };
      if (c >= 2) {
        row.getCell(c).numFmt = MONEY_FMT;
        row.getCell(c).alignment = { horizontal: 'right' };
      }
    }
    return row;
  };

  for (const cat of data.categories) {
    const ch = ws.addRow([cat.category]);
    ch.getCell(1).font = { bold: true };
    for (const a of cat.assets) {
      const row = ws.addRow([
        `   ${a.name}`,
        a.originalValue,
        a.accumStart,
        a.amortYear,
        a.accumEnd,
        a.residualEnd,
      ]);
      for (let c = 2; c <= 6; c++) {
        row.getCell(c).numFmt = MONEY_FMT;
        row.getCell(c).alignment = { horizontal: 'right' };
      }
    }
    numRow(`   Subtotal ${cat.category}`, cat.totals, { bold: true });
  }

  ws.addRow([]);
  numRow('TOTAL GENERAL', data.grandTotals, { bold: true, fill: true });
  if (data.priorResidualEnd != null) {
    const pr = ws.addRow([
      `Valor residual al cierre · Ejercicio anterior (N°${data.priorNumber})`,
      '',
      '',
      '',
      '',
      data.priorResidualEnd,
    ]);
    pr.getCell(6).numFmt = MONEY_FMT;
    pr.getCell(6).alignment = { horizontal: 'right' };
    pr.getCell(1).font = { italic: true, color: { argb: 'FF555555' } };
  }

  [40, 16, 18, 16, 18, 18].forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `anexo_i_bienes_uso_${Date.now()}.xlsx`
  );
}

const ax = StyleSheet.create({
  th: {
    flexDirection: 'row',
    borderBottom: '1pt solid #999',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
  },
  catRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e5e5e5',
    paddingVertical: 2.5,
  },
  subRow: {
    flexDirection: 'row',
    borderTop: '0.5pt solid #999',
    paddingVertical: 2.5,
    fontFamily: 'Helvetica-Bold',
  },
  totalRow: {
    flexDirection: 'row',
    borderTop: '1pt solid #333',
    borderBottom: '1pt solid #333',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
  },
  cName: { width: '34%' },
  cNum: { width: '13.2%', textAlign: 'right' },
  prior: { marginTop: 8, fontSize: 8, color: '#555', fontStyle: 'italic' },
});

function AnexoIDoc({ data }: { data: AnexoIExportData }) {
  const t = data.grandTotals;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page} wrap>
        <Text style={s.empresa}>{data.empresaName}</Text>
        <Text style={s.sub}>
          Anexo I · Bienes de uso · Ejercicio N°{data.fiscalYearNumber} ·{' '}
          {data.periodLabel}
        </Text>
        <Text style={s.disclaimer}>{DISCLAIMER}</Text>

        <View style={ax.th}>
          <Text style={ax.cName}>Bien</Text>
          <Text style={ax.cNum}>Valor origen</Text>
          <Text style={ax.cNum}>Am. ac. inicio</Text>
          <Text style={ax.cNum}>Am. ejercicio</Text>
          <Text style={ax.cNum}>Am. ac. cierre</Text>
          <Text style={ax.cNum}>V. resid. cierre</Text>
        </View>

        {data.categories.map((cat) => (
          <View key={cat.category} wrap={false}>
            <View style={ax.catRow}>
              <Text>{cat.category}</Text>
            </View>
            {cat.assets.map((a, i) => (
              <View key={i} style={ax.row}>
                <Text style={ax.cName}>{a.name}</Text>
                <Text style={ax.cNum}>{fmtMoney(a.originalValue)}</Text>
                <Text style={ax.cNum}>{fmtMoney(a.accumStart)}</Text>
                <Text style={ax.cNum}>{fmtMoney(a.amortYear)}</Text>
                <Text style={ax.cNum}>{fmtMoney(a.accumEnd)}</Text>
                <Text style={ax.cNum}>{fmtMoney(a.residualEnd)}</Text>
              </View>
            ))}
            <View style={ax.subRow}>
              <Text style={ax.cName}>Subtotal {cat.category}</Text>
              <Text style={ax.cNum}>{fmtMoney(cat.totals.originalValue)}</Text>
              <Text style={ax.cNum}>{fmtMoney(cat.totals.accumStart)}</Text>
              <Text style={ax.cNum}>{fmtMoney(cat.totals.amortYear)}</Text>
              <Text style={ax.cNum}>{fmtMoney(cat.totals.accumEnd)}</Text>
              <Text style={ax.cNum}>{fmtMoney(cat.totals.residualEnd)}</Text>
            </View>
          </View>
        ))}

        <View style={ax.totalRow}>
          <Text style={ax.cName}>TOTAL GENERAL</Text>
          <Text style={ax.cNum}>{fmtMoney(t.originalValue)}</Text>
          <Text style={ax.cNum}>{fmtMoney(t.accumStart)}</Text>
          <Text style={ax.cNum}>{fmtMoney(t.amortYear)}</Text>
          <Text style={ax.cNum}>{fmtMoney(t.accumEnd)}</Text>
          <Text style={ax.cNum}>{fmtMoney(t.residualEnd)}</Text>
        </View>

        {data.priorResidualEnd != null && (
          <Text style={ax.prior}>
            Valor residual al cierre · Ejercicio anterior (N°{data.priorNumber}
            ): {fmtMoney(data.priorResidualEnd)}
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function exportAnexoIPdf(data: AnexoIExportData): Promise<void> {
  const blob = await pdf(<AnexoIDoc data={data} />).toBlob();
  triggerDownload(blob, `anexo_i_bienes_uso_${Date.now()}.pdf`);
}
