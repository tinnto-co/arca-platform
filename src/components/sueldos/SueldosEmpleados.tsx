'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, RefreshCw, Pencil, Save, Search, ChevronLeft, ChevronRight, FileText, Bookmark, BookmarkCheck, UserX, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { legajoParaMostrar } from '@/lib/legajo';
import { BANCOS } from '@/lib/bancos';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface SueldosEmpleadosProps {
  clientId: string;
  profileId: string;
  onVerRecibos?: (empleadoId: string) => void;
}

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'acreditacion', label: 'Acreditación en cuenta' },
] as const;

function formaDbToSelect(
  v: string | null | undefined
): (typeof FORMAS_PAGO)[number]['value'] {
  if (v == null || String(v).trim() === '') return 'efectivo';
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'efectivo') return 'efectivo';
  if (s === '2' || s === 'acreditacion' || s === 'acreditación') {
    return 'acreditacion';
  }
  if (s === '3' || s === 'cheque') return 'cheque';
  if (s === '4' || s === 'otro' || s === 'otros') return 'efectivo';
  if (s === 'cheque') return 'cheque';
  if (s === 'acreditacion') return 'acreditacion';
  return 'efectivo';
}

function formatDate(d: Date | string | null | undefined): string {
  if (d == null) return '—';
  try {
    // Siempre leer la parte UTC para evitar el desfase de timezone (UTC-3 → día anterior)
    const iso = typeof d === 'string' ? d : (d as Date).toISOString();
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

function codigoConNombre(codigo: string | null | undefined, nombre: string | null | undefined): string | null {
  const c = codigo?.trim() || null;
  const n = nombre?.trim() || null;
  if (c && n) return `${c} - ${n}`;
  return n ?? c ?? null;
}

function formaPagoLabel(v: string | null | undefined): string {
  if (!v) return '—';
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'efectivo') return 'Efectivo';
  if (s === '2' || s === 'acreditacion' || s === 'acreditación') return 'Acreditación';
  if (s === '3' || s === 'cheque') return 'Cheque';
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

function Seccion({ title, children, cols = 3 }: { title: string; children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
        {title}
      </h4>
      <div className={cols === 2
        ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5'
        : 'grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3'}>
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
  profileId,
  convenios,
  onSaved,
}: {
  row: EmpleadoRow | null;
  open: boolean;
  onClose: () => void;
  clientId: string;
  profileId: string;
  convenios: { id: string; nombre: string }[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);

  // Campos editables — personal/laboral/pago
  const [nombre, setNombre] = useState('');
  const [cuil, setCuil] = useState('');
  const [fechaAlta, setFechaAlta] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [activo, setActivo] = useState(true);
  const [tipoJornada, setTipoJornada] = useState<'full_time' | 'part_time' | 'reducida'>('full_time');
  const [convenioId, setConvenioId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [legajo, setLegajo] = useState('');
  const [lugarPago, setLugarPago] = useState('');
  const [formaPago, setFormaPago] = useState<(typeof FORMAS_PAGO)[number]['value']>('efectivo');
  const [banco, setBanco] = useState('_otro banco');
  const [cbu, setCbu] = useState('');
  // Domicilio y familia
  const [domicilio, setDomicilio] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [conyuge, setConyuge] = useState('');
  const [hijos, setHijos] = useState('');
  const [adherentes, setAdherentes] = useState('');
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
        ? (typeof emp.fechaAlta === 'string' ? emp.fechaAlta : (emp.fechaAlta as Date).toISOString()).slice(0, 10)
        : ''
    );
    setFechaIngreso(
      emp.fechaIngreso
        ? (typeof emp.fechaIngreso === 'string' ? emp.fechaIngreso : (emp.fechaIngreso as Date).toISOString()).slice(0, 10)
        : ''
    );
    setActivo(emp.activo ?? true);
    setTipoJornada((emp.tipoJornada as 'full_time' | 'part_time' | 'reducida') ?? 'full_time');
    setConvenioId(emp.convenioId ?? '');
    setCategoriaId(emp.categoriaId ?? '');
    setCategoria(emp.categoria ?? '');
    setLegajo(emp.legajo ?? '');
    setLugarPago(emp.lugarPago ?? '');
    setFormaPago(formaDbToSelect(emp.formaPago));
    setBanco(emp.banco && emp.banco.trim() !== '' ? emp.banco : '_otro banco');
    setCbu(emp.cbu ?? '');
    setDomicilio(emp.domicilio ?? '');
    setLocalidad(emp.localidad ?? '');
    setCodigoPostal(emp.codigoPostal ?? '');
    setConyuge(emp.conyuge != null ? String(emp.conyuge) : '');
    setHijos(emp.hijos != null ? String(emp.hijos) : '');
    setAdherentes(emp.adherentes != null ? String(emp.adherentes) : '');
    setObraSocialId(emp.obraSocialId ?? '');
    setProvinciaId(emp.provinciaId ?? '');
    setModalidadContratacionId(emp.modalidadContratacionId ?? '');
    setSituacionId(emp.situacionId ?? '');
    setZonaId(emp.zonaId ?? '');
    setCondicionId(emp.condicionId ?? '');
    setActividadId(emp.actividadId ?? '');
    setSiniestradoId(emp.siniestradoId ?? '');
    setObservaciones(emp.observaciones ?? '');
    setValorSueldoOverride(emp.valorSueldo != null ? String(emp.valorSueldo) : '');
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
          fechaIngreso: fechaIngreso || undefined,
          activo,
          tipoJornada,
          convenioId: convenioId || undefined,
          categoriaId: categoriaId || undefined,
          categoria: categoria.trim() || undefined,
          legajo: legajo.trim() || null,
          lugarPago: lugarPago.trim() || null,
          formaPago,
          banco: banco.trim() || null,
          cbu: cbu.trim() || null,
          domicilio: domicilio.trim() || null,
          localidad: localidad.trim() || null,
          codigoPostal: codigoPostal.trim() || null,
          conyuge: conyuge !== '' ? parseInt(conyuge, 10) : null,
          hijos: hijos !== '' ? parseInt(hijos, 10) : null,
          adherentes: adherentes !== '' ? parseInt(adherentes, 10) : null,
          obraSocialId: obraSocialId || null,
          provinciaId: provinciaId || null,
          modalidadContratacionId: modalidadContratacionId || null,
          situacionId: situacionId || null,
          zonaId: zonaId || null,
          condicionId: condicionId || null,
          actividadId: actividadId || null,
          siniestradoId: siniestradoId || null,
          observaciones: observaciones.trim() || null,
          valorSueldo: valorSueldoOverride.trim() !== '' ? valorSueldoOverride.trim() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success('Empleado guardado');
      queryClient.invalidateQueries({ queryKey: ['import-empleados', clientId, profileId] });
      queryClient.invalidateQueries({ queryKey: ['empleados', clientId] });
      queryClient.invalidateQueries({ queryKey: ['recibo-detalle'] });
      setIsEditing(false);
      onSaved();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  if (!row) return null;
  const e = row.empleado;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
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
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            ) : (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => { resetForm(row); setIsEditing(false); }}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={guardar.isPending} onClick={() => guardar.mutate()} className="gap-1.5">
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
                      <Input value={nombre} onChange={(ev) => setNombre(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>CUIL</Label>
                      <Input value={cuil} onChange={(ev) => setCuil(ev.target.value)} placeholder="20-12345678-9" />
                    </div>
                    <div className="space-y-1">
                      <Label>Estado</Label>
                      <Select value={activo ? 'activo' : 'inactivo'} onValueChange={(v) => setActivo(v === 'activo')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <Campo label="Fecha de nacimiento" value={formatDate(e.fechaNacimiento)} />
                    <Campo label="Origen" value={e.origen === 'manual' ? 'Manual' : 'Importado'} />
                    <Campo label="Estado" value={e.activo ? 'Activo' : 'Inactivo'} />
                  </>
                )}
              </Seccion>
              <Seccion title="Domicilio y familia">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Domicilio</Label>
                      <Input value={domicilio} onChange={(ev) => setDomicilio(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Localidad</Label>
                      <Input value={localidad} onChange={(ev) => setLocalidad(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Provincia</Label>
                      <Select value={provinciaId || '_ninguna'} onValueChange={(v) => setProvinciaId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin provincia" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin provincia</SelectItem>
                          {catalogProvincias.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Código postal</Label>
                      <Input value={codigoPostal} onChange={(ev) => setCodigoPostal(ev.target.value)} maxLength={10} />
                    </div>
                    <div className="space-y-1">
                      <Label>Cónyuge</Label>
                      <Input type="number" min={0} value={conyuge} onChange={(ev) => setConyuge(ev.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label>Hijos</Label>
                      <Input type="number" min={0} value={hijos} onChange={(ev) => setHijos(ev.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label>Adherentes</Label>
                      <Input type="number" min={0} value={adherentes} onChange={(ev) => setAdherentes(ev.target.value)} placeholder="0" />
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Domicilio" value={e.domicilio} />
                    <Campo label="Localidad" value={e.localidad} />
                    <Campo label="Provincia" value={row.provinciaNombre ?? null} />
                    <Campo label="Código postal" value={e.codigoPostal} />
                    <Campo label="Cónyuge" value={e.conyuge != null ? (e.conyuge > 0 ? 'Sí' : 'No') : null} />
                    <Campo label="Hijos" value={e.hijos != null ? String(e.hijos) : null} />
                    <Campo label="Adherentes" value={e.adherentes != null ? String(e.adherentes) : null} />
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
                      <Input value={legajo} onChange={(ev) => setLegajo(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Fecha de alta (antigüedad)</Label>
                      <Input type="date" value={fechaAlta} onChange={(ev) => setFechaAlta(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Fecha de ingreso</Label>
                      <Input type="date" value={fechaIngreso} onChange={(ev) => setFechaIngreso(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo jornada</Label>
                      <Select value={tipoJornada} onValueChange={(v) => setTipoJornada(v as typeof tipoJornada)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">Tiempo completo</SelectItem>
                          <SelectItem value="part_time">Part time</SelectItem>
                          <SelectItem value="reducida">Reducida</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Fecha de alta (antigüedad)" value={formatDate(e.fechaAlta)} />
                    <Campo label="Fecha de ingreso" value={formatDate(e.fechaIngreso)} />
                    <Campo label="Fecha de baja" value={formatDate(e.fechaBaja)} />
                    <Campo label="Tipo jornada" value={tipoJornadaLabel(e.tipoJornada)} />
                    <Campo label="Modo contrato" value={e.modoContrato} />
                    <Campo label="Tarea / Puesto" value={e.tarea} />
                    <Campo label="Tipo empleador" value={e.tipoEmpleador} />
                  </>
                )}
              </Seccion>
              <Seccion title="Convenio y categoría">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Convenio</Label>
                      <Select value={convenioId} onValueChange={(v) => { setConvenioId(v); setCategoriaId(''); }}>
                        <SelectTrigger><SelectValue placeholder="Sin convenio" /></SelectTrigger>
                        <SelectContent>
                          {convenios.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
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
                        <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                        <SelectContent>
                          {categoriasEdit.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Puesto</Label>
                      <Input value={categoria} onChange={(ev) => setCategoria(ev.target.value)} placeholder="Nombre del puesto" />
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Convenio" value={row.convenioNombre ? formatTitleCaseDisplay(row.convenioNombre) : null} />
                    <Campo label="Categoría (sistema)" value={row.categoriaNombre ? formatTitleCaseDisplay(row.categoriaNombre) : null} />
                    <Campo label="Puesto" value={e.categoria ? formatTitleCaseDisplay(e.categoria) : null} />
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
                    <p className="text-xs text-muted-foreground">Si se ingresa un valor, tiene prioridad sobre la escala del convenio.</p>
                  </div>
                ) : (
                  <Campo label="Sueldo básico override" value={e.valorSueldo ? `$${Number(e.valorSueldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null} />
                )}
                <Campo label="Valor hora override" value={e.valorHora ? `$${Number(e.valorHora).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null} />
                <Campo label="Horas mensuales" value={e.horasMensualesNormales != null ? String(e.horasMensualesNormales) : null} />
                <Campo label="Días mensuales" value={e.diasMensualesNormales != null ? String(e.diasMensualesNormales) : null} />
                <Campo label="Aporte adicional SS" value={e.porcentajeAporteAdicionalSS ? `${Number(e.porcentajeAporteAdicionalSS)}%` : null} />
              </Seccion>
            </TabsContent>

            {/* ── PAGO ── */}
            <TabsContent value="pago" className="space-y-4 mt-0">
              <Seccion title="Obra social">
                {isEditing ? (
                  <div className="col-span-full space-y-1">
                    <Label>Obra social</Label>
                    <Select value={obraSocialId || '_ninguna'} onValueChange={(v) => setObraSocialId(v === '_ninguna' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Sin obra social" /></SelectTrigger>
                      <SelectContent className="max-h-[240px]">
                        <SelectItem value="_ninguna">Sin obra social</SelectItem>
                        {obrasSociales.map((os) => (
                          <SelectItem key={os.id} value={os.id}>{os.codigo} — {os.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <Campo label="Nombre" value={row.obraSocialNombre ? formatTitleCaseDisplay(row.obraSocialNombre) : null} />
                    <Campo label="Código" value={row.obraSocialCodigo ?? null} />
                  </>
                )}
              </Seccion>
              <Seccion title="Datos de pago">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="det-lugar">Lugar de pago</Label>
                      <Input id="det-lugar" value={lugarPago} onChange={(ev) => setLugarPago(ev.target.value)} maxLength={80} placeholder="Ej. CABA" />
                    </div>
                    <div className="space-y-1">
                      <Label>Forma de pago</Label>
                      <Select value={formaPago} onValueChange={(v) => setFormaPago(v as typeof formaPago)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FORMAS_PAGO.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Banco</Label>
                      <Select value={banco || '_otro banco'} onValueChange={setBanco}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          {BANCOS.map((b) => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formaPago === 'acreditacion' && (
                      <div className="space-y-1">
                        <Label htmlFor="det-cbu">CBU / cuenta</Label>
                        <Input id="det-cbu" value={cbu} onChange={(ev) => setCbu(ev.target.value)} maxLength={22} className="font-mono" placeholder="22 dígitos" />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Campo label="Forma de pago" value={formaPagoLabel(e.formaPago)} />
                    <Campo label="Lugar de pago" value={e.lugarPago} />
                    <Campo label="Banco" value={e.banco && e.banco !== '_otro banco' ? e.banco : null} />
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
                      <Select value={modalidadContratacionId || '_ninguna'} onValueChange={(v) => setModalidadContratacionId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin modalidad" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin modalidad</SelectItem>
                          {catalogModalidades.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.codigo} — {m.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Situación</Label>
                      <Select value={situacionId || '_ninguna'} onValueChange={(v) => setSituacionId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin situación" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin situación</SelectItem>
                          {catalogSituaciones.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Zona</Label>
                      <Select value={zonaId || '_ninguna'} onValueChange={(v) => setZonaId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin zona" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin zona</SelectItem>
                          {catalogZonas.map((z) => (
                            <SelectItem key={z.id} value={z.id}>{z.codigo} — {z.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Condición</Label>
                      <Select value={condicionId || '_ninguna'} onValueChange={(v) => setCondicionId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin condición" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin condición</SelectItem>
                          {catalogCondiciones.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Actividad</Label>
                      <Select value={actividadId || '_ninguna'} onValueChange={(v) => setActividadId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin actividad" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin actividad</SelectItem>
                          {catalogActividades.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.codigo} — {a.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Siniestrado</Label>
                      <Select value={siniestradoId || '_ninguna'} onValueChange={(v) => setSiniestradoId(v === '_ninguna' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Sin siniestrado" /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          <SelectItem value="_ninguna">Sin siniestrado</SelectItem>
                          {catalogSiniestrados.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Modalidad contratación" value={codigoConNombre(e.codigoModalidadContratacion, row.modalidadNombre)} />
                    <Campo label="Situación" value={codigoConNombre(e.codigoSituacion, row.situacionNombre)} />
                    <Campo label="Zona" value={codigoConNombre(e.codigoZona, row.zonaNombre)} />
                    <Campo label="Condición" value={codigoConNombre(e.codigoCondicion, row.condicionNombre)} />
                    <Campo label="Actividad" value={codigoConNombre(e.codigoActividad, row.actividadNombre)} />
                    <Campo label="Siniestrado" value={codigoConNombre(e.codigoSiniestrado, row.siniestradoNombre)} />
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
  profileId,
  convenios,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  profileId: string;
  convenios: { id: string; nombre: string }[];
}) {
  const queryClient = useQueryClient();

  const [nombre, setNombre] = useState('');
  const [cuil, setCuil] = useState('');
  const [fechaAlta, setFechaAlta] = useState('');
  const [fechaBaja, setFechaBaja] = useState('');
  const [tipoJornada, setTipoJornada] = useState<'full_time' | 'part_time' | 'reducida'>('full_time');
  const [convenioId, setConvenioId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [legajo, setLegajo] = useState('');
  const [modoContrato, setModoContrato] = useState('');
  const [lugarPago, setLugarPago] = useState('');
  const [formaPago, setFormaPago] = useState<(typeof FORMAS_PAGO)[number]['value']>('efectivo');
  const [banco, setBanco] = useState('_otro banco');
  const [cbu, setCbu] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [conyuge, setConyuge] = useState('');
  const [hijos, setHijos] = useState('');
  const [adherentes, setAdherentes] = useState('');
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
    setNombre(''); setCuil(''); setFechaAlta(''); setFechaBaja('');
    setTipoJornada('full_time'); setConvenioId(''); setCategoriaId('');
    setLegajo(''); setModoContrato(''); setLugarPago('');
    setFormaPago('efectivo'); setBanco('_otro banco'); setCbu('');
    setDomicilio(''); setLocalidad(''); setCodigoPostal('');
    setConyuge(''); setHijos(''); setAdherentes('');
    setObraSocialId(''); setProvinciaId('');
    setModalidadContratacionId(''); setSituacionId('');
    setZonaId(''); setCondicionId(''); setActividadId('');
    setSiniestradoId(''); setObservaciones('');
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
          profileId,
          cuil: cuil.trim(),
          legajo: legajo.trim(),
          nombre: nombre.trim(),
          fechaAlta: fechaAlta || undefined,
          fechaBaja: fechaBaja || undefined,
          modoContrato: modoContrato || undefined,
          tipoJornada,
          convenioId: convenioId || undefined,
          categoriaId: categoriaId || undefined,
          formaPago,
          banco: banco !== '_otro banco' ? banco : undefined,
          cbu: cbu || undefined,
          lugarPago: lugarPago || undefined,
          domicilio: domicilio || undefined,
          localidad: localidad || undefined,
          codigoPostal: codigoPostal || undefined,
          conyuge: conyuge !== '' ? parseInt(conyuge, 10) : undefined,
          hijos: hijos !== '' ? parseInt(hijos, 10) : undefined,
          adherentes: adherentes !== '' ? parseInt(adherentes, 10) : undefined,
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
      queryClient.invalidateQueries({ queryKey: ['import-empleados', clientId, profileId] });
      queryClient.invalidateQueries({ queryKey: ['empleados', clientId] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al crear'),
  });

  const handleSubmit = () => {
    if (!cuil.trim() || !legajo.trim() || !nombre.trim()) {
      toast.error('CUIL, legajo y nombre son requeridos');
      return;
    }
    crear.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[95vw] sm:max-w-2xl h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Nuevo empleado</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="persona" className="flex flex-col min-h-0 flex-1">
          <TabsList className="shrink-0 grid w-full grid-cols-4">
            <TabsTrigger value="persona">Persona</TabsTrigger>
            <TabsTrigger value="laboral">Laboral</TabsTrigger>
            <TabsTrigger value="pago">Pago</TabsTrigger>
            <TabsTrigger value="codigos">Códigos</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto flex-1 pt-4">
            {/* ── PERSONA ── */}
            <TabsContent value="persona" className="space-y-5 mt-0">
              <Seccion title="Identificación">
                <div className="space-y-1">
                  <Label>CUIL *</Label>
                  <Input value={cuil} onChange={(ev) => setCuil(ev.target.value)} placeholder="20-12345678-9" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Nombre completo *</Label>
                  <Input value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Apellido, Nombre" />
                </div>
              </Seccion>
              <Seccion title="Domicilio y familia">
                <div className="space-y-1">
                  <Label>Domicilio</Label>
                  <Input value={domicilio} onChange={(ev) => setDomicilio(ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Localidad</Label>
                  <Input value={localidad} onChange={(ev) => setLocalidad(ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Provincia</Label>
                  <Select value={provinciaId || '_ninguna'} onValueChange={(v) => setProvinciaId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin provincia" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin provincia</SelectItem>
                      {catalogProvinciasCreate.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Código postal</Label>
                  <Input value={codigoPostal} onChange={(ev) => setCodigoPostal(ev.target.value)} maxLength={10} />
                </div>
                <div className="space-y-1">
                  <Label>Cónyuge</Label>
                  <Input type="number" min={0} value={conyuge} onChange={(ev) => setConyuge(ev.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Hijos</Label>
                  <Input type="number" min={0} value={hijos} onChange={(ev) => setHijos(ev.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Adherentes</Label>
                  <Input type="number" min={0} value={adherentes} onChange={(ev) => setAdherentes(ev.target.value)} placeholder="0" />
                </div>
              </Seccion>
            </TabsContent>

            {/* ── LABORAL ── */}
            <TabsContent value="laboral" className="space-y-5 mt-0">
              <Seccion title="Situación laboral">
                <div className="space-y-1">
                  <Label>Legajo *</Label>
                  <Input value={legajo} onChange={(ev) => setLegajo(ev.target.value)} placeholder="001" />
                </div>
                <div className="space-y-1">
                  <Label>Fecha de alta</Label>
                  <Input type="date" value={fechaAlta} onChange={(ev) => setFechaAlta(ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha de baja</Label>
                  <Input type="date" value={fechaBaja} onChange={(ev) => setFechaBaja(ev.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Tipo jornada</Label>
                  <Select value={tipoJornada} onValueChange={(v) => setTipoJornada(v as typeof tipoJornada)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Tiempo completo</SelectItem>
                      <SelectItem value="part_time">Part time</SelectItem>
                      <SelectItem value="reducida">Reducida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Modo contrato</Label>
                  <Input value={modoContrato} onChange={(ev) => setModoContrato(ev.target.value)} placeholder="Tiempo indeterminado" />
                </div>
              </Seccion>
              <Seccion title="Convenio y categoría">
                <div className="space-y-1">
                  <Label>Convenio</Label>
                  <Select value={convenioId || '_ninguno'} onValueChange={(v) => { setConvenioId(v === '_ninguno' ? '' : v); setCategoriaId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Sin convenio" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_ninguno">Sin convenio</SelectItem>
                      {convenios.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select value={categoriaId || '_ninguna'} onValueChange={(v) => setCategoriaId(v === '_ninguna' ? '' : v)} disabled={!convenioId}>
                    <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_ninguna">Sin categoría</SelectItem>
                      {categoriasCreate.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.nombre}</SelectItem>
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
                  <Select value={obraSocialId || '_ninguna'} onValueChange={(v) => setObraSocialId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin obra social" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin obra social</SelectItem>
                      {obrasSocialesCreate.map((os) => (
                        <SelectItem key={os.id} value={os.id}>{os.codigo} — {os.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Seccion>
              <Seccion title="Datos de pago">
                <div className="space-y-1">
                  <Label>Lugar de pago</Label>
                  <Input value={lugarPago} onChange={(ev) => setLugarPago(ev.target.value)} maxLength={80} placeholder="Ej. CABA" />
                </div>
                <div className="space-y-1">
                  <Label>Forma de pago</Label>
                  <Select value={formaPago} onValueChange={(v) => setFormaPago(v as typeof formaPago)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMAS_PAGO.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Banco</Label>
                  <Select value={banco || '_otro banco'} onValueChange={setBanco}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      {BANCOS.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formaPago === 'acreditacion' && (
                  <div className="space-y-1">
                    <Label>CBU / cuenta</Label>
                    <Input value={cbu} onChange={(ev) => setCbu(ev.target.value)} maxLength={22} className="font-mono" placeholder="22 dígitos" />
                  </div>
                )}
              </Seccion>
            </TabsContent>

            {/* ── CÓDIGOS ── */}
            <TabsContent value="codigos" className="space-y-5 mt-0">
              <Seccion title="Códigos auxiliares" cols={2}>
                <div className="space-y-1">
                  <Label>Modalidad contratación</Label>
                  <Select value={modalidadContratacionId || '_ninguna'} onValueChange={(v) => setModalidadContratacionId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin modalidad" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin modalidad</SelectItem>
                      {catalogModalidadesCreate.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.codigo} — {m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Situación</Label>
                  <Select value={situacionId || '_ninguna'} onValueChange={(v) => setSituacionId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin situación" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin situación</SelectItem>
                      {catalogSituacionesCreate.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Zona</Label>
                  <Select value={zonaId || '_ninguna'} onValueChange={(v) => setZonaId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin zona" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin zona</SelectItem>
                      {catalogZonasCreate.map((z) => (
                        <SelectItem key={z.id} value={z.id}>{z.codigo} — {z.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Condición</Label>
                  <Select value={condicionId || '_ninguna'} onValueChange={(v) => setCondicionId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin condición" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin condición</SelectItem>
                      {catalogCondicionesCreate.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Actividad</Label>
                  <Select value={actividadId || '_ninguna'} onValueChange={(v) => setActividadId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin actividad" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin actividad</SelectItem>
                      {catalogActividadesCreate.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.codigo} — {a.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Siniestrado</Label>
                  <Select value={siniestradoId || '_ninguna'} onValueChange={(v) => setSiniestradoId(v === '_ninguna' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin siniestrado" /></SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      <SelectItem value="_ninguna">Sin siniestrado</SelectItem>
                      {catalogSiniestradosCreate.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

        <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={crear.isPending} onClick={handleSubmit}>
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export function SueldosEmpleados({
  clientId,
  profileId,
  onVerRecibos,
}: SueldosEmpleadosProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [ocultarBajas, setOcultarBajas] = useState(true);
  const [detalleRow, setDetalleRow] = useState<EmpleadoRow | null>(null);

  const importEmpleadosQuery = useQuery({
    queryKey: ['import-empleados', clientId, profileId],
    queryFn: () => listImportEmpleados({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
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
    queryKey: ['convenios', clientId, profileId],
    queryFn: () => listConvenios({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const sincronizar = useMutation({
    mutationFn: () =>
      sincronizarConveniosEmpleados({ data: { clientId, profileId } }),
    onSuccess: (result) => {
      toast.success(result.mensaje);
      queryClient.invalidateQueries({ queryKey: ['import-empleados', clientId, profileId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al sincronizar'),
  });

  // Dialog para dar de baja
  const [dialogBaja, setDialogBaja] = useState<{ id: string; nombre: string } | null>(null);
  const [fechaBajaInput, setFechaBajaInput] = useState('');

  const darDeBaja = useMutation({
    mutationFn: ({ id, fechaBaja }: { id: string; fechaBaja: string }) =>
      updateEmpleado({ data: { id, clientId, fechaBaja } }),
    onSuccess: () => {
      toast.success('Fecha de baja registrada');
      setDialogBaja(null);
      setFechaBajaInput('');
      queryClient.invalidateQueries({ queryKey: ['import-empleados', clientId, profileId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  const reactivar = useMutation({
    mutationFn: (id: string) =>
      updateEmpleado({ data: { id, clientId, fechaBaja: null } }),
    onSuccess: () => {
      toast.success('Empleado reactivado');
      queryClient.invalidateQueries({ queryKey: ['import-empleados', clientId, profileId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  const eliminar = useMutation({
    mutationFn: (empleadoId: string) =>
      deleteManualEmpleado({ data: { clientId, empleadoId } }),
    onSuccess: () => {
      toast.success('Empleado eliminado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId, profileId],
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: employerConfig } = useQuery({
    queryKey: ['payroll-employer-config', clientId, profileId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const plantillaEmpleadoId = employerConfig?.plantillaEmpleadoId ?? null;

  const setPlantilla = useMutation({
    mutationFn: (empleadoId: string | null) =>
      setPlantillaEmpleado({ data: { clientId, profileId, empleadoId } }),
    onSuccess: (_, empleadoId) => {
      toast.success(empleadoId ? 'Plantilla base actualizada' : 'Plantilla base eliminada');
      queryClient.invalidateQueries({ queryKey: ['payroll-employer-config', clientId, profileId] });
      queryClient.invalidateQueries({ queryKey: ['plantilla-manual-sos', clientId, profileId] });
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground break-words">
          Empleados del perfil fiscal (importados desde LSD o creados
          manualmente).
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => sincronizar.mutate()}
            disabled={sincronizar.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${sincronizar.isPending ? 'animate-spin' : ''}`} />
            Sincronizar convenios
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, CUIL o legajo…"
            value={busqueda}
            onChange={(e) => handleBusqueda(e.target.value)}
            className="pl-8"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={ocultarBajas}
            onChange={(e) => { setOcultarBajas(e.target.checked); setPagina(1); }}
            className="h-4 w-4 accent-primary"
          />
          Ocultar bajas
        </label>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border">
        <Table className="w-full min-w-0 table-fixed text-sm">
          <colgroup>
            <col className="w-[21%]" />
            <col className="w-[14%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[9%]" />
            <col className="w-[7%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal">Nombre</TableHead>
              <TableHead>CUIL</TableHead>
              <TableHead>Legajo</TableHead>
              <TableHead className="whitespace-normal">Fecha alta</TableHead>
              <TableHead className="whitespace-normal">Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Recibos</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {busqueda
                    ? 'Sin resultados para la búsqueda.'
                    : ocultarBajas
                      ? 'No hay empleados activos. Desactivá "Ocultar bajas" para ver todos.'
                      : 'No hay empleados para este perfil. Ejecutá el import de Excel en el scrapper o creá uno manualmente.'}
                </TableCell>
              </TableRow>
            ) : (
              paginaRows.map((r) => {
                const e = r.empleado;
                const baja = e.fechaBaja != null;
                const esManual = e.origen === 'manual';
                return (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetalleRow(r)}
                  >
                    <TableCell className="min-w-0 break-words font-medium align-top py-2">
                      {formatTitleCaseDisplay(e.nombre)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2 tabular-nums">
                      {e.cuil}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2 tabular-nums">
                      {legajoParaMostrar(e.legajo)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2">
                      {formatDate(e.fechaAlta ?? undefined)}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {e.categoria
                        ? formatTitleCaseDisplay(e.categoria)
                        : r.categoriaNombre
                          ? <span className="text-muted-foreground text-xs">{formatTitleCaseDisplay(r.categoriaNombre)}</span>
                          : null}
                    </TableCell>
                    <TableCell className="align-top py-2" onClick={(ev) => ev.stopPropagation()}>
                      {baja ? (
                        <button
                          type="button"
                          className="focus:outline-none"
                          disabled={reactivar.isPending}
                          title="Reactivar empleado"
                          onClick={() => reactivar.mutate(e.id)}
                        >
                          <Badge variant="secondary" className="whitespace-nowrap cursor-pointer hover:opacity-75 transition-opacity">
                            Baja {e.fechaBaja ? formatDate(e.fechaBaja) : ''}
                          </Badge>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="focus:outline-none"
                          title="Dar de baja"
                          onClick={() => {
                            setFechaBajaInput(format(new Date(), 'yyyy-MM-dd'));
                            setDialogBaja({ id: e.id, nombre: e.nombre });
                          }}
                        >
                          <Badge variant="default" className="whitespace-nowrap cursor-pointer hover:opacity-75 transition-opacity">
                            Activo
                          </Badge>
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-2" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        {onVerRecibos && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Ver recibos del empleado"
                            onClick={() => onVerRecibos(e.id)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${plantillaEmpleadoId === e.id ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-amber-500'}`}
                          title={plantillaEmpleadoId === e.id ? 'Quitar como plantilla base' : 'Usar como plantilla base para nuevos recibos'}
                          disabled={setPlantilla.isPending}
                          onClick={() => setPlantilla.mutate(plantillaEmpleadoId === e.id ? null : e.id)}
                        >
                          {plantillaEmpleadoId === e.id
                            ? <BookmarkCheck className="h-4 w-4" />
                            : <Bookmark className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="align-top py-2" onClick={(ev) => ev.stopPropagation()}>
                      {esManual && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={eliminar.isPending}
                          onClick={() => eliminar.mutate(e.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && filtrados.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {filtrados.length === rows.length
              ? `${rows.length} empleados`
              : `${filtrados.length} de ${rows.length} empleados`}
            {' · '}página {paginaActual} de {totalPaginas}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <NuevoEmpleadoDialog
        open={open}
        onClose={() => setOpen(false)}
        clientId={clientId}
        profileId={profileId}
        convenios={convenios}
      />

      <EmpleadoDetalleDialog
        row={detalleRow}
        open={detalleRow !== null}
        onClose={() => setDetalleRow(null)}
        clientId={clientId}
        profileId={profileId}
        convenios={convenios}
        onSaved={() => setDetalleRow(null)}
      />

      {/* Dialog: Dar de baja */}
      <Dialog open={dialogBaja !== null} onOpenChange={(open) => { if (!open) { setDialogBaja(null); setFechaBajaInput(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Dar de baja</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground -mt-2">
            {dialogBaja?.nombre}
          </p>
          <div className="space-y-1 pt-1">
            <Label className="text-[13px]">Fecha de baja</Label>
            <Input
              type="date"
              value={fechaBajaInput}
              onChange={(e) => setFechaBajaInput(e.target.value)}
              className="h-9 text-[13px]"
              autoFocus
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDialogBaja(null); setFechaBajaInput(''); }}
              disabled={darDeBaja.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!fechaBajaInput || darDeBaja.isPending}
              onClick={() => dialogBaja && darDeBaja.mutate({ id: dialogBaja.id, fechaBaja: fechaBajaInput })}
            >
              {darDeBaja.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
              Registrar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
