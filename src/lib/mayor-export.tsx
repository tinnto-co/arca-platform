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
import type {
  EspResult,
  ErResult,
  ErLine,
  AnexoIIResult,
  AnexoICategory,
  FsNote,
} from '@/actions/accounting';

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

/* Opción 2 (US 7.2.2): tabla plana en una sola hoja con columna de cuenta, para filtrar. */
const FLAT_HEADERS = [
  'Código',
  'Cuenta',
  'Fecha',
  'N° Asiento',
  'Detalle',
  'Origen',
  'Debe',
  'Haber',
  'Saldo',
];
const FNCOLS = 9;

function writeFlatMayor(ws: XLWorksheet, data: MayorExportData) {
  const head = ws.addRow(FLAT_HEADERS);
  setBold(head, FNCOLS);
  fillRow(head, GREY, FNCOLS);
  for (let c = 1; c <= FNCOLS; c++) {
    head.getCell(c).border = {
      bottom: { style: 'thin', color: { argb: BORDER_GREY } },
    };
    if (c >= 7) head.getCell(c).alignment = { horizontal: 'right' };
  }
  let lastRow = head.number;
  for (const section of data.sections) {
    // Saldo inicial de la cuenta (preserva el saldo progresivo por cuenta).
    const ini = ws.addRow([
      section.code,
      section.name,
      '',
      '',
      'Saldo inicial',
      '',
      null,
      null,
      section.saldoInicial,
    ]);
    ini.getCell(1).numFmt = '@';
    ini.getCell(5).font = { italic: true, color: { argb: 'FF888888' } };
    ini.getCell(9).numFmt = SALDO_FMT;
    ini.getCell(9).alignment = { horizontal: 'right' };
    lastRow = ini.number;
    for (const r of section.rows) {
      const row = ws.addRow([
        section.code,
        section.name,
        fmtDate(r.entryDate),
        r.number,
        r.description ?? r.lineDescription ?? '',
        JOURNAL_ORIGIN_LABELS[r.origin] ?? r.origin,
        r.debit > 0 ? r.debit : null,
        r.credit > 0 ? r.credit : null,
        r.balance,
      ]);
      row.getCell(1).numFmt = '@'; // código como texto
      row.getCell(7).numFmt = MONEY_FMT;
      row.getCell(8).numFmt = MONEY_FMT;
      row.getCell(9).numFmt = SALDO_FMT;
      for (const c of [7, 8, 9])
        row.getCell(c).alignment = { horizontal: 'right' };
      lastRow = row.number;
    }
  }
  (ws as unknown as { autoFilter: unknown }).autoFilter = {
    from: { row: head.number, column: 1 },
    to: { row: lastRow, column: FNCOLS },
  };
  [16, 34, 13, 11, 40, 16, 15, 15, 16].forEach((w, i) => {
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
    writeFlatMayor(ws, data);
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
    row.getCell(1).numFmt = '@'; // código como texto
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

/* ═══════════════ Paquete EECC + Libros legales — PDF (Fase 7) ═══════════════ */

const EECC_DISCLAIMER =
  'Estados Contables expresados en valores históricos, sin ajuste por inflación (RT 6).';

export interface EeccPackageData {
  empresaName: string;
  cuit: string;
  fiscalYearNumber: number;
  periodLabel: string;
  generatedLabel: string;
  esp: EspResult;
  er: ErResult;
  anexoI: {
    categories: AnexoICategory[];
    grandTotals: AnexoICategory['totals'];
  } | null;
  anexoII: AnexoIIResult;
  notes: FsNote[];
}

const pk = StyleSheet.create({
  page: {
    padding: 34,
    paddingBottom: 50,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  cover: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  coverKicker: { fontSize: 9, color: '#888', letterSpacing: 2, marginBottom: 8 },
  coverEmpresa: { fontSize: 24, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  coverCuit: { fontSize: 11, color: '#555', marginTop: 4 },
  coverTitle: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    marginTop: 26,
    color: '#222',
  },
  coverMeta: { fontSize: 11, marginTop: 4, color: '#444' },
  coverDisc: {
    fontSize: 8,
    marginTop: 30,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: 340,
  },
  coverGen: { fontSize: 7.5, marginTop: 8, color: '#aaa' },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 4,
    borderBottom: '1pt solid #333',
    paddingBottom: 3,
  },
  colHead: {
    flexDirection: 'row',
    borderBottom: '1pt solid #999',
    paddingVertical: 2,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: '#555',
  },
  macroRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 2,
    paddingHorizontal: 2,
    marginTop: 5,
    fontFamily: 'Helvetica-Bold',
  },
  subTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#666',
    marginTop: 3,
    paddingLeft: 4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 1.5,
    borderBottom: '0.5pt solid #eee',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderTop: '1pt solid #999',
    fontFamily: 'Helvetica-Bold',
  },
  grandRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    borderTop: '2pt solid #333',
    fontFamily: 'Helvetica-Bold',
  },
  cLabel: { width: '56%' },
  cLabelIndent: { width: '56%', paddingLeft: 10 },
  cNum: { width: '22%', textAlign: 'right' },
  ok: { fontSize: 8, color: '#0a7d33', marginTop: 6 },
  bad: { fontSize: 8, color: '#b00020', marginTop: 6, fontFamily: 'Helvetica-Bold' },
  noteTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  noteP: { fontSize: 9, marginTop: 2.5, lineHeight: 1.35, color: '#222' },
  noteLi: { fontSize: 9, marginTop: 1.5, marginLeft: 10, lineHeight: 1.3, color: '#222' },
  noteH: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 5 },
  empty: { fontSize: 8.5, color: '#999', fontStyle: 'italic', marginTop: 4 },
  signWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 50,
  },
  signBox: {
    width: '30%',
    borderTop: '0.7pt solid #333',
    paddingTop: 4,
    textAlign: 'center',
    fontSize: 8,
    color: '#444',
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 34,
    right: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
    borderTop: '0.5pt solid #e5e5e5',
    paddingTop: 4,
  },
});

const ax6 = StyleSheet.create({
  th: {
    flexDirection: 'row',
    borderBottom: '1pt solid #999',
    paddingVertical: 2,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: '#555',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 1.5,
    borderBottom: '0.5pt solid #eee',
    fontSize: 7.5,
  },
  sub: {
    flexDirection: 'row',
    paddingVertical: 1.5,
    borderTop: '0.5pt solid #999',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
  },
  total: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderTop: '1.5pt solid #333',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    marginTop: 2,
  },
  cName: { width: '34%' },
  cNum: { width: '13.2%', textAlign: 'right' },
  cat: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 5 },
});

function PageFooter({ data }: { data: { empresaName: string; fiscalYearNumber: number } }) {
  return (
    <View style={pk.footer} fixed>
      <Text>
        {data.empresaName} · Estados Contables · Ejercicio N°
        {data.fiscalYearNumber}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

function mdLines(md: string): { type: 'h' | 'li' | 'p'; text: string }[] {
  return md
    .split('\n')
    .map((raw) => {
      let line = raw.trim();
      let type: 'h' | 'li' | 'p' = 'p';
      if (/^#{1,6}\s/.test(line)) {
        type = 'h';
        line = line.replace(/^#{1,6}\s+/, '');
      } else if (/^[-*+]\s/.test(line)) {
        type = 'li';
        line = line.replace(/^[-*+]\s+/, '');
      } else if (/^\d+\.\s/.test(line)) {
        type = 'li';
      }
      line = line
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/`(.+?)`/g, '$1');
      return { type, text: line };
    })
    .filter((l) => l.text.length > 0);
}

function EspBlock({ esp }: { esp: EspResult }) {
  const macros: { macro: 'activo' | 'pasivo' | 'pn'; title: string }[] = [
    { macro: 'activo', title: 'ACTIVO' },
    { macro: 'pasivo', title: 'PASIVO' },
    { macro: 'pn', title: 'PATRIMONIO NETO' },
  ];
  const priorLabel = esp.hasPrior
    ? `Ej. N°${esp.priorFiscalYearNumber}`
    : 'Anterior';
  return (
    <View>
      <Text style={pk.sectionTitle}>Estado de Situación Patrimonial</Text>
      <View style={pk.colHead}>
        <Text style={pk.cLabel}>Rubro</Text>
        <Text style={pk.cNum}>Ej. N°{esp.fiscalYearNumber}</Text>
        <Text style={pk.cNum}>{priorLabel}</Text>
      </View>
      {macros.map(({ macro, title }) => {
        const secs = esp.sections.filter((s) => s.macro === macro);
        const totCur = secs.reduce((a, s) => a + s.current, 0);
        const totPri = secs.reduce((a, s) => a + s.prior, 0);
        return (
          <View key={macro} wrap={false}>
            <View style={pk.macroRow}>
              <Text style={pk.cLabel}>{title}</Text>
              <Text style={pk.cNum} />
              <Text style={pk.cNum} />
            </View>
            {secs.map((sec) => (
              <View key={sec.key}>
                {sec.macro !== 'pn' && (
                  <Text style={pk.subTitle}>
                    {sec.label.replace('Activo ', '').replace('Pasivo ', '')}
                  </Text>
                )}
                {sec.rubros.map((r) => (
                  <View key={r.group} style={pk.row}>
                    <Text style={pk.cLabelIndent}>{r.label}</Text>
                    <Text style={pk.cNum}>{fmtMoney(r.current)}</Text>
                    <Text style={pk.cNum}>
                      {esp.hasPrior ? fmtMoney(r.prior) : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={pk.totalRow}>
              <Text style={pk.cLabel}>Total {title.toLowerCase()}</Text>
              <Text style={pk.cNum}>{fmtMoney(totCur)}</Text>
              <Text style={pk.cNum}>
                {esp.hasPrior ? fmtMoney(totPri) : '—'}
              </Text>
            </View>
          </View>
        );
      })}
      <View style={pk.grandRow}>
        <Text style={pk.cLabel}>TOTAL PASIVO + PATRIMONIO NETO</Text>
        <Text style={pk.cNum}>{fmtMoney(esp.totals.pasivoMasPn.current)}</Text>
        <Text style={pk.cNum}>
          {esp.hasPrior ? fmtMoney(esp.totals.pasivoMasPn.prior) : '—'}
        </Text>
      </View>
      {esp.balancedCurrent ? (
        <Text style={pk.ok}>
          Activo = Pasivo + Patrimonio Neto ({fmtMoney(esp.totals.activo.current)})
        </Text>
      ) : (
        <Text style={pk.bad}>
          El Estado no cuadra: Activo {fmtMoney(esp.totals.activo.current)} ≠
          Pasivo + PN {fmtMoney(esp.totals.pasivoMasPn.current)}.
        </Text>
      )}
    </View>
  );
}

function ErBlock({ er }: { er: ErResult }) {
  const priorLabel = er.hasPrior
    ? `Ej. N°${er.priorFiscalYearNumber}`
    : 'Anterior';
  return (
    <View>
      <Text style={pk.sectionTitle}>Estado de Resultados</Text>
      <View style={pk.colHead}>
        <Text style={pk.cLabel}>Concepto</Text>
        <Text style={pk.cNum}>Ej. N°{er.fiscalYearNumber}</Text>
        <Text style={pk.cNum}>{priorLabel}</Text>
      </View>
      {er.lines.map((line: ErLine) => {
        const isSub = line.kind === 'subtotal';
        const isFinal = line.key === 'resultado_ejercicio';
        const style = isFinal ? pk.grandRow : isSub ? pk.totalRow : pk.row;
        return (
          <View key={line.key} style={style}>
            <Text style={isSub ? pk.cLabel : pk.cLabelIndent}>
              {line.label}
            </Text>
            <Text style={pk.cNum}>{fmtMoney(line.current)}</Text>
            <Text style={pk.cNum}>
              {er.hasPrior ? fmtMoney(line.prior) : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function AnexoIIBlock({ a2 }: { a2: AnexoIIResult }) {
  const priorLabel = a2.hasPrior
    ? `Ej. N°${a2.priorFiscalYearNumber}`
    : 'Anterior';
  return (
    <View>
      <Text style={pk.sectionTitle}>Anexo II · Gastos por función</Text>
      {a2.functions.length === 0 ? (
        <Text style={pk.empty}>Sin gastos registrados en el ejercicio.</Text>
      ) : (
        <>
          <View style={pk.colHead}>
            <Text style={pk.cLabel}>Función / cuenta</Text>
            <Text style={pk.cNum}>Ej. N°{a2.fiscalYearNumber}</Text>
            <Text style={pk.cNum}>{priorLabel}</Text>
          </View>
          {a2.functions.map((fn) => (
            <View key={fn.key} wrap={false}>
              <View style={pk.macroRow}>
                <Text style={pk.cLabel}>{fn.label}</Text>
                <Text style={pk.cNum}>{fmtMoney(fn.current)}</Text>
                <Text style={pk.cNum}>
                  {a2.hasPrior ? fmtMoney(fn.prior) : '—'}
                </Text>
              </View>
              {fn.accounts.map((a) => (
                <View key={a.accountId} style={pk.row}>
                  <Text style={pk.cLabelIndent}>
                    {a.code} {a.name}
                  </Text>
                  <Text style={pk.cNum}>{fmtMoney(a.current)}</Text>
                  <Text style={pk.cNum}>
                    {a2.hasPrior ? fmtMoney(a.prior) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))}
          <View style={pk.grandRow}>
            <Text style={pk.cLabel}>TOTAL GASTOS</Text>
            <Text style={pk.cNum}>{fmtMoney(a2.totalCurrent)}</Text>
            <Text style={pk.cNum}>
              {a2.hasPrior ? fmtMoney(a2.totalPrior) : '—'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function AnexoIBlock({
  anexoI,
}: {
  anexoI: EeccPackageData['anexoI'];
}) {
  return (
    <View>
      <Text style={pk.sectionTitle}>Anexo I · Bienes de uso</Text>
      {!anexoI || anexoI.categories.length === 0 ? (
        <Text style={pk.empty}>Sin bienes de uso registrados.</Text>
      ) : (
        <>
          <View style={ax6.th}>
            <Text style={ax6.cName}>Bien</Text>
            <Text style={ax6.cNum}>Valor origen</Text>
            <Text style={ax6.cNum}>Am.ac.inicio</Text>
            <Text style={ax6.cNum}>Am.ejercicio</Text>
            <Text style={ax6.cNum}>Am.ac.cierre</Text>
            <Text style={ax6.cNum}>V.resid.cierre</Text>
          </View>
          {anexoI.categories.map((cat) => (
            <View key={cat.category} wrap={false}>
              <Text style={ax6.cat}>{cat.category}</Text>
              {cat.assets.map((a) => (
                <View key={a.id} style={ax6.row}>
                  <Text style={ax6.cName}>{a.name}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.originalValue)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.accumStart)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.amortYear)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.accumEnd)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.residualEnd)}</Text>
                </View>
              ))}
              <View style={ax6.sub}>
                <Text style={ax6.cName}>Subtotal {cat.category}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.originalValue)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.accumStart)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.amortYear)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.accumEnd)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.residualEnd)}</Text>
              </View>
            </View>
          ))}
          <View style={ax6.total}>
            <Text style={ax6.cName}>TOTAL GENERAL</Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.originalValue)}
            </Text>
            <Text style={ax6.cNum}>{fmtMoney(anexoI.grandTotals.accumStart)}</Text>
            <Text style={ax6.cNum}>{fmtMoney(anexoI.grandTotals.amortYear)}</Text>
            <Text style={ax6.cNum}>{fmtMoney(anexoI.grandTotals.accumEnd)}</Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.residualEnd)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function NotesBlock({ notes }: { notes: FsNote[] }) {
  return (
    <View>
      <Text style={pk.sectionTitle}>Notas a los Estados Contables</Text>
      {notes.length === 0 ? (
        <Text style={pk.empty}>Sin notas cargadas.</Text>
      ) : (
        notes.map((note, idx) => (
          <View key={note.id} wrap={false}>
            <Text style={pk.noteTitle}>
              {idx + 1}. {note.title || `Nota ${idx + 1}`}
            </Text>
            {mdLines(note.content).map((l, i) =>
              l.type === 'h' ? (
                <Text key={i} style={pk.noteH}>
                  {l.text}
                </Text>
              ) : l.type === 'li' ? (
                <Text key={i} style={pk.noteLi}>
                  • {l.text}
                </Text>
              ) : (
                <Text key={i} style={pk.noteP}>
                  {l.text}
                </Text>
              )
            )}
          </View>
        ))
      )}
    </View>
  );
}

function Signatures() {
  return (
    <View style={pk.signWrap} wrap={false}>
      <Text style={pk.signBox}>Firma del representante legal</Text>
      <Text style={pk.signBox}>Firma del contador{'\n'}Sello profesional</Text>
      <Text style={pk.signBox}>Legalización C.P.C.E.</Text>
    </View>
  );
}

function EeccPackageDoc({ data }: { data: EeccPackageData }) {
  return (
    <Document>
      {/* Carátula */}
      <Page size="A4" style={pk.page}>
        <View style={pk.cover}>
          <Text style={pk.coverKicker}>ESTADOS CONTABLES</Text>
          <Text style={pk.coverEmpresa}>{data.empresaName}</Text>
          <Text style={pk.coverCuit}>CUIT {data.cuit}</Text>
          <Text style={pk.coverTitle}>
            Ejercicio Económico N°{data.fiscalYearNumber}
          </Text>
          <Text style={pk.coverMeta}>{data.periodLabel}</Text>
          <Text style={pk.coverDisc}>{EECC_DISCLAIMER}</Text>
          <Text style={pk.coverGen}>Generado el {data.generatedLabel}</Text>
        </View>
        <PageFooter data={data} />
      </Page>

      {/* Cuerpo */}
      <Page size="A4" style={pk.page} wrap>
        <EspBlock esp={data.esp} />
        <ErBlock er={data.er} />
        <AnexoIIBlock a2={data.anexoII} />
        <AnexoIBlock anexoI={data.anexoI} />
        <NotesBlock notes={data.notes} />
        <Signatures />
        <PageFooter data={data} />
      </Page>
    </Document>
  );
}

/** Genera el PDF del paquete EECC, lo descarga y devuelve el Blob (para persistir). */
export async function exportEeccPackagePdf(
  data: EeccPackageData
): Promise<Blob> {
  const blob = await pdf(<EeccPackageDoc data={data} />).toBlob();
  triggerDownload(
    blob,
    `eecc_${data.empresaName.replace(/\s+/g, '_')}_ej${data.fiscalYearNumber}.pdf`
  );
  return blob;
}

/* ── Libro Mayor (rubricable, una página por cuenta) — US 7.1.2 ── */

const lm = StyleSheet.create({
  page: {
    padding: 28,
    paddingBottom: 44,
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  empresa: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  meta: { fontSize: 8, color: '#555', marginTop: 1 },
  acct: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  th: {
    flexDirection: 'row',
    borderBottom: '1pt solid #999',
    paddingVertical: 3,
    fontFamily: 'Helvetica-Bold',
    marginTop: 6,
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
  cFecha: { width: '12%' },
  cNum: { width: '8%' },
  cDesc: { width: '42%' },
  cMoney: { width: '12.66%', textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
    borderTop: '0.5pt solid #e5e5e5',
    paddingTop: 4,
  },
});

function LibroMayorDoc({ data }: { data: MayorExportData }) {
  return (
    <Document>
      {data.sections.map((section) => (
        <Page key={section.code} size="A4" style={lm.page} wrap>
          <Text style={lm.empresa}>{data.empresaName}</Text>
          <Text style={lm.meta}>
            Libro Mayor · Ejercicio N°{data.fiscalYearNumber ?? ''} ·{' '}
            {fmtDate(data.from)} a {fmtDate(data.to)}
          </Text>
          <Text style={lm.acct}>
            {section.code} · {section.name}
          </Text>
          <View style={lm.th}>
            <Text style={lm.cFecha}>Fecha</Text>
            <Text style={lm.cNum}>Asiento</Text>
            <Text style={lm.cDesc}>Detalle</Text>
            <Text style={lm.cMoney}>Debe</Text>
            <Text style={lm.cMoney}>Haber</Text>
            <Text style={lm.cMoney}>Saldo</Text>
          </View>
          <View style={lm.row}>
            <Text style={lm.cFecha} />
            <Text style={lm.cNum} />
            <Text style={lm.cDesc}>Saldo inicial</Text>
            <Text style={lm.cMoney} />
            <Text style={lm.cMoney} />
            <Text style={lm.cMoney}>{saldoLabel(section.saldoInicial)}</Text>
          </View>
          {section.rows.map((r, i) => (
            <View key={i} style={lm.row}>
              <Text style={lm.cFecha}>{fmtDate(r.entryDate)}</Text>
              <Text style={lm.cNum}>{r.number}</Text>
              <Text style={lm.cDesc}>
                {r.description ?? r.lineDescription ?? ''}
              </Text>
              <Text style={lm.cMoney}>{r.debit ? fmtMoney(r.debit) : ''}</Text>
              <Text style={lm.cMoney}>{r.credit ? fmtMoney(r.credit) : ''}</Text>
              <Text style={lm.cMoney}>{saldoLabel(r.balance)}</Text>
            </View>
          ))}
          <View style={lm.totalRow}>
            <Text style={lm.cFecha} />
            <Text style={lm.cNum} />
            <Text style={lm.cDesc}>Totales del ejercicio</Text>
            <Text style={lm.cMoney}>{fmtMoney(section.totalDebit)}</Text>
            <Text style={lm.cMoney}>{fmtMoney(section.totalCredit)}</Text>
            <Text style={lm.cMoney}>{saldoLabel(section.saldoFinal)}</Text>
          </View>
          <View style={lm.footer} fixed>
            <Text>
              {data.empresaName} · Libro Mayor · Cuenta {section.code}
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `Página ${pageNumber} de ${totalPages}`
              }
            />
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function exportLibroMayorPdf(
  data: MayorExportData
): Promise<void> {
  const blob = await pdf(<LibroMayorDoc data={data} />).toBlob();
  triggerDownload(blob, `libro_mayor_ej${data.fiscalYearNumber ?? ''}.pdf`);
}

/* ── Libro Inventarios y Balances — US 7.1.3 ── */

export interface LibroInventariosData {
  empresaName: string;
  cuit: string;
  fiscalYearNumber: number;
  periodLabel: string;
  esp: EspResult;
  er: ErResult;
}

function InventarioBlock({ esp }: { esp: EspResult }) {
  return (
    <View>
      <Text style={pk.sectionTitle}>Inventario al cierre del ejercicio</Text>
      <View style={pk.colHead}>
        <Text style={pk.cLabel}>Cuenta</Text>
        <Text style={pk.cNum}>Saldo al cierre</Text>
        <Text style={pk.cNum} />
      </View>
      {(['activo', 'pasivo', 'pn'] as const).map((macro) => {
        const secs = esp.sections.filter((s) => s.macro === macro);
        const title =
          macro === 'activo'
            ? 'ACTIVO'
            : macro === 'pasivo'
              ? 'PASIVO'
              : 'PATRIMONIO NETO';
        if (secs.every((s) => s.rubros.length === 0)) return null;
        return (
          <View key={macro}>
            <View style={pk.macroRow}>
              <Text style={pk.cLabel}>{title}</Text>
              <Text style={pk.cNum} />
              <Text style={pk.cNum} />
            </View>
            {secs.map((sec) =>
              sec.rubros.map((r) => (
                <View key={r.group} wrap={false}>
                  <Text style={pk.subTitle}>{r.label}</Text>
                  {r.accounts.map((a) => (
                    <View key={a.accountId} style={pk.row}>
                      <Text style={pk.cLabelIndent}>
                        {a.code} {a.name}
                      </Text>
                      <Text style={pk.cNum}>{fmtMoney(a.current)}</Text>
                      <Text style={pk.cNum} />
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

function EepnBlock({ esp }: { esp: EspResult }) {
  const pn = esp.sections.find((s) => s.macro === 'pn');
  const rubros = pn?.rubros ?? [];
  return (
    <View wrap={false}>
      <Text style={pk.sectionTitle}>
        Estado de Evolución del Patrimonio Neto (simplificado)
      </Text>
      <View style={pk.colHead}>
        <Text style={pk.cLabel}>Componente</Text>
        <Text style={pk.cNum}>Ej. N°{esp.fiscalYearNumber}</Text>
        <Text style={pk.cNum} />
      </View>
      {rubros.map((r) => (
        <View key={r.group} style={pk.row}>
          <Text style={pk.cLabelIndent}>{r.label}</Text>
          <Text style={pk.cNum}>{fmtMoney(r.current)}</Text>
          <Text style={pk.cNum} />
        </View>
      ))}
      <View style={pk.grandRow}>
        <Text style={pk.cLabel}>TOTAL PATRIMONIO NETO</Text>
        <Text style={pk.cNum}>{fmtMoney(esp.totals.pn.current)}</Text>
        <Text style={pk.cNum} />
      </View>
    </View>
  );
}

function LibroInventariosDoc({ data }: { data: LibroInventariosData }) {
  const footerData = {
    empresaName: data.empresaName,
    fiscalYearNumber: data.fiscalYearNumber,
  };
  return (
    <Document>
      <Page size="A4" style={pk.page} wrap>
        <Text style={lm.empresa}>{data.empresaName}</Text>
        <Text style={lm.meta}>
          CUIT {data.cuit} · Libro Inventarios y Balances · Ejercicio N°
          {data.fiscalYearNumber} · {data.periodLabel}
        </Text>
        <Text style={[lm.meta, { fontStyle: 'italic', color: '#999' }] as never}>
          {EECC_DISCLAIMER}
        </Text>
        <InventarioBlock esp={data.esp} />
        <EspBlock esp={data.esp} />
        <ErBlock er={data.er} />
        <EepnBlock esp={data.esp} />
        <View style={pk.footer} fixed>
          <Text>
            {footerData.empresaName} · Libro Inventarios y Balances · Ejercicio
            N°{footerData.fiscalYearNumber}
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

export async function exportLibroInventariosPdf(
  data: LibroInventariosData
): Promise<void> {
  const blob = await pdf(<LibroInventariosDoc data={data} />).toBlob();
  triggerDownload(
    blob,
    `libro_inventarios_balances_ej${data.fiscalYearNumber}.pdf`
  );
}
