'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileText,
  AlertCircle,
  Users,
  Hash,
  Building2,
  RefreshCw,
  TriangleAlert,
  Pencil,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  previewLsd,
  generarArchivoLsd,
  validarLsd,
  getParametrosPeriodo,
  upsertParametrosPeriodo,
  updateReciboLsdOverrides,
} from '@/actions/sueldos';
import { legajoParaMostrar } from '@/lib/legajo';

interface SueldosCargasProps {
  clientId: string;
  profileId: string;
}

const MONTHS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

function getPeriodoDefecto(): { year: string; month: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
  };
}

function getYearOptions(): string[] {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1].map(String);
}

function formatPesos(value: string | number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(parseFloat(String(value)));
}

// ─── Widget: Tope imponible ──────────────────────────────────────────────────

function TopeImponibleWidget({
  clientId,
  profileId,
  periodo,
}: {
  clientId: string;
  profileId: string;
  periodo: string;
}) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [topeInput, setTopeInput] = useState('');

  const { data: params, isLoading } = useQuery({
    queryKey: ['parametros-periodo', periodo],
    queryFn: () => getParametrosPeriodo({ data: { periodo } }),
    enabled: !!(clientId && profileId),
  });

  const { mutate: guardarTope, isPending: guardando } = useMutation({
    mutationFn: () =>
      upsertParametrosPeriodo({
        data: { periodo, topeMaximoImponible: topeInput },
      }),
    onSuccess: () => {
      toast.success('Tope imponible guardado');
      setEditando(false);
      setTopeInput('');
      queryClient.invalidateQueries({ queryKey: ['parametros-periodo', periodo] });
      queryClient.invalidateQueries({ queryKey: ['lsd-validacion', profileId, periodo] });
    },
    onError: (err) => {
      toast.error(`Error al guardar: ${(err as Error).message}`);
    },
  });

  const iniciarEdicion = () => {
    setTopeInput(params?.topeMaximoImponible ?? '');
    setEditando(true);
  };

  const cancelar = () => {
    setEditando(false);
    setTopeInput('');
  };

  const confirmar = () => {
    const val = parseFloat(topeInput.replace(/[.,\s]/g, (c) => (c === ',' ? '.' : '')));
    if (isNaN(val) || val <= 0) {
      toast.error('Ingresá un monto válido mayor a cero');
      return;
    }
    guardarTope();
  };

  if (isLoading) return null;

  // Tope ya cargado
  if (params && !editando) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-[var(--arca-r-md)] text-[13px]"
        style={{
          background: 'var(--arca-surface)',
          border: '1px solid var(--arca-border)',
        }}
      >
        <TrendingUp className="h-4 w-4 text-[var(--arca-ink-3)] shrink-0" />
        <div className="flex-1">
          <span className="text-[var(--arca-ink-2)]">Tope máximo imponible</span>
          <span className="ml-2 font-semibold font-mono text-[var(--arca-ink)]">
            {formatPesos(params.topeMaximoImponible)}
          </span>
          {params.actualizadoPorCron ? (
            <span className="ml-2 text-[11px] text-[var(--arca-ink-3)]">
              (actualizado automáticamente)
            </span>
          ) : (
            <span className="ml-2 text-[11px] text-[var(--arca-ink-3)]">
              (cargado manualmente)
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-[12px] text-[var(--arca-ink-2)]"
          onClick={iniciarEdicion}
        >
          <Pencil className="h-3 w-3" />
          Editar
        </Button>
      </div>
    );
  }

  // Sin tope o editando
  const esFaltante = !params && !editando;

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[var(--arca-r-md)] text-[13px]"
      style={
        esFaltante
          ? {
              background: 'var(--arca-warning-bg, #fffbeb)',
              border: '1px solid var(--arca-warning-border, #fde68a)',
            }
          : {
              background: 'var(--arca-surface)',
              border: '1px solid var(--arca-border)',
            }
      }
    >
      <div className="flex items-start gap-2.5">
        {esFaltante ? (
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        ) : (
          <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-[var(--arca-ink-3)]" />
        )}
        <div>
          <p
            className="font-medium"
            style={{ color: esFaltante ? 'var(--arca-warning-text, #92400e)' : 'var(--arca-ink)' }}
          >
            {esFaltante
              ? `No hay tope imponible cargado para ${periodo}`
              : 'Editar tope máximo imponible'}
          </p>
          {esFaltante && (
            <p className="text-[12px] mt-0.5 text-amber-700 opacity-90">
              Sin este dato, las bases imponibles del Record 04 se calculan incorrectamente. Ingresá
              el valor publicado por ANSES para este período.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-6 sm:ml-7">
        <Input
          type="text"
          inputMode="numeric"
          placeholder="Ej: 1357033"
          className="h-8 w-48 text-[13px] font-mono"
          value={topeInput}
          onChange={(e) => setTopeInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirmar()}
          autoFocus
        />
        <Button size="sm" className="h-8 text-[13px]" onClick={confirmar} disabled={guardando}>
          {guardando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
        </Button>
        {params && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[13px]"
            onClick={cancelar}
            disabled={guardando}
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Panel de validación ─────────────────────────────────────────────────────

function ValidacionPanel({
  clientId,
  profileId,
  periodo,
}: {
  clientId: string;
  profileId: string;
  periodo: string;
}) {
  const { data: validacion, isLoading } = useQuery({
    queryKey: ['lsd-validacion', profileId, periodo],
    queryFn: () => validarLsd({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  if (isLoading || !validacion) return null;

  const errores = validacion.issues.filter((i) => i.tipo === 'error');
  const warnings = validacion.issues.filter((i) => i.tipo === 'warning');

  if (errores.length === 0 && warnings.length === 0) return null;

  return (
    <div
      className="rounded-[var(--arca-r-md)] overflow-hidden"
      style={{ border: '1px solid var(--arca-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: 'var(--arca-surface-2, var(--arca-surface))' }}
      >
        <ShieldAlert className="h-4 w-4 text-[var(--arca-ink-3)]" />
        <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--arca-ink-2)]">
          Verificación pre-descarga
        </span>
        {errores.length > 0 ? (
          <Badge variant="destructive" className="ml-auto text-[11px]">
            {errores.length} error{errores.length > 1 ? 'es' : ''}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="ml-auto text-[11px] text-amber-700 border-amber-300 bg-amber-50"
          >
            {warnings.length} aviso{warnings.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Issues */}
      <div className="divide-y" style={{ borderColor: 'var(--arca-border)' }}>
        {errores.map((issue, i) => (
          <IssueRow key={i} issue={issue} />
        ))}
        {warnings.map((issue, i) => (
          <IssueRow key={`w${i}`} issue={issue} />
        ))}
      </div>
    </div>
  );
}

function IssueRow({
  issue,
}: {
  issue: {
    tipo: 'error' | 'warning';
    codigo: string;
    mensaje: string;
    empleadoCuil?: string;
    empleadoNombre?: string;
  };
}) {
  const isError = issue.tipo === 'error';
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      {isError ? (
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
      ) : (
        <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
      )}
      <div className="flex-1 min-w-0">
        {issue.empleadoNombre && (
          <p className="text-[12px] font-medium text-[var(--arca-ink)] truncate">
            {issue.empleadoNombre}
            <span className="ml-1.5 font-mono font-normal text-[var(--arca-ink-3)]">
              {issue.empleadoCuil}
            </span>
          </p>
        )}
        <p className="text-[12px] text-[var(--arca-ink-2)]">{issue.mensaje}</p>
      </div>
    </div>
  );
}

// ─── Dialog overrides LSD ────────────────────────────────────────────────────

type OverrideRow = {
  reciboId: string;
  empleadoNombre: string;
  rem4y8Override: string | null;
  rem9Override: string | null;
  contribucionAdicionalOS: string | null;
  importeADetraerLey27430: string | null;
  importeMaternidadArt13: string | null;
};

function LsdOverridesDialog({
  clientId,
  profileId,
  row,
  onClose,
}: {
  clientId: string;
  profileId: string;
  row: OverrideRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rem4y8, setRem4y8] = useState(row.rem4y8Override ?? '');
  const [rem9, setRem9] = useState(row.rem9Override ?? '');
  const [aporteOS, setAporteOS] = useState(row.contribucionAdicionalOS ?? '');
  const [detraer, setDetraer] = useState(row.importeADetraerLey27430 ?? '');
  const [maternidad, setMaternidad] = useState(row.importeMaternidadArt13 ?? '');

  const parseMonto = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return isNaN(v) ? null : v;
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      updateReciboLsdOverrides({
        data: {
          clientId,
          profileId,
          reciboId: row.reciboId,
          rem4y8Override: rem4y8 === '' ? null : parseMonto(rem4y8),
          rem9Override: rem9 === '' ? null : parseMonto(rem9),
          contribucionAdicionalOS: aporteOS === '' ? null : parseMonto(aporteOS),
          importeADetraerLey27430: detraer === '' ? null : parseMonto(detraer),
          importeMaternidadArt13: maternidad === '' ? null : parseMonto(maternidad),
        },
      }),
    onSuccess: () => {
      toast.success('Campos LSD actualizados');
      queryClient.invalidateQueries({ queryKey: ['lsd-preview'] });
      queryClient.invalidateQueries({ queryKey: ['lsd-validacion'] });
      onClose();
    },
    onError: (err) => toast.error(`Error: ${(err as Error).message}`),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Bases LSD — {row.empleadoNombre}</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-[var(--arca-ink-3)] -mt-2">
          Dejá en blanco para usar la remuneración bruta del recibo como base.
        </p>
        <div className="space-y-3 pt-1">
          {[
            { label: 'Base OS aportes y contrib (rem4y8)', value: rem4y8, set: setRem4y8, hint: 'B4 y B8 en el LSD' },
            { label: 'Base ART (rem9)', value: rem9, set: setRem9, hint: 'B9 en el LSD' },
            { label: 'Remuneración maternidad Art. 13 LRT', value: maternidad, set: setMaternidad, hint: 'Campo remunMaternidad' },
            { label: 'Contribución adicional OS', value: aporteOS, set: setAporteOS, hint: 'Campo aporteAdicOS' },
            { label: 'Importe a detraer Ley 27.430', value: detraer, set: setDetraer, hint: 'Campo detraer27430' },
          ].map(({ label, value, set, hint }) => (
            <div key={label} className="space-y-1">
              <Label className="text-[12px]">{label}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Sin override (usa bruta)"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="h-8 text-[13px]"
              />
              <p className="text-[11px] text-[var(--arca-ink-3)]">{hint}</p>
            </div>
          ))}
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => mutate()} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function SueldosCargas({ clientId, profileId }: SueldosCargasProps) {
  const def = getPeriodoDefecto();
  const [year, setYear] = useState(def.year);
  const [month, setMonth] = useState(def.month);
  const [editingOverride, setEditingOverride] = useState<OverrideRow | null>(null);

  const periodo = `${year}-${month}`;

  const { data: preview, isLoading, error, refetch } = useQuery({
    queryKey: ['lsd-preview', profileId, periodo],
    queryFn: () => previewLsd({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  const { data: validacion } = useQuery({
    queryKey: ['lsd-validacion', profileId, periodo],
    queryFn: () => validarLsd({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  const { mutate: descargarLsd, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      generarArchivoLsd({ data: { clientId, profileId, periodo } }),
    onSuccess: (result) => {
      const blob = new Blob([result.contenido], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Archivo generado: ${result.empleados} empleados, ${result.conceptos} conceptos`
      );
    },
    onError: (err) => {
      toast.error(`Error al generar LSD: ${(err as Error).message}`);
    },
  });

  const hasData = preview && preview.empleados.length > 0;
  const puedeDescargar = validacion?.puedeDescargar !== false;

  return (
    <div className="space-y-4">
      {/* Selector de período */}
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[var(--arca-r-lg)]"
        style={{
          background: 'var(--arca-surface)',
          border: '1px solid var(--arca-border)',
        }}
      >
        <span className="text-[13px] font-medium text-[var(--arca-ink-2)] min-w-max">
          Período a presentar
        </span>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[150px] h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-[13px]">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getYearOptions().map((y) => (
                <SelectItem key={y} value={y} className="text-[13px]">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {hasData && (
          <div className="sm:ml-auto flex items-center gap-2">
            {puedeDescargar ? (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-[13px]"
                onClick={() => descargarLsd()}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {isGenerating ? 'Generando…' : 'Descargar LSD'}
              </Button>
            ) : (
              <Button size="sm" className="h-8 gap-1.5 text-[13px]" disabled>
                <AlertCircle className="h-3.5 w-3.5" />
                Corrija los errores para descargar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tope imponible */}
      <TopeImponibleWidget clientId={clientId} profileId={profileId} periodo={periodo} />

      {/* Panel de validación */}
      <ValidacionPanel clientId={clientId} profileId={profileId} periodo={periodo} />

      {/* Error de carga */}
      {error && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-[var(--arca-r-md)] text-[13px]"
          style={{
            background: 'var(--arca-surface)',
            border: '1px solid var(--arca-border)',
          }}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
          <p className="text-[var(--arca-ink-2)]">{(error as Error).message}</p>
        </div>
      )}

      {/* Stats cards */}
      {preview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Building2 className="h-4 w-4" />}
            label="Empresa"
            value={preview.employer.cuit}
            sub={preview.employer.nombre}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="Tipo empleador"
            value={preview.employer.codigoLsd ?? '—'}
            sub={preview.employer.tipoEmpresaNombre ?? 'Sin configurar'}
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Empleados"
            value={String(preview.empleados.length)}
            sub={`${MONTHS.find((m) => m.value === month)?.label} ${year}`}
          />
          <StatCard
            icon={<Hash className="h-4 w-4" />}
            label="Conceptos"
            value={String(preview.conceptos)}
            sub="líneas en el archivo"
          />
        </div>
      )}

      {/* Tabla de empleados — cargando */}
      {isLoading && (
        <div
          className="flex items-center justify-center py-12 rounded-[var(--arca-r-lg)]"
          style={{
            background: 'var(--arca-surface)',
            border: '1px solid var(--arca-border)',
          }}
        >
          <RefreshCw className="h-5 w-5 animate-spin text-[var(--arca-ink-3)]" />
        </div>
      )}

      {/* Tabla de empleados — sin datos */}
      {!isLoading && preview && preview.empleados.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-14 text-center rounded-[var(--arca-r-lg)]"
          style={{
            background: 'var(--arca-surface)',
            border: '1px solid var(--arca-border)',
          }}
        >
          <FileText className="h-8 w-8 text-[var(--arca-ink-3)] mb-3" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-[var(--arca-ink)]">
            Sin recibos para este período
          </p>
          <p className="text-[13px] text-[var(--arca-ink-3)] mt-1">
            No hay recibos cargados para{' '}
            {MONTHS.find((m) => m.value === month)?.label} {year}.
          </p>
        </div>
      )}

      {/* Tabla de empleados — con datos */}
      {!isLoading && preview && preview.empleados.length > 0 && (
        <div
          className="rounded-[var(--arca-r-lg)] overflow-hidden"
          style={{ border: '1px solid var(--arca-border)' }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[12px]">Legajo</TableHead>
                <TableHead className="text-[12px]">Empleado</TableHead>
                <TableHead className="text-[12px]">CUIL</TableHead>
                <TableHead className="text-[12px]">Situación revista</TableHead>
                <TableHead className="text-[12px]">Modalidad contratación</TableHead>
                <TableHead className="text-[12px] text-right">Días trab.</TableHead>
                <TableHead className="text-[12px] text-right">Conceptos</TableHead>
                <TableHead className="text-[12px]">Origen</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.empleados.map((emp) => {
                const tieneError =
                  validacion?.issues.some(
                    (i) => i.tipo === 'error' && i.empleadoCuil === emp.empleadoCuil
                  ) ?? false;
                return (
                  <TableRow
                    key={emp.reciboId}
                    className={tieneError ? 'bg-red-50/50' : undefined}
                  >
                    <TableCell className="text-[13px] font-mono">
                      {legajoParaMostrar(emp.empleadoLegajo)}
                    </TableCell>
                    <TableCell className="text-[13px] font-medium">
                      {emp.empleadoNombre}
                    </TableCell>
                    <TableCell className="text-[13px] font-mono text-[var(--arca-ink-2)]">
                      {emp.empleadoCuil}
                    </TableCell>
                    <TableCell>
                      {emp.situacionCodigo ? (
                        <span className="text-[12px] font-mono text-[var(--arca-ink-2)]">
                          {emp.situacionCodigo} — {emp.situacionNombre}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-amber-600">
                          <TriangleAlert className="h-3 w-3" />
                          Sin situación
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {emp.modalidadCodigo ? (
                        <span className="text-[12px] font-mono text-[var(--arca-ink-2)]">
                          {emp.modalidadCodigo} — {emp.modalidadNombre}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-amber-600">
                          <TriangleAlert className="h-3 w-3" />
                          Sin modalidad
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-right tabular-nums text-[var(--arca-ink-2)]">
                      {emp.diasTrabajados ?? '—'}
                    </TableCell>
                    <TableCell className="text-[13px] text-right tabular-nums font-medium">
                      {emp.cantidadConceptos}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {emp.origen}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-8 pr-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title="Editar bases LSD"
                        onClick={() =>
                          setEditingOverride({
                            reciboId: emp.reciboId,
                            empleadoNombre: emp.empleadoNombre,
                            rem4y8Override: emp.rem4y8Override,
                            rem9Override: emp.rem9Override,
                            contribucionAdicionalOS: emp.contribucionAdicionalOS,
                            importeADetraerLey27430: emp.importeADetraerLey27430,
                            importeMaternidadArt13: emp.importeMaternidadArt13,
                          })
                        }
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editingOverride && (
        <LsdOverridesDialog
          clientId={clientId}
          profileId={profileId}
          row={editingOverride}
          onClose={() => setEditingOverride(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 p-4 rounded-[var(--arca-r-lg)]"
      style={{
        background: 'var(--arca-surface)',
        border: '1px solid var(--arca-border)',
      }}
    >
      <div className="flex items-center gap-1.5 text-[var(--arca-ink-3)]">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[18px] font-semibold text-[var(--arca-ink)] font-mono leading-tight">
        {value}
      </p>
      <p className="text-[11px] text-[var(--arca-ink-3)] truncate">{sub}</p>
    </div>
  );
}
