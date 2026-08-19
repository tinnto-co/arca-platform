'use client';

import { useState, useMemo } from 'react';
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
  Upload,
  Filter,
  Settings,
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  previewLsd,
  generarArchivoLsd,
  validarLsd,
  updateReciboLsdOverrides,
  listLsdPresentaciones,
  getLsdPresentacionContenido,
  generarConceptosLsd,
} from '@/actions/sueldos';
import { legajoParaMostrar } from '@/lib/legajo';
import { EmpleadorConfigDialog } from '@/components/sueldos/EmpleadorConfigDialog';

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

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function triggerDownload(contenido: string, filename: string) {
  const blob = new Blob([contenido], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

interface OverrideRow {
  reciboId: string;
  empleadoNombre: string;
  rem4y8Override: string | null;
  rem9Override: string | null;
  rem4y8Sugerido: string | null;
  rem9Sugerido: string | null;
  contribucionAdicionalOS: string | null;
  importeADetraerLey27430: string | null;
  importeMaternidadArt13: string | null;
}

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
  const [rem4y8, setRem4y8] = useState(row.rem4y8Override ?? row.rem4y8Sugerido ?? '');
  const [rem9, setRem9] = useState(row.rem9Override ?? row.rem9Sugerido ?? '');
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
    onError: (err) => toast.error(`Error: ${(err).message}`),
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

// ─── Historial de presentaciones ─────────────────────────────────────────────

function HistorialPresentaciones({
  clientId,
  profileId,
  periodo,
}: {
  clientId: string;
  profileId: string;
  periodo: string;
}) {
  const [reDescargando, setReDescargando] = useState<string | null>(null);

  const { data: presentaciones = [], isLoading } = useQuery({
    queryKey: ['lsd-presentaciones', profileId, periodo],
    queryFn: () => listLsdPresentaciones({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  const handleReDescargar = async (id: string) => {
    setReDescargando(id);
    try {
      const pres = await getLsdPresentacionContenido({
        data: { clientId, profileId, presentacionId: id },
      });
      triggerDownload(pres.contenido, pres.filename);
      toast.success(`Presentación nro ${pres.nroPresentacion} descargada`);
    } catch (err) {
      toast.error(`Error al descargar: ${(err as Error).message}`);
    } finally {
      setReDescargando(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-4 w-4 animate-spin text-[var(--arca-ink-3)]" />
      </div>
    );
  }

  if (presentaciones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Upload className="h-7 w-7 text-[var(--arca-ink-3)] mb-3" strokeWidth={1.5} />
        <p className="text-[13px] font-medium text-[var(--arca-ink)]">
          Sin presentaciones para este período
        </p>
        <p className="text-[12px] text-[var(--arca-ink-3)] mt-1">
          Prepará y generá la primera presentación en la sección siguiente.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[12px] w-16">Nro</TableHead>
          <TableHead className="text-[12px]">Tipo</TableHead>
          <TableHead className="text-[12px]">Fecha y hora</TableHead>
          <TableHead className="text-[12px] text-right">Empleados</TableHead>
          <TableHead className="text-[12px] text-right">Conceptos</TableHead>
          <TableHead className="text-[12px]">Archivo</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {presentaciones.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="text-[13px] font-mono font-semibold">
              {p.nroPresentacion}
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={
                  p.nroPresentacion === 1
                    ? 'text-[11px] text-emerald-700 border-emerald-300 bg-emerald-50'
                    : 'text-[11px] text-amber-700 border-amber-300 bg-amber-50'
                }
              >
                {p.nroPresentacion === 1 ? 'Original' : 'Rectificativa'}
              </Badge>
            </TableCell>
            <TableCell className="text-[13px] text-[var(--arca-ink-2)] tabular-nums">
              {formatDateTime(p.generadoEn)}
            </TableCell>
            <TableCell className="text-[13px] text-right tabular-nums text-[var(--arca-ink-2)]">
              {p.empleados}
            </TableCell>
            <TableCell className="text-[13px] text-right tabular-nums text-[var(--arca-ink-2)]">
              {p.conceptos}
            </TableCell>
            <TableCell className="text-[12px] font-mono text-[var(--arca-ink-3)] truncate max-w-[200px]">
              {p.filename}
            </TableCell>
            <TableCell className="w-10 pr-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Re-descargar archivo"
                disabled={reDescargando === p.id}
                onClick={() => handleReDescargar(p.id)}
              >
                {reDescargando === p.id ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Dialog: Generar presentación ────────────────────────────────────────────

function GenerarPresentacionDialog({
  clientId,
  profileId,
  periodo,
  nroPresentacion,
  onClose,
}: {
  clientId: string;
  profileId: string;
  periodo: string;
  nroPresentacion: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingOverride, setEditingOverride] = useState<OverrideRow | null>(null);
  const [selectedCuils, setSelectedCuils] = useState<Set<string> | null>(null);
  const [showEmpleadorConfig, setShowEmpleadorConfig] = useState(false);

  const { data: preview, isLoading: loadingPreview, error } = useQuery({
    queryKey: ['lsd-preview', profileId, periodo],
    queryFn: () => previewLsd({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  const allCuils = useMemo(
    () => preview?.empleados.map((e) => e.empleadoCuil) ?? [],
    [preview]
  );

  const effectiveCuils = selectedCuils ?? new Set(allCuils);
  const allSelected = effectiveCuils.size === allCuils.length;
  const someSelected = effectiveCuils.size > 0 && !allSelected;
  const isFiltered = selectedCuils !== null && selectedCuils.size < allCuils.length;

  const toggleCuil = (cuil: string) => {
    const next = new Set(effectiveCuils);
    if (next.has(cuil)) next.delete(cuil);
    else next.add(cuil);
    setSelectedCuils(next);
  };

  const toggleAll = () => {
    if (allSelected) setSelectedCuils(new Set());
    else setSelectedCuils(null);
  };

  const { data: validacion } = useQuery({
    queryKey: ['lsd-validacion', profileId, periodo],
    queryFn: () => validarLsd({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  const { mutate: generar, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      generarArchivoLsd({
        data: {
          clientId,
          profileId,
          periodo,
          cuils: isFiltered ? [...effectiveCuils] : undefined,
        },
      }),
    onSuccess: (result) => {
      triggerDownload(result.contenido, result.filename);
      toast.success(
        `Presentación nro ${result.nroPresentacion} generada — ${result.empleados} empleados, ${result.conceptos} conceptos`
      );
      queryClient.invalidateQueries({ queryKey: ['lsd-presentaciones', profileId, periodo] });
      onClose();
    },
    onError: (err) => {
      toast.error(`Error al generar LSD: ${(err).message}`);
    },
  });

  const { mutate: generarConceptos, isPending: isGeneratingConceptos } = useMutation({
    mutationFn: () => generarConceptosLsd({ data: { clientId, profileId, periodo } }),
    onSuccess: (result) => {
      triggerDownload(result.contenido, result.filename);
      toast.success(`Conceptos LSD descargados — ${result.conceptos} conceptos`);
    },
    onError: (err) => {
      toast.error(`Error al generar conceptos: ${(err).message}`);
    },
  });

  const hasData = preview && preview.empleados.length > 0;
  const puedeDescargar = validacion?.puedeDescargar !== false && effectiveCuils.size > 0;

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-[15px]">
              Generar presentación
              {nroPresentacion > 1 && (
                <span className="ml-2 text-[13px] font-normal text-amber-600">(rectificativa)</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Panel de validación */}
            <ValidacionPanel clientId={clientId} profileId={profileId} periodo={periodo} />

            {/* Error de carga */}
            {error && (
              <div
                className="flex items-start gap-3 p-3.5 rounded-[var(--arca-r-md)] text-[13px]"
                style={{ background: 'var(--arca-surface)', border: '1px solid var(--arca-border)' }}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
                <p className="text-[var(--arca-ink-2)]">{(error).message}</p>
              </div>
            )}

            {/* Stats */}
            {preview && (
              <div className="grid grid-cols-4 gap-3">
                <StatCard icon={<Building2 className="h-4 w-4" />} label="Empresa" value={preview.employer.cuit} sub={preview.employer.nombre} />
                {/* Tipo empleador con botón de configuración */}
                <div
                  className="flex flex-col gap-1.5 p-4 rounded-[var(--arca-r-lg)] relative group"
                  style={{ background: 'var(--arca-surface)', border: '1px solid var(--arca-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[var(--arca-ink-3)]">
                      <FileText className="h-4 w-4" />
                      <span className="text-[11px] font-medium uppercase tracking-wide">Tipo empleador</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmpleadorConfig(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
                      title="Editar configuración de empleador"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-[18px] font-semibold text-[var(--arca-ink)] font-mono leading-tight">
                    {preview.employer.codigoLsd ?? '—'}
                  </p>
                  <p className={`text-[11px] truncate ${!preview.employer.tipoEmpresaNombre ? 'text-amber-500' : 'text-[var(--arca-ink-3)]'}`}>
                    {preview.employer.tipoEmpresaNombre ?? 'Sin configurar'}
                  </p>
                </div>
                <StatCard icon={<Users className="h-4 w-4" />} label="Empleados" value={String(isFiltered ? effectiveCuils.size : preview.empleados.length)} sub={isFiltered ? `de ${preview.empleados.length} en el período` : 'en este período'} />
                <StatCard icon={<Hash className="h-4 w-4" />} label="Conceptos" value={String(preview.conceptos)} sub="líneas en el archivo" />
              </div>
            )}

            <EmpleadorConfigDialog
              open={showEmpleadorConfig}
              onOpenChange={setShowEmpleadorConfig}
              clientId={profileId}
              empresaNombre={preview?.employer.nombre ?? ''}
            />

            {/* Loading */}
            {loadingPreview && (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-4 w-4 animate-spin text-[var(--arca-ink-3)]" />
              </div>
            )}

            {/* Tabla de empleados */}
            {!loadingPreview && hasData && (
              <div className="rounded-[var(--arca-r-md)] overflow-hidden" style={{ border: '1px solid var(--arca-border)' }}>
                {/* Barra de selección */}
                <div
                  className="flex items-center gap-3 px-3 py-2 border-b text-[12px]"
                  style={{ borderColor: 'var(--arca-border)', background: 'var(--arca-surface)' }}
                >
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-[var(--arca-ink-2)]">
                    {isFiltered ? (
                      <>
                        <span className="font-medium text-[var(--arca-ink)]">{effectiveCuils.size}</span>
                        <span> de {allCuils.length} empleados seleccionados</span>
                      </>
                    ) : (
                      `Todos los empleados seleccionados (${allCuils.length})`
                    )}
                  </span>
                  {isFiltered && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Filter className="h-3 w-3" />
                      Rectificativa parcial
                    </span>
                  )}
                  {isFiltered && (
                    <button
                      className="ml-auto text-[11px] underline text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
                      onClick={() => setSelectedCuils(null)}
                    >
                      Seleccionar todos
                    </button>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="text-[12px]">Legajo</TableHead>
                      <TableHead className="text-[12px]">Empleado</TableHead>
                      <TableHead className="text-[12px]">CUIL</TableHead>
                      <TableHead className="text-[12px] max-w-[180px]">Situación revista</TableHead>
                      <TableHead className="text-[12px] w-28">Modalidad</TableHead>
                      <TableHead className="text-[12px] text-right">Días</TableHead>
                      <TableHead className="text-[12px] text-right">Conceptos</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.empleados.map((emp) => {
                      const tieneError =
                        validacion?.issues.some(
                          (i) => i.tipo === 'error' && i.empleadoCuil === emp.empleadoCuil
                        ) ?? false;
                      const checked = effectiveCuils.has(emp.empleadoCuil);
                      return (
                        <TableRow
                          key={emp.reciboId}
                          className={!checked ? 'opacity-40' : tieneError ? 'bg-red-50/50' : undefined}
                        >
                          <TableCell className="w-8 pl-3 pr-0">
                            <Checkbox checked={checked} onCheckedChange={() => toggleCuil(emp.empleadoCuil)} />
                          </TableCell>
                          <TableCell className="text-[13px] font-mono">{legajoParaMostrar(emp.empleadoLegajo)}</TableCell>
                          <TableCell className="text-[13px] font-medium">{emp.empleadoNombre}</TableCell>
                          <TableCell className="text-[13px] font-mono text-[var(--arca-ink-2)]">{emp.empleadoCuil}</TableCell>
                          <TableCell className="max-w-[180px]">
                            {emp.situacionCodigo ? (
                              <span className="text-[12px] font-mono text-[var(--arca-ink-2)] block truncate" title={`${emp.situacionCodigo} — ${emp.situacionNombre}`}>
                                {emp.situacionCodigo} — {emp.situacionNombre}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[12px] text-amber-600"><TriangleAlert className="h-3 w-3" />Sin situación</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {emp.modalidadCodigo ? (
                              <span className="text-[12px] font-mono text-[var(--arca-ink-2)]">{emp.modalidadCodigo}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[12px] text-amber-600"><TriangleAlert className="h-3 w-3" />Sin modalidad</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[13px] text-right tabular-nums text-[var(--arca-ink-2)]">{emp.diasTrabajados ?? '—'}</TableCell>
                          <TableCell className="text-[13px] text-right tabular-nums font-medium">{emp.cantidadConceptos}</TableCell>
                          <TableCell className="w-8 pr-2">
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6" title="Editar bases LSD" tabIndex={-1}
                              onClick={() => setEditingOverride({
                                reciboId: emp.reciboId,
                                empleadoNombre: emp.empleadoNombre,
                                rem4y8Override: emp.rem4y8Override,
                                rem9Override: emp.rem9Override,
                                rem4y8Sugerido: emp.rem4y8Sugerido ?? null,
                                rem9Sugerido: emp.rem9Sugerido ?? null,
                                contribucionAdicionalOS: emp.contribucionAdicionalOS,
                                importeADetraerLey27430: emp.importeADetraerLey27430,
                                importeMaternidadArt13: emp.importeMaternidadArt13,
                              })}
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

            {!loadingPreview && preview && preview.empleados.length === 0 && (
              <div
                className="flex flex-col items-center justify-center py-10 text-center rounded-[var(--arca-r-md)]"
                style={{ background: 'var(--arca-surface)', border: '1px solid var(--arca-border)' }}
              >
                <FileText className="h-7 w-7 text-[var(--arca-ink-3)] mb-2" strokeWidth={1.5} />
                <p className="text-[13px] text-[var(--arca-ink)]">Sin recibos confirmados para este período</p>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t" style={{ borderColor: 'var(--arca-border)' }}>
            <Button variant="outline" onClick={() => generarConceptos()} disabled={isGeneratingConceptos} className="gap-2 mr-auto">
              {isGeneratingConceptos ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isGeneratingConceptos ? 'Generando…' : 'Descargar Conceptos LSD'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            {puedeDescargar ? (
              <Button onClick={() => generar()} disabled={isGenerating || !hasData} className="gap-2">
                {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isGenerating
                  ? 'Generando…'
                  : isFiltered
                  ? `Generar presentación (${effectiveCuils.size} empleados)`
                  : 'Generar presentación'}
              </Button>
            ) : (
              <Button disabled className="gap-2">
                <AlertCircle className="h-4 w-4" />
                {effectiveCuils.size === 0 ? 'Seleccioná al menos un empleado' : 'Corrija los errores para continuar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingOverride && (
        <LsdOverridesDialog
          clientId={clientId}
          profileId={profileId}
          row={editingOverride}
          onClose={() => setEditingOverride(null)}
        />
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function SueldosCargas({ clientId, profileId }: SueldosCargasProps) {
  const def = getPeriodoDefecto();
  const [year, setYear] = useState(def.year);
  const [month, setMonth] = useState(def.month);
  const [showGenerarDialog, setShowGenerarDialog] = useState(false);

  const periodo = `${year}-${month}`;
  const mesNombre = MONTHS.find((m) => m.value === month)?.label ?? '';

  const { data: presentaciones = [] } = useQuery({
    queryKey: ['lsd-presentaciones', profileId, periodo],
    queryFn: () => listLsdPresentaciones({ data: { clientId, profileId, periodo } }),
    enabled: !!(clientId && profileId),
  });

  const nroPresentacionSiguiente = (presentaciones[presentaciones.length - 1]?.nroPresentacion ?? 0) + 1;

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
          Período
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
        </div>
      </div>

      {/* Historial de presentaciones */}
      <div
        className="rounded-[var(--arca-r-lg)] overflow-hidden"
        style={{ border: '1px solid var(--arca-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            background: 'var(--arca-surface)',
            borderBottom: '1px solid var(--arca-border)',
          }}
        >
          <Upload className="h-4 w-4 text-[var(--arca-ink-3)]" />
          <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
            Presentaciones — {mesNombre} {year}
          </span>
          {presentaciones.length > 0 && (
            <Badge variant="outline" className="ml-auto text-[11px]">
              {presentaciones.length}
            </Badge>
          )}
        </div>

        <HistorialPresentaciones
          clientId={clientId}
          profileId={profileId}
          periodo={periodo}
        />
      </div>

      {/* Botón generar presentación */}
      <div className="flex justify-end">
        <Button onClick={() => setShowGenerarDialog(true)} className="gap-2">
          <Download className="h-4 w-4" />
          Generar presentación
        </Button>
      </div>

      {showGenerarDialog && (
        <GenerarPresentacionDialog
          clientId={clientId}
          profileId={profileId}
          periodo={periodo}
          nroPresentacion={nroPresentacionSiguiente}
          onClose={() => setShowGenerarDialog(false)}
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
