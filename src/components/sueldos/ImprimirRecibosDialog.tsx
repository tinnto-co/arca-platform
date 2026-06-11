'use client';

import { useState, useEffect } from 'react';
import { Loader2, Printer, Download, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listRecibosDetalleParaPDF } from '@/actions/sueldos';
import { legajoParaMostrar } from '@/lib/legajo';
import { toTitleCase } from '@/lib/format-name';
import type { ClientDataPdf, ReciboDetallePdf } from './recibo-pdf';

// ─── Constantes ───────────────────────────────────────────────────────────────

const now = new Date();
const ANOS = Array.from({ length: 8 }, (_, i) => String(now.getFullYear() - i));
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImprimirRecibosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  profileId: string;
  clientData: ClientDataPdf | null;
  firmaEmpleadorUrl: string | null;
  empleados: Array<{
    empleado: {
      id: string;
      nombre: string;
      legajo: string | null;
    };
  }>;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ImprimirRecibosDialog({
  open,
  onOpenChange,
  clientId,
  profileId,
  clientData,
  firmaEmpleadorUrl,
  empleados,
}: ImprimirRecibosDialogProps) {
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState('');
  const [todosEmpleados, setTodosEmpleados] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generandoPreview, setGenerandoPreview] = useState(false);

  // Limpiar la URL del blob al cerrar el diálogo
  useEffect(() => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function replacePreview(url: string | null) {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  function toggleEmpleado(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleTodosChange(checked: boolean) {
    setTodosEmpleados(checked);
    if (checked) setSelectedIds(new Set());
  }

  const puedeGenerar =
    !!ano &&
    !generando &&
    !generandoPreview &&
    (todosEmpleados || selectedIds.size > 0);

  async function fetchAgrupados() {
    const data = await listRecibosDetalleParaPDF({
      data: {
        clientId,
        profileId,
        ano,
        mes: mes || undefined,
        empleadoIds: todosEmpleados ? undefined : [...selectedIds],
      },
    });

    const byEmployee = new Map<string, { empleadoNombre: string; recibos: typeof data }>();
    for (const item of data) {
      const id = item.empleado.id;
      if (!byEmployee.has(id)) {
        byEmployee.set(id, { empleadoNombre: item.empleado.nombre, recibos: [] });
      }
      byEmployee.get(id)!.recibos.push(item);
    }

    return { data, agrupados: [...byEmployee.values()] };
  }

  // ── Vista previa ─────────────────────────────────────────────────────────

  async function handlePreview() {
    if (!ano) {
      toast.error('Seleccioná un año.');
      return;
    }
    setGenerandoPreview(true);
    try {
      const { agrupados } = await fetchAgrupados();
      if (agrupados.length === 0) {
        toast.error('No se encontraron recibos para los filtros seleccionados.');
        return;
      }

      const { generarPdfBlobEmpleado } = await import('./recibo-pdf');
      const todosLosRecibos = agrupados.flatMap((a) => a.recibos);
      const blob = await generarPdfBlobEmpleado(
        todosLosRecibos as ReciboDetallePdf[],
        clientData,
        firmaEmpleadorUrl,
      );
      replacePreview(URL.createObjectURL(blob));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar la vista previa.');
    } finally {
      setGenerandoPreview(false);
    }
  }

  // ── Generar y descargar ───────────────────────────────────────────────────

  async function handleGenerar() {
    if (!ano) {
      toast.error('Seleccioná un año.');
      return;
    }
    if (!todosEmpleados && selectedIds.size === 0) {
      toast.error('Seleccioná al menos un empleado.');
      return;
    }

    setGenerando(true);
    setProgreso('Buscando recibos…');

    try {
      const { data, agrupados } = await fetchAgrupados();

      if (data.length === 0) {
        toast.error('No se encontraron recibos para los filtros seleccionados.');
        return;
      }

      const totalEmpleados = agrupados.length;
      setProgreso(
        totalEmpleados === 1 ? 'Generando PDF…' : `Generando ${totalEmpleados} PDFs…`,
      );

      const { generarYDescargar } = await import('./recibo-pdf');

      await generarYDescargar({
        recibosAgrupados: agrupados as Array<{ empleadoNombre: string; recibos: ReciboDetallePdf[] }>,
        clientData,
        firmaEmpleadorUrl,
        ano,
        mes,
        onProgress: (current, total) => {
          if (total > 1) setProgreso(`Generando PDF ${current + 1} de ${total}…`);
        },
      });

      const totalRecibos = data.length;
      toast.success(
        totalEmpleados === 1
          ? `PDF generado: ${totalRecibos} recibo${totalRecibos !== 1 ? 's' : ''}.`
          : `ZIP generado con ${totalEmpleados} PDFs (${totalRecibos} recibos en total).`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar el PDF.');
    } finally {
      setGenerando(false);
      setProgreso('');
    }
  }

  const showPreview = !!previewUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showPreview ? 'flex h-[88vh] w-[95vw] max-w-[95vw] sm:max-w-[95vw] flex-col' : 'max-w-lg'}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Imprimir recibos en PDF
          </DialogTitle>
        </DialogHeader>

        <div className={showPreview ? 'flex min-h-0 flex-1 gap-6 overflow-hidden' : undefined}>

          {/* ── Panel izquierdo: filtros ──────────────────────────────────── */}
          <div className={showPreview ? 'w-72 shrink-0 space-y-4 overflow-y-auto py-2' : 'space-y-4 py-2'}>

            {/* Año */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Año <span className="text-destructive">*</span>
              </label>
              <Select value={ano} onValueChange={setAno} disabled={generando}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Seleccioná un año" />
                </SelectTrigger>
                <SelectContent>
                  {ANOS.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Mes{' '}
                <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Select
                value={mes || '__all'}
                onValueChange={(v) => setMes(v === '__all' ? '' : v)}
                disabled={generando}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos los meses del año</SelectItem>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Empleados */}
            <div>
              <label className="mb-2 block text-sm font-medium">Empleados</label>

              <div className="mb-2 flex items-center gap-2">
                <Checkbox
                  id="todos-empleados"
                  checked={todosEmpleados}
                  onCheckedChange={(v) => handleTodosChange(!!v)}
                  disabled={generando}
                />
                <label htmlFor="todos-empleados" className="cursor-pointer text-sm select-none">
                  Todos los empleados
                </label>
              </div>

              {!todosEmpleados && (
                <div className="rounded-md border bg-muted/20">
                  {empleados.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No hay empleados disponibles.</p>
                  ) : (
                    <ScrollArea className="h-[160px]">
                      <div className="divide-y">
                        {empleados.map(({ empleado: e }) => (
                          <label
                            key={e.id}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40 select-none"
                          >
                            <Checkbox
                              checked={selectedIds.has(e.id)}
                              onCheckedChange={() => toggleEmpleado(e.id)}
                              disabled={generando}
                            />
                            <span className="flex-1 truncate">{toTitleCase(e.nombre)}</span>
                            {e.legajo && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                Leg. {legajoParaMostrar(e.legajo)}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  {selectedIds.size > 0 && (
                    <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                      {selectedIds.size} empleado{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Info */}
            {!showPreview && (
              <p className="rounded-md border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {!todosEmpleados && selectedIds.size > 1
                  ? `Se generará un ZIP con ${selectedIds.size} PDFs (uno por empleado). Cada PDF incluye todos los recibos del período con copia empleado y copia empleador.`
                  : 'Se generará un PDF con todos los recibos encontrados. Cada recibo ocupa dos hojas: copia empleado y copia empleador.'}
              </p>
            )}

            {/* Progreso */}
            {generando && progreso && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                {progreso}
              </div>
            )}
          </div>

          {/* ── Panel derecho: vista previa ───────────────────────────────── */}
          {showPreview && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 py-2">
              <div className="flex shrink-0 items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Vista previa
                </span>
                <button
                  type="button"
                  onClick={() => replacePreview(null)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  title="Cerrar vista previa"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <iframe
                src={`${previewUrl}#zoom=100`}
                className="min-h-0 w-full flex-1 rounded border border-border"
                title="Vista previa del recibo"
              />
            </div>
          )}
        </div>

        {/* ── Acciones ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generando}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={!puedeGenerar}
            className="gap-2"
          >
            {generandoPreview
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Eye className="h-4 w-4" />}
            {generandoPreview ? 'Generando…' : 'Vista previa'}
          </Button>
          <Button onClick={handleGenerar} disabled={!puedeGenerar} className="gap-2">
            {generando
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {generando ? 'Generando…' : 'Generar y descargar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
