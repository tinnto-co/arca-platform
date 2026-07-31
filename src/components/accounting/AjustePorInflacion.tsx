/**
 * Ajuste por inflación (RT 6) de un ejercicio: preplanilla y asiento.
 *
 * La preplanilla es el papel de trabajo que pidió el estudio — por cada cuenta y
 * mes: histórico, coeficiente, ajustado y diferencia. Al aprobarla se genera un
 * asiento con origen `auto_inflation`, así los estados contables quedan
 * ajustados sin tocar ningún generador, y el toggle "histórico" lo excluye.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Layers,
  RotateCcw,
  Search,
  Sparkles,
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
  applyInflationAdjustment,
  getInflationAdjustment,
  listFiscalYearsForInflation,
  regenerateInflationAdjustment,
  voidInflationAdjustment,
  type InflationAdjustmentPreview,
} from '@/actions/inflation';
import {
  INFLATION_NATURE_LABELS,
  INFLATION_NATURE_SHORT_LABELS,
} from '@/lib/accounting-inflation';

const MONTHS_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const INPUT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

const fmtMoney = (n: number) =>
  n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtCoef = (n: number) =>
  n.toLocaleString('es-AR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

const periodLabel = (year: number | null, month: number | null) =>
  year === null || month === null
    ? 'Apertura'
    : `${MONTHS_SHORT[month - 1]} ${year}`;

type View = 'resumen' | 'detalle' | 'asiento' | 'coeficientes';

export function AjustePorInflacion({
  clientId,
  clientName,
  isOwner,
}: {
  clientId: string;
  clientName: string;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [fyId, setFyId] = useState('');
  const [view, setView] = useState<View>('resumen');
  const [search, setSearch] = useState('');
  const [onlyAdjusted, setOnlyAdjusted] = useState(true);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const { data: fys = [] } = useQuery({
    queryKey: ['inflation', 'fiscal-years', clientId],
    queryFn: () => listFiscalYearsForInflation({ data: { clientId } }),
  });

  const effectiveFyId = fyId || fys[0]?.id || '';

  const {
    data: preview,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['inflation', 'adjustment', clientId, effectiveFyId],
    queryFn: () =>
      getInflationAdjustment({
        data: {
          clientId,
          fiscalYearId: effectiveFyId,
          source: 'facpce_rt6',
        },
      }),
    enabled: !!effectiveFyId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['inflation', 'adjustment'] });
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const applyMut = useMutation({
    mutationFn: () =>
      applyInflationAdjustment({
        data: { clientId, fiscalYearId: effectiveFyId, source: 'facpce_rt6' },
      }),
    onSuccess: (res) => {
      toast.success(
        `Asiento N° ${res.number} generado. RECPAM ${fmtMoney(-res.recpam)}.`
      );
      setConfirmApply(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerateMut = useMutation({
    mutationFn: () =>
      regenerateInflationAdjustment({
        data: { clientId, fiscalYearId: effectiveFyId, source: 'facpce_rt6' },
      }),
    onSuccess: (res) => {
      toast.success(
        `Ajuste regenerado. Asiento N° ${res.number}, RECPAM ${fmtMoney(-res.recpam)}.`
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidMut = useMutation({
    mutationFn: () =>
      voidInflationAdjustment({
        data: { clientId, fiscalYearId: effectiveFyId },
      }),
    onSuccess: () => {
      toast.success('Ajuste anulado. El asiento quedó marcado como anulado.');
      setConfirmVoid(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredAccounts = useMemo(() => {
    if (!preview) return [];
    const q = search.trim().toLowerCase();
    return preview.byAccount
      .filter((a) => (onlyAdjusted ? Math.abs(a.difference) >= 0.005 : true))
      .filter(
        (a) =>
          !q ||
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [preview, search, onlyAdjusted]);

  const filteredLines = useMemo(() => {
    if (!preview) return [];
    const q = search.trim().toLowerCase();
    return preview.lines
      .filter((l) => (onlyAdjusted ? Math.abs(l.difference) >= 0.005 : true))
      .filter(
        (l) =>
          !q ||
          l.code.toLowerCase().includes(q) ||
          l.name.toLowerCase().includes(q)
      )
      .sort(
        (a, b) =>
          a.code.localeCompare(b.code) ||
          (a.year ?? 0) - (b.year ?? 0) ||
          (a.month ?? 0) - (b.month ?? 0)
      );
  }, [preview, search, onlyAdjusted]);

  async function exportExcel() {
    if (!preview) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const resumen: unknown[][] = [
      ['Cuenta', 'Nombre', 'Naturaleza', 'Histórico', 'Ajustado', 'Diferencia'],
      ...preview.byAccount.map((a) => [
        a.code,
        a.name,
        INFLATION_NATURE_LABELS[a.nature],
        a.historical,
        a.adjusted,
        a.difference,
      ]),
      [],
      ['RECPAM', '', '', '', '', -preview.recpam],
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(resumen),
      'Resumen'
    );

    const detalle: unknown[][] = [
      [
        'Cuenta',
        'Nombre',
        'Período',
        'Histórico',
        'Coeficiente',
        'Ajustado',
        'Diferencia',
      ],
      ...preview.lines.map((l) => [
        l.code,
        l.name,
        periodLabel(l.year, l.month),
        l.historical,
        l.coefficient,
        l.adjusted,
        l.difference,
      ]),
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(detalle),
      'Preplanilla'
    );

    const coefs: unknown[][] = [
      ['Período', 'Índice', 'Coeficiente'],
      ...preview.coefficients.map((c) => [
        periodLabel(c.year, c.month),
        c.index,
        c.coefficient,
      ]),
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(coefs),
      'Coeficientes'
    );

    XLSX.writeFile(
      wb,
      `AXI-${clientName.replace(/[^\w]+/g, '-')}-ej${preview.fiscalYearNumber}.xlsx`
    );
    toast.success('Preplanilla exportada.');
  }

  if (fys.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa todavía no tiene ejercicios contables. Creá uno en la
          solapa «Ejercicios» antes de ajustar por inflación.
        </div>
      </ArcaCard>
    );
  }

  const applied = preview?.status === 'applied';
  const blocked = (preview?.missingIndexes.length ?? 0) > 0;
  const totalReexpresado = preview
    ? preview.byAccount.reduce((s, a) => s + Math.abs(a.difference), 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Cabecera ── */}
      <ArcaCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--arca-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-[10px] bg-[var(--arca-surface-2)] flex items-center justify-center shrink-0">
              <Sparkles
                className="w-4.5 h-4.5 text-[var(--arca-ink-2)]"
                strokeWidth={1.8}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-[var(--arca-ink)]">
                  Ajuste por inflación
                </span>
                {preview && (
                  <span
                    className="text-[9.5px] px-1.5 py-px rounded-full font-semibold uppercase tracking-wide"
                    style={
                      applied && preview.stale
                        ? { background: '#fef3c7', color: '#b45309' }
                        : applied
                          ? { background: '#dcfce7', color: '#15803d' }
                          : { background: '#f1f5f9', color: '#475569' }
                    }
                  >
                    {applied
                      ? preview.stale
                        ? 'Desactualizado'
                        : 'Aplicado'
                      : 'Borrador'}
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
                {preview
                  ? `Ejercicio ${preview.fiscalYearNumber} · ${preview.periodLabel}`
                  : 'Preplanilla y asiento de reexpresión a moneda de cierre'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={effectiveFyId} onValueChange={setFyId}>
              <SelectTrigger size="sm" className="w-[220px] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fys.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    Ejercicio {f.number} ·{' '}
                    {new Date(f.endDate).getUTCFullYear()}
                    {f.status === 'closed' ? ' (cerrado)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preview && !blocked && preview.lines.length > 0 && (
              <button
                onClick={() => void exportExcel()}
                className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={2} />
                Exportar
              </button>
            )}

            {isOwner &&
              preview &&
              !blocked &&
              (applied ? (
                <button
                  onClick={() => setConfirmVoid(true)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-red-600 hover:bg-red-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
                  Anular ajuste
                </button>
              ) : (
                <button
                  disabled={preview.entryLines.length === 0}
                  onClick={() => setConfirmApply(true)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                  Generar asiento
                </button>
              ))}
          </div>
        </div>

        {/* ── Resumen numérico ── */}
        {preview && !blocked && (
          <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-3 bg-[var(--arca-surface-2)] text-[12px]">
            <Stat
              label="RECPAM"
              value={fmtMoney(-preview.recpam)}
              hint={
                preview.recpam > 0
                  ? 'Pérdida por exposición'
                  : preview.recpam < 0
                    ? 'Ganancia por exposición'
                    : undefined
              }
              tone={
                preview.recpam > 0 ? 'neg' : preview.recpam < 0 ? 'pos' : 'flat'
              }
            />
            <Stat
              label="Total reexpresado"
              value={fmtMoney(totalReexpresado)}
            />
            <Stat
              label="Cuentas alcanzadas"
              value={String(
                preview.byAccount.filter((a) => Math.abs(a.difference) >= 0.005)
                  .length
              )}
            />
            <Stat
              label="Coeficiente de apertura"
              value={
                preview.coefficients.find(
                  (c) =>
                    c.year === preview.opening.year &&
                    c.month === preview.opening.month
                )
                  ? fmtCoef(
                      preview.coefficients.find(
                        (c) =>
                          c.year === preview.opening.year &&
                          c.month === preview.opening.month
                      )!.coefficient
                    )
                  : '—'
              }
              hint={`${MONTHS_SHORT[preview.opening.month - 1]} ${preview.opening.year}`}
            />
            <Stat
              label="Asiento"
              value={
                preview.journalEntryNumber
                  ? `N° ${preview.journalEntryNumber}`
                  : 'Sin generar'
              }
            />
          </div>
        )}
      </ArcaCard>

      {/* ── Avisos ── */}
      {error && (
        <Banner tone="error" icon={AlertTriangle} title="No se pudo calcular">
          {error.message}
        </Banner>
      )}

      {preview && blocked && (
        <Banner
          tone="warn"
          icon={AlertTriangle}
          title="Faltan índices para calcular el ajuste"
        >
          No hay índice cargado para: {preview.missingIndexes.join(', ')}. Cargá
          la serie en la solapa «Índices» y volvé acá.
        </Banner>
      )}

      {preview && !blocked && preview.stale && (
        <Banner
          tone="warn"
          icon={AlertTriangle}
          title="El ajuste quedó desactualizado"
        >
          Se cargaron o modificaron asientos después de generarlo, así que la
          preplanilla ya no refleja el mayor.{' '}
          {Math.abs((preview.appliedRecpam ?? 0) - preview.recpam) >= 0.01 ? (
            <>
              El RECPAM del asiento es {fmtMoney(-(preview.appliedRecpam ?? 0))}{' '}
              y el que corresponde hoy es {fmtMoney(-preview.recpam)}: los
              Estados Contables están usando el valor viejo.
            </>
          ) : (
            <>
              En este caso el RECPAM no cambia —los movimientos nuevos caen en
              meses con coeficiente 1— pero el detalle del ajuste sí, y conviene
              regenerarlo para que el papel de trabajo cierre.
            </>
          )}
          {isOwner && (
            <button
              onClick={() => regenerateMut.mutate()}
              disabled={regenerateMut.isPending}
              className="ml-2 inline-flex items-center gap-1 h-6 px-2 text-[11.5px] font-semibold rounded-[6px] border border-current disabled:opacity-60"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={2.2} />
              {regenerateMut.isPending ? 'Regenerando…' : 'Regenerar ajuste'}
            </button>
          )}
        </Banner>
      )}

      {preview && !blocked && preview.accountsWithoutNature.length > 0 && (
        <Banner
          tone="warn"
          icon={Info}
          title={`${preview.accountsWithoutNature.length} cuenta(s) sin naturaleza asignada`}
        >
          Se usó la clasificación por defecto según el rubro:{' '}
          {preview.accountsWithoutNature
            .slice(0, 6)
            .map((a) => a.code)
            .join(', ')}
          {preview.accountsWithoutNature.length > 6 && '…'}. Revisala en el plan
          de cuentas si alguna necesita otro tratamiento.
        </Banner>
      )}

      {preview && !blocked && !preview.balanced && (
        <Banner tone="error" icon={AlertTriangle} title="El asiento no cuadra">
          Debe y Haber no coinciden. No se puede generar el asiento hasta
          resolverlo.
        </Banner>
      )}

      {preview && !blocked && preview.lines.length === 0 && (
        <Banner tone="info" icon={Info} title="Nada para ajustar">
          El ejercicio no tiene movimientos en partidas no monetarias, así que
          el ajuste no genera ningún asiento.
        </Banner>
      )}

      {/* ── Preplanilla ── */}
      {preview && !blocked && preview.lines.length > 0 && (
        <ArcaCard>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--arca-border)]">
            <div className="flex gap-1">
              {(
                [
                  ['resumen', 'Resumen por cuenta'],
                  ['detalle', 'Detalle mes a mes'],
                  ['asiento', 'Asiento'],
                  ['coeficientes', 'Coeficientes'],
                ] as [View, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className="px-2.5 py-1 text-[12px] font-medium rounded-[8px] transition-colors"
                  style={
                    view === id
                      ? {
                          background: 'var(--arca-surface-2)',
                          color: 'var(--arca-ink)',
                        }
                      : { color: 'var(--arca-ink-3)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {(view === 'resumen' || view === 'detalle') && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[12px] text-[var(--arca-ink-3)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyAdjusted}
                    onChange={(e) => setOnlyAdjusted(e.target.checked)}
                    className="accent-[var(--arca-navy-900)]"
                  />
                  Solo cuentas ajustadas
                </label>
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--arca-ink-3)]"
                    strokeWidth={1.8}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cuenta…"
                    className={`${INPUT_CLASS} pl-8 w-[200px]`}
                  />
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Calculando ajuste…
            </div>
          ) : view === 'resumen' ? (
            <ResumenTable rows={filteredAccounts} recpam={preview.recpam} />
          ) : view === 'detalle' ? (
            <DetalleTable rows={filteredLines} />
          ) : view === 'asiento' ? (
            <AsientoTable rows={preview.entryLines} />
          ) : (
            <CoeficientesTable
              rows={preview.coefficients}
              closing={preview.closing}
            />
          )}
        </ArcaCard>
      )}

      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generar el asiento de ajuste</AlertDialogTitle>
            <AlertDialogDescription>
              Se va a crear un asiento con fecha de cierre del ejercicio, por{' '}
              {preview?.entryLines.length} líneas, con un RECPAM de{' '}
              {preview ? fmtMoney(-preview.recpam) : ''}. A partir de ahí los
              Estados Contables se muestran ajustados. Se puede anular y volver
              a generar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                applyMut.mutate();
              }}
            >
              {applyMut.isPending ? 'Generando…' : 'Generar asiento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmVoid} onOpenChange={setConfirmVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular el ajuste por inflación</AlertDialogTitle>
            <AlertDialogDescription>
              El asiento N° {preview?.journalEntryNumber} queda anulado y la
              preplanilla se borra. Los Estados Contables vuelven a valores
              históricos hasta que se genere un ajuste nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                voidMut.mutate();
              }}
            >
              {voidMut.isPending ? 'Anulando…' : 'Anular'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────────────────── Tablas ─────────────────────────── */

function ResumenTable({
  rows,
  recpam,
}: {
  rows: InflationAdjustmentPreview['byAccount'];
  recpam: number;
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <>
      <HeadRow
        cols="grid-cols-[90px_1fr_160px_140px_140px_140px]"
        labels={[
          'Código',
          'Cuenta',
          'Naturaleza',
          'Histórico',
          'Ajustado',
          'Diferencia',
        ]}
        align={[false, false, false, true, true, true]}
      />
      {rows.map((a) => (
        <div
          key={a.accountId}
          className="grid grid-cols-[90px_1fr_160px_140px_140px_140px] gap-3 px-5 py-2 border-b border-[var(--arca-border)] text-[12.5px] items-center hover:bg-[var(--arca-surface-2)]"
        >
          <div className="tabular-nums text-[var(--arca-ink-3)]">{a.code}</div>
          <div className="text-[var(--arca-ink)] truncate">
            {a.name}
            {a.targetAccountId !== a.accountId && (
              <span className="ml-1.5 text-[10.5px] text-[var(--arca-ink-3)]">
                → ajusta contra {a.targetCode}
              </span>
            )}
          </div>
          <div
            className="text-[11px] text-[var(--arca-ink-3)] truncate"
            title={INFLATION_NATURE_LABELS[a.nature]}
          >
            {INFLATION_NATURE_SHORT_LABELS[a.nature]}
          </div>
          <div className="text-right tabular-nums text-[var(--arca-ink-2)]">
            {fmtMoney(a.historical)}
          </div>
          <div className="text-right tabular-nums text-[var(--arca-ink)]">
            {fmtMoney(a.adjusted)}
          </div>
          <div
            className="text-right tabular-nums font-medium"
            style={{
              color:
                Math.abs(a.difference) < 0.005
                  ? 'var(--arca-ink-3)'
                  : 'var(--arca-ink)',
            }}
          >
            {fmtMoney(a.difference)}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[90px_1fr_160px_140px_140px_140px] gap-3 px-5 py-2.5 text-[12.5px] font-semibold bg-[var(--arca-surface-2)] items-center">
        <div />
        <div className="text-[var(--arca-ink)]">
          RECPAM — contrapartida del ajuste
        </div>
        <div className="text-[11px] font-normal text-[var(--arca-ink-3)]">
          {recpam > 0 ? 'Pérdida por exposición' : 'Ganancia por exposición'}
        </div>
        <div />
        <div />
        <div className="text-right tabular-nums text-[var(--arca-ink)]">
          {fmtMoney(-recpam)}
        </div>
      </div>
    </>
  );
}

function DetalleTable({ rows }: { rows: InflationAdjustmentPreview['lines'] }) {
  if (rows.length === 0) return <Empty />;
  return (
    <>
      <HeadRow
        cols="grid-cols-[90px_1fr_90px_140px_100px_140px_140px]"
        labels={[
          'Código',
          'Cuenta',
          'Período',
          'Histórico',
          'Coeficiente',
          'Ajustado',
          'Diferencia',
        ]}
        align={[false, false, false, true, true, true, true]}
      />
      <div className="max-h-[560px] overflow-y-auto">
        {rows.map((l, i) => (
          <div
            key={`${l.accountId}-${l.year}-${l.month}-${i}`}
            className="grid grid-cols-[90px_1fr_90px_140px_100px_140px_140px] gap-3 px-5 py-1.5 border-b border-[var(--arca-border)] text-[12.5px] items-center hover:bg-[var(--arca-surface-2)]"
          >
            <div className="tabular-nums text-[var(--arca-ink-3)]">
              {l.code}
            </div>
            <div className="text-[var(--arca-ink)] truncate">{l.name}</div>
            <div className="text-[11.5px] text-[var(--arca-ink-2)]">
              {l.isOpening ? (
                <span className="px-1.5 py-px rounded-full bg-[var(--arca-surface-2)] text-[10px] font-medium">
                  Apertura
                </span>
              ) : (
                periodLabel(l.year, l.month)
              )}
            </div>
            <div className="text-right tabular-nums text-[var(--arca-ink-2)]">
              {fmtMoney(l.historical)}
            </div>
            <div className="text-right tabular-nums text-[var(--arca-ink-3)]">
              {fmtCoef(l.coefficient)}
            </div>
            <div className="text-right tabular-nums text-[var(--arca-ink)]">
              {fmtMoney(l.adjusted)}
            </div>
            <div className="text-right tabular-nums text-[var(--arca-ink)]">
              {fmtMoney(l.difference)}
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 text-[11.5px] text-[var(--arca-ink-3)] border-t border-[var(--arca-border)]">
        {rows.length} fila{rows.length === 1 ? '' : 's'} · ajustado = histórico
        × coeficiente
      </div>
    </>
  );
}

function AsientoTable({
  rows,
}: {
  rows: InflationAdjustmentPreview['entryLines'];
}) {
  if (rows.length === 0) return <Empty />;
  const debit = rows.reduce((s, l) => s + l.debit, 0);
  const credit = rows.reduce((s, l) => s + l.credit, 0);
  return (
    <>
      <HeadRow
        cols="grid-cols-[90px_1fr_160px_160px]"
        labels={['Código', 'Cuenta', 'Debe', 'Haber']}
        align={[false, false, true, true]}
      />
      {rows.map((l, i) => (
        <div
          key={`${l.accountId}-${i}`}
          className="grid grid-cols-[90px_1fr_160px_160px] gap-3 px-5 py-2 border-b border-[var(--arca-border)] text-[12.5px] items-center"
        >
          <div className="tabular-nums text-[var(--arca-ink-3)]">{l.code}</div>
          <div className="text-[var(--arca-ink)] truncate">{l.name}</div>
          <div className="text-right tabular-nums text-[var(--arca-ink)]">
            {l.debit ? fmtMoney(l.debit) : ''}
          </div>
          <div className="text-right tabular-nums text-[var(--arca-ink)]">
            {l.credit ? fmtMoney(l.credit) : ''}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[90px_1fr_160px_160px] gap-3 px-5 py-2.5 text-[12.5px] font-semibold bg-[var(--arca-surface-2)]">
        <div />
        <div className="flex items-center gap-1.5 text-[var(--arca-ink)]">
          <Layers className="w-3.5 h-3.5" strokeWidth={2} />
          Totales
        </div>
        <div className="text-right tabular-nums">{fmtMoney(debit)}</div>
        <div className="text-right tabular-nums">{fmtMoney(credit)}</div>
      </div>
    </>
  );
}

function CoeficientesTable({
  rows,
  closing,
}: {
  rows: InflationAdjustmentPreview['coefficients'];
  closing: { year: number; month: number };
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <>
      <HeadRow
        cols="grid-cols-[1fr_180px_180px]"
        labels={['Período', 'Índice', 'Coeficiente']}
        align={[false, true, true]}
      />
      {rows.map((c) => {
        const isClosing = c.year === closing.year && c.month === closing.month;
        return (
          <div
            key={`${c.year}-${c.month}`}
            className="grid grid-cols-[1fr_180px_180px] gap-3 px-5 py-2 border-b border-[var(--arca-border)] text-[12.5px] items-center"
          >
            <div className="text-[var(--arca-ink)] flex items-center gap-1.5">
              {periodLabel(c.year, c.month)}
              {isClosing && (
                <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--arca-navy-900)] text-white font-semibold">
                  cierre
                </span>
              )}
            </div>
            <div className="text-right tabular-nums text-[var(--arca-ink-2)]">
              {fmtCoef(c.index)}
            </div>
            <div className="text-right tabular-nums font-medium text-[var(--arca-ink)]">
              {fmtCoef(c.coefficient)}
            </div>
          </div>
        );
      })}
      <div className="px-5 py-2.5 text-[11.5px] text-[var(--arca-ink-3)]">
        Serie FACPCE — Índice RT 6 (Res. JG 539/18). Coeficiente = índice de
        cierre ÷ índice del mes.
      </div>
    </>
  );
}

/* ─────────────────────────── Piezas chicas ─────────────────────────── */

function HeadRow({
  cols,
  labels,
  align,
}: {
  cols: string;
  labels: string[];
  align: boolean[];
}) {
  return (
    <div
      className={`grid ${cols} gap-3 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide`}
    >
      {labels.map((l, i) => (
        <div key={l} className={align[i] ? 'text-right' : ''}>
          {l}
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
      No hay filas para los filtros seleccionados.
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'flat',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'pos' | 'neg' | 'flat';
}) {
  const color =
    tone === 'neg'
      ? 'var(--arca-accent-neg)'
      : tone === 'pos'
        ? 'var(--arca-accent-pos)'
        : 'var(--arca-ink)';
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--arca-ink-3)] font-semibold">
        {label}
      </div>
      <div className="text-[12.5px] tabular-nums font-medium" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="text-[10.5px] text-[var(--arca-ink-3)]">{hint}</div>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'warn' | 'error' | 'info';
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'error'
      ? { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' }
      : tone === 'warn'
        ? { bg: '#fffbeb', border: '#fde68a', fg: '#b45309' }
        : {
            bg: 'var(--arca-surface-2)',
            border: 'var(--arca-border)',
            fg: 'var(--arca-ink-2)',
          };
  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-[12px] border text-[12.5px]"
      style={{
        background: styles.bg,
        borderColor: styles.border,
        color: styles.fg,
      }}
    >
      <Icon className="w-4 h-4 mt-px shrink-0" strokeWidth={1.9} />
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
