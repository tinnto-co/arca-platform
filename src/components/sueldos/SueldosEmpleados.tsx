'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, RefreshCw, Wallet } from 'lucide-react';
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

export function SueldosEmpleados({
  clientId,
  profileId,
}: SueldosEmpleadosProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pagoEdit, setPagoEdit] = useState<{
    empleadoId: string;
    lugarPago: string;
    formaPago: (typeof FORMAS_PAGO)[number]['value'];
    banco: string;
    cbu: string;
  } | null>(null);
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
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId, profileId],
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al sincronizar'),
  });

  const guardarPagoLegajo = useMutation({
    mutationFn: async () => {
      if (!pagoEdit) return;
      await updateEmpleado({
        data: {
          id: pagoEdit.empleadoId,
          clientId,
          lugarPago: pagoEdit.lugarPago.trim() || null,
          formaPago: pagoEdit.formaPago,
          banco: pagoEdit.banco.trim() || null,
          cbu: pagoEdit.cbu.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success('Datos de pago del legajo guardados');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId, profileId],
      });
      queryClient.invalidateQueries({ queryKey: ['empleados', clientId] });
      queryClient.invalidateQueries({ queryKey: ['recibo-detalle'] });
      setPagoEdit(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar'),
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
            <RefreshCw
              className={`h-4 w-4 ${sincronizar.isPending ? 'animate-spin' : ''}`}
            />
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

      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border">
        <Table className="w-full min-w-0 table-fixed text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal">Nombre</TableHead>
              <TableHead>CUIL</TableHead>
              <TableHead>Legajo</TableHead>
              <TableHead className="whitespace-normal">Fecha alta</TableHead>
              <TableHead className="whitespace-normal">Fecha baja</TableHead>
              <TableHead className="whitespace-normal">Convenio</TableHead>
              <TableHead className="whitespace-normal">Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="whitespace-normal">Pago</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-muted-foreground"
                >
                  No hay empleados para este perfil. Ejecutá el import de Excel
                  en el scrapper o creá uno manualmente con el botón "Nuevo
                  empleado".
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const e = r.empleado;
                const baja = e.fechaBaja != null;
                const esManual = e.origen === 'manual';
                return (
                  <TableRow key={e.id}>
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
                    <TableCell className="whitespace-nowrap align-top py-2">
                      {formatDate(e.fechaBaja ?? undefined)}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {r.convenioNombre ? (
                        formatTitleCaseDisplay(r.convenioNombre)
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Sin vincular
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {r.categoriaNombre ? (
                        formatTitleCaseDisplay(r.categoriaNombre)
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {formatTitleCaseDisplay(e.categoria)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      {baja ? (
                        <Badge
                          variant="secondary"
                          className="whitespace-nowrap"
                        >
                          Baja
                        </Badge>
                      ) : (
                        <Badge variant="default" className="whitespace-nowrap">
                          Activo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1 h-8"
                        onClick={() =>
                          setPagoEdit({
                            empleadoId: e.id,
                            lugarPago: e.lugarPago ?? '',
                            formaPago: formaDbToSelect(e.formaPago),
                            banco:
                              e.banco && e.banco.trim() !== ''
                                ? e.banco
                                : '_otro banco',
                            cbu: e.cbu ?? '',
                          })
                        }
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Legajo
                      </Button>
                    </TableCell>
                    <TableCell className="align-top py-2">
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

      <Dialog
        open={pagoEdit !== null}
        onOpenChange={(v) => {
          if (!v) setPagoEdit(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Datos de pago del legajo</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Se usan en el recibo de haberes cuando el período no trae esos
              datos. CBU aplica si la forma de pago es acreditación.
            </p>
          </DialogHeader>
          {pagoEdit ? (
            <div className="grid gap-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="pago-lugar">Lugar de pago</Label>
                <Input
                  id="pago-lugar"
                  value={pagoEdit.lugarPago}
                  onChange={(ev) =>
                    setPagoEdit((p) =>
                      p ? { ...p, lugarPago: ev.target.value } : p
                    )
                  }
                  maxLength={80}
                  placeholder="Ej. CABA"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Forma de pago</Label>
                  <Select
                    value={pagoEdit.formaPago}
                    onValueChange={(value) =>
                      setPagoEdit((p) =>
                        p
                          ? {
                              ...p,
                              formaPago:
                                value as (typeof FORMAS_PAGO)[number]['value'],
                            }
                          : p
                      )
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
                    value={pagoEdit.banco || '_otro banco'}
                    onValueChange={(value) =>
                      setPagoEdit((p) => (p ? { ...p, banco: value } : p))
                    }
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
              </div>
              {pagoEdit.formaPago === 'acreditacion' && (
                <div className="space-y-1">
                  <Label htmlFor="pago-cbu">CBU / cuenta</Label>
                  <Input
                    id="pago-cbu"
                    value={pagoEdit.cbu}
                    onChange={(ev) =>
                      setPagoEdit((p) =>
                        p ? { ...p, cbu: ev.target.value } : p
                      )
                    }
                    maxLength={22}
                    className="font-mono"
                    placeholder="22 dígitos"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPagoEdit(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={guardarPagoLegajo.isPending}
                  onClick={() => guardarPagoLegajo.mutate()}
                >
                  {guardarPagoLegajo.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
