'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Plus,
  Trash2,
  RefreshCw,
  Pencil,
  Save,
  Search,
  FileText,
  Bookmark,
  BookmarkCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { SelectorFecha } from '@/components/shared/selector-fecha';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, BadgeDot } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Paginador } from '@/components/shared/paginador';
import { chipFiltro } from '@/components/shared/filtros';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  listImportEmpleados,
  createManualEmpleado,
  deleteManualEmpleado,
  listConvenios,
  listCategoriasByConvenio,
  listObrasSociales,
  listModalidadesContratacion,
  listSituaciones,
  listZonas,
  listCondiciones,
  listActividades,
  listSiniestrados,
  listProvincias,
  sincronizarConveniosEmpleados,
  updateEmpleado,
  getPayrollEmployerConfig,
  setPlantillaEmpleado,
} from '@/actions/sueldos';
import { GenerarLiqFinalDialog } from '@/components/sueldos/SueldosRecibo';
import { legajoParaMostrar } from '@/lib/legajo';
import { BANCOS } from '@/lib/bancos';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SueldosEmpleadosProps {
  clientId: string;
  onVerRecibos?: (empleadoId: string) => void;
}

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'deposito', label: 'Depósito en cuenta' },
  { value: 'transferencia', label: 'Transferencia' },
] as const;

function formaDbToSelect(
  v: string | null | undefined
): (typeof FORMAS_PAGO)[number]['value'] {
  if (v == null || String(v).trim() === '') return 'efectivo';
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'efectivo') return 'efectivo';
  if (
    s === '2' ||
    s === 'deposito' ||
    s === 'acreditacion' ||
    s === 'acreditación'
  ) {
    return 'deposito';
  }
  if (s === '3' || s === 'cheque') return 'cheque';
  if (s === '4' || s === 'otro' || s === 'otros') return 'efectivo';
  if (s === 'transferencia') return 'transferencia';
  return 'efectivo';
}

function formatDate(d: Date | string | null | undefined): string {
  if (d == null) return '—';
  try {
    // Siempre leer la parte UTC para evitar el desfase de timezone (UTC-3 → día anterior)
    const iso = typeof d === 'string' ? d : d.toISOString();
    const [y, m, day] = iso.slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
  } catch {
    return '—';
  }
}

/** Decodifica entidades numéricas HTML que a veces vienen en imports (ej. &#209; → Ñ). */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

const PAGE_SIZE = 10;

/** Primera letra de cada palabra en mayúscula, resto en minúscula. */
function titleCaseWords(segment: string): string {
  return segment
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length === 0) return word;
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Texto legible para nombres y categorías: título por segmentos separados por coma. */
function formatTitleCaseDisplay(str: string | null | undefined): string {
  if (str == null || str.trim() === '') return '—';
  const decoded = decodeHtmlEntities(str);
  return decoded
    .split(',')
    .map((part) => titleCaseWords(part))
    .filter(Boolean)
    .join(', ');
}

// ─── Tipos derivados ───────────────────────────────────────────────────────

type EmpleadoRow = Awaited<ReturnType<typeof listImportEmpleados>>[number];

// ─── Helpers de display ────────────────────────────────────────────────────

function tipoJornadaLabel(v: string | null | undefined): string {
  if (v === 'full_time') return 'Tiempo completo';
  if (v === 'part_time') return 'Part time';
  if (v === 'reducida') return 'Reducida';
  return v ?? '—';
}

/** Las cuatro pestañas del alta, en el orden en que se completan. */
const TABS_EMPLEADO = ['persona', 'laboral', 'pago', 'codigos'] as const;
type TabEmpleado = (typeof TABS_EMPLEADO)[number];
const TAB_LABEL: Record<TabEmpleado, string> = {
  persona: 'Persona',
  laboral: 'Laboral',
  pago: 'Pago',
  codigos: 'Códigos',
};

function formaPagoLabel(v: string | null | undefined): string {
  if (!v) return '—';
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'efectivo') return 'Efectivo';
  if (
    s === '2' ||
    s === 'deposito' ||
    s === 'acreditacion' ||
    s === 'acreditación'
  )
    return 'Depósito en cuenta';
  if (s === '3' || s === 'cheque') return 'Cheque';
  if (s === 'transferencia') return 'Transferencia';
  return v;
}

// ─── Seccion y Campo ───────────────────────────────────────────────────────

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value ?? '—'}</p>
    </div>
  );
}

function Seccion({
  title,
  children,
  cols = 3,
}: {
  title: string;
  children: React.ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
        {title}
      </h4>
      <div
        className={
          cols === 2
            ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5'
            : 'grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3'
        }
      >
        {children}
      </div>
    </div>
  );
}

// ─── Dialog de detalle/edición del empleado ────────────────────────────────

function EmpleadoDetalleDialog({
  row,
  open,
  onClose,
  clientId,
  convenios,
  onSaved,
}: {
  row: EmpleadoRow | null;
  open: boolean;
  onClose: () => void;
  clientId: string;
  convenios: { id: string; nombre: string }[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);

  // Campos editables — personal/laboral/pago
  const [nombre, setNombre] = useState('');
  const [cuil, setCuil] = useState('');
  const [fechaAlta, setFechaAlta] = useState('');
  const [fechaBaja, setFechaBaja] = useState('');
  const [activo, setActivo] = useState(true);
  const [tipoJornada, setTipoJornada] = useState<
    'full_time' | 'part_time' | 'reducida'
  >('full_time');
  const [convenioId, setConvenioId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [legajo, setLegajo] = useState('');
  const [formaPago, setFormaPago] =
    useState<(typeof FORMAS_PAGO)[number]['value']>('efectivo');
  const [banco, setBanco] = useState('_otro banco');
  const [cbu, setCbu] = useState('');
  // Domicilio y familia
  const [domicilio, setDomicilio] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [conyuge, setConyuge] = useState('');
  const [hijos, setHijos] = useState('');
  // Obra social
  const [obraSocialId, setObraSocialId] = useState('');
  // Provincia
  const [provinciaId, setProvinciaId] = useState('');
  // Códigos auxiliares (UUIDs de catálogos)
  const [modalidadContratacionId, setModalidadContratacionId] = useState('');
  const [situacionId, setSituacionId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [condicionId, setCondicionId] = useState('');
  const [actividadId, setActividadId] = useState('');
  const [siniestradoId, setSiniestradoId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [valorSueldoOverride, setValorSueldoOverride] = useState('');

  const { data: categoriasEdit = [] } = useQuery({
    queryKey: ['categorias', convenioId, clientId],
    queryFn: () => listCategoriasByConvenio({ data: { convenioId, clientId } }),
    enabled: isEditing && !!convenioId,
  });

  const { data: obrasSociales = [] } = useQuery({
    queryKey: ['obras-sociales'],
    queryFn: () => listObrasSociales(),
    enabled: isEditing,
    staleTime: 10 * 60 * 1000,
  });

  const { data: catalogModalidades = [] } = useQuery({
    queryKey: ['catalog-modalidades'],
    queryFn: () => listModalidadesContratacion(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogSituaciones = [] } = useQuery({
    queryKey: ['catalog-situaciones'],
    queryFn: () => listSituaciones(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogZonas = [] } = useQuery({
    queryKey: ['catalog-zonas'],
    queryFn: () => listZonas(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogCondiciones = [] } = useQuery({
    queryKey: ['catalog-condiciones'],
    queryFn: () => listCondiciones(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogActividades = [] } = useQuery({
    queryKey: ['catalog-actividades'],
    queryFn: () => listActividades(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogSiniestrados = [] } = useQuery({
    queryKey: ['catalog-siniestrados'],
    queryFn: () => listSiniestrados(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogProvincias = [] } = useQuery({
    queryKey: ['catalog-provincias'],
    queryFn: () => listProvincias(),
    enabled: isEditing,
    staleTime: 30 * 60 * 1000,
  });

  const resetForm = (r: EmpleadoRow) => {
    const emp = r.empleado;
    setNombre(emp.nombre ?? '');
    setCuil(emp.cuil ?? '');
    setFechaAlta(
      emp.fechaAlta
        ? (typeof emp.fechaAlta === 'string'
            ? emp.fechaAlta
            : (emp.fechaAlta as Date).toISOString()
          ).slice(0, 10)
        : ''
    );
    setFechaBaja(
      emp.fechaBaja
        ? (typeof emp.fechaBaja === 'string'
            ? emp.fechaBaja
            : (emp.fechaBaja as Date).toISOString()
          ).slice(0, 10)
        : ''
    );
    setActivo(emp.activo ?? true);
    setTipoJornada(emp.tipoJornada ?? 'full_time');
    setConvenioId(emp.convenioId ?? '');
    setCategoriaId(emp.categoriaId ?? '');
    setCategoria(emp.categoriaTexto ?? '');
    setLegajo(emp.legajo ?? '');
    setFormaPago(formaDbToSelect(emp.formaPago));
    setBanco(emp.banco && emp.banco.trim() !== '' ? emp.banco : '_otro banco');
    setCbu(emp.cbu ?? '');
    setDomicilio(emp.domicilio ?? '');
    setCodigoPostal(emp.codigoPostal ?? '');
    setConyuge(emp.conyuge != null ? String(emp.conyuge) : '');
    setHijos(emp.hijos != null ? String(emp.hijos) : '');
    setObraSocialId(emp.obraSocialId ?? '');
    setProvinciaId(emp.provinciaId ?? '');
    setModalidadContratacionId(emp.modalidadContratacionId ?? '');
    setSituacionId(emp.situacionId ?? '');
    setZonaId(emp.zonaId ?? '');
    setCondicionId(emp.condicionId ?? '');
    setActividadId(emp.actividadId ?? '');
    setSiniestradoId(emp.siniestradoId ?? '');
    setObservaciones(emp.observaciones ?? '');
    setValorSueldoOverride(
      emp.valorSueldo != null ? String(emp.valorSueldo) : ''
    );
  };

  useEffect(() => {
    if (!row) return;
    setIsEditing(false);
    resetForm(row);
  }, [row?.empleado.id]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (!row) return;
      await updateEmpleado({
        data: {
          id: row.empleado.id,
          clientId,
          nombre: nombre.trim() || undefined,
          cuilCuil: cuil.trim() || undefined,
          fechaAlta: fechaAlta || undefined,
          fechaBaja: fechaBaja || null,
          activo,
          tipoJornada,
          convenioId: convenioId || undefined,
          categoriaId: categoriaId || undefined,
          categoria: categoria.trim() || undefined,
          legajo: legajo.trim() || null,
          formaPago,
          banco: banco.trim() || null,
          cbu: cbu.trim() || null,
          domicilio: domicilio.trim() || null,
          codigoPostal: codigoPostal.trim() || null,
          conyuge: conyuge !== '' ? parseInt(conyuge, 10) : null,
          hijos: hijos !== '' ? parseInt(hijos, 10) : null,
          obraSocialId: obraSocialId || null,
          provinciaId: provinciaId || null,
          modalidadContratacionId: modalidadContratacionId || null,
          situacionId: situacionId || null,
          zonaId: zonaId || null,
          condicionId: condicionId || null,
          actividadId: actividadId || null,
          siniestradoId: siniestradoId || null,
          observaciones: observaciones.trim() || null,
          valorSueldo:
            valorSueldoOverride.trim() !== ''
              ? valorSueldoOverride.trim()
              : null,
        },
      });
    },
    onSuccess: () => {
      toast.success('Empleado guardado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
      queryClient.invalidateQueries({ queryKey: ['empleados', clientId] });
      queryClient.invalidateQueries({ queryKey: ['recibo-detalle'] });
      setIsEditing(false);
      onSaved();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  if (!row) return null;
  const e = row.empleado;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-2xl h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base leading-snug">
              {formatTitleCaseDisplay(e.nombre)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Legajo {legajoParaMostrar(e.legajo)}
              </span>
            </DialogTitle>
            {!isEditing ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    resetForm(row);
                    setIsEditing(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={guardar.isPending}
                  onClick={() => guardar.mutate()}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Guardar
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="personal" className="flex flex-col min-h-0 flex-1">
          <TabsList className="shrink-0 grid w-full grid-cols-4">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="laboral">Laboral</TabsTrigger>
            <TabsTrigger value="pago">Pago</TabsTrigger>
            <TabsTrigger value="codigos">Códigos</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto flex-1 pt-4">
            {/* ── PERSONAL ── */}
            <TabsContent value="personal" className="space-y-5 mt-0">
              <Seccion title="Identificación">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Nombre</Label>
                      <Input
                        value={nombre}
                        onChange={(ev) => setNombre(ev.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>CUIL</Label>
                      <Input
                        value={cuil}
                        onChange={(ev) => setCuil(ev.target.value)}
                        placeholder="20-12345678-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Estado</Label>
                      <Select
                        value={activo ? 'activo' : 'inactivo'}
                        onValueChange={(v) => setActivo(v === 'activo')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="activo">Activo</SelectItem>
                          <SelectItem value="inactivo">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="CUIL" value={e.cuil} />
                    <Campo label="Sexo" value={e.sexo} />
                    <Campo
                      label="Fecha de nacimiento"
                      value={formatDate(e.fechaNacimiento)}
                    />
                    <Campo
                      label="Origen"
                      value={e.fuente === 'manual' ? 'Manual' : 'Importado'}
                    />
                    <Campo
                      label="Estado"
                      value={e.activo ? 'Activo' : 'Inactivo'}
                    />
                  </>
                )}
              </Seccion>
              <Seccion title="Domicilio y familia">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Domicilio</Label>
                      <Input
                        value={domicilio}
                        onChange={(ev) => setDomicilio(ev.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Provincia</Label>
                      <Select
                        value={provinciaId || '_ninguna'}
                        onValueChange={(v) =>
                          setProvinciaId(v === '_ninguna' ? '' : v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin provincia" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">
                            Sin provincia
                          </SelectItem>
                          {catalogProvincias.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Código postal</Label>
                      <Input
                        value={codigoPostal}
                        onChange={(ev) => setCodigoPostal(ev.target.value)}
                        maxLength={10}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cónyuge</Label>
                      <Input
                        type="number"
                        min={0}
                        value={conyuge}
                        onChange={(ev) => setConyuge(ev.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Hijos</Label>
                      <Input
                        type="number"
                        min={0}
                        value={hijos}
                        onChange={(ev) => setHijos(ev.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Domicilio" value={e.domicilio} />
                    <Campo
                      label="Provincia"
                      value={row.provinciaNombre ?? null}
                    />
                    <Campo label="Código postal" value={e.codigoPostal} />
                    <Campo
                      label="Cónyuge"
                      value={
                        e.conyuge != null ? (e.conyuge > 0 ? 'Sí' : 'No') : null
                      }
                    />
                    <Campo
                      label="Hijos"
                      value={e.hijos != null ? String(e.hijos) : null}
                    />
                  </>
                )}
              </Seccion>
            </TabsContent>

            {/* ── LABORAL ── */}
            <TabsContent value="laboral" className="space-y-5 mt-0">
              <Seccion title="Situación laboral">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Legajo</Label>
                      <Input
                        value={legajo}
                        onChange={(ev) => setLegajo(ev.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Fecha de alta (antigüedad)</Label>
                      <SelectorFecha
                        value={fechaAlta}
                        onChange={setFechaAlta}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Fecha de baja</Label>
                      <SelectorFecha
                        value={fechaBaja}
                        onChange={setFechaBaja}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo jornada</Label>
                      <Select
                        value={tipoJornada}
                        onValueChange={(v) =>
                          setTipoJornada(v as typeof tipoJornada)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">
                            Tiempo completo
                          </SelectItem>
                          <SelectItem value="part_time">Part time</SelectItem>
                          <SelectItem value="reducida">Reducida</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <Campo
                      label="Fecha de alta (antigüedad)"
                      value={formatDate(e.fechaAlta)}
                    />
                    <Campo
                      label="Fecha de baja"
                      value={formatDate(e.fechaBaja)}
                    />
                    <Campo
                      label="Tipo jornada"
                      value={tipoJornadaLabel(e.tipoJornada)}
                    />
                    <Campo label="Tarea / Puesto" value={e.tarea} />
                  </>
                )}
              </Seccion>
              <Seccion title="Convenio y categoría">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Convenio</Label>
                      <Select
                        value={convenioId}
                        onValueChange={(v) => {
                          setConvenioId(v);
                          setCategoriaId('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin convenio" />
                        </SelectTrigger>
                        <SelectContent>
                          {convenios.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Categoría (sistema)</Label>
                      <Select
                        value={categoriaId}
                        onValueChange={(v) => {
                          setCategoriaId(v);
                          const cat = categoriasEdit.find((c) => c.id === v);
                          if (cat) setCategoria(cat.nombre);
                        }}
                        disabled={!convenioId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {categoriasEdit.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.codigo} - {c.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Puesto</Label>
                      <Input
                        value={categoria}
                        onChange={(ev) => setCategoria(ev.target.value)}
                        placeholder="Nombre del puesto"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Campo
                      label="Convenio"
                      value={
                        row.convenioNombre
                          ? formatTitleCaseDisplay(row.convenioNombre)
                          : null
                      }
                    />
                    <Campo
                      label="Categoría (sistema)"
                      value={
                        row.categoriaNombre
                          ? formatTitleCaseDisplay(row.categoriaNombre)
                          : null
                      }
                    />
                    <Campo
                      label="Puesto"
                      value={
                        e.categoriaTexto
                          ? formatTitleCaseDisplay(e.categoriaTexto)
                          : null
                      }
                    />
                  </>
                )}
              </Seccion>
              <Seccion title="Remuneración">
                {isEditing ? (
                  <div className="space-y-1">
                    <Label>Sueldo básico override</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Dejar vacío para usar escala del convenio"
                      value={valorSueldoOverride}
                      onChange={(ev) => setValorSueldoOverride(ev.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Si se ingresa un valor, tiene prioridad sobre la escala
                      del convenio.
                    </p>
                  </div>
                ) : (
                  <Campo
                    label="Sueldo básico override"
                    value={
                      e.valorSueldo
                        ? `$${Number(e.valorSueldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                        : null
                    }
                  />
                )}
                <Campo
                  label="Valor hora override"
                  value={
                    e.valorHora
                      ? `$${Number(e.valorHora).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                      : null
                  }
                />
                <Campo
                  label="Horas mensuales"
                  value={
                    e.horasMensualesNormales != null
                      ? String(e.horasMensualesNormales)
                      : null
                  }
                />
                <Campo
                  label="Días mensuales"
                  value={
                    e.diasMensualesNormales != null
                      ? String(e.diasMensualesNormales)
                      : null
                  }
                />
              </Seccion>
            </TabsContent>

            {/* ── PAGO ── */}
            <TabsContent value="pago" className="space-y-4 mt-0">
              <Seccion title="Obra social">
                {isEditing ? (
                  <div className="col-span-full space-y-1">
                    <Label>Obra social</Label>
                    <Select
                      value={obraSocialId || '_ninguna'}
                      onValueChange={(v) =>
                        setObraSocialId(v === '_ninguna' ? '' : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin obra social" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[240px]">
                        <SelectItem value="_ninguna">
                          Sin obra social
                        </SelectItem>
                        {obrasSociales.map((os) => (
                          <SelectItem key={os.id} value={os.id}>
                            {os.codigo} — {os.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <Campo
                      label="Nombre"
                      value={
                        row.obraSocialNombre
                          ? formatTitleCaseDisplay(row.obraSocialNombre)
                          : null
                      }
                    />
                    <Campo
                      label="Código"
                      value={row.obraSocialCodigo ?? null}
                    />
                  </>
                )}
              </Seccion>
              <Seccion title="Datos de pago">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Forma de pago</Label>
                      <Select
                        value={formaPago}
                        onValueChange={(v) =>
                          setFormaPago(v as typeof formaPago)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMAS_PAGO.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Banco</Label>
                      <Select
                        value={banco || '_otro banco'}
                        onValueChange={setBanco}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          {BANCOS.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(formaPago === 'deposito' ||
                      formaPago === 'transferencia') && (
                      <div className="space-y-1">
                        <Label htmlFor="det-cbu">CBU / cuenta</Label>
                        <Input
                          id="det-cbu"
                          value={cbu}
                          onChange={(ev) => setCbu(ev.target.value)}
                          maxLength={22}
                          className="font-mono"
                          placeholder="22 dígitos"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Campo
                      label="Forma de pago"
                      value={formaPagoLabel(e.formaPago)}
                    />
                    <Campo
                      label="Banco"
                      value={
                        e.banco && e.banco !== '_otro banco' ? e.banco : null
                      }
                    />
                    <Campo label="CBU" value={e.cbu} />
                  </>
                )}
              </Seccion>
            </TabsContent>

            {/* ── CÓDIGOS ── */}
            <TabsContent value="codigos" className="space-y-5 mt-0">
              <Seccion title="Códigos auxiliares" cols={2}>
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Modalidad contratación</Label>
                      <SearchableSelect
                        width="100%"
                        value={modalidadContratacionId || '_ninguna'}
                        onValueChange={(v) =>
                          setModalidadContratacionId(v === '_ninguna' ? '' : v)
                        }
                        placeholder="Sin modalidad"
                        searchPlaceholder="Buscar por código o nombre…"
                        emptyMessage="Sin opciones"
                        options={[
                          { value: '_ninguna', label: 'Sin modalidad' },
                          ...catalogModalidades.map((m) => ({
                            value: m.id,
                            label: `${m.codigo} — ${m.nombre}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Situación</Label>
                      <SearchableSelect
                        width="100%"
                        value={situacionId || '_ninguna'}
                        onValueChange={(v) =>
                          setSituacionId(v === '_ninguna' ? '' : v)
                        }
                        placeholder="Sin situación"
                        searchPlaceholder="Buscar por código o nombre…"
                        emptyMessage="Sin opciones"
                        options={[
                          { value: '_ninguna', label: 'Sin situación' },
                          ...catalogSituaciones.map((s) => ({
                            value: s.id,
                            label: `${s.codigo} — ${s.nombre}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Zona</Label>
                      <SearchableSelect
                        width="100%"
                        value={zonaId || '_ninguna'}
                        onValueChange={(v) =>
                          setZonaId(v === '_ninguna' ? '' : v)
                        }
                        placeholder="Sin zona"
                        searchPlaceholder="Buscar por código o nombre…"
                        emptyMessage="Sin opciones"
                        options={[
                          { value: '_ninguna', label: 'Sin zona' },
                          ...catalogZonas.map((z) => ({
                            value: z.id,
                            label: `${z.codigo} — ${z.nombre}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Condición</Label>
                      <SearchableSelect
                        width="100%"
                        value={condicionId || '_ninguna'}
                        onValueChange={(v) =>
                          setCondicionId(v === '_ninguna' ? '' : v)
                        }
                        placeholder="Sin condición"
                        searchPlaceholder="Buscar por código o nombre…"
                        emptyMessage="Sin opciones"
                        options={[
                          { value: '_ninguna', label: 'Sin condición' },
                          ...catalogCondiciones.map((c) => ({
                            value: c.id,
                            label: `${c.codigo} — ${c.nombre}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Actividad</Label>
                      <SearchableSelect
                        width="100%"
                        value={actividadId || '_ninguna'}
                        onValueChange={(v) =>
                          setActividadId(v === '_ninguna' ? '' : v)
                        }
                        placeholder="Sin actividad"
                        searchPlaceholder="Buscar por código o nombre…"
                        emptyMessage="Sin opciones"
                        options={[
                          { value: '_ninguna', label: 'Sin actividad' },
                          ...catalogActividades.map((a) => ({
                            value: a.id,
                            label: `${a.codigo} — ${a.nombre}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Siniestrado</Label>
                      <SearchableSelect
                        width="100%"
                        value={siniestradoId || '_ninguna'}
                        onValueChange={(v) =>
                          setSiniestradoId(v === '_ninguna' ? '' : v)
                        }
                        placeholder="Sin siniestrado"
                        searchPlaceholder="Buscar por código o nombre…"
                        emptyMessage="Sin opciones"
                        options={[
                          { value: '_ninguna', label: 'Sin siniestrado' },
                          ...catalogSiniestrados.map((s) => ({
                            value: s.id,
                            label: `${s.codigo} — ${s.nombre}`,
                          })),
                        ]}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Campo
                      label="Modalidad contratación"
                      value={row.modalidadNombre ?? null}
                    />
                    <Campo
                      label="Situación"
                      value={row.situacionNombre ?? null}
                    />
                    <Campo label="Zona" value={row.zonaNombre ?? null} />
                    <Campo
                      label="Condición"
                      value={row.condicionNombre ?? null}
                    />
                    <Campo
                      label="Actividad"
                      value={row.actividadNombre ?? null}
                    />
                    <Campo
                      label="Siniestrado"
                      value={row.siniestradoNombre ?? null}
                    />
                  </>
                )}
              </Seccion>
              <Seccion title="Observaciones">
                {isEditing ? (
                  <div className="col-span-full space-y-1">
                    <Label>Observaciones</Label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-none"
                      value={observaciones}
                      onChange={(ev) => setObservaciones(ev.target.value)}
                    />
                  </div>
                ) : (
                  <div className="col-span-full">
                    <p className="text-sm">{e.observaciones ?? '—'}</p>
                  </div>
                )}
              </Seccion>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de alta de empleado (con solapas) ──────────────────────────────

function NuevoEmpleadoDialog({
  open,
  onClose,
  clientId,
  convenios,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  convenios: { id: string; nombre: string }[];
}) {
  const queryClient = useQueryClient();

  const [nombre, setNombre] = useState('');
  const [cuil, setCuil] = useState('');
  const [fechaAlta, setFechaAlta] = useState('');
  const [fechaBaja, setFechaBaja] = useState('');
  const [tipoJornada, setTipoJornada] = useState<
    'full_time' | 'part_time' | 'reducida'
  >('full_time');
  const [convenioId, setConvenioId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [legajo, setLegajo] = useState('');
  const [tab, setTab] = useState<TabEmpleado>('persona');
  const indiceTab = TABS_EMPLEADO.indexOf(tab);
  const esUltimaTab = indiceTab === TABS_EMPLEADO.length - 1;
  const [formaPago, setFormaPago] =
    useState<(typeof FORMAS_PAGO)[number]['value']>('efectivo');
  const [banco, setBanco] = useState('_otro banco');
  const [cbu, setCbu] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [conyuge, setConyuge] = useState('');
  const [hijos, setHijos] = useState('');
  const [obraSocialId, setObraSocialId] = useState('');
  const [provinciaId, setProvinciaId] = useState('');
  const [modalidadContratacionId, setModalidadContratacionId] = useState('');
  const [situacionId, setSituacionId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [condicionId, setCondicionId] = useState('');
  const [actividadId, setActividadId] = useState('');
  const [siniestradoId, setSiniestradoId] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const resetForm = () => {
    setNombre('');
    setCuil('');
    setFechaAlta('');
    setFechaBaja('');
    setTipoJornada('full_time');
    setConvenioId('');
    setCategoriaId('');
    setLegajo('');
    setFormaPago('efectivo');
    setBanco('_otro banco');
    setCbu('');
    setDomicilio('');
    setCodigoPostal('');
    setConyuge('');
    setHijos('');
    setObraSocialId('');
    setProvinciaId('');
    setModalidadContratacionId('');
    setSituacionId('');
    setZonaId('');
    setCondicionId('');
    setActividadId('');
    setSiniestradoId('');
    setObservaciones('');
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const { data: categoriasCreate = [] } = useQuery({
    queryKey: ['categorias', convenioId, clientId],
    queryFn: () => listCategoriasByConvenio({ data: { convenioId, clientId } }),
    enabled: open && !!convenioId,
  });
  const { data: obrasSocialesCreate = [] } = useQuery({
    queryKey: ['obras-sociales'],
    queryFn: () => listObrasSociales(),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });
  const { data: catalogModalidadesCreate = [] } = useQuery({
    queryKey: ['catalog-modalidades'],
    queryFn: () => listModalidadesContratacion(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogSituacionesCreate = [] } = useQuery({
    queryKey: ['catalog-situaciones'],
    queryFn: () => listSituaciones(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogZonasCreate = [] } = useQuery({
    queryKey: ['catalog-zonas'],
    queryFn: () => listZonas(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogCondicionesCreate = [] } = useQuery({
    queryKey: ['catalog-condiciones'],
    queryFn: () => listCondiciones(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogActividadesCreate = [] } = useQuery({
    queryKey: ['catalog-actividades'],
    queryFn: () => listActividades(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogSiniestradosCreate = [] } = useQuery({
    queryKey: ['catalog-siniestrados'],
    queryFn: () => listSiniestrados(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });
  const { data: catalogProvinciasCreate = [] } = useQuery({
    queryKey: ['catalog-provincias'],
    queryFn: () => listProvincias(),
    enabled: open,
    staleTime: 30 * 60 * 1000,
  });

  const crear = useMutation({
    mutationFn: () =>
      createManualEmpleado({
        data: {
          clientId,
          cuil: cuil.trim(),
          legajo: legajo.trim(),
          nombre: nombre.trim(),
          fechaAlta: fechaAlta || undefined,
          fechaBaja: fechaBaja || undefined,
          tipoJornada,
          convenioId: convenioId || undefined,
          categoriaId: categoriaId || undefined,
          formaPago,
          banco: banco !== '_otro banco' ? banco : undefined,
          cbu: cbu || undefined,
          domicilio: domicilio || undefined,
          codigoPostal: codigoPostal || undefined,
          conyuge: conyuge !== '' ? parseInt(conyuge, 10) : undefined,
          hijos: hijos !== '' ? parseInt(hijos, 10) : undefined,
          obraSocialId: obraSocialId || undefined,
          provinciaId: provinciaId || undefined,
          modalidadContratacionId: modalidadContratacionId || undefined,
          situacionId: situacionId || undefined,
          zonaId: zonaId || undefined,
          condicionId: condicionId || undefined,
          actividadId: actividadId || undefined,
          siniestradoId: siniestradoId || undefined,
          observaciones: observaciones || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Empleado creado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
      queryClient.invalidateQueries({ queryKey: ['empleados', clientId] });
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Error al crear'),
  });

  /**
   * Los tres datos obligatorios viven en dos pestañas distintas, así que un
   * "faltan datos" a secas deja al usuario buscándolos: el aviso nombra el
   * campo y la vista salta a su pestaña.
   */
  const handleSubmit = () => {
    const faltan: { campo: string; tab: TabEmpleado }[] = [];
    if (!cuil.trim()) faltan.push({ campo: 'CUIL', tab: 'persona' });
    if (!nombre.trim())
      faltan.push({ campo: 'Nombre completo', tab: 'persona' });
    if (!legajo.trim()) faltan.push({ campo: 'Legajo', tab: 'laboral' });

    if (faltan.length > 0) {
      const primero = faltan[0];
      setTab(primero.tab);
      toast.error(
        faltan.length === 1
          ? `Falta completar ${primero.campo} (pestaña ${TAB_LABEL[primero.tab]})`
          : `Faltan completar ${faltan.map((f) => f.campo).join(', ')}`
      );
      return;
    }
    crear.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-2xl h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Nuevo empleado</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabEmpleado)}
          className="flex flex-col min-h-0 flex-1"
        >
          <TabsList className="shrink-0 grid w-full grid-cols-4">
            {TABS_EMPLEADO.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="overflow-y-auto flex-1 pt-4">
            {/* ── PERSONA ── */}
            <TabsContent value="persona" className="space-y-5 mt-0">
              <Seccion title="Identificación">
                <div className="space-y-1">
                  <Label>CUIL *</Label>
                  <Input
                    value={cuil}
                    onChange={(ev) => setCuil(ev.target.value)}
                    placeholder="20-12345678-9"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Nombre completo *</Label>
                  <Input
                    value={nombre}
                    onChange={(ev) => setNombre(ev.target.value)}
                    placeholder="Apellido, Nombre"
                  />
                </div>
              </Seccion>
              <Seccion title="Domicilio y familia">
                <div className="space-y-1">
                  <Label>Domicilio</Label>
                  <Input
                    value={domicilio}
                    onChange={(ev) => setDomicilio(ev.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Provincia</Label>
                  <SearchableSelect
                    width="100%"
                    value={provinciaId || '_ninguna'}
                    onValueChange={(v) =>
                      setProvinciaId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin provincia"
                    searchPlaceholder="Buscar provincia…"
                    emptyMessage="Sin provincias"
                    options={[
                      { value: '_ninguna', label: 'Sin provincia' },
                      ...catalogProvinciasCreate.map((p) => ({
                        value: p.id,
                        label: p.nombre,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Código postal</Label>
                  <Input
                    value={codigoPostal}
                    onChange={(ev) => setCodigoPostal(ev.target.value)}
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cónyuge</Label>
                  <Input
                    type="number"
                    min={0}
                    value={conyuge}
                    onChange={(ev) => setConyuge(ev.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Hijos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={hijos}
                    onChange={(ev) => setHijos(ev.target.value)}
                    placeholder="0"
                  />
                </div>
              </Seccion>
            </TabsContent>

            {/* ── LABORAL ── */}
            <TabsContent value="laboral" className="space-y-5 mt-0">
              <Seccion title="Situación laboral">
                <div className="space-y-1">
                  <Label>Legajo *</Label>
                  <Input
                    value={legajo}
                    onChange={(ev) => setLegajo(ev.target.value)}
                    placeholder="001"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fecha de alta</Label>
                  <SelectorFecha value={fechaAlta} onChange={setFechaAlta} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha de baja</Label>
                  <SelectorFecha value={fechaBaja} onChange={setFechaBaja} />
                </div>
                <div className="space-y-1">
                  <Label>Tipo jornada</Label>
                  <Select
                    value={tipoJornada}
                    onValueChange={(v) =>
                      setTipoJornada(v as typeof tipoJornada)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Tiempo completo</SelectItem>
                      <SelectItem value="part_time">Part time</SelectItem>
                      <SelectItem value="reducida">Reducida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Seccion>
              <Seccion title="Convenio y categoría">
                <div className="space-y-1">
                  <Label>Convenio</Label>
                  <Select
                    value={convenioId || '_ninguno'}
                    onValueChange={(v) => {
                      setConvenioId(v === '_ninguno' ? '' : v);
                      setCategoriaId('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin convenio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_ninguno">Sin convenio</SelectItem>
                      {convenios.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select
                    value={categoriaId || '_ninguna'}
                    onValueChange={(v) =>
                      setCategoriaId(v === '_ninguna' ? '' : v)
                    }
                    disabled={!convenioId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_ninguna">Sin categoría</SelectItem>
                      {categoriasCreate.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.codigo} - {c.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Seccion>
            </TabsContent>

            {/* ── PAGO ── */}
            <TabsContent value="pago" className="space-y-4 mt-0">
              <Seccion title="Obra social">
                <div className="col-span-full space-y-1">
                  <Label>Obra social</Label>
                  <SearchableSelect
                    width="100%"
                    value={obraSocialId || '_ninguna'}
                    onValueChange={(v) =>
                      setObraSocialId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin obra social"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin obras sociales"
                    options={[
                      { value: '_ninguna', label: 'Sin obra social' },
                      ...obrasSocialesCreate.map((os) => ({
                        value: os.id,
                        label: `${os.codigo} — ${os.nombre}`,
                      })),
                    ]}
                  />
                </div>
              </Seccion>
              <Seccion title="Datos de pago">
                <div className="space-y-1">
                  <Label>Forma de pago</Label>
                  <SearchableSelect
                    width="100%"
                    value={formaPago}
                    onValueChange={(v) => setFormaPago(v as typeof formaPago)}
                    searchPlaceholder="Buscar forma de pago…"
                    options={FORMAS_PAGO.map((f) => ({
                      value: f.value,
                      label: f.label,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Banco</Label>
                  <SearchableSelect
                    width="100%"
                    value={banco || '_otro banco'}
                    onValueChange={setBanco}
                    searchPlaceholder="Buscar banco…"
                    emptyMessage="Sin bancos"
                    options={BANCOS.map((b) => ({ value: b, label: b }))}
                  />
                </div>
                {(formaPago === 'deposito' ||
                  formaPago === 'transferencia') && (
                  <div className="space-y-1">
                    <Label>CBU / cuenta</Label>
                    <Input
                      value={cbu}
                      onChange={(ev) => setCbu(ev.target.value)}
                      maxLength={22}
                      className="font-mono"
                      placeholder="22 dígitos"
                    />
                  </div>
                )}
              </Seccion>
            </TabsContent>

            {/* ── CÓDIGOS ── */}
            <TabsContent value="codigos" className="space-y-5 mt-0">
              <Seccion title="Códigos auxiliares" cols={2}>
                <div className="space-y-1">
                  <Label>Modalidad contratación</Label>
                  <SearchableSelect
                    width="100%"
                    value={modalidadContratacionId || '_ninguna'}
                    onValueChange={(v) =>
                      setModalidadContratacionId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin modalidad"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin opciones"
                    options={[
                      { value: '_ninguna', label: 'Sin modalidad' },
                      ...catalogModalidadesCreate.map((m) => ({
                        value: m.id,
                        label: `${m.codigo} — ${m.nombre}`,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Situación</Label>
                  <SearchableSelect
                    width="100%"
                    value={situacionId || '_ninguna'}
                    onValueChange={(v) =>
                      setSituacionId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin situación"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin opciones"
                    options={[
                      { value: '_ninguna', label: 'Sin situación' },
                      ...catalogSituacionesCreate.map((s) => ({
                        value: s.id,
                        label: `${s.codigo} — ${s.nombre}`,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Zona</Label>
                  <SearchableSelect
                    width="100%"
                    value={zonaId || '_ninguna'}
                    onValueChange={(v) => setZonaId(v === '_ninguna' ? '' : v)}
                    placeholder="Sin zona"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin opciones"
                    options={[
                      { value: '_ninguna', label: 'Sin zona' },
                      ...catalogZonasCreate.map((z) => ({
                        value: z.id,
                        label: `${z.codigo} — ${z.nombre}`,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Condición</Label>
                  <SearchableSelect
                    width="100%"
                    value={condicionId || '_ninguna'}
                    onValueChange={(v) =>
                      setCondicionId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin condición"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin opciones"
                    options={[
                      { value: '_ninguna', label: 'Sin condición' },
                      ...catalogCondicionesCreate.map((c) => ({
                        value: c.id,
                        label: `${c.codigo} — ${c.nombre}`,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Actividad</Label>
                  <SearchableSelect
                    width="100%"
                    value={actividadId || '_ninguna'}
                    onValueChange={(v) =>
                      setActividadId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin actividad"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin opciones"
                    options={[
                      { value: '_ninguna', label: 'Sin actividad' },
                      ...catalogActividadesCreate.map((a) => ({
                        value: a.id,
                        label: `${a.codigo} — ${a.nombre}`,
                      })),
                    ]}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Siniestrado</Label>
                  <SearchableSelect
                    width="100%"
                    value={siniestradoId || '_ninguna'}
                    onValueChange={(v) =>
                      setSiniestradoId(v === '_ninguna' ? '' : v)
                    }
                    placeholder="Sin siniestrado"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyMessage="Sin opciones"
                    options={[
                      { value: '_ninguna', label: 'Sin siniestrado' },
                      ...catalogSiniestradosCreate.map((s) => ({
                        value: s.id,
                        label: `${s.codigo} — ${s.nombre}`,
                      })),
                    ]}
                  />
                </div>
              </Seccion>
              <Seccion title="Observaciones">
                <div className="col-span-full space-y-1">
                  <Label>Observaciones</Label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-none"
                    value={observaciones}
                    onChange={(ev) => setObservaciones(ev.target.value)}
                  />
                </div>
              </Seccion>
            </TabsContent>
          </div>
        </Tabs>

        {/* El alta se completa en cuatro pestañas: el botón principal avanza
            y recién guarda en la última. Antes decía "Guardar" en todas y
            fallaba pidiendo el legajo, que está en otra pestaña. */}
        <div className="flex items-center gap-2 pt-4 border-t shrink-0">
          <span className="text-[11.5px] text-[var(--arca-ink-4)]">
            Paso {indiceTab + 1} de {TABS_EMPLEADO.length} · {TAB_LABEL[tab]}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {indiceTab > 0 && (
              <Button
                variant="outline"
                onClick={() => setTab(TABS_EMPLEADO[indiceTab - 1])}
              >
                Atrás
              </Button>
            )}
            {/* Se guarda solo al final: los datos obligatorios están repartidos
                entre pestañas, así que un atajo a mitad de camino solo podía
                terminar en el error de que falta el legajo. */}
            {esUltimaTab ? (
              <Button disabled={crear.isPending} onClick={handleSubmit}>
                {crear.isPending ? 'Guardando…' : 'Guardar empleado'}
              </Button>
            ) : (
              <Button onClick={() => setTab(TABS_EMPLEADO[indiceTab + 1])}>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export function SueldosEmpleados({
  clientId,
  onVerRecibos,
}: SueldosEmpleadosProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [ocultarBajas, setOcultarBajas] = useState(true);
  const [detalleRow, setDetalleRow] = useState<EmpleadoRow | null>(null);

  const importEmpleadosQuery = useQuery({
    queryKey: ['import-empleados', clientId],
    queryFn: () => listImportEmpleados({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: rows = [], isLoading } = importEmpleadosQuery;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter((r) => {
      const e = r.empleado;
      if (ocultarBajas && e.fechaBaja != null) return false;
      if (!q) return true;
      return (
        e.nombre.toLowerCase().includes(q) ||
        e.cuil.toLowerCase().includes(q) ||
        (e.legajo ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, busqueda, ocultarBajas]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const paginaRows = filtrados.slice(
    (paginaActual - 1) * PAGE_SIZE,
    paginaActual * PAGE_SIZE
  );

  const handleBusqueda = (v: string) => {
    setBusqueda(v);
    setPagina(1);
  };

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', clientId],
    queryFn: () => listConvenios({ data: { clientId } }),
    enabled: !!clientId,
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarConveniosEmpleados({ data: { clientId } }),
    onSuccess: (result) => {
      toast.success(result.mensaje);
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al sincronizar'),
  });

  // Dialog para dar de baja
  const [dialogBaja, setDialogBaja] = useState<{
    id: string;
    nombre: string;
  } | null>(null);
  const [fechaBajaInput, setFechaBajaInput] = useState('');
  const [pendingLiqFinal, setPendingLiqFinal] = useState<{
    nombre: string;
    fechaBaja: string;
  } | null>(null);
  const [showLiqFinalPost, setShowLiqFinalPost] = useState<{
    periodo: string;
  } | null>(null);

  const darDeBaja = useMutation({
    mutationFn: ({ id, fechaBaja }: { id: string; fechaBaja: string }) =>
      updateEmpleado({ data: { id, clientId, fechaBaja, activo: false } }),
    onSuccess: (_, variables) => {
      toast.success('Fecha de baja registrada');
      const nombre = dialogBaja?.nombre ?? '';
      setPendingLiqFinal({ nombre, fechaBaja: variables.fechaBaja });
      setDialogBaja(null);
      setFechaBajaInput('');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  const reactivar = useMutation({
    mutationFn: (id: string) =>
      updateEmpleado({ data: { id, clientId, fechaBaja: null, activo: true } }),
    onSuccess: () => {
      toast.success('Empleado reactivado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  const eliminar = useMutation({
    mutationFn: (empleadoId: string) =>
      deleteManualEmpleado({ data: { clientId, empleadoId } }),
    onSuccess: () => {
      toast.success('Empleado eliminado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: employerConfig } = useQuery({
    queryKey: ['payroll-employer-config', clientId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId } }),
    enabled: !!clientId,
  });
  const plantillaEmpleadoId = employerConfig?.plantillaEmpleadoId ?? null;

  const setPlantilla = useMutation({
    mutationFn: (empleadoId: string | null) =>
      setPlantillaEmpleado({ data: { clientId, empleadoId } }),
    onSuccess: (_, empleadoId) => {
      toast.success(
        empleadoId ? 'Plantilla base actualizada' : 'Plantilla base eliminada'
      );
      queryClient.invalidateQueries({
        queryKey: ['payroll-employer-config', clientId],
      });
      queryClient.invalidateQueries({
        queryKey: ['plantilla-manual-sos', clientId],
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {importEmpleadosQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los empleados</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {(importEmpleadosQuery.error as Error | undefined)?.message ??
                'Error desconocido'}
            </p>
            <p>
              Si el error menciona columnas en{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                liquidacion_import_empleado
              </code>
              , ejecutá{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                npm run db:ensure-empleado-pago
              </code>{' '}
              (con <code className="font-mono text-xs">DATABASE_URL</code> en
              .env).
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Top action row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium break-words text-[var(--arca-ink-3)]">
          Empleados del perfil fiscal (importados desde LSD o creados
          manualmente)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => sincronizar.mutate()}
            disabled={sincronizar.isPending}
            className="inline-flex items-center gap-2 bg-white border border-[var(--arca-border-strong)] rounded-lg px-[13px] py-[8px] text-[13px] font-semibold hover:bg-[var(--arca-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: 'var(--arca-ink-2)' }}
          >
            <RefreshCw
              style={{ width: 14, height: 14 }}
              className={sincronizar.isPending ? 'animate-spin' : ''}
            />
            Sincronizar convenios
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 bg-[var(--arca-accent)] text-white rounded-lg h-9 px-4 text-[13px] font-semibold hover:bg-[var(--arca-accent-hover)] transition-colors"
          >
            <Plus style={{ width: 14, height: 14 }} />
            Nuevo empleado
          </button>
        </div>
      </div>

      {/* Buscador y filtro del sistema: el input de 32px que usan Facturas y
        Notificaciones, y el estado como chip —un checkbox negro no es un
        control de filtro en esta plataforma. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-[8px] left-2 size-4 text-[var(--arca-ink-4)]" />
          <Input
            placeholder="Buscar por nombre, CUIL o legajo…"
            value={busqueda}
            onChange={(e) => handleBusqueda(e.target.value)}
            className="h-8 w-[280px] pl-8 text-[12.5px]"
          />
        </div>
        <button
          type="button"
          aria-pressed={ocultarBajas}
          onClick={() => {
            setOcultarBajas(!ocultarBajas);
            setPagina(1);
          }}
          className={chipFiltro(ocultarBajas)}
        >
          Ocultar bajas
        </button>
      </div>

      {/* La tabla del sistema: `Table` de shadcn dentro de una card, con el
        paginado compartido adentro. Era una grilla de divs con su propio
        header, sus propios badges pintados a mano en oklch y un paginador
        de dos botones "Anterior/Siguiente" que no decía en qué página se
        estaba ni dejaba saltar. */}
      <div className="overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-card)] [&_[data-slot=table-container]]:rounded-none [&_[data-slot=table-container]]:border-0">
        <Table className="table-fixed">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>CUIL</TableHead>
              <TableHead className="text-right">Legajo</TableHead>
              <TableHead className="text-right">Fecha alta</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Recibos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-[13px] text-[var(--arca-ink-3)]"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-[13px] text-[var(--arca-ink-3)]"
                >
                  {busqueda
                    ? 'Sin resultados para la búsqueda.'
                    : ocultarBajas
                      ? 'No hay empleados activos. Sacá el filtro "Ocultar bajas" para ver todos.'
                      : 'No hay empleados para este perfil. Importá el Excel de empleados o creá uno manualmente.'}
                </TableCell>
              </TableRow>
            ) : (
              paginaRows.map((r) => {
                const e = r.empleado;
                const baja = e.fechaBaja != null;
                const esManual = e.fuente === 'manual';
                return (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => setDetalleRow(r)}
                  >
                    <TableCell className="truncate font-medium text-[var(--arca-ink)]">
                      {formatTitleCaseDisplay(e.nombre)}
                    </TableCell>
                    <TableCell className="tabular-nums [font-family:var(--ff-mono)]">
                      {e.cuil}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {legajoParaMostrar(e.legajo)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums [font-family:var(--ff-mono)]">
                      {formatDate(e.fechaAlta ?? undefined)}
                    </TableCell>
                    <TableCell className="truncate">
                      {r.categoriaNombre
                        ? formatTitleCaseDisplay(r.categoriaNombre)
                        : formatTitleCaseDisplay(e.categoriaTexto)}
                    </TableCell>

                    {/* El badge es el botón: click alterna alta/baja. */}
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {baja ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              asChild
                              variant="error"
                              size="sm"
                              className="cursor-pointer hover:opacity-80"
                            >
                              <button
                                type="button"
                                disabled={reactivar.isPending}
                                onClick={() => reactivar.mutate(e.id)}
                              >
                                <BadgeDot />
                                Baja
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Reactivar empleado
                            {e.fechaBaja
                              ? ` · baja ${formatDate(e.fechaBaja)}`
                              : ''}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              asChild
                              variant="success"
                              size="sm"
                              className="cursor-pointer hover:opacity-80"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setFechaBajaInput(
                                    format(new Date(), 'yyyy-MM-dd')
                                  );
                                  setDialogBaja({ id: e.id, nombre: e.nombre });
                                }}
                              >
                                <BadgeDot />
                                Activo
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Dar de baja</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>

                    <TableCell
                      className="text-right"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-0.5">
                        {onVerRecibos && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Ver recibos del empleado"
                                onClick={() => onVerRecibos(e.id)}
                              >
                                <FileText className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Ver recibos del empleado
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={setPlantilla.isPending}
                              aria-label="Usar como plantilla base"
                              className={
                                plantillaEmpleadoId === e.id
                                  ? 'text-[var(--arca-accent-warn-fg)]'
                                  : undefined
                              }
                              onClick={() =>
                                setPlantilla.mutate(
                                  plantillaEmpleadoId === e.id ? null : e.id
                                )
                              }
                            >
                              {plantillaEmpleadoId === e.id ? (
                                <BookmarkCheck className="size-3.5" />
                              ) : (
                                <Bookmark className="size-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {plantillaEmpleadoId === e.id
                              ? 'Quitar como plantilla base'
                              : 'Usar como plantilla base para nuevos recibos'}
                          </TooltipContent>
                        </Tooltip>
                        {esManual && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={eliminar.isPending}
                                aria-label="Eliminar empleado"
                                className="text-[var(--arca-accent-neg)] hover:bg-[var(--arca-accent-neg-bg)] hover:text-[var(--arca-accent-neg-fg)]"
                                onClick={() => eliminar.mutate(e.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Eliminar empleado</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {!isLoading && filtrados.length > 0 && (
          <Paginador
            className="w-full min-w-0 border-t border-[var(--arca-border)] px-[18px] py-[11px]"
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            onPagina={setPagina}
            total={filtrados.length}
            unidad="empleado"
            unidadPlural="empleados"
          />
        )}
      </div>

      <NuevoEmpleadoDialog
        open={open}
        onClose={() => setOpen(false)}
        clientId={clientId}
        convenios={convenios}
      />

      <EmpleadoDetalleDialog
        row={detalleRow}
        open={detalleRow !== null}
        onClose={() => setDetalleRow(null)}
        clientId={clientId}
        convenios={convenios}
        onSaved={() => setDetalleRow(null)}
      />

      {/* Dialog: ¿Generar Liquidación Final? (post-baja) */}
      <Dialog
        open={pendingLiqFinal !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLiqFinal(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              ¿Generar Liquidación Final?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground -mt-2">
            {pendingLiqFinal?.nombre} fue dado/a de baja el{' '}
            <span className="font-medium text-foreground">
              {pendingLiqFinal?.fechaBaja}
            </span>
            . ¿Querés generar la Liquidación Final para el período{' '}
            <span className="font-medium text-foreground">
              {pendingLiqFinal?.fechaBaja?.slice(0, 7)}
            </span>
            ?
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingLiqFinal(null)}
            >
              No, después
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const periodo = pendingLiqFinal!.fechaBaja.slice(0, 7);
                setPendingLiqFinal(null);
                setShowLiqFinalPost({ periodo });
              }}
            >
              Sí, generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Liquidación Final post-baja */}
      {showLiqFinalPost && (
        <GenerarLiqFinalDialog
          clientId={clientId}
          periodo={showLiqFinalPost.periodo}
          onClose={() => setShowLiqFinalPost(null)}
        />
      )}

      {/* Dialog: Dar de baja */}
      <Dialog
        open={dialogBaja !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogBaja(null);
            setFechaBajaInput('');
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Dar de baja</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground -mt-2">
            {dialogBaja?.nombre}
          </p>
          <div className="space-y-1 pt-1">
            <Label className="text-[13px]">Fecha de baja</Label>
            <SelectorFecha
              value={fechaBajaInput}
              onChange={setFechaBajaInput}
              placeholder="Fecha de baja"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDialogBaja(null);
                setFechaBajaInput('');
              }}
              disabled={darDeBaja.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!fechaBajaInput || darDeBaja.isPending}
              onClick={() =>
                dialogBaja &&
                darDeBaja.mutate({
                  id: dialogBaja.id,
                  fechaBaja: fechaBajaInput,
                })
              }
            >
              {darDeBaja.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserX className="h-3.5 w-3.5" />
              )}
              Registrar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
