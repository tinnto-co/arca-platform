'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSXRaw from 'xlsx';
import {
  Upload,
  Loader2,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { importChartOfAccounts } from '@/actions/accounting';
import { downloadChartTemplate } from '@/lib/accounting-chart-template';
import {
  parseChartMatrix,
  type ImportRow,
  type ModifiedAccount,
  type ImportError,
  type PlannedAccount,
} from '@/lib/accounting-chart-import';

/* Tipado mínimo de xlsx (los typings del paquete no cubren read/opts). */
type XlsxSheet = Record<string, unknown>;
const XLSX = XLSXRaw as unknown as {
  read(
    data: ArrayBuffer,
    opts: { type: 'array' }
  ): {
    Sheets: Record<string, XlsxSheet>;
    SheetNames: string[];
  };
  utils: {
    sheet_to_json(
      sheet: XlsxSheet,
      opts: {
        header: 1;
        raw?: boolean;
        defval?: string;
        blankrows?: boolean;
      }
    ): unknown[][];
  };
};

type Target = 'base' | 'custom';
type Mode = 'complementar' | 'reemplazar';

/* Botones con estilo arca, consistentes con el resto del módulo. */
const BTN_OUTLINE =
  'flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors disabled:opacity-50';
const BTN_PRIMARY =
  'flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 transition-opacity disabled:opacity-50';
const BTN_GHOST =
  'flex items-center gap-1.5 h-8 px-2.5 text-[12px] rounded-[8px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors';

/** Lee la hoja "Plan de cuentas" del Excel y delega el mapeo a la lib pura. */
function parseSheet(data: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets['Plan de cuentas'] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas');
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
  return parseChartMatrix(matrix);
}

interface Preview {
  blocker: string | null;
  create: PlannedAccount[];
  unchanged: string[];
  modified: ModifiedAccount[];
  errors: ImportError[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onImported: () => void;
}

export function ImportarPlanDialog({
  open,
  onOpenChange,
  clientId,
  onImported,
}: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState<Target>('base');
  const [mode, setMode] = useState<Mode>('complementar');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<{
    created: number;
    updated: number;
  } | null>(null);

  const reset = () => {
    setFile(null);
    setRows(null);
    setPreview(null);
    setChecked(new Set());
    setApplied(null);
  };

  const analyzeMut = useMutation({
    mutationFn: (r: ImportRow[]) =>
      importChartOfAccounts({
        data: {
          clientId,
          target,
          mode,
          confirm: false,
          applyUpdateCodes: [],
          rows: r,
        },
      }),
    onSuccess: (d) => {
      setPreview({
        blocker: d.blocker,
        create: d.create,
        unchanged: d.unchanged,
        modified: d.modified,
        errors: d.errors,
      });
      setChecked(new Set(d.modified.map((m) => m.code))); // por defecto: todas
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: () =>
      importChartOfAccounts({
        data: {
          clientId,
          target,
          mode,
          confirm: true,
          applyUpdateCodes: [...checked],
          rows: rows ?? [],
        },
      }),
    onSuccess: (d) => {
      setApplied(d.applied);
      void queryClient.invalidateQueries({
        queryKey: ['accounting', 'chart', clientId],
      });
      const { created = 0, updated = 0 } = d.applied ?? {};
      toast.success(
        `Import aplicado: ${created} creada(s)${
          updated ? `, ${updated} actualizada(s)` : ''
        }`
      );
      onImported();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setRows(null);
    setPreview(null);
    setApplied(null);
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (!data) throw new Error('No se pudo leer el archivo');
        const parsed = parseSheet(data as ArrayBuffer);
        if (parsed.length === 0) {
          toast.error('No se encontraron cuentas cargadas en el archivo');
          return;
        }
        setRows(parsed);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Error al leer el Excel'
        );
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const canConfirm =
    !!preview &&
    !preview.blocker &&
    (preview.create.length > 0 || checked.size > 0);

  const toggleChecked = (code: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const summary = useMemo(() => {
    if (!preview) return null;
    return {
      create: preview.create.length,
      unchanged: preview.unchanged.length,
      modified: preview.modified.length,
      errors: preview.errors.length,
    };
  }, [preview]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar plan de cuentas</DialogTitle>
          <DialogDescription>
            Subí la plantilla Excel completada. Analizamos el archivo y te
            mostramos qué se va a crear antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {applied ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--arca-accent-pos-fg)]" />
            <p className="text-[15px] font-medium">
              {applied.created} cuenta(s) creada(s)
              {applied.updated ? `, ${applied.updated} actualizada(s)` : ''}
            </p>
            {preview && preview.errors.length > 0 && (
              <p className="text-[12px] text-[var(--arca-ink-3)]">
                {preview.errors.length} fila(s) con error se omitieron.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Alcance + modo */}
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-[var(--arca-ink-3)]">Importar a</span>
                <select
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value as Target);
                    setPreview(null);
                  }}
                  className="h-8 px-2 rounded-[8px] border border-[var(--arca-border)] bg-transparent text-[13px]"
                >
                  <option value="base">Plan base del estudio</option>
                  <option value="custom">Cuentas propias de la empresa</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-[var(--arca-ink-3)]">Modo</span>
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as Mode);
                    setPreview(null);
                  }}
                  className="h-8 px-2 rounded-[8px] border border-[var(--arca-border)] bg-transparent text-[13px]"
                >
                  <option value="complementar">Complementar (agregar)</option>
                  <option value="reemplazar">Reemplazar (desde cero)</option>
                </select>
              </label>
            </div>

            {mode === 'reemplazar' && (
              <p className="flex items-start gap-1.5 text-[12px] text-[var(--arca-ink-3)] bg-[var(--arca-surface-2)] rounded-[8px] p-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Reemplazar borra el plan actual y carga el del Excel. Solo se
                permite si todavía no se usó (sin asientos, cuentas propias ni
                cambios por empresa).
              </p>
            )}

            {/* Archivo */}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onPickFile}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={`${BTN_OUTLINE} max-w-[60%]`}
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {file ? file.name : 'Seleccionar archivo'}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void downloadChartTemplate({
                    mode: 'blank',
                    label: 'estudio',
                  })
                }
                className={BTN_GHOST}
              >
                <Download className="w-3.5 h-3.5" />
                Descargar plantilla vacía
              </button>
            </div>

            {/* Preview */}
            {summary && (
              <div className="rounded-[10px] border border-[var(--arca-border)] p-3 space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  <span className="text-[var(--arca-accent-pos-fg)] font-medium">
                    {summary.create} nueva(s)
                  </span>
                  <span className="text-[var(--arca-ink-3)]">
                    {summary.unchanged} sin cambios
                  </span>
                  <span className="text-[var(--arca-ink-2)]">
                    {summary.modified} modificada(s)
                  </span>
                  {summary.errors > 0 && (
                    <span className="text-[var(--arca-accent-neg)] font-medium">
                      {summary.errors} con error
                    </span>
                  )}
                </div>

                {preview?.blocker && (
                  <p className="flex items-start gap-1.5 text-[12px] text-[var(--arca-accent-neg)]">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    No se puede reemplazar: {preview.blocker}. Cambiá a modo
                    “Complementar”.
                  </p>
                )}

                {preview && preview.modified.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium">
                      Cuentas modificadas — tildá las que quieras aplicar:
                    </p>
                    <ul className="max-h-32 overflow-y-auto space-y-0.5">
                      {preview.modified.map((m) => (
                        <li
                          key={m.code}
                          className="flex items-center gap-2 text-[12px]"
                        >
                          <input
                            type="checkbox"
                            checked={checked.has(m.code)}
                            onChange={() => toggleChecked(m.code)}
                            className="accent-[var(--arca-navy-900)]"
                          />
                          <span className="font-mono">{m.code}</span>
                          <span className="text-[var(--arca-ink-3)]">
                            {m.changes.join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview && preview.errors.length > 0 && (
                  <ul className="max-h-32 overflow-y-auto space-y-0.5 text-[12px] text-[var(--arca-accent-neg)]">
                    {preview.errors.map((e, i) => (
                      <li key={i}>
                        Fila {e.row}
                        {e.code ? ` (${e.code})` : ''}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {applied ? (
            <button onClick={() => onOpenChange(false)} className={BTN_PRIMARY}>
              Cerrar
            </button>
          ) : (
            <>
              <button
                onClick={() => onOpenChange(false)}
                className={BTN_OUTLINE}
              >
                Cancelar
              </button>
              {preview ? (
                <button
                  onClick={() => confirmMut.mutate()}
                  disabled={!canConfirm || confirmMut.isPending}
                  className={BTN_PRIMARY}
                >
                  {confirmMut.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Confirmar import
                </button>
              ) : (
                <button
                  onClick={() => rows && analyzeMut.mutate(rows)}
                  disabled={!rows || analyzeMut.isPending}
                  className={BTN_PRIMARY}
                >
                  {analyzeMut.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Analizar
                </button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
