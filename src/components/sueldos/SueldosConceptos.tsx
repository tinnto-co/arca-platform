'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Info,
  ChevronLeft,
  ChevronRight,
  Search,
  Pencil,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createConcepto,
  deleteConcepto,
  getBasesCalculo,
  listConceptos,
  listTodosConceptosSos,
} from '@/actions/sueldos';
import {
  formulaLegibleSos,
  leyendaRelacionadaFormulaSos,
} from '@/lib/sos-formula-display';
import { CONCEPTO_MODO_LABELS } from '@/lib/sueldos-labels';

interface SueldosConceptosProps {
  clientId: string;
}

type ConceptoRow = Awaited<ReturnType<typeof listTodosConceptosSos>>[number];
type ConceptoOverride = Awaited<ReturnType<typeof listConceptos>>[number];
type BaseCalculoRow = Awaited<ReturnType<typeof getBasesCalculo>>[number];

/** Modos configurables desde la UI (los demás son automáticos del motor). */
const MODOS_EDITABLES = [
  'importe_manual',
  'pct_sobre_base',
  'pct_sobre_concepto',
] as const;

function ConceptoEditDialog({
  row,
  clientId,
  override,
  bases,
}: {
  row: ConceptoRow;
  clientId: string;
  override: ConceptoOverride | undefined;
  bases: BaseCalculoRow[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState('');
  const [baseCalculoId, setBaseCalculoId] = useState('');
  const [importeFijo, setImporteFijo] = useState('');
  const [importeMin, setImporteMin] = useState('');
  const [importeMax, setImporteMax] = useState('');

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setModo(override?.modo ?? '');
      setBaseCalculoId(override?.baseCalculoId ?? '');
      setImporteFijo(override?.importeFijo ?? '');
      setImporteMin(override?.importeMin ?? '');
      setImporteMax(override?.importeMax ?? '');
    }
  };

  const invalidar = () =>
    queryClient.invalidateQueries({
      queryKey: ['conceptos-cliente', clientId],
    });

  const guardar = useMutation({
    mutationFn: () =>
      createConcepto({
        data: {
          clientId,
          numeroSos: row.numero,
          codigo: override?.codigo ?? String(row.numero),
          nombre: override?.nombre ?? row.nombre,
          modo:
            modo === ''
              ? undefined
              : (modo as (typeof MODOS_EDITABLES)[number]),
          baseCalculoId:
            modo === 'pct_sobre_base' && baseCalculoId !== ''
              ? baseCalculoId
              : undefined,
          importeFijo:
            importeFijo.trim() !== '' ? Number(importeFijo) : undefined,
          importeMin: importeMin.trim() !== '' ? Number(importeMin) : null,
          importeMax: importeMax.trim() !== '' ? Number(importeMax) : null,
          orden: override?.orden ?? 0,
        },
      }),
    onSuccess: () => {
      toast.success(`Concepto ${row.numero} configurado para el cliente`);
      invalidar();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quitar = useMutation({
    mutationFn: () => deleteConcepto({ data: { id: override!.id, clientId } }),
    onSuccess: () => {
      toast.success(
        `Concepto ${row.numero}: se volvió a la configuración del catálogo`
      );
      invalidar();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const faltaBase = modo === 'pct_sobre_base' && baseCalculoId === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Configurar para este cliente"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] hover:bg-[#F1EFE8] transition-colors"
        >
          <Pencil style={{ width: 14, height: 14, color: '#B7B8BD' }} />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="font-mono text-muted-foreground mr-2">
              {row.numero}
            </span>
            {row.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Configuración propia del cliente. Lo que quede vacío se calcula con
            la regla del catálogo ({CONCEPTO_MODO_LABELS[row.modo] ?? row.modo}
            {row.baseCodigo ? ` · base ${row.baseCodigo}` : ''}).
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`modo-${row.numero}`}>Modo de cálculo</Label>
            <select
              id={`modo-${row.numero}`}
              value={modo}
              onChange={(e) => setModo(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Según catálogo</option>
              {MODOS_EDITABLES.map((m) => (
                <option key={m} value={m}>
                  {CONCEPTO_MODO_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          {modo === 'pct_sobre_base' && (
            <div className="space-y-1.5">
              <Label htmlFor={`base-${row.numero}`}>Base de cálculo</Label>
              <select
                id={`base-${row.numero}`}
                value={baseCalculoId}
                onChange={(e) => setBaseCalculoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Elegir base…</option>
                {bases.map((b) => (
                  <option key={b.id} value={b.id} title={b.descripcion}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`fijo-${row.numero}`}>Importe fijo ($)</Label>
            <Input
              id={`fijo-${row.numero}`}
              type="number"
              step="0.01"
              placeholder="Sin importe fijo"
              value={importeFijo}
              onChange={(e) => setImporteFijo(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`min-${row.numero}`}>Importe mínimo</Label>
              <Input
                id={`min-${row.numero}`}
                type="number"
                step="0.01"
                placeholder="—"
                value={importeMin}
                onChange={(e) => setImporteMin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`max-${row.numero}`}>Importe máximo</Label>
              <Input
                id={`max-${row.numero}`}
                type="number"
                step="0.01"
                placeholder="—"
                value={importeMax}
                onChange={(e) => setImporteMax(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {override ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={quitar.isPending}
              onClick={() => quitar.mutate()}
            >
              {quitar.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Quitar personalización
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            disabled={guardar.isPending || faltaBase}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConceptoDialog({ row }: { row: ConceptoRow }) {
  const meta = {
    modo: row.modo,
    baseCodigo: row.baseCodigo,
    divCantidad: row.divCantidad,
    divHsNorm: row.divHsNorm,
    tieneCantidad: row.usaCantidad,
    tienePct: row.usaPct,
    tieneImporte: row.usaImporte,
    tieneImpConceptoNro: row.usaConceptoRef,
    tieneImpMin: row.usaImporteMin,
    tieneImpMax: row.usaImporteMax,
  };
  const formula = formulaLegibleSos(meta);
  const leyenda = leyendaRelacionadaFormulaSos(meta);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] hover:bg-[#F1EFE8] transition-colors"
        >
          <Info style={{ width: 15, height: 15, color: '#B7B8BD' }} />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="font-mono text-muted-foreground mr-2">
              {row.numero}
            </span>
            {row.nombre}
            {row.codigoAfip && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                AFIP: {row.codigoAfip}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-3">
          <div>
            <p className="text-muted-foreground">Fórmula del concepto</p>
            <p className="mt-1 font-mono leading-relaxed text-foreground break-words">
              {formula}
            </p>
          </div>
          {leyenda.length > 0 && (
            <div className="border-t border-border/60 pt-2">
              <p className="text-muted-foreground mb-1.5">
                Significado de las abreviaturas
              </p>
              <ul className="max-h-[min(40vh,14rem)] space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug text-muted-foreground">
                {leyenda.map((item) => (
                  <li key={item.sigla} className="flex gap-2">
                    <span className="shrink-0 font-mono font-medium text-foreground">
                      {item.sigla}
                    </span>
                    <span>{item.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 10;

export function SueldosConceptos({ clientId }: SueldosConceptosProps) {
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['todos-conceptos-sos'],
    queryFn: () => listTodosConceptosSos(),
    staleTime: 10 * 60 * 1000,
    enabled: !!clientId,
  });

  // Overrides del cliente (cliente_concepto) + canastas de base para el editor.
  const { data: overrides = [] } = useQuery({
    queryKey: ['conceptos-cliente', clientId],
    queryFn: () => listConceptos({ data: { clientId } }),
    enabled: !!clientId,
  });
  const { data: bases = [] } = useQuery({
    queryKey: ['bases-calculo'],
    queryFn: () => getBasesCalculo(),
    staleTime: 10 * 60 * 1000,
  });
  const overridePorNumero = useMemo(
    () => new Map(overrides.map((o) => [o.numeroSos, o])),
    [overrides]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conceptos;
    return conceptos.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.codigoAfip ?? '').toLowerCase().includes(q)
    );
  }, [conceptos, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * PAGE_SIZE;
  const pagina_rows = filtrados.slice(inicio, inicio + PAGE_SIZE);

  const handleBusqueda = (v: string) => {
    setBusqueda(v);
    setPagina(1);
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {/* Intro text */}
      <p className="text-[13.5px] max-w-[760px]" style={{ color: '#6E7079' }}>
        Catálogo completo de conceptos SOS (códigos 1–699). Todos los conceptos
        están disponibles para usar en cualquier recibo.
      </p>

      {/* Search pill */}
      <div
        className="flex items-center gap-[9px] w-[380px] bg-white rounded-[10px] px-[13px] py-[8px]"
        style={{ border: '1px solid #DFDCD3' }}
      >
        <Search
          style={{ width: 15, height: 15, color: '#9B9CA3', flexShrink: 0 }}
        />
        <input
          type="text"
          placeholder="Buscar por nombre o código AFIP…"
          value={busqueda}
          onChange={(e) => handleBusqueda(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-[#9B9CA3]"
          style={{ color: '#12131A' }}
        />
      </div>

      {/* Table */}
      <div
        className="w-full overflow-hidden rounded-[10px]"
        style={{ border: '1px solid #ECEAE3' }}
      >
        {/* Navy header */}
        <div
          className="grid h-[44px] items-center px-5 rounded-t-[10px] text-[10.5px] font-semibold tracking-[0.06em] uppercase"
          style={{
            background: '#0B1730',
            color: '#E7EAF2',
            gridTemplateColumns: '120px 140px 1fr 96px',
          }}
        >
          <span>Cód. SOS</span>
          <span>Cód. AFIP</span>
          <span>Nombre</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div
            className="px-5 py-[14px] text-[13.5px] text-center"
            style={{ color: '#9B9CA3' }}
          >
            Cargando...
          </div>
        ) : filtrados.length === 0 ? (
          <div
            className="px-5 py-[14px] text-[13.5px] text-center"
            style={{ color: '#9B9CA3' }}
          >
            {busqueda
              ? 'Sin resultados para la búsqueda.'
              : 'No hay conceptos en el catálogo.'}
          </div>
        ) : (
          pagina_rows.map((row) => (
            <div
              key={row.id}
              className="grid items-center px-5 py-[14px] transition-[background] duration-[120ms] hover:bg-[#FBFAF6]"
              style={{
                gridTemplateColumns: '120px 140px 1fr 96px',
                borderBottom: '1px solid #ECEAE3',
              }}
            >
              {/* CÓD. SOS */}
              <span
                className="text-[13.5px] font-semibold tabular-nums"
                style={{ color: '#12131A' }}
              >
                {row.numero}
              </span>
              {/* CÓD. AFIP */}
              <span
                className="font-[family-name:var(--ff-mono)] text-[12.5px]"
                style={{ color: '#9B9CA3' }}
              >
                {row.codigoAfip ?? '—'}
              </span>
              {/* NOMBRE */}
              <span
                className="text-[13.5px] min-w-0 break-words"
                style={{ color: '#3E404A' }}
              >
                {row.nombre}
                {overridePorNumero.has(row.numero) && (
                  <span
                    className="ml-2 inline-block rounded-full px-2 py-[1px] text-[10.5px] font-semibold align-middle"
                    style={{ background: '#F1EFE8', color: '#6E7079' }}
                    title="Este cliente tiene una configuración propia para el concepto"
                  >
                    Personalizado
                  </span>
                )}
              </span>
              {/* ACCIONES */}
              <div className="flex justify-end gap-1">
                <ConceptoEditDialog
                  row={row}
                  clientId={clientId}
                  override={overridePorNumero.get(row.numero)}
                  bases={bases}
                />
                <ConceptoDialog row={row} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!isLoading && filtrados.length > 0 && (
        <div className="flex items-center justify-between py-4 px-[2px]">
          <span className="text-[12.5px]" style={{ color: '#9B9CA3' }}>
            {filtrados.length === conceptos.length
              ? `${conceptos.length} de ${conceptos.length} conceptos`
              : `${filtrados.length} de ${conceptos.length} conceptos`}
            {' · '}página {paginaActual} de {totalPaginas}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
              className="bg-white border border-[#DFDCD3] rounded-[10px] text-[13.5px] font-semibold px-[17px] py-[10px] hover:bg-[#FBFAF6] disabled:opacity-40 transition-colors flex items-center gap-1"
              style={{ color: '#3E404A' }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
              className="bg-white border border-[#DFDCD3] rounded-[10px] text-[13.5px] font-semibold px-[17px] py-[10px] hover:bg-[#FBFAF6] disabled:opacity-40 transition-colors flex items-center gap-1"
              style={{ color: '#3E404A' }}
            >
              Siguiente
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
