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
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { MONTH_NAMES, JOURNAL_ORIGIN_LABELS } from '@/lib/accounting-labels';
import type { NumberedNote } from '@/lib/accounting-document';
import {
  fillAuditReport,
  type AuditReportVars,
} from '@/lib/accounting-audit-report';
import type {
  EspResult,
  ErResult,
  ErLine,
  AnexoIIResult,
  AnexoICategory,
  FsNote,
  EepnResult,
  EfeResult,
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
  alignment?: {
    horizontal?: 'left' | 'right' | 'center';
    vertical?: string;
    wrapText?: boolean;
  };
  fill?: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } };
  border?: {
    top?: XLBorderLine;
    bottom?: XLBorderLine;
    left?: XLBorderLine;
    right?: XLBorderLine;
  };
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
  valorInicio: number;
  altas: number;
  bajas: number;
  valorCierre: number;
  accumStart: number;
  amortBajas: number;
  rate: number;
  amortYear: number;
  accumEnd: number;
  residualEnd: number;
  /** Neto al cierre del ejercicio anterior. Ausente si no hay comparativo. */
  priorResidualEnd?: number | null;
}
export interface AnexoIExportCategory {
  category: string;
  assets: AnexoIExportAsset[];
  totals: {
    valorInicio: number;
    altas: number;
    bajas: number;
    valorCierre: number;
    accumStart: number;
    amortBajas: number;
    amortYear: number;
    accumEnd: number;
    residualEnd: number;
    priorResidualEnd?: number | null;
  };
}
export interface AnexoIAccountantData {
  nombre: string;
  titulo: string;
  universidad: string;
  consejo: string;
  tomo: string;
  folio: string;
  firmaImagen: string | null;
}
export interface AnexoIMembrete {
  cuit: string;
  domicilio: string;
  actividadPrincipal: string;
  /** Fechas ya formateadas (dd/mm/aaaa) o ''. Constitución e inscripción son
   *  hechos distintos y la carátula y la Nota 1 piden los dos. */
  fechaConstitucion: string;
  fechaInscripcion: string;
  numeroInscripcion: string;
  /** Fecha inicio del ejercicio, formateada. */
  inicioLabel: string;
  /** Fecha cierre del ejercicio, formateada. */
  cierreLabel: string;
  accountant: AnexoIAccountantData | null;
}
export interface AnexoIExportData {
  empresaName: string;
  fiscalYearNumber: number;
  periodLabel: string;
  categories: AnexoIExportCategory[];
  grandTotals: AnexoIExportCategory['totals'];
  priorResidualEnd?: number | null;
  priorNumber?: number | null;
  /** Datos para el membrete formal. Opcional: si falta, se omite el bloque. */
  membrete?: AnexoIMembrete | null;
}

const ANEXO_HEADERS = [
  'Cuenta Principal',
  'Valor al inicio',
  'Altas del ejercicio',
  'Bajas del ejercicio',
  'Valor al cierre',
  'Amort. acum. inicio',
  'Amort. bajas ejercicio',
  'Amort. % ejercicio',
  'Amort. del ejercicio',
  'Amort. acum. cierre',
  'Neto al cierre',
];
/** Encabezados efectivos: con comparativo se suma la columna del anterior. */
function anexoIHeaders(priorNumber?: number | null): string[] {
  return priorNumber != null
    ? [...ANEXO_HEADERS, `Neto al cierre ej. N°${priorNumber}`]
    : ANEXO_HEADERS;
}

async function anexoIWorkbookBuffer(
  data: AnexoIExportData
): Promise<ArrayBuffer | Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Anexo Bienes de Uso', {
    views: [{ showGridLines: false }],
  });
  const m = data.membrete;
  const hasPrior = data.priorNumber != null;
  const HEADERS = anexoIHeaders(data.priorNumber);
  const NC = HEADERS.length;
  const RATE_COL = 8;
  const thin = { style: 'thin' as const, color: { argb: 'FF999999' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const greyFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: GREY },
  };
  const COL = (n: number) => String.fromCharCode(64 + n); // 1→A … 11→K
  const mergeRange = (row: number, c1: number, c2: number) =>
    ws.mergeCells(`${COL(c1)}${row}:${COL(c2)}${row}`);
  const mergeBlock = (r1: number, c1: number, r2: number, c2: number) =>
    ws.mergeCells(`${COL(c1)}${r1}:${COL(c2)}${r2}`);

  // ── Membrete ──
  const bannerRow = (text: string, font: XLCell['font']) => {
    const r = ws.addRow([text]);
    mergeRange(r.number, 1, NC);
    const cell = r.getCell(1);
    cell.font = font;
    cell.alignment = { horizontal: 'center' };
    return r;
  };
  const leftRow = (text: string) => {
    const r = ws.addRow([text]);
    mergeRange(r.number, 1, NC);
    r.getCell(1).font = { size: 10 };
    r.getCell(1).alignment = { horizontal: 'left' };
    return r;
  };

  bannerRow(data.empresaName, { bold: true, size: 14 });
  if (m?.domicilio) leftRow(m.domicilio);
  if (m?.actividadPrincipal)
    leftRow(`Actividad Principal: ${m.actividadPrincipal}`);
  if (m?.fechaConstitucion)
    leftRow(`Fecha de Constitución: ${m.fechaConstitucion}`);
  if (m?.fechaInscripcion)
    leftRow(
      `Fecha de Inscripción en el Registro Público de Comercio: ${m.fechaInscripcion}`
    );
  if (m?.numeroInscripcion)
    leftRow(
      `Número de Inscripción en la Inspección General de Justicia: ${m.numeroInscripcion}`
    );
  if (m?.cuit) leftRow(`CUIT: ${m.cuit}`);
  ws.addRow([]);
  bannerRow(
    m && (m.inicioLabel || m.cierreLabel)
      ? `EJERCICIO ECONÓMICO N°${data.fiscalYearNumber} INICIADO EL ${m.inicioLabel} FINALIZADO EL ${m.cierreLabel}`
      : `Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`,
    { bold: true, size: 11 }
  );
  ws.addRow([]);
  bannerRow('ANEXO DE BIENES DE USO', { bold: true, size: 12 });
  ws.addRow([]);

  // ── Encabezado de 3 niveles ──
  const hr1 = ws.addRow([]);
  const hr2 = ws.addRow([]);
  const hr3 = ws.addRow([]);
  const R1 = hr1.number;
  const R2 = hr2.number;
  const R3 = hr3.number;
  const headRows: Record<number, XLRow> = { [R1]: hr1, [R2]: hr2, [R3]: hr3 };
  const setHead = (row: number, col: number, value: string) => {
    headRows[row].getCell(col).value = value;
  };
  // Columnas simples (merge vertical R1:R3)
  const singles: [number, string][] = [
    [1, 'Cuenta Principal'],
    [2, 'Valor al inicio'],
    [3, 'Altas del ejercicio'],
    [4, 'Bajas del ejercicio'],
    [5, 'Valor al cierre'],
    [10, 'Neto acum. al cierre'],
    [11, 'Neto al cierre'],
    ...(hasPrior
      ? ([[12, `Neto al cierre ej. N°${data.priorNumber}`]] as [
          number,
          string,
        ][])
      : []),
  ];
  for (const [col, label] of singles) {
    mergeBlock(R1, col, R3, col);
    setHead(R1, col, label);
  }
  // AMORTIZACIONES (merge horizontal 6-9 en R1)
  mergeBlock(R1, 6, R1, 9);
  setHead(R1, 6, 'AMORTIZACIONES');
  // R2: Acum inicio (6) y Bajas (7) merge vertical R2:R3; Del ejercicio (8-9) horizontal
  mergeBlock(R2, 6, R3, 6);
  setHead(R2, 6, 'Acumuladas al inicio');
  mergeBlock(R2, 7, R3, 7);
  setHead(R2, 7, 'Bajas del ejercicio');
  mergeBlock(R2, 8, R2, 9);
  setHead(R2, 8, 'Del ejercicio');
  // R3: % y Monto
  setHead(R3, 8, '%');
  setHead(R3, 9, 'Monto');
  // Estilo de todas las celdas del encabezado
  for (const R of [R1, R2, R3]) {
    for (let c = 1; c <= NC; c++) {
      const cell = headRows[R].getCell(c);
      cell.font = { bold: true, size: 9 };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.fill = greyFill;
      cell.border = box;
    }
  }

  // ── Cuerpo ──
  const styleDataRow = (
    row: XLRow,
    opts?: { bold?: boolean; fill?: boolean }
  ) => {
    for (let c = 1; c <= NC; c++) {
      const cell = row.getCell(c);
      cell.border = box;
      if (opts?.bold) cell.font = { bold: true };
      if (opts?.fill) cell.fill = greyFill;
      if (c === 1) {
        cell.alignment = { horizontal: 'left' };
      } else {
        cell.alignment = { horizontal: 'right' };
        if (c !== RATE_COL) cell.numFmt = MONEY_FMT;
      }
    }
  };
  const totalsCells = (label: string, t: AnexoIExportCategory['totals']) => [
    label,
    t.valorInicio,
    t.altas,
    t.bajas,
    t.valorCierre,
    t.accumStart,
    t.amortBajas,
    '—',
    t.amortYear,
    t.accumEnd,
    t.residualEnd,
    ...(hasPrior ? [t.priorResidualEnd ?? 0] : []),
  ];

  for (const cat of data.categories) {
    // Banda de rubro
    const ch = ws.addRow([cat.category]);
    mergeRange(ch.number, 1, NC);
    ch.getCell(1).font = { bold: true };
    ch.getCell(1).fill = greyFill;
    for (let c = 1; c <= NC; c++) ch.getCell(c).border = box;

    for (const a of cat.assets) {
      const row = ws.addRow([
        a.name,
        a.valorInicio,
        a.altas,
        a.bajas,
        a.valorCierre,
        a.accumStart,
        a.amortBajas,
        a.rate ? `${a.rate}%` : '—',
        a.amortYear,
        a.accumEnd,
        a.residualEnd,
        ...(hasPrior ? [a.priorResidualEnd ?? 0] : []),
      ]);
      styleDataRow(row);
    }
    styleDataRow(
      ws.addRow(totalsCells(`Subtotal ${cat.category}`, cat.totals)),
      {
        bold: true,
      }
    );
  }

  styleDataRow(ws.addRow(totalsCells('TOTALES $', data.grandTotals)), {
    bold: true,
    fill: true,
  });

  ws.addRow([]);
  const note = ws.addRow([
    'Las Notas y Anexos forman parte integrante de este Estado.',
  ]);
  mergeRange(note.number, 1, NC);
  note.getCell(1).font = { bold: true, size: 9 };

  // ── Firma del contador ──
  const ac = m?.accountant;
  if (ac && (ac.nombre || ac.tomo || ac.consejo)) {
    ws.addRow([]);
    ws.addRow([]);
    const signLines = [
      ac.nombre,
      `${ac.titulo}${ac.universidad ? ` (${ac.universidad})` : ''}`,
      [
        ac.tomo ? `Tomo ${ac.tomo}` : '',
        ac.folio ? `Folio ${ac.folio}` : '',
        ac.consejo,
      ]
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean);
    for (const line of signLines) {
      const r = ws.addRow(['']);
      mergeRange(r.number, 8, NC);
      const cell = r.getCell(8);
      cell.value = line;
      cell.alignment = { horizontal: 'center' };
      cell.font = { size: 9 };
    }
  }

  [30, 14, 13, 13, 14, 14, 13, 8, 14, 14, 14].forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });

  return await wb.xlsx.writeBuffer();
}

export async function exportAnexoIExcel(data: AnexoIExportData): Promise<void> {
  const buffer = await anexoIWorkbookBuffer(data);
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `anexo_bienes_uso_${Date.now()}.xlsx`
  );
}

const AXB = '0.5pt solid #888';
// Anchos de columna como % de la tabla (suman 100).
/**
 * Anchos de las columnas del Anexo I, en dos juegos: con y sin la columna del
 * ejercicio anterior. Cada juego suma 100%, que es lo que espera react-pdf.
 */
export const AXW_BASE = {
  name: '16%',
  vInicio: '8%',
  altas: '7%',
  bajas: '7%',
  vCierre: '9%',
  acumInicio: '8%',
  amortBajas: '7%',
  rate: '7%',
  amortYear: '12%',
  acumCierre: '9%',
  neto: '10%',
  netoPrior: '0%',
};
export const AXW_PRIOR = {
  name: '13%',
  vInicio: '7%',
  altas: '7%',
  bajas: '7%',
  vCierre: '8%',
  acumInicio: '7%',
  amortBajas: '6%',
  rate: '5%',
  amortYear: '10%',
  acumCierre: '8%',
  neto: '11%',
  netoPrior: '11%',
};
const ax = StyleSheet.create({
  table: { borderTop: AXB, borderLeft: AXB, marginTop: 8, fontSize: 6.8 },
  // Encabezado (3 niveles)
  headRow: {
    flexDirection: 'row',
    backgroundColor: '#f2f2ef',
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.2,
  },
  hCell: {
    borderRight: AXB,
    borderBottom: AXB,
    paddingVertical: 2,
    paddingHorizontal: 2,
    justifyContent: 'center',
    textAlign: 'center',
  },
  hGroupTop: {
    borderRight: AXB,
    borderBottom: AXB,
    paddingVertical: 2,
    textAlign: 'center',
  },
  hBand: { flexDirection: 'row' },
  hCellB: {
    borderRight: AXB,
    borderBottom: AXB,
    paddingVertical: 2,
    paddingHorizontal: 2,
    justifyContent: 'center',
    textAlign: 'center',
  },
  // Cuerpo
  catRow: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e4',
    fontFamily: 'Helvetica-Bold',
  },
  catCell: {
    width: '100%',
    borderRight: AXB,
    borderBottom: AXB,
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  row: { flexDirection: 'row' },
  subRow: {
    flexDirection: 'row',
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#fafaf8',
  },
  totalRow: {
    flexDirection: 'row',
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#eeeee9',
  },
  cName: {
    borderRight: AXB,
    borderBottom: AXB,
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: 'left',
  },
  c: {
    borderRight: AXB,
    borderBottom: AXB,
    paddingVertical: 2,
    paddingHorizontal: 3,
    textAlign: 'right',
  },
  // Membrete
  mbEmpresa: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  mbLine: { fontSize: 8.5, marginTop: 1 },
  mbEjercicio: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 8,
  },
  mbTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 2,
  },
  prior: { marginTop: 8, fontSize: 8, color: '#555', fontStyle: 'italic' },
  note: { marginTop: 10, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  sign: {
    marginTop: 34,
    alignItems: 'center',
    alignSelf: 'flex-end',
    width: 200,
  },
  signImg: { width: 110, height: 44, objectFit: 'contain' },
  signLine: { width: 160, borderTop: '0.5pt solid #333', marginTop: 24 },
  signName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  signMeta: { fontSize: 8, color: '#333' },
});

function AnexoIDoc({ data }: { data: AnexoIExportData }) {
  const hasPrior = data.priorNumber != null;
  const AXW = hasPrior ? AXW_PRIOR : AXW_BASE;
  const t = data.grandTotals;
  const m = data.membrete;
  const num = (v: number) => fmtMoney(v);
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page} wrap>
        {/* ── Membrete ── */}
        <Text style={ax.mbEmpresa}>{data.empresaName}</Text>
        {m?.domicilio ? <Text style={ax.mbLine}>{m.domicilio}</Text> : null}
        {m?.actividadPrincipal ? (
          <Text style={ax.mbLine}>
            Actividad Principal: {m.actividadPrincipal}
          </Text>
        ) : null}
        {m?.fechaConstitucion ? (
          <Text style={ax.mbLine}>
            Fecha de Constitución: {m.fechaConstitucion}
          </Text>
        ) : null}
        {m?.fechaInscripcion ? (
          <Text style={ax.mbLine}>
            Fecha de Inscripción en el Registro Público de Comercio:{' '}
            {m.fechaInscripcion}
          </Text>
        ) : null}
        {m?.numeroInscripcion ? (
          <Text style={ax.mbLine}>
            Número de Inscripción en la Inspección General de Justicia:{' '}
            {m.numeroInscripcion}
          </Text>
        ) : null}
        {m?.cuit ? <Text style={ax.mbLine}>CUIT: {m.cuit}</Text> : null}

        {m && (m.inicioLabel || m.cierreLabel) ? (
          <Text style={ax.mbEjercicio}>
            EJERCICIO ECONÓMICO N°{data.fiscalYearNumber} INICIADO EL{' '}
            {m.inicioLabel} FINALIZADO EL {m.cierreLabel}
          </Text>
        ) : (
          <Text style={ax.mbEjercicio}>
            Ejercicio N°{data.fiscalYearNumber} · {data.periodLabel}
          </Text>
        )}
        <Text style={ax.mbTitle}>ANEXO DE BIENES DE USO</Text>

        {/* ── Tabla con grilla ── */}
        <View style={ax.table}>
          {/* Encabezado de 3 niveles */}
          <View style={ax.headRow}>
            <View style={[ax.hCell, { width: AXW.name }]}>
              <Text>Cuenta Principal</Text>
            </View>
            <View style={[ax.hCell, { width: AXW.vInicio }]}>
              <Text>Valor al inicio</Text>
            </View>
            <View style={[ax.hCell, { width: AXW.altas }]}>
              <Text>Altas del ejercicio</Text>
            </View>
            <View style={[ax.hCell, { width: AXW.bajas }]}>
              <Text>Bajas del ejercicio</Text>
            </View>
            <View style={[ax.hCell, { width: AXW.vCierre }]}>
              <Text>Valor al cierre</Text>
            </View>
            {/* Grupo AMORTIZACIONES (34%) */}
            <View style={{ width: '34%' }}>
              <View style={ax.hGroupTop}>
                <Text>AMORTIZACIONES</Text>
              </View>
              <View style={ax.hBand}>
                <View style={[ax.hCellB, { width: '23.53%' }]}>
                  <Text>Acum. al inicio</Text>
                </View>
                <View style={[ax.hCellB, { width: '20.59%' }]}>
                  <Text>Bajas</Text>
                </View>
                {/* Sub-grupo Del ejercicio (19% de tabla = 55.88% del grupo) */}
                <View style={{ width: '55.88%' }}>
                  <View style={ax.hGroupTop}>
                    <Text>Del ejercicio</Text>
                  </View>
                  <View style={ax.hBand}>
                    <View style={[ax.hCellB, { width: '36.84%' }]}>
                      <Text>%</Text>
                    </View>
                    <View style={[ax.hCellB, { width: '63.16%' }]}>
                      <Text>Monto</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
            <View style={[ax.hCell, { width: AXW.acumCierre }]}>
              <Text>Neto acum. al cierre</Text>
            </View>
            <View style={[ax.hCell, { width: AXW.neto }]}>
              <Text>Neto al cierre</Text>
            </View>
            {hasPrior && (
              <View style={[ax.hCell, { width: AXW.netoPrior }]}>
                <Text>Neto al cierre ej. N°{data.priorNumber}</Text>
              </View>
            )}
          </View>

          {/* Filas por rubro */}
          {data.categories.map((cat) => (
            <View key={cat.category} wrap={false}>
              <View style={ax.catRow}>
                <View style={ax.catCell}>
                  <Text>{cat.category}</Text>
                </View>
              </View>
              {cat.assets.map((a, i) => (
                <View key={i} style={ax.row}>
                  <Text style={[ax.cName, { width: AXW.name }]}>{a.name}</Text>
                  <Text style={[ax.c, { width: AXW.vInicio }]}>
                    {num(a.valorInicio)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.altas }]}>
                    {num(a.altas)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.bajas }]}>
                    {num(a.bajas)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.vCierre }]}>
                    {num(a.valorCierre)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.acumInicio }]}>
                    {num(a.accumStart)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.amortBajas }]}>
                    {num(a.amortBajas)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.rate }]}>
                    {a.rate ? `${a.rate}%` : '—'}
                  </Text>
                  <Text style={[ax.c, { width: AXW.amortYear }]}>
                    {num(a.amortYear)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.acumCierre }]}>
                    {num(a.accumEnd)}
                  </Text>
                  <Text style={[ax.c, { width: AXW.neto }]}>
                    {num(a.residualEnd)}
                  </Text>
                  {hasPrior && (
                    <Text style={[ax.c, { width: AXW.netoPrior }]}>
                      {num(a.priorResidualEnd ?? 0)}
                    </Text>
                  )}
                </View>
              ))}
              <View style={ax.subRow}>
                <Text style={[ax.cName, { width: AXW.name }]}>
                  Subtotal {cat.category}
                </Text>
                <Text style={[ax.c, { width: AXW.vInicio }]}>
                  {num(cat.totals.valorInicio)}
                </Text>
                <Text style={[ax.c, { width: AXW.altas }]}>
                  {num(cat.totals.altas)}
                </Text>
                <Text style={[ax.c, { width: AXW.bajas }]}>
                  {num(cat.totals.bajas)}
                </Text>
                <Text style={[ax.c, { width: AXW.vCierre }]}>
                  {num(cat.totals.valorCierre)}
                </Text>
                <Text style={[ax.c, { width: AXW.acumInicio }]}>
                  {num(cat.totals.accumStart)}
                </Text>
                <Text style={[ax.c, { width: AXW.amortBajas }]}>
                  {num(cat.totals.amortBajas)}
                </Text>
                <Text style={[ax.c, { width: AXW.rate }]}>—</Text>
                <Text style={[ax.c, { width: AXW.amortYear }]}>
                  {num(cat.totals.amortYear)}
                </Text>
                <Text style={[ax.c, { width: AXW.acumCierre }]}>
                  {num(cat.totals.accumEnd)}
                </Text>
                <Text style={[ax.c, { width: AXW.neto }]}>
                  {num(cat.totals.residualEnd)}
                </Text>
                {hasPrior && (
                  <Text style={[ax.c, { width: AXW.netoPrior }]}>
                    {num(cat.totals.priorResidualEnd ?? 0)}
                  </Text>
                )}
              </View>
            </View>
          ))}

          {/* TOTALES */}
          <View style={ax.totalRow}>
            <Text style={[ax.cName, { width: AXW.name }]}>TOTALES $</Text>
            <Text style={[ax.c, { width: AXW.vInicio }]}>
              {num(t.valorInicio)}
            </Text>
            <Text style={[ax.c, { width: AXW.altas }]}>{num(t.altas)}</Text>
            <Text style={[ax.c, { width: AXW.bajas }]}>{num(t.bajas)}</Text>
            <Text style={[ax.c, { width: AXW.vCierre }]}>
              {num(t.valorCierre)}
            </Text>
            <Text style={[ax.c, { width: AXW.acumInicio }]}>
              {num(t.accumStart)}
            </Text>
            <Text style={[ax.c, { width: AXW.amortBajas }]}>
              {num(t.amortBajas)}
            </Text>
            <Text style={[ax.c, { width: AXW.rate }]}>—</Text>
            <Text style={[ax.c, { width: AXW.amortYear }]}>
              {num(t.amortYear)}
            </Text>
            <Text style={[ax.c, { width: AXW.acumCierre }]}>
              {num(t.accumEnd)}
            </Text>
            <Text style={[ax.c, { width: AXW.neto }]}>
              {num(t.residualEnd)}
            </Text>
            {hasPrior && (
              <Text style={[ax.c, { width: AXW.netoPrior }]}>
                {num(data.priorResidualEnd ?? 0)}
              </Text>
            )}
          </View>
        </View>

        <Text style={ax.note}>
          Las Notas y Anexos forman parte integrante de este Estado.
        </Text>

        {/* ── Firma del contador ── */}
        {m?.accountant &&
          (m.accountant.nombre ||
            m.accountant.tomo ||
            m.accountant.firmaImagen) && (
            <View style={ax.sign}>
              {m.accountant.firmaImagen ? (
                <Image style={ax.signImg} src={m.accountant.firmaImagen} />
              ) : (
                <View style={ax.signLine} />
              )}
              {m.accountant.nombre ? (
                <Text style={ax.signName}>{m.accountant.nombre}</Text>
              ) : null}
              <Text style={ax.signMeta}>
                {m.accountant.titulo}
                {m.accountant.universidad
                  ? ` (${m.accountant.universidad})`
                  : ''}
              </Text>
              {m.accountant.tomo ||
              m.accountant.folio ||
              m.accountant.consejo ? (
                <Text style={ax.signMeta}>
                  {m.accountant.tomo ? `Tomo ${m.accountant.tomo} ` : ''}
                  {m.accountant.folio ? `Folio ${m.accountant.folio} ` : ''}
                  {m.accountant.consejo}
                </Text>
              ) : null}
            </View>
          )}
      </Page>
    </Document>
  );
}

export async function exportAnexoIPdf(data: AnexoIExportData): Promise<void> {
  const blob = await pdf(<AnexoIDoc data={data} />).toBlob();
  triggerDownload(blob, `anexo_i_bienes_uso_${Date.now()}.pdf`);
}

/* ═══════════════ Anexo Costo de Mercadería Vendida — standalone ═══════════════ */

const cmvx = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  anexoLbl: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  importe: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    marginTop: 18,
  },
  // Ítem de dos renglones (asterisco arriba, sub-línea con importe).
  block: { marginTop: 16 },
  star: { fontSize: 10 },
  subRow: { flexDirection: 'row', marginTop: 2 },
  subLabel: { flexGrow: 1, fontSize: 10, paddingLeft: 12 },
  // Ítem de un renglón.
  oneRow: { flexDirection: 'row', marginTop: 16 },
  oneLabel: { flexGrow: 1, fontSize: 10 },
  num: { width: '32%', textAlign: 'right', fontSize: 10 },
  // Total con línea arriba y doble subrayado abajo.
  totalRow: { flexDirection: 'row', marginTop: 26, alignItems: 'flex-start' },
  totalLabel: {
    flexGrow: 1,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    paddingTop: 4,
  },
  totalBox: { width: '32%' },
  totalNum: {
    textAlign: 'right',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 3,
    borderTop: '1pt solid #000',
  },
  dblLine1: { borderTop: '1pt solid #000' },
  dblLine2: { borderTop: '1pt solid #000', marginTop: 1.5 },
});

/** Bloque de membrete reutilizable (empresa + datos fiscales + ejercicio). */
function MembreteHeader({
  empresaName,
  fiscalYearNumber,
  periodLabel,
  m,
}: {
  empresaName: string;
  fiscalYearNumber: number;
  periodLabel: string;
  m?: AnexoIMembrete | null;
}) {
  return (
    <>
      <Text style={ax.mbEmpresa}>{empresaName}</Text>
      {m?.domicilio ? <Text style={ax.mbLine}>{m.domicilio}</Text> : null}
      {m?.actividadPrincipal ? (
        <Text style={ax.mbLine}>
          Actividad Principal: {m.actividadPrincipal}
        </Text>
      ) : null}
      {m?.fechaConstitucion ? (
        <Text style={ax.mbLine}>
          Fecha de Constitución: {m.fechaConstitucion}
        </Text>
      ) : null}
      {m?.fechaInscripcion ? (
        <Text style={ax.mbLine}>
          Fecha de Inscripción en el Registro Público de Comercio:{' '}
          {m.fechaInscripcion}
        </Text>
      ) : null}
      {m?.numeroInscripcion ? (
        <Text style={ax.mbLine}>
          Número de Inscripción en la Inspección General de Justicia:{' '}
          {m.numeroInscripcion}
        </Text>
      ) : null}
      {m?.cuit ? <Text style={ax.mbLine}>CUIT: {m.cuit}</Text> : null}
      {m && (m.inicioLabel || m.cierreLabel) ? (
        <Text style={ax.mbEjercicio}>
          EJERCICIO ECONÓMICO N°{fiscalYearNumber} INICIADO EL {m.inicioLabel}{' '}
          FINALIZADO EL {m.cierreLabel}
        </Text>
      ) : (
        <Text style={ax.mbEjercicio}>
          Ejercicio N°{fiscalYearNumber} · {periodLabel}
        </Text>
      )}
    </>
  );
}

/** Bloque de firma del contador reutilizable. */
function SignatureBlock({
  ac,
}: {
  ac: AnexoIAccountantData | null | undefined;
}) {
  if (!ac || !(ac.nombre || ac.tomo || ac.firmaImagen)) return null;
  return (
    <View style={ax.sign}>
      {ac.firmaImagen ? (
        <Image style={ax.signImg} src={ac.firmaImagen} />
      ) : (
        <View style={ax.signLine} />
      )}
      {ac.nombre ? <Text style={ax.signName}>{ac.nombre}</Text> : null}
      <Text style={ax.signMeta}>
        {ac.titulo}
        {ac.universidad ? ` (${ac.universidad})` : ''}
      </Text>
      {ac.tomo || ac.folio || ac.consejo ? (
        <Text style={ax.signMeta}>
          {ac.tomo ? `Tomo ${ac.tomo} ` : ''}
          {ac.folio ? `Folio ${ac.folio} ` : ''}
          {ac.consejo}
        </Text>
      ) : null}
    </View>
  );
}

function AnexoCMVDoc({ data }: { data: CmvExportData }) {
  const m = data.membrete;
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <MembreteHeader
          empresaName={data.empresaName}
          fiscalYearNumber={data.fiscalYearNumber}
          periodLabel={data.periodLabel}
          m={m}
        />
        <View style={cmvx.headerRow}>
          <Text style={cmvx.title}>COSTO DE LA MERCADERÍA VENDIDA</Text>
          <Text style={cmvx.anexoLbl}>{data.anexoLabel || 'ANEXO'}</Text>
        </View>
        <Text style={cmvx.importe}>IMPORTE $</Text>

        {/* Existencia al inicio (dos renglones) */}
        <View style={cmvx.block}>
          <Text style={cmvx.star}>* EXISTENCIA DE MERCADERÍAS</Text>
          <View style={cmvx.subRow}>
            <Text style={cmvx.subLabel}>AL INICIO DEL EJERCICIO</Text>
            <Text style={cmvx.num}>{fmtMoney(data.existenciaInicial)}</Text>
          </View>
        </View>

        {/* Compras/gastos (un renglón) */}
        <View style={cmvx.oneRow}>
          <Text style={cmvx.oneLabel}>* COMPRAS/GASTOS DEL EJERCICIO</Text>
          <Text style={cmvx.num}>{fmtMoney(data.comprasGastos)}</Text>
        </View>

        {/* Existencia al cierre (dos renglones) */}
        <View style={cmvx.block}>
          <Text style={cmvx.star}>* EXISTENCIA DE MERCADERÍAS</Text>
          <View style={cmvx.subRow}>
            <Text style={cmvx.subLabel}>AL CIERRE DEL EJERCICIO</Text>
            <Text style={cmvx.num}>{fmtMoney(data.existenciaFinal)}</Text>
          </View>
        </View>

        {/* Total con línea arriba y doble subrayado abajo */}
        <View style={cmvx.totalRow}>
          <Text style={cmvx.totalLabel}>TOTAL COSTO DE VENTAS</Text>
          <View style={cmvx.totalBox}>
            <Text style={cmvx.totalNum}>{fmtMoney(data.total)}</Text>
            <View style={cmvx.dblLine1} />
            <View style={cmvx.dblLine2} />
          </View>
        </View>

        {data.priorTotal != null && (
          <Text style={ax.prior}>
            Total · Ejercicio anterior (N°{data.priorNumber}):{' '}
            {fmtMoney(data.priorTotal)}
          </Text>
        )}
        <View style={{ marginTop: 20 }}>
          <Text style={ax.note}>
            Las Notas y Anexos forman parte integrante de este Estado.
          </Text>
          <Text style={[ax.note, { marginTop: 2 }] as never}>
            El informe del auditor se extiende en documento aparte.
          </Text>
        </View>
        <SignatureBlock ac={m?.accountant} />
      </Page>
    </Document>
  );
}

export async function exportCmvPdf(data: CmvExportData): Promise<void> {
  const blob = await pdf(<AnexoCMVDoc data={data} />).toBlob();
  triggerDownload(blob, `anexo_cmv_${Date.now()}.pdf`);
}

export async function exportCmvExcel(data: CmvExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CMV', { views: [{ showGridLines: false }] });
  const m = data.membrete;
  const merge = (row: number) => ws.mergeCells(`A${row}:B${row}`);
  const banner = (text: string, font: XLCell['font'], center = true) => {
    const r = ws.addRow([text]);
    merge(r.number);
    r.getCell(1).font = font;
    r.getCell(1).alignment = { horizontal: center ? 'center' : 'left' };
  };
  banner(data.empresaName, { bold: true, size: 14 });
  if (m?.domicilio) banner(m.domicilio, { size: 10 }, false);
  if (m?.actividadPrincipal)
    banner(`Actividad Principal: ${m.actividadPrincipal}`, { size: 10 }, false);
  if (m?.fechaConstitucion)
    banner(
      `Fecha de Constitución: ${m.fechaConstitucion}`,
      { size: 10 },
      false
    );
  if (m?.fechaInscripcion)
    banner(
      `Fecha de Inscripción en el Registro Público de Comercio: ${m.fechaInscripcion}`,
      { size: 10 },
      false
    );
  if (m?.numeroInscripcion)
    banner(
      `Número de Inscripción en la Inspección General de Justicia: ${m.numeroInscripcion}`,
      { size: 10 },
      false
    );
  if (m?.cuit) banner(`CUIT: ${m.cuit}`, { size: 10 }, false);
  ws.addRow([]);
  banner(
    m && (m.inicioLabel || m.cierreLabel)
      ? `EJERCICIO ECONÓMICO N°${data.fiscalYearNumber} INICIADO EL ${m.inicioLabel} FINALIZADO EL ${m.cierreLabel}`
      : `Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`,
    { bold: true, size: 11 }
  );
  ws.addRow([]);
  banner('COSTO DE LA MERCADERÍA VENDIDA', { bold: true, size: 12 }, false);

  const imp = ws.addRow(['', 'IMPORTE $']);
  imp.getCell(2).font = { bold: true };
  imp.getCell(2).alignment = { horizontal: 'right' };

  const line = (label: string, value: number, bold = false) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold, size: 11 };
    r.getCell(2).numFmt = MONEY_FMT;
    r.getCell(2).alignment = { horizontal: 'right' };
    if (bold) {
      r.getCell(2).font = { bold: true };
      r.getCell(2).border = {
        top: { style: 'thin', color: { argb: 'FF333333' } },
      };
      r.getCell(1).border = {
        top: { style: 'thin', color: { argb: 'FF333333' } },
      };
    }
    return r;
  };
  line(
    'Existencia de mercaderías al inicio del ejercicio',
    data.existenciaInicial
  );
  line('Compras / gastos del ejercicio', data.comprasGastos);
  line(
    'Existencia de mercaderías al cierre del ejercicio',
    data.existenciaFinal
  );
  line('TOTAL COSTO DE VENTAS', data.total, true);

  if (data.priorTotal != null) {
    const pr = ws.addRow([
      `Total · Ejercicio anterior (N°${data.priorNumber})`,
      data.priorTotal,
    ]);
    pr.getCell(1).font = { italic: true, color: { argb: 'FF555555' } };
    pr.getCell(2).numFmt = MONEY_FMT;
    pr.getCell(2).alignment = { horizontal: 'right' };
  }
  ws.addRow([]);
  banner(
    'Las Notas y Anexos forman parte integrante de este Estado.',
    {
      bold: true,
      size: 9,
    },
    false
  );

  const ac = m?.accountant;
  if (ac && (ac.nombre || ac.tomo || ac.consejo)) {
    ws.addRow([]);
    ws.addRow([]);
    for (const l of [
      ac.nombre,
      `${ac.titulo}${ac.universidad ? ` (${ac.universidad})` : ''}`,
      [
        ac.tomo ? `Tomo ${ac.tomo}` : '',
        ac.folio ? `Folio ${ac.folio}` : '',
        ac.consejo,
      ]
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean)) {
      banner(l, { size: 9 });
    }
  }

  [58, 22].forEach((w, i) => {
    if (ws.columns[i]) ws.columns[i].width = w;
  });

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `anexo_cmv_${Date.now()}.xlsx`
  );
}

/* ═══════════════ Paquete EECC + Libros legales — PDF (Fase 7) ═══════════════ */

/**
 * La norma que se cita depende de la empresa: un ente pequeño aplica RT 54 y
 * el resto RT 6. El mecanismo del ajuste es el mismo en las dos.
 */
const disclaimerFor = (
  valuation: 'ajustado' | 'historico' | undefined,
  norma = 'RT 54'
) =>
  valuation === 'historico'
    ? `Estados Contables expresados en valores históricos, sin ajuste por inflación (${norma}).`
    : `Estados Contables expresados en moneda homogénea de cierre, con ajuste por inflación (${norma}).`;

export interface EeccPackageData {
  empresaName: string;
  cuit: string;
  fiscalYearNumber: number;
  periodLabel: string;
  generatedLabel: string;
  esp: EspResult;
  er: ErResult;
  eepn: EepnResult | null;
  efe: EfeResult | null;
  /** Con qué valuación se generaron los estados. Define el disclaimer. */
  valuation?: 'ajustado' | 'historico';
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma?: string;
  /** Firma del contador: la misma que ya usa el Anexo I. */
  accountant?: AnexoIAccountantData | null;
  anexoI: {
    categories: AnexoICategory[];
    grandTotals: AnexoICategory['totals'];
    /** Neto al cierre del ejercicio anterior, por bien y por rubro. */
    prior: {
      number: number;
      grandTotals: AnexoICategory['totals'];
      residualByAsset: Record<string, number>;
      residualByCategory: Record<string, number>;
    } | null;
  } | null;
  anexoII: AnexoIIResult;
  cmv: CmvBlockData | null;
  notes: FsNote[];
  /**
   * Secuencia de notas ya numerada, incluida la composición de rubros. Define
   * el número de cada una y en qué posición cae el bloque del sistema.
   */
  noteSequence?: NumberedNote[];
  /**
   * Referencia de cada rubro a su nota o su anexo, por clave de rubro:
   * { caja_bancos: 'Nota 3.1', bienes_uso: 's/Anexo I' }.
   */
  references?: Record<string, string>;
  /** Fecha del informe del auditor, para la leyenda al pie de cada estado. */
  auditoriaFecha?: string | null;
  /** Informe del auditor ya rellenado, si se cargó. */
  auditReport?: { body: string; lugar: string; fecha: string } | null;
  /**
   * Orden de las secciones. Cada entrada es una clave de sección o `note:<id>`.
   * Sin esto se usa el orden clásico.
   */
  sections?: string[];
  /** Datos del membrete para la carátula del PDF. */
  domicilio?: string;
  actividadPrincipal?: string;
  fechaConstitucion?: string | null;
  fechaInscripcion?: string | null;
  numeroInscripcion?: string;
  /** Variables para reemplazar `{{empresa}}` etc. en el contenido de las notas. */
  noteVars?: Partial<AuditReportVars>;
}

/** Valores del Anexo CMV para el bloque embebido en el paquete EECC. */
export interface CmvBlockData {
  existenciaInicial: number;
  comprasGastos: number;
  existenciaFinal: number;
  total: number;
}

/** Datos para el export standalone del Anexo CMV (PDF/Excel). */
export interface CmvExportData {
  empresaName: string;
  fiscalYearNumber: number;
  periodLabel: string;
  existenciaInicial: number;
  comprasGastos: number;
  existenciaFinal: number;
  total: number;
  priorTotal?: number | null;
  priorNumber?: number | null;
  /** Etiqueta a la derecha del título (ej. "ANEXO I"). Default "ANEXO". */
  anexoLabel?: string;
  membrete?: AnexoIMembrete | null;
}

const pk = StyleSheet.create({
  page: {
    padding: 34,
    paddingBottom: 50,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  // Arriba y no centrada verticalmente (TIN-1439). El centrado horizontal se
  // mantiene: es lo habitual en una carátula y el ticket solo objeta que el
  // contenido «flote» en el medio de la hoja.
  cover: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 48,
  },
  coverKicker: {
    fontSize: 9,
    color: '#888',
    letterSpacing: 2,
    marginBottom: 8,
  },
  coverEmpresa: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
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
  bad: {
    fontSize: 8,
    color: '#b00020',
    marginTop: 6,
    fontFamily: 'Helvetica-Bold',
  },
  noteTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  noteP: { fontSize: 9, marginTop: 2.5, lineHeight: 1.35, color: '#222' },
  noteLi: {
    fontSize: 9,
    marginTop: 1.5,
    marginLeft: 10,
    lineHeight: 1.3,
    color: '#222',
  },
  noteH: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 5 },
  empty: { fontSize: 8.5, color: '#999', fontStyle: 'italic', marginTop: 4 },
  integracion: {
    fontSize: 7.5,
    fontStyle: 'italic',
    color: '#444',
    marginTop: 10,
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
  cName: { width: '18%' },
  cNum: { width: '8.2%', textAlign: 'right' },
  cat: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 5 },
});

function PageFooter({
  data,
}: {
  data: { empresaName: string; fiscalYearNumber: number };
}) {
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

function EspBlock({
  esp,
  references = {},
}: {
  esp: EspResult;
  references?: Record<string, string>;
}) {
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
                    <Text style={pk.cLabelIndent}>
                      {r.label}
                      {references[r.group] ? ` (${references[r.group]})` : ''}
                    </Text>
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
          Activo = Pasivo + Patrimonio Neto (
          {fmtMoney(esp.totals.activo.current)})
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

function ErBlock({
  er,
  references = {},
}: {
  er: ErResult;
  references?: Record<string, string>;
}) {
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
              {references[line.key] ? ` (${references[line.key]})` : ''}
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

/**
 * Estado de Evolución del Patrimonio Neto. Una columna por cuenta de PN más el
 * total; el comparativo del ejercicio anterior va solo en la fila de cierre,
 * que es como lo expone el modelo RT 9.
 */
function EepnBlock({ eepn }: { eepn: EepnResult | null }) {
  if (!eepn || eepn.columns.length === 0) return null;
  /**
   * Los anchos se reparten para sumar 100: react-pdf no recorta el excedente,
   * encima las columnas unas sobre otras y no da ningún error. El concepto y
   * los dos totales se llevan lo fijo y el resto se divide entre las cuentas.
   */
  const totalCols = eepn.priorFiscalYearNumber !== null ? 2 : 1;
  const LABEL = 22;
  const TOTAL = 13;
  const libre = 100 - LABEL - TOTAL * totalCols;
  const colWidth = `${libre / eepn.columns.length}%`;
  const labelStyle = { width: `${LABEL}%` };
  const totalStyle = {
    width: `${TOTAL}%`,
    textAlign: 'right' as const,
    paddingLeft: 3,
  };
  const colStyle = {
    width: colWidth,
    textAlign: 'right' as const,
    paddingLeft: 3,
  };
  return (
    <View>
      <Text style={pk.sectionTitle}>
        Estado de Evolución del Patrimonio Neto
      </Text>
      <View style={pk.colHead}>
        <Text style={labelStyle}>Concepto</Text>
        {eepn.columns.map((c) => (
          <Text key={c.accountId} style={colStyle}>
            {c.isSubtotal ? `Total ${c.groupLabel}` : c.name}
          </Text>
        ))}
        <Text style={totalStyle}>Ej. N°{eepn.fiscalYearNumber}</Text>
        {eepn.priorFiscalYearNumber !== null && (
          <Text style={totalStyle}>Ej. N°{eepn.priorFiscalYearNumber}</Text>
        )}
      </View>
      {eepn.rows.map((r) => {
        const strong = r.kind === 'inicio' || r.kind === 'cierre';
        return (
          <View key={r.key} style={strong ? pk.totalRow : pk.row}>
            <Text style={[labelStyle, strong ? {} : { paddingLeft: 6 }]}>
              {r.label}
            </Text>
            {eepn.columns.map((c) => (
              <Text key={c.accountId} style={colStyle}>
                {r.amounts[c.accountId]
                  ? fmtMoney(r.amounts[c.accountId])
                  : '—'}
              </Text>
            ))}
            <Text style={totalStyle}>{fmtMoney(r.total)}</Text>
            {eepn.priorFiscalYearNumber !== null && (
              <Text style={totalStyle}>
                {eepn.prior
                  ? fmtMoney(
                      r.kind === 'inicio'
                        ? eepn.prior.inicio
                        : r.kind === 'resultado'
                          ? eepn.prior.resultado
                          : r.kind === 'cierre'
                            ? eepn.prior.cierre
                            : 0
                    )
                  : '—'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Estado de Flujo de Efectivo, método directo, comparativo. */
function EfeBlock({ efe }: { efe: EfeResult | null }) {
  if (!efe) return null;
  const priorLabel =
    efe.priorFiscalYearNumber !== null
      ? `Ej. N°${efe.priorFiscalYearNumber}`
      : 'Anterior';
  const row = (
    label: string,
    v: { current: number; prior: number },
    style: Record<string, unknown> = pk.row,
    indent = true
  ) => (
    <View style={style as never} key={label}>
      <Text style={indent ? pk.cLabelIndent : pk.cLabel}>{label}</Text>
      <Text style={pk.cNum}>{fmtMoney(v.current)}</Text>
      <Text style={pk.cNum}>{efe.hasPrior ? fmtMoney(v.prior) : '—'}</Text>
    </View>
  );
  return (
    <View>
      <Text style={pk.sectionTitle}>
        Estado de Flujo de Efectivo y sus Equivalentes — Método directo, forma
        completa
      </Text>
      <View style={pk.colHead}>
        <Text style={pk.cLabel}>Concepto</Text>
        <Text style={pk.cNum}>Ej. N°{efe.fiscalYearNumber}</Text>
        <Text style={pk.cNum}>{priorLabel}</Text>
      </View>
      {row(
        'Efectivo y equivalentes al inicio del ejercicio',
        efe.efectivoInicio
      )}
      {row(
        'Efectivo y equivalentes al cierre del ejercicio',
        efe.efectivoCierre
      )}
      {row(
        'Aumento (disminución) neto del efectivo',
        efe.variacion,
        pk.totalRow,
        false
      )}

      <Text style={pk.subTitle}>Causas de las variaciones del efectivo</Text>
      {efe.activities.map((a) => (
        <View key={a.key}>
          <Text style={pk.subTitle}>{a.label}</Text>
          {a.lines.map((l) => row(l.name, l))}
          {row(`Flujo neto de ${a.label.toLowerCase()}`, a, pk.totalRow, false)}
        </View>
      ))}
      {row(
        'Total de las variaciones del efectivo',
        efe.totalCausas,
        pk.grandRow,
        false
      )}
    </View>
  );
}

/**
 * Nota 3 — Composición de los principales rubros. Sale del mismo detalle por
 * cuenta del ESP, así que no puede diferir de él.
 */
function Nota3Block({
  esp,
  numero,
}: {
  esp: EspResult;
  /** Número que le tocó en la secuencia; null si no se numera. */
  numero: number | null;
}) {
  const rubros = esp.sections
    .flatMap((sec) => sec.rubros)
    .filter((r) => r.group !== 'resultado_ejercicio')
    .filter((r) => Math.abs(r.current) >= 0.005 || Math.abs(r.prior) >= 0.005);
  if (rubros.length === 0) return null;
  const priorLabel = esp.hasPrior
    ? `Ej. N°${esp.priorFiscalYearNumber}`
    : 'Anterior';
  return (
    <View>
      <Text style={pk.sectionTitle}>
        {numero != null ? `Nota ${numero} — ` : ''}Composición de los
        principales rubros
      </Text>
      <View style={pk.colHead}>
        <Text style={pk.cLabel}>Concepto</Text>
        <Text style={pk.cNum}>Ej. N°{esp.fiscalYearNumber}</Text>
        <Text style={pk.cNum}>{priorLabel}</Text>
      </View>
      {rubros.map((r, i) => (
        <View key={r.group}>
          <Text style={pk.subTitle}>
            {numero ?? 3}.{i + 1} — {r.label}
          </Text>
          {r.accounts.map((a) => (
            <View key={a.accountId} style={pk.row}>
              <Text style={pk.cLabelIndent}>{a.name}</Text>
              <Text style={pk.cNum}>{fmtMoney(a.current)}</Text>
              <Text style={pk.cNum}>
                {esp.hasPrior ? fmtMoney(a.prior) : '—'}
              </Text>
            </View>
          ))}
          <View style={pk.totalRow}>
            <Text style={pk.cLabel} />
            <Text style={pk.cNum}>{fmtMoney(r.current)}</Text>
            <Text style={pk.cNum}>
              {esp.hasPrior ? fmtMoney(r.prior) : '—'}
            </Text>
          </View>
        </View>
      ))}
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

function AnexoCMVBlock({ cmv }: { cmv: CmvBlockData | null }) {
  return (
    <View>
      <Text style={pk.sectionTitle}>Costo de la mercadería vendida</Text>
      {!cmv ? (
        <Text style={pk.empty}>Sin datos cargados para el ejercicio.</Text>
      ) : (
        <>
          <View style={pk.colHead}>
            <Text style={{ flexGrow: 1 }} />
            <Text style={pk.cNum}>Importe $</Text>
          </View>
          <View style={pk.row}>
            <Text style={{ flexGrow: 1 }}>
              Existencia de mercaderías al inicio del ejercicio
            </Text>
            <Text style={pk.cNum}>{fmtMoney(cmv.existenciaInicial)}</Text>
          </View>
          <View style={pk.row}>
            <Text style={{ flexGrow: 1 }}>Compras / gastos del ejercicio</Text>
            <Text style={pk.cNum}>{fmtMoney(cmv.comprasGastos)}</Text>
          </View>
          <View style={pk.row}>
            <Text style={{ flexGrow: 1 }}>
              Existencia de mercaderías al cierre del ejercicio
            </Text>
            <Text style={pk.cNum}>{fmtMoney(cmv.existenciaFinal)}</Text>
          </View>
          <View style={pk.grandRow}>
            <Text style={{ flexGrow: 1, fontFamily: 'Helvetica-Bold' }}>
              TOTAL COSTO DE VENTAS
            </Text>
            <Text style={pk.cNum}>{fmtMoney(cmv.total)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function AnexoIBlock({ anexoI }: { anexoI: EeccPackageData['anexoI'] }) {
  const prior = anexoI?.prior ?? null;
  return (
    <View>
      <Text style={pk.sectionTitle}>Anexo I · Bienes de uso</Text>
      {!anexoI || anexoI.categories.length === 0 ? (
        <Text style={pk.empty}>Sin bienes de uso registrados.</Text>
      ) : (
        <>
          <View style={ax6.th}>
            <Text style={ax6.cName}>Cuenta Principal</Text>
            <Text style={ax6.cNum}>V.inicio</Text>
            <Text style={ax6.cNum}>Altas</Text>
            <Text style={ax6.cNum}>Bajas</Text>
            <Text style={ax6.cNum}>V.cierre</Text>
            <Text style={ax6.cNum}>Am.ac.ini</Text>
            <Text style={ax6.cNum}>Am.bajas</Text>
            <Text style={ax6.cNum}>%</Text>
            <Text style={ax6.cNum}>Am.ejerc</Text>
            <Text style={ax6.cNum}>Am.ac.cie</Text>
            <Text style={ax6.cNum}>Neto cierre</Text>
            {prior && <Text style={ax6.cNum}>Neto ej. N°{prior.number}</Text>}
          </View>
          {anexoI.categories.map((cat) => (
            <View key={cat.category} wrap={false}>
              <Text style={ax6.cat}>{cat.category}</Text>
              {cat.assets.map((a) => (
                <View key={a.id} style={ax6.row}>
                  <Text style={ax6.cName}>{a.name}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.valorInicio)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.altas)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.bajas)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.valorCierre)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.accumStart)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.amortBajas)}</Text>
                  <Text style={ax6.cNum}>{a.rate ? `${a.rate}%` : '—'}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.amortYear)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.accumEnd)}</Text>
                  <Text style={ax6.cNum}>{fmtMoney(a.residualEnd)}</Text>
                  {prior && (
                    <Text style={ax6.cNum}>
                      {fmtMoney(prior.residualByAsset[a.id] ?? 0)}
                    </Text>
                  )}
                </View>
              ))}
              <View style={ax6.sub}>
                <Text style={ax6.cName}>Subtotal {cat.category}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.valorInicio)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.altas)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.bajas)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.valorCierre)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.accumStart)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.amortBajas)}</Text>
                <Text style={ax6.cNum}>—</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.amortYear)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.accumEnd)}</Text>
                <Text style={ax6.cNum}>{fmtMoney(cat.totals.residualEnd)}</Text>
                {prior && (
                  <Text style={ax6.cNum}>
                    {fmtMoney(prior.residualByCategory[cat.category] ?? 0)}
                  </Text>
                )}
              </View>
            </View>
          ))}
          <View style={ax6.total}>
            <Text style={ax6.cName}>TOTAL GENERAL</Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.valorInicio)}
            </Text>
            <Text style={ax6.cNum}>{fmtMoney(anexoI.grandTotals.altas)}</Text>
            <Text style={ax6.cNum}>{fmtMoney(anexoI.grandTotals.bajas)}</Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.valorCierre)}
            </Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.accumStart)}
            </Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.amortBajas)}
            </Text>
            <Text style={ax6.cNum}>—</Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.amortYear)}
            </Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.accumEnd)}
            </Text>
            <Text style={ax6.cNum}>
              {fmtMoney(anexoI.grandTotals.residualEnd)}
            </Text>
            {prior && (
              <Text style={ax6.cNum}>
                {fmtMoney(prior.grandTotals.residualEnd)}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function NotesBlock({
  notes,
  sequence,
  soloUna = false,
  vars = {},
}: {
  notes: FsNote[];
  /** Números resueltos por posición. Sin esto se numeran por orden de carga. */
  sequence?: NumberedNote[];
  /** Intercalada entre estados: se imprime sin el título del bloque. */
  soloUna?: boolean;
  /** Variables para reemplazar `{{empresa}}` etc. en el contenido de cada nota. */
  vars?: Partial<AuditReportVars>;
}) {
  // La composición de rubros se imprime en su propio bloque: acá solo van las
  // notas de texto, pero con el número que les tocó en la secuencia completa.
  const numeroDe = (id: string) =>
    sequence?.find((n) => n.entry === `note:${id}`)?.number ?? null;
  const ordenadas = sequence
    ? sequence
        .filter((n) => !n.isSystem)
        .map((n) => notes.find((x) => `note:${x.id}` === n.entry))
        .filter((n): n is FsNote => !!n)
    : notes;
  return (
    <View>
      {!soloUna && (
        <Text style={pk.sectionTitle}>Notas a los Estados Contables</Text>
      )}
      {ordenadas.length === 0 ? (
        <Text style={pk.empty}>Sin notas cargadas.</Text>
      ) : (
        ordenadas.map((note, idx) => (
          <View key={note.id}>
            <Text style={pk.noteTitle}>
              {numeroDe(note.id) ?? idx + 1}.{' '}
              {note.title || `Nota ${numeroDe(note.id) ?? idx + 1}`}
            </Text>
            {mdLines(fillAuditReport(note.content, vars)).map((l, i) =>
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

/**
 * Cierre de cada estado: la leyenda de integración y el espacio de firma.
 *
 * En el balance del estudio esto va al pie de **cada** estado y de cada anexo,
 * no una sola vez al final del cuerpo. Cada hoja tiene que poder circular sola
 * y decir que las notas y anexos forman parte de ella.
 */
function EstadoFooter({
  auditoriaFecha,
  accountant,
}: {
  auditoriaFecha?: string | null;
  accountant?: AnexoIAccountantData | null;
}) {
  return (
    <View wrap={false}>
      <Text style={pk.integracion}>
        Las Notas y Anexos que se acompañan forman parte integrante de este
        Estado.
      </Text>
      {auditoriaFecha && (
        <Text style={pk.integracion}>
          El informe del auditor se extiende en documento aparte con fecha{' '}
          {auditoriaFecha}.
        </Text>
      )}
      <SignatureBlock ac={accountant} />
    </View>
  );
}

/** Orden clásico: estados, notas y anexos al final. */
const DEFAULT_PACKAGE_SECTIONS: string[] = [
  'esp',
  'er',
  'eepn',
  'efe',
  'composicion',
  'anexo_ii',
  'anexo_i',
  'anexo_cmv',
  'inventario',
  'informe_auditor',
];

/**
 * Informe del auditor. Va sin la leyenda de integración: no es un estado, es
 * una opinión sobre ellos, y lleva su propio lugar y fecha al pie.
 */
function InformeAuditorBlock({
  informe,
}: {
  informe?: { body: string; lugar: string; fecha: string } | null;
}) {
  if (!informe?.body?.trim()) return null;
  return (
    <View>
      {mdLines(informe.body).map((l, i) =>
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
      {(informe.lugar || informe.fecha) && (
        <Text style={pk.noteP}>
          {[informe.lugar, informe.fecha].filter(Boolean).join(', ')}
        </Text>
      )}
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
          {!!data.domicilio && (
            <Text style={pk.coverMeta}>{data.domicilio}</Text>
          )}
          {!!data.actividadPrincipal && (
            <Text style={pk.coverMeta}>
              Actividad principal: {data.actividadPrincipal}
            </Text>
          )}
          {!!data.fechaConstitucion && (
            <Text style={pk.coverMeta}>
              Fecha de constitución: {data.fechaConstitucion}
            </Text>
          )}
          {!!(data.fechaInscripcion || data.numeroInscripcion) && (
            <Text style={pk.coverMeta}>
              {[
                data.fechaInscripcion &&
                  `Inscripción RPC: ${data.fechaInscripcion}`,
                data.numeroInscripcion && `N° IGJ: ${data.numeroInscripcion}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          <Text style={[pk.coverTitle, { marginTop: 24 }]}>
            Ejercicio Económico N°{data.fiscalYearNumber}
          </Text>
          <Text style={pk.coverMeta}>{data.periodLabel}</Text>
          <Text style={pk.coverDisc}>
            {disclaimerFor(data.valuation, data.norma)}
          </Text>
          <Text style={pk.coverGen}>Generado el {data.generatedLabel}</Text>
        </View>
        <PageFooter data={data} />
      </Page>

      {/* Cuerpo: una página por sección, en el orden que eligió el contador */}
      {(data.sections ?? DEFAULT_PACKAGE_SECTIONS).map((entry) => {
        const bloque = (() => {
          switch (entry) {
            case 'esp':
              return (
                <EspBlock
                  key={entry}
                  esp={data.esp}
                  references={data.references}
                />
              );
            case 'er':
              return (
                <ErBlock
                  key={entry}
                  er={data.er}
                  references={data.references}
                />
              );
            case 'eepn':
              return <EepnBlock key={entry} eepn={data.eepn} />;
            case 'efe':
              return <EfeBlock key={entry} efe={data.efe} />;
            case 'composicion':
              return (
                <Nota3Block
                  key={entry}
                  esp={data.esp}
                  numero={
                    data.noteSequence?.find((n) => n.entry === 'composicion')
                      ?.number ?? null
                  }
                />
              );
            case 'anexo_ii':
              return <AnexoIIBlock key={entry} a2={data.anexoII} />;
            case 'anexo_i':
              return <AnexoIBlock key={entry} anexoI={data.anexoI} />;
            case 'anexo_cmv':
              return <AnexoCMVBlock key={entry} cmv={data.cmv} />;
            case 'inventario':
              return (
                <View key={entry}>
                  <InventarioBlock esp={data.esp} />
                  <View break>
                    <InventarioPnBlock esp={data.esp} />
                  </View>
                </View>
              );
            case 'informe_auditor':
              return (
                <InformeAuditorBlock key={entry} informe={data.auditReport} />
              );
            default: {
              // Una nota suelta: se imprime sola, en la posición que le tocó.
              const note = data.notes.find((n) => `note:${n.id}` === entry);
              if (!note) return null;
              return (
                <NotesBlock
                  key={entry}
                  notes={[note]}
                  sequence={data.noteSequence}
                  soloUna
                  vars={data.noteVars}
                />
              );
            }
          }
        })();
        if (!bloque) return null;
        return (
          <Page key={entry} size="A4" style={pk.page} wrap>
            {bloque}
            {entry === 'informe_auditor' ? (
              <SignatureBlock ac={data.accountant} />
            ) : (
              <EstadoFooter
                auditoriaFecha={data.auditoriaFecha}
                accountant={data.accountant}
              />
            )}
            <PageFooter data={data} />
          </Page>
        );
      })}
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
              <Text style={lm.cMoney}>
                {r.credit ? fmtMoney(r.credit) : ''}
              </Text>
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
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma?: string;
  empresaName: string;
  cuit: string;
  fiscalYearNumber: number;
  periodLabel: string;
  esp: EspResult;
  er: ErResult;
  /** Estado real; si falta se cae al resumen de patrimonio del ESP. */
  eepn?: EepnResult | null;
  valuation?: 'ajustado' | 'historico';
}

/** Anchos del inventario: concepto + las cuatro columnas de importes. */
const inv = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 1.2 },
  label: { width: '36%' },
  c: { width: '16%', textAlign: 'right', paddingLeft: 3 },
});

/**
 * Inventario al cierre, en el formato de cuatro columnas del balance: cada
 * nivel de la jerarquía coloca su importe una columna más a la derecha.
 */
function InventarioBlock({ esp }: { esp: EspResult }) {
  const fila = (
    key: string,
    label: string,
    col: 0 | 1 | 2 | 3 | 4,
    amount?: number,
    opts: { indent?: number; bold?: boolean } = {}
  ) => (
    <View key={key} style={inv.row}>
      <Text
        style={[
          inv.label,
          { paddingLeft: (opts.indent ?? 0) * 7 },
          opts.bold ? { fontFamily: 'Helvetica-Bold' } : {},
        ]}
      >
        {label}
      </Text>
      {([1, 2, 3, 4] as const).map((n) => (
        <Text
          key={n}
          style={[inv.c, opts.bold ? { fontFamily: 'Helvetica-Bold' } : {}]}
        >
          {col === n && amount !== undefined ? fmtMoney(amount) : ''}
        </Text>
      ))}
    </View>
  );

  const macros = [
    { macro: 'activo' as const, title: 'Activo', total: esp.totals.activo },
    { macro: 'pasivo' as const, title: 'Pasivo', total: esp.totals.pasivo },
    { macro: 'pn' as const, title: 'Patrimonio Neto', total: esp.totals.pn },
  ];

  return (
    <View>
      <Text style={pk.sectionTitle}>Inventario al cierre del ejercicio</Text>
      <View style={[pk.colHead, inv.row]}>
        <Text style={inv.label}>Conceptos</Text>
        {[1, 2, 3, 4].map((n) => (
          <Text key={n} style={inv.c}>
            $
          </Text>
        ))}
      </View>
      {macros.map(({ macro, title, total }) => {
        const secs = esp.sections.filter((s) => s.macro === macro);
        if (secs.every((s) => s.rubros.length === 0)) return null;
        return (
          <View key={macro}>
            {fila(macro, title, 0, undefined, { bold: true })}
            {secs.map((sec) => (
              <View key={sec.key}>
                {sec.label !== title
                  ? fila(sec.key, sec.label, 0, undefined, { indent: 1 })
                  : null}
                {sec.rubros.map((r) => (
                  <View key={r.group} wrap={false}>
                    {fila(r.group, r.label, 2, r.current, { indent: 2 })}
                    {r.accounts.map((a) =>
                      fila(a.accountId, a.name, 1, a.current, { indent: 3 })
                    )}
                  </View>
                ))}
                {sec.rubros.length > 0 && sec.label !== title
                  ? fila(
                      `${sec.key}-total`,
                      `Total ${sec.label}`,
                      3,
                      sec.current,
                      { indent: 1 }
                    )
                  : null}
              </View>
            ))}
            {fila(`${macro}-total`, `Total ${title}`, 4, total.current, {
              bold: true,
            })}
          </View>
        );
      })}
      {fila(
        'total-general',
        'Total Pasivo + Patrimonio Neto',
        4,
        esp.totals.pasivoMasPn.current,
        { bold: true }
      )}
    </View>
  );
}

function InventarioPnBlock({ esp }: { esp: EspResult }) {
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
        <Text
          style={[lm.meta, { fontStyle: 'italic', color: '#999' }] as never}
        >
          {disclaimerFor(data.valuation, data.norma)}
        </Text>
        {/* El salto lo decide el documento: el paquete de EECC abre una
            página por sección y el libro encadena, salvo el patrimonio. */}
        <InventarioBlock esp={data.esp} />
        <View break>
          <EspBlock esp={data.esp} />
          <ErBlock er={data.er} />
        </View>
        <View break>
          {data.eepn && data.eepn.columns.length > 0 ? (
            <EepnBlock eepn={data.eepn} />
          ) : (
            <InventarioPnBlock esp={data.esp} />
          )}
        </View>
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

/* ═════ Excel de los estados nuevos: EEPN, EFE y Nota 3 (AXI-6/7/8) ═════ */

export interface EstadosExcelData {
  /** Cómo se cita la norma del ajuste: "RT 54" o "RT 6". */
  norma?: string;
  /** Orden de las secciones, para que las solapas sigan el del documento. */
  sections?: string[];
  /** Número que le tocó a la composición de rubros. */
  composicionNumber?: number | null;
  empresaName: string;
  fiscalYearNumber: number;
  periodLabel: string;
  valuation: 'ajustado' | 'historico';
  eepn: EepnResult | null;
  efe: EfeResult | null;
  esp: EspResult;
}

/**
 * Un libro con una hoja por estado. Se exporta el paquete completo y no cada
 * estado por separado porque el contador los cruza entre sí: tenerlos en
 * pestañas del mismo archivo es lo que hace su papel de trabajo.
 */
export async function exportEstadosExcel(
  data: EstadosExcelData
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const disclaimer =
    data.valuation === 'historico'
      ? 'Valores históricos, sin ajuste por inflación (papel de trabajo).'
      : `Moneda homogénea de cierre, con ajuste por inflación (${data.norma ?? 'RT 54'}).`;

  /** Encabezado común a todas las hojas. */
  const header = (ws: XLWorksheet, title: string, cols: number) => {
    const t = ws.addRow([data.empresaName]);
    t.getCell(1).font = { bold: true, size: 14 };
    const s = ws.addRow([
      `${title} · Ejercicio N°${data.fiscalYearNumber} · ${data.periodLabel}`,
    ]);
    s.getCell(1).font = { size: 10 };
    const d = ws.addRow([disclaimer]);
    d.getCell(1).font = { size: 9, italic: true };
    ws.addRow([]);
    if (ws.columns[0]) ws.columns[0].width = 46;
    for (let i = 1; i < cols; i++) {
      if (ws.columns[i]) ws.columns[i].width = 20;
    }
  };

  const money = (row: XLRow, from: number, to: number, bold = false) => {
    for (let c = from; c <= to; c++) {
      row.getCell(c).numFmt = MONEY_FMT;
      row.getCell(c).alignment = { horizontal: 'right' };
      if (bold) row.getCell(c).font = { bold: true };
    }
  };

  /**
   * Cada hoja se crea aparte para poder respetar el orden que eligió el
   * contador: en exceljs el orden de las solapas es el de creación.
   */
  const hojaEepn = () => {
    if (!(data.eepn && data.eepn.columns.length > 0)) return;
    const e = data.eepn;
    const ws = wb.addWorksheet('EEPN', { views: [{ showGridLines: false }] });
    const nCols =
      e.columns.length + 2 + (e.priorFiscalYearNumber !== null ? 1 : 0);
    header(ws, 'Estado de Evolución del Patrimonio Neto', nCols);

    const head = [
      'Concepto',
      ...e.columns.map((c) =>
        c.isSubtotal ? `Total ${c.groupLabel}` : c.name
      ),
      `Ej. N°${e.fiscalYearNumber}`,
    ];
    if (e.priorFiscalYearNumber !== null) {
      head.push(`Ej. N°${e.priorFiscalYearNumber}`);
    }
    const hr = ws.addRow(head);
    for (let c = 1; c <= head.length; c++) hr.getCell(c).font = { bold: true };

    for (const row of e.rows) {
      const strong = row.kind === 'inicio' || row.kind === 'cierre';
      const values: (string | number)[] = [row.label];
      for (const c of e.columns) values.push(row.amounts[c.accountId] ?? 0);
      values.push(row.total);
      if (e.priorFiscalYearNumber !== null) {
        values.push(
          e.prior
            ? row.kind === 'inicio'
              ? e.prior.inicio
              : row.kind === 'resultado'
                ? e.prior.resultado
                : row.kind === 'cierre'
                  ? e.prior.cierre
                  : 0
            : 0
        );
      }
      const r = ws.addRow(values);
      if (strong) r.getCell(1).font = { bold: true };
      money(r, 2, values.length, strong);
      e.columns.forEach((c, i) => {
        if (c.isSubtotal) r.getCell(i + 2).font = { bold: true };
      });
    }
  };

  const hojaEfe = () => {
    if (!data.efe) return;
    const f = data.efe;
    const ws = wb.addWorksheet('Flujo de efectivo', {
      views: [{ showGridLines: false }],
    });
    header(
      ws,
      'Estado de Flujo de Efectivo y sus Equivalentes — Método directo, forma completa',
      3
    );

    const hr = ws.addRow([
      'Concepto',
      `Ej. N°${f.fiscalYearNumber}`,
      f.priorFiscalYearNumber !== null
        ? `Ej. N°${f.priorFiscalYearNumber}`
        : 'Anterior',
    ]);
    for (let c = 1; c <= 3; c++) hr.getCell(c).font = { bold: true };

    const line = (
      label: string,
      value: { current: number; prior: number },
      bold = false
    ) => {
      const r = ws.addRow([label, value.current, value.prior]);
      if (bold) r.getCell(1).font = { bold: true };
      money(r, 2, 3, bold);
    };

    line('Efectivo y equivalentes al inicio del ejercicio', f.efectivoInicio);
    line('Efectivo y equivalentes al cierre del ejercicio', f.efectivoCierre);
    line('Aumento (disminución) neto del efectivo', f.variacion, true);
    ws.addRow([]);
    const causas = ws.addRow(['Causas de las variaciones del efectivo']);
    causas.getCell(1).font = { bold: true };

    for (const a of f.activities) {
      const t = ws.addRow([a.label]);
      t.getCell(1).font = { bold: true, size: 10 };
      for (const l of a.lines) line(`    ${l.name}`, l);
      line(`Flujo neto por ${a.label.toLowerCase()}`, a, true);
    }
    line('Total de las variaciones del efectivo', f.totalCausas, true);
  };

  const hojaComposicion = () => {
    const rubros = data.esp.sections
      .flatMap((sec) => sec.rubros)
      .filter((r) => r.group !== 'resultado_ejercicio')
      .filter(
        (r) => Math.abs(r.current) >= 0.005 || Math.abs(r.prior) >= 0.005
      );
    if (rubros.length === 0) return;
    // El número sale de la posición de la nota, igual que en el PDF.
    const n = data.composicionNumber;
    const titulo = n != null ? `Nota ${n}` : 'Composición';
    const ws = wb.addWorksheet(titulo, { views: [{ showGridLines: false }] });
    header(ws, `${titulo} — Composición de los principales rubros`, 4);
    const hr = ws.addRow([
      'Nota',
      'Concepto',
      `Ej. N°${data.esp.fiscalYearNumber}`,
      data.esp.priorFiscalYearNumber !== null
        ? `Ej. N°${data.esp.priorFiscalYearNumber}`
        : 'Anterior',
    ]);
    for (let c = 1; c <= 4; c++) hr.getCell(c).font = { bold: true };
    if (ws.columns[0]) ws.columns[0].width = 8;
    if (ws.columns[1]) ws.columns[1].width = 46;

    rubros.forEach((r, i) => {
      const t = ws.addRow([`${n ?? 3}.${i + 1}`, r.label]);
      t.getCell(2).font = { bold: true };
      for (const a of r.accounts) {
        const row = ws.addRow(['', `    ${a.name}`, a.current, a.prior]);
        money(row, 3, 4);
      }
      const tot = ws.addRow(['', '', r.current, r.prior]);
      money(tot, 3, 4, true);
    });
  };

  // Las solapas salen en el orden del documento, igual que el PDF.
  const porSeccion: Record<string, () => void> = {
    eepn: hojaEepn,
    efe: hojaEfe,
    composicion: hojaComposicion,
  };
  const orden = (data.sections ?? ['eepn', 'efe', 'composicion']).filter(
    (k) => k in porSeccion
  );
  for (const k of orden) porSeccion[k]();

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `estados_${data.empresaName.replace(/\s+/g, '_')}_ej${data.fiscalYearNumber}.xlsx`
  );
}
