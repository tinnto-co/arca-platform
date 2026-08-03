/**
 * Administración de la serie de índices para el ajuste por inflación (RT 6).
 *
 * La serie es global del estudio (no se scopea por empresa) porque es un dato
 * público. Se carga de tres formas: importando la planilla de FACPCE, mes a mes
 * a mano, o corriendo `bun run db:seed-inflation-index`.
 *
 * El coeficiente de reexpresión de un mes se calcula contra el mes de cierre
 * elegido arriba: `índice(cierre) / índice(mes)` a 4 decimales.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { ArcaCard } from '@/components/dashboard/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  deleteInflationIndex,
  importInflationIndexes,
  listInflationIndexes,
  saveInflationIndex,
  type InflationIndexRow,
} from '@/actions/inflation';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

type IndexSource = 'facpce_rt6' | 'indec_ipc' | 'manual';

const SOURCE_LABELS: Record<IndexSource, string> = {
  facpce_rt6: 'FACPCE — Índice RT 6 (Res. JG 539/18)',
  indec_ipc: 'INDEC — IPC nivel general',
  manual: 'Carga manual del estudio',
};

const FACPCE_URL = 'https://www.facpce.org.ar/indices-facpce/';

const INPUT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

const fmtIndex = (n: number) =>
  n.toLocaleString('es-AR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

const fmtCoef = (n: number) =>
  n.toLocaleString('es-AR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

/** Coeficiente de reexpresión RT 6, redondeado a 4 decimales. */
function coefficient(closingIndex: number, originIndex: number): number {
  return Math.round((closingIndex / originIndex) * 10000) / 10000;
}

interface ParsedRow {
  year: number;
  month: number;
  value: number;
}

/**
 * Lee la planilla de FACPCE en el navegador: primera hoja, columna A = mes
 * (fecha) y columna B = índice. Las filas sin índice publicado (vienen con "*")
 * se saltean.
 */
async function parseWorkbook(
  file: File
): Promise<{ rows: ParsedRow[]; skipped: number }> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('La planilla no tiene hojas.');
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
  });

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const row of raw) {
    const rawDate = row?.[0];
    const rawValue = row?.[1];
    if (!(rawDate instanceof Date)) continue;
    // La celda del índice viene como número; el mes sin publicar viene como "*".
    const value =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
          ? Number(rawValue.replace(',', '.'))
          : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      skipped++;
      continue;
    }
    rows.push({
      year: rawDate.getFullYear(),
      month: rawDate.getMonth() + 1,
      value,
    });
  }
  if (rows.length === 0) {
    throw new Error(
      'No se pudo leer ninguna fila. Verificá que sea la planilla de índices de FACPCE.'
    );
  }
  return { rows, skipped };
}

export function IndicesInflacion({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [source, setSource] = useState<IndexSource>('facpce_rt6');
  const [year, setYear] = useState<number | null>(null);
  const [closing, setClosing] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [editing, setEditing] = useState<InflationIndexRow | 'new' | null>(
    null
  );
  const [deleting, setDeleting] = useState<InflationIndexRow | null>(null);
  const [importPreview, setImportPreview] = useState<{
    rows: ParsedRow[];
    skipped: number;
    fileName: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['inflation', 'indexes', source],
    queryFn: () => listInflationIndexes({ data: { source } }),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const years = data?.years ?? [];

  // Por defecto se muestra el último año con datos y se toma su último mes
  // publicado como mes de cierre.
  const effectiveYear = year ?? years[0] ?? new Date().getFullYear();
  const effectiveClosing = useMemo(
    () =>
      closing ??
      (data?.lastPeriod
        ? { year: data.lastPeriod.year, month: data.lastPeriod.month }
        : null),
    [closing, data]
  );

  const closingIndex = useMemo(() => {
    if (!effectiveClosing) return null;
    const r = rows.find(
      (x) =>
        x.year === effectiveClosing.year && x.month === effectiveClosing.month
    );
    return r?.value ?? null;
  }, [rows, effectiveClosing]);

  const yearRows = useMemo(
    () =>
      rows
        .filter((r) => r.year === effectiveYear)
        .sort((a, b) => a.month - b.month),
    [rows, effectiveYear]
  );

  const yearIdx = years.indexOf(effectiveYear);
  const canPrevYear = yearIdx >= 0 && yearIdx < years.length - 1;
  const canNextYear = yearIdx > 0;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['inflation', 'indexes'] });

  const importMut = useMutation({
    mutationFn: (rowsToImport: ParsedRow[]) =>
      importInflationIndexes({ data: { source, rows: rowsToImport } }),
    onSuccess: (res) => {
      toast.success(
        `Serie importada: ${res.imported} meses, de ${res.from} a ${res.to}.`
      );
      setImportPreview(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (v: { year: number; month: number; value: number }) =>
      saveInflationIndex({ data: { source, ...v } }),
    onSuccess: () => {
      toast.success('Índice guardado.');
      setEditing(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteInflationIndex({ data: { id } }),
    onSuccess: () => {
      toast.success('Índice eliminado.');
      setDeleting(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFilePicked(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await parseWorkbook(file);
      setImportPreview({ ...parsed, fileName: file.name });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Cabecera: fuente + estado de la serie + acciones ── */}
      <ArcaCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--arca-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-[10px] bg-[var(--arca-surface-2)] flex items-center justify-center shrink-0">
              <TrendingUp
                className="w-4.5 h-4.5 text-[var(--arca-ink-2)]"
                strokeWidth={1.8}
              />
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-[var(--arca-ink)]">
                Índices de ajuste por inflación
              </div>
              <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
                Serie mensual usada para reexpresar los estados contables
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={source}
              onValueChange={(v) => setSource(v as IndexSource)}
            >
              <SelectTrigger size="sm" className="max-w-[300px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SOURCE_LABELS) as [IndexSource, string][]).map(
                  ([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            {isOwner && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => void onFilePicked(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)]"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={2} />
                  Importar planilla
                </button>
                <button
                  onClick={() => setEditing('new')}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                  Cargar índice
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-3 bg-[var(--arca-surface-2)] text-[12px]">
          <Stat label="Meses cargados" value={String(data?.total ?? 0)} />
          <Stat
            label="Cobertura"
            value={
              rows.length > 0
                ? `${MONTHS[rows[0].month - 1].slice(0, 3)} ${rows[0].year} → ${MONTHS[rows[rows.length - 1].month - 1].slice(0, 3)} ${rows[rows.length - 1].year}`
                : '—'
            }
          />
          <Stat
            label="Último publicado"
            value={
              data?.lastPeriod
                ? `${MONTHS[data.lastPeriod.month - 1]} ${data.lastPeriod.year} · ${fmtIndex(data.lastPeriod.value)}`
                : '—'
            }
          />
        </div>

        {data && data.total === 0 && (
          <div className="flex items-start gap-2.5 px-5 py-4 text-[12.5px] text-[var(--arca-ink-2)]">
            <Info
              className="w-4 h-4 mt-px shrink-0 text-[var(--arca-ink-3)]"
              strokeWidth={1.8}
            />
            <div>
              Todavía no hay índices cargados en esta serie. Descargá la
              planilla desde{' '}
              <a
                href={FACPCE_URL}
                target="_blank"
                rel="noreferrer"
                className="underline font-medium text-[var(--arca-ink)]"
              >
                facpce.org.ar
              </a>{' '}
              e importala con el botón de arriba, o cargá los meses a mano.
            </div>
          </div>
        )}
      </ArcaCard>

      {/* ── Filtros: año + mes de cierre para los coeficientes ── */}
      <ArcaCard>
        <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-[var(--arca-border)]">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-medium text-[var(--arca-ink-3)]">
              Año
            </span>
            <button
              disabled={!canPrevYear}
              onClick={() => setYear(years[yearIdx + 1])}
              className="h-7 w-7 flex items-center justify-center rounded-[8px] border border-[var(--arca-border)] disabled:opacity-30"
              aria-label="Año anterior"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
            </button>
            <Select
              value={String(effectiveYear)}
              onValueChange={(v) => setYear(Number(v))}
            >
              <SelectTrigger size="sm" className="w-[100px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              disabled={!canNextYear}
              onClick={() => setYear(years[yearIdx - 1])}
              className="h-7 w-7 flex items-center justify-center rounded-[8px] border border-[var(--arca-border)] disabled:opacity-30"
              aria-label="Año siguiente"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="h-5 w-px bg-[var(--arca-border)]" />

          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-medium text-[var(--arca-ink-3)]">
              Coeficientes contra el cierre de
            </span>
            <Select
              value={String(effectiveClosing?.month ?? '')}
              onValueChange={(v) =>
                setClosing({
                  year: effectiveClosing?.year ?? effectiveYear,
                  month: Number(v),
                })
              }
            >
              <SelectTrigger size="sm" className="w-[120px] text-[12.5px]">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(effectiveClosing?.year ?? '')}
              onValueChange={(v) =>
                setClosing({
                  year: Number(v),
                  month: effectiveClosing?.month ?? 12,
                })
              }
            >
              <SelectTrigger size="sm" className="w-[100px] text-[12.5px]">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {effectiveClosing && closingIndex === null && (
              <span className="flex items-center gap-1 text-[11.5px] text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                Sin índice para ese mes
              </span>
            )}
          </div>
        </div>

        {/* ── Tabla del año ── */}
        <div className="grid grid-cols-[110px_1fr_120px_130px_72px] gap-3 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          <div>Mes</div>
          <div className="text-right">Índice</div>
          <div className="text-right">Var. mensual</div>
          <div className="text-right">Coeficiente</div>
          <div className="text-right">Acciones</div>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando serie…
          </div>
        ) : yearRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay índices cargados para {effectiveYear}.
          </div>
        ) : (
          yearRows.map((r) => {
            const isClosing =
              r.year === effectiveClosing?.year &&
              r.month === effectiveClosing.month;
            return (
              <div
                key={r.id}
                className="grid grid-cols-[110px_1fr_120px_130px_72px] gap-3 px-5 py-2 border-b border-[var(--arca-border)] last:border-b-0 text-[12.5px] items-center hover:bg-[var(--arca-surface-2)]"
              >
                <div className="text-[var(--arca-ink)] font-medium flex items-center gap-1.5">
                  {MONTHS[r.month - 1]}
                  {isClosing && (
                    <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--arca-navy-900)] text-white font-semibold">
                      cierre
                    </span>
                  )}
                </div>
                <div className="text-right tabular-nums text-[var(--arca-ink)]">
                  {fmtIndex(r.value)}
                </div>
                <div className="text-right tabular-nums text-[var(--arca-ink-3)]">
                  {r.variation === null
                    ? '—'
                    : `${r.variation > 0 ? '+' : ''}${r.variation.toFixed(2)} %`}
                </div>
                <div className="text-right tabular-nums font-medium text-[var(--arca-ink)]">
                  {closingIndex === null
                    ? '—'
                    : fmtCoef(coefficient(closingIndex, r.value))}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {isOwner && (
                    <>
                      <button
                        onClick={() => setEditing(r)}
                        className="h-6 w-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)] hover:text-[var(--arca-ink)]"
                        title="Editar índice"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                      <button
                        onClick={() => setDeleting(r)}
                        className="h-6 w-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:bg-red-50 hover:text-red-600"
                        title="Eliminar índice"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {yearRows.length > 0 && closingIndex !== null && effectiveClosing && (
          <div className="px-5 py-2.5 border-t border-[var(--arca-border)] text-[11.5px] text-[var(--arca-ink-3)]">
            Coeficiente = índice de {MONTHS[effectiveClosing.month - 1]}{' '}
            {effectiveClosing.year} ({fmtIndex(closingIndex)}) ÷ índice del mes,
            redondeado a 4 decimales (RT 6, sección IV.B.6).
          </div>
        )}
      </ArcaCard>

      {/* ── Confirmación de importación ── */}
      <Dialog
        open={!!importPreview}
        onOpenChange={(o) => !o && setImportPreview(null)}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Importar serie de índices</DialogTitle>
            <DialogDescription>
              Se van a cargar en «{SOURCE_LABELS[source]}». Los meses que ya
              existan se actualizan con el valor de la planilla.
            </DialogDescription>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-2 text-[12.5px]">
              <Row label="Archivo" value={importPreview.fileName} />
              <Row
                label="Meses a importar"
                value={String(importPreview.rows.length)}
              />
              <Row
                label="Cobertura"
                value={`${MONTHS[importPreview.rows[0].month - 1]} ${importPreview.rows[0].year} → ${MONTHS[importPreview.rows[importPreview.rows.length - 1].month - 1]} ${importPreview.rows[importPreview.rows.length - 1].year}`}
              />
              {importPreview.skipped > 0 && (
                <Row
                  label="Filas salteadas"
                  value={`${importPreview.skipped} (sin índice publicado)`}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setImportPreview(null)}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)]"
            >
              Cancelar
            </button>
            <button
              disabled={importMut.isPending}
              onClick={() =>
                importPreview && importMut.mutate(importPreview.rows)
              }
              className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2} />
              {importMut.isPending ? 'Importando…' : 'Importar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Alta / edición manual ── */}
      <IndexEditor
        state={editing}
        years={years}
        onClose={() => setEditing(null)}
        onSave={(v) => saveMut.mutate(v)}
        saving={saveMut.isPending}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar índice</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `Se va a eliminar el índice de ${MONTHS[deleting.month - 1]} ${deleting.year}. Los ejercicios que lo necesiten no van a poder ajustarse hasta que se vuelva a cargar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--arca-ink-3)] font-semibold">
        {label}
      </div>
      <div className="text-[12.5px] text-[var(--arca-ink)] tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--arca-ink-3)]">{label}</span>
      <span className="text-[var(--arca-ink)] font-medium text-right">
        {value}
      </span>
    </div>
  );
}

function IndexEditor({
  state,
  years,
  onClose,
  onSave,
  saving,
}: {
  state: InflationIndexRow | 'new' | null;
  years: number[];
  onClose: () => void;
  onSave: (v: { year: number; month: number; value: number }) => void;
  saving: boolean;
}) {
  const isNew = state === 'new';
  const row = isNew ? null : state;
  const now = new Date();

  const [year, setYear] = useState(row?.year ?? now.getFullYear());
  const [month, setMonth] = useState(row?.month ?? now.getMonth() + 1);
  const [value, setValue] = useState(row ? String(row.value) : '');

  // Cada vez que se abre el diálogo se reinicia con los datos de la fila.
  const key = state === null ? 'closed' : isNew ? 'new' : `${row?.id}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setYear(row?.year ?? now.getFullYear());
    setMonth(row?.month ?? now.getMonth() + 1);
    setValue(row ? String(row.value) : '');
  }

  const numeric = Number(value.replace(',', '.'));
  const valid = Number.isFinite(numeric) && numeric > 0;
  const yearOptions = [
    ...new Set([...years, now.getFullYear(), now.getFullYear() + 1]),
  ].sort((a, b) => b - a);

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Cargar índice' : 'Editar índice'}</DialogTitle>
          <DialogDescription>
            Cargá el índice de nivel general del mes. El coeficiente lo calcula
            el sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11.5px] font-medium text-[var(--arca-ink-3)]">
                Mes
              </span>
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
                disabled={!isNew}
              >
                <SelectTrigger size="sm" className="w-full text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-[11.5px] font-medium text-[var(--arca-ink-3)]">
                Año
              </span>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(Number(v))}
                disabled={!isNew}
              >
                <SelectTrigger size="sm" className="w-full text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-[11.5px] font-medium text-[var(--arca-ink-3)]">
              Índice de nivel general
            </span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej. 11077,0608"
              inputMode="decimal"
              className={`${INPUT_CLASS} w-full tabular-nums`}
            />
          </label>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)]"
          >
            Cancelar
          </button>
          <button
            disabled={!valid || saving}
            onClick={() => onSave({ year, month, value: numeric })}
            className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
