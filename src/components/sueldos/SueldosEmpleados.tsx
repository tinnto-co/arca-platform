'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, RefreshCw, Pencil, Save, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  listImportEmpleados,
  createManualEmpleado,
  deleteManualEmpleado,
  listConvenios,
  listCategoriasByConvenio,
  listObrasSociales,
  sincronizarConveniosEmpleados,
  updateEmpleado,
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
    const dt = typeof d === 'string' ? parseISO(d) : d;
    return format(dt, 'dd/MM/yyyy');
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

function formaPagoLabel(v: string | null | undefined): string {
  if (!v) return '—';
  const s = v.trim().toLowerCase();
  if (s === '1' || s === 'efectivo') return 'Efectivo';
  if (s === '2' || s === 'acreditacion' || s === 'acreditación') return 'Acreditación';
  if (s === '3' || s === 'cheque') return 'Cheque';
  return v;
}

// ─── Dialog de detalle del empleado ────────────────────────────────────────

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

function Seccion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

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
  const [activo, setActivo] = useState(true);
  const [tipoJornada, setTipoJornada] = useState<'full_time' | 'part_time' | 'reducida'>('full_time');
  const [convenioId, setConvenioId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
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
  // Códigos auxiliares
  const [codModalidad, setCodModalidad] = useState('');
  const [codSituacion, setCodSituacion] = useState('');
  const [codZona, setCodZona] = useState('');
  const [codCondicion, setCodCondicion] = useState('');
  const [codActividad, setCodActividad] = useState('');
  const [codSiniestrado, setCodSiniestrado] = useState('');
  const [observaciones, setObservaciones] = useState('');

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

  const resetForm = (r: EmpleadoRow) => {
    const emp = r.empleado;
    setNombre(emp.nombre ?? '');
    setCuil(emp.cuil ?? '');
    setFechaAlta(
      emp.fechaAlta
        ? format(typeof emp.fechaAlta === 'string' ? parseISO(emp.fechaAlta) : emp.fechaAlta, 'yyyy-MM-dd')
        : ''
    );
    setActivo(emp.activo ?? true);
    setTipoJornada((emp.tipoJornada as 'full_time' | 'part_time' | 'reducida') ?? 'full_time');
    setConvenioId(emp.convenioId ?? '');
    setCategoriaId(emp.categoriaId ?? '');
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
    setCodModalidad(emp.codigoModalidadContratacion ?? '');
    setCodSituacion(emp.codigoSituacion ?? '');
    setCodZona(emp.codigoZona ?? '');
    setCodCondicion(emp.codigoCondicion ?? '');
    setCodActividad(emp.codigoActividad ?? '');
    setCodSiniestrado(emp.codigoSiniestrado ?? '');
    setObservaciones(emp.observaciones ?? '');
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
          fechaIngreso: fechaAlta || undefined,
          activo,
          tipoJornada,
          convenioId: convenioId || undefined,
          categoriaId: categoriaId || undefined,
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
          codigoModalidadContratacion: codModalidad.trim() || null,
          codigoSituacion: codSituacion.trim() || null,
          codigoZona: codZona.trim() || null,
          codigoCondicion: codCondicion.trim() || null,
          codigoActividad: codActividad.trim() || null,
          codigoSiniestrado: codSiniestrado.trim() || null,
          observaciones: observaciones.trim() || null,
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
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col">
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
                    <Campo label="Código postal" value={e.codigoPostal} />
                    <Campo label="Cónyuge" value={e.conyuge != null ? String(e.conyuge) : null} />
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
                      <Label>Fecha de alta</Label>
                      <Input type="date" value={fechaAlta} onChange={(ev) => setFechaAlta(ev.target.value)} />
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
                    <Campo label="Fecha de alta" value={formatDate(e.fechaAlta)} />
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
                      <Label>Categoría</Label>
                      <Select value={categoriaId} onValueChange={setCategoriaId} disabled={!convenioId}>
                        <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                        <SelectContent>
                          {categoriasEdit.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Convenio" value={row.convenioNombre ? formatTitleCaseDisplay(row.convenioNombre) : null} />
                    <Campo label="Categoría (sistema)" value={row.categoriaNombre ? formatTitleCaseDisplay(row.categoriaNombre) : null} />
                    <Campo label="Categoría (importado)" value={e.categoria ? formatTitleCaseDisplay(e.categoria) : null} />
                  </>
                )}
              </Seccion>
              <Seccion title="Remuneración">
                <Campo label="Sueldo básico override" value={e.valorSueldo ? `$${Number(e.valorSueldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : null} />
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
              <Seccion title="Códigos auxiliares">
                {isEditing ? (
                  <>
                    <div className="space-y-1">
                      <Label>Modalidad contratación</Label>
                      <Input value={codModalidad} onChange={(ev) => setCodModalidad(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Situación</Label>
                      <Input value={codSituacion} onChange={(ev) => setCodSituacion(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Zona</Label>
                      <Input value={codZona} onChange={(ev) => setCodZona(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Condición</Label>
                      <Input value={codCondicion} onChange={(ev) => setCodCondicion(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Actividad</Label>
                      <Input value={codActividad} onChange={(ev) => setCodActividad(ev.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Siniestrado</Label>
                      <Input value={codSiniestrado} onChange={(ev) => setCodSiniestrado(ev.target.value)} />
                    </div>
                  </>
                ) : (
                  <>
                    <Campo label="Modalidad contratación" value={e.codigoModalidadContratacion} />
                    <Campo label="Situación" value={e.codigoSituacion} />
                    <Campo label="Zona" value={e.codigoZona} />
                    <Campo label="Condición" value={e.codigoCondicion} />
                    <Campo label="Actividad" value={e.codigoActividad} />
                    <Campo label="Siniestrado" value={e.codigoSiniestrado} />
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

// ─── Componente principal ──────────────────────────────────────────────────

export function SueldosEmpleados({
  clientId,
  profileId,
}: SueldosEmpleadosProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [ocultarBajas, setOcultarBajas] = useState(true);
  const [detalleRow, setDetalleRow] = useState<EmpleadoRow | null>(null);
  const [form, setForm] = useState({
    cuil: '',
    legajo: '',
    nombre: '',
    fechaAlta: '',
    fechaBaja: '',
    modoContrato: '',
    categoria: '',
    convenioId: '',
    categoriaId: '',
  });

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
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', form.convenioId, clientId],
    queryFn: () =>
      listCategoriasByConvenio({
        data: { convenioId: form.convenioId, clientId },
      }),
    enabled: !!clientId && !!form.convenioId,
  });

  const crear = useMutation({
    mutationFn: () =>
      createManualEmpleado({
        data: {
          clientId,
          profileId,
          cuil: form.cuil,
          legajo: form.legajo,
          nombre: form.nombre,
          fechaAlta: form.fechaAlta || undefined,
          fechaBaja: form.fechaBaja || undefined,
          modoContrato: form.modoContrato || undefined,
          categoria: form.categoria || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Empleado creado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId, profileId],
      });
      setOpen(false);
      setForm({
        cuil: '',
        legajo: '',
        nombre: '',
        fechaAlta: '',
        fechaBaja: '',
        modoContrato: '',
        categoria: '',
        convenioId: '',
        categoriaId: '',
      });
    },
    onError: (e) => toast.error(e.message),
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cuil || !form.legajo || !form.nombre) {
      toast.error('CUIL, legajo y nombre son requeridos');
      return;
    }
    crear.mutate();
  };

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
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Nuevo empleado manual</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="cuil">CUIL *</Label>
                  <Input
                    id="cuil"
                    value={form.cuil}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cuil: e.target.value }))
                    }
                    placeholder="20-12345678-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="legajo">Legajo *</Label>
                  <Input
                    id="legajo"
                    value={form.legajo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, legajo: e.target.value }))
                    }
                    placeholder="001"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="nombre">Nombre completo *</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  placeholder="Apellido, Nombre"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="fechaAlta">Fecha de alta</Label>
                  <Input
                    id="fechaAlta"
                    type="date"
                    value={form.fechaAlta}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fechaAlta: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fechaBaja">Fecha de baja</Label>
                  <Input
                    id="fechaBaja"
                    type="date"
                    value={form.fechaBaja}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fechaBaja: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="modoContrato">Modo contrato</Label>
                  <Input
                    id="modoContrato"
                    value={form.modoContrato}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, modoContrato: e.target.value }))
                    }
                    placeholder="Tiempo indeterminado"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="convenio">Convenio</Label>
                  <Select
                    value={form.convenioId}
                    onValueChange={(value) =>
                      setForm((f) => ({
                        ...f,
                        convenioId: value,
                        categoriaId: '',
                      }))
                    }
                  >
                    <SelectTrigger id="convenio">
                      <SelectValue placeholder="Seleccionar convenio" />
                    </SelectTrigger>
                    <SelectContent>
                      {convenios.map((convenio) => (
                        <SelectItem key={convenio.id} value={convenio.id}>
                          {convenio.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="categoria">Categoría</Label>
                  <Select
                    value={form.categoriaId}
                    onValueChange={(value) => {
                      const categoriaSeleccionada = categorias.find(
                        (categoria) => categoria.id === value
                      );
                      setForm((f) => ({
                        ...f,
                        categoriaId: value,
                        categoria: categoriaSeleccionada
                          ? `${categoriaSeleccionada.codigo} - ${categoriaSeleccionada.nombre}`
                          : '',
                      }));
                    }}
                    disabled={!form.convenioId}
                  >
                    <SelectTrigger id="categoria">
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id}>
                          {categoria.codigo} - {categoria.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={crear.isPending}>
                  {crear.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
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
            <col className="w-[20%]" />
            <col className="w-[14%]" />
            <col className="w-[7%]" />
            <col className="w-[9%]" />
            <col className="w-[17%]" />
            <col className="w-[17%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal">Nombre</TableHead>
              <TableHead>CUIL</TableHead>
              <TableHead>Legajo</TableHead>
              <TableHead className="whitespace-normal">Fecha alta</TableHead>
              <TableHead className="whitespace-normal">Convenio</TableHead>
              <TableHead className="whitespace-normal">Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
                      {r.convenioNombre
                        ? formatTitleCaseDisplay(r.convenioNombre)
                        : <span className="text-muted-foreground text-xs">Sin vincular</span>}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {r.categoriaNombre
                        ? formatTitleCaseDisplay(r.categoriaNombre)
                        : <span className="text-muted-foreground text-xs">{formatTitleCaseDisplay(e.categoria)}</span>}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      {baja ? (
                        <Badge variant="secondary" className="whitespace-nowrap">Baja</Badge>
                      ) : (
                        <Badge variant="default" className="whitespace-nowrap">Activo</Badge>
                      )}
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

      <EmpleadoDetalleDialog
        row={detalleRow}
        open={detalleRow !== null}
        onClose={() => setDetalleRow(null)}
        clientId={clientId}
        profileId={profileId}
        convenios={convenios}
        onSaved={() => setDetalleRow(null)}
      />
    </div>
  );
}
