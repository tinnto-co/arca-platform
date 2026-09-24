/**
 * Portada de Sueldos: tabla de empresas.
 *
 * Reemplaza al estado vacío "Seleccioná una empresa", que obligaba a saber de
 * antemano qué empresa buscabas. Acá se ven las empresas QUE LIQUIDAN sueldos
 * con las señales que importan para decidir por dónde empezar el mes; el resto
 * del padrón entra por «Agregar empresa».
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Users, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

import { DataTable } from '@/components/ui/data-table';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { listEmpresasSueldos, toggleLiquidaSueldos } from '@/actions/sueldos';

interface Empresa {
  id: string;
  razonSocial: string;
  cuit: string;
  estado: string;
  liquidaSueldos: boolean;
  empleados: number;
  convenio: string | null;
  ultimoPeriodo: string | null;
}

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** `2026-07` → `jul 2026`. Se parte el string a mano: no es una fecha con hora. */
function formatPeriodo(p: string | null): string {
  if (!p) return '—';
  const [anio, mes] = p.split('-');
  const i = Number(mes) - 1;
  return MESES[i] ? `${MESES[i]} ${anio}` : p;
}

/** El período liquidable es el mes anterior: con eso se decide quién va atrasado. */
function periodoEsperado(): string {
  const hoy = new Date();
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function EmpresasSueldosTable({
  onSelect,
}: {
  onSelect: (clienteId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['empresasSueldos'],
    queryFn: () => listEmpresasSueldos(),
  });

  // La tabla muestra solo las que liquidan; las demás entran por el «+»
  // del header (AgregarEmpresaDialog).
  const liquidan = empresas.filter((e) => e.liquidaSueldos);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['empresasSueldos'] });
    queryClient.invalidateQueries({ queryKey: ['clientesSueldos'] });
  };

  const togglear = useMutation({
    mutationFn: (v: { clientId: string; liquidaSueldos: boolean }) =>
      toggleLiquidaSueldos({ data: v }),
    onSuccess: (_, v) => {
      invalidar();
      toast.success(
        v.liquidaSueldos ? 'Sueldos habilitado' : 'Sueldos deshabilitado'
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar'),
  });

  const esperado = periodoEsperado();

  const columns: ColumnDef<Empresa>[] = [
    {
      accessorKey: 'razonSocial',
      header: 'Empresa',
      cell: ({ row }) => (
        <span className="font-medium truncate">{row.original.razonSocial}</span>
      ),
    },
    {
      accessorKey: 'cuit',
      header: 'CUIT',
      cell: ({ row }) => (
        <span className="text-[12.5px] text-[var(--arca-ink-3)] [font-family:var(--ff-mono)]">
          {row.original.cuit}
        </span>
      ),
    },
    {
      accessorKey: 'empleados',
      header: 'Empleados',
      cell: ({ row }) => {
        const n = row.original.empleados;
        if (!n) return <span className="text-[var(--arca-ink-4)]">—</span>;
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px]">
            <Users className="h-3.5 w-3.5 text-[var(--arca-ink-4)]" />
            {n}
          </span>
        );
      },
    },
    {
      accessorKey: 'convenio',
      header: 'Convenio',
      cell: ({ row }) =>
        row.original.convenio ? (
          <span className="text-[12.5px]">{row.original.convenio}</span>
        ) : (
          <span className="text-[var(--arca-ink-4)]">—</span>
        ),
    },
    {
      accessorKey: 'ultimoPeriodo',
      header: 'Última liquidación',
      cell: ({ row }) => {
        const p = row.original.ultimoPeriodo;
        // Sólo se marca atraso si la empresa liquida: una que no liquida no
        // está atrasada, simplemente no corresponde.
        const atrasada = row.original.liquidaSueldos && (!p || p < esperado);
        return (
          <span
            className={
              atrasada
                ? 'text-[13px] font-medium text-[var(--arca-accent-neg-fg)]'
                : 'text-[13px]'
            }
            title={
              atrasada ? `Se esperaba ${formatPeriodo(esperado)}` : undefined
            }
          >
            {formatPeriodo(p)}
          </span>
        );
      },
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.estado === 'activo' ? (
          <Badge variant="success">
            <BadgeDot />
            Activo
          </Badge>
        ) : (
          <Badge>
            <BadgeDot />
            {row.original.estado}
          </Badge>
        ),
    },
    {
      id: 'quitar',
      header: '',
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div onClick={(ev) => ev.stopPropagation()} className="text-right">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={togglear.isPending}
                  aria-label={`Quitar ${e.razonSocial} de Sueldos`}
                  onClick={() =>
                    togglear.mutate({ clientId: e.id, liquidaSueldos: false })
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                Quitar de Sueldos — no borra nada, se re-agrega cuando quieras
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={liquidan}
      isLoading={isLoading}
      // Sin buscador ni filtro propios: la empresa se busca en el selector
      // global del header.
      pagination
      pageSize={20}
      // Sin checkbox: no hay ninguna acción en lote sobre estas filas, y el
      // click en la fila abre el módulo de la empresa.
      showSelection={false}
      emptyMessage="Ninguna empresa liquida sueldos todavía — agregá la primera con el + de arriba"
      onRowClick={(row) => onSelect(row.id)}
    />
  );
}

/**
 * Alta de una empresa en el módulo: elige entre las del padrón que todavía no
 * liquidan y prende su `liquidaSueldos`. No crea clientes — para eso está la
 * pantalla de Clientes. Autónomo (query y mutación propias) para poder vivir
 * en el header de la portada, al lado del selector global.
 */
export function AgregarEmpresaDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [elegida, setElegida] = useState('');

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresasSueldos'],
    queryFn: () => listEmpresasSueldos(),
  });
  const candidatas = empresas.filter((e) => !e.liquidaSueldos);

  const agregar = useMutation({
    mutationFn: (clientId: string) =>
      toggleLiquidaSueldos({ data: { clientId, liquidaSueldos: true } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['empresasSueldos'] });
      void queryClient.invalidateQueries({ queryKey: ['clientesSueldos'] });
      void queryClient.invalidateQueries({ queryKey: ['clients', 'sueldos'] });
      toast.success('Sueldos habilitado');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo agregar'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setElegida('');
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            {/* El acento ya lo pone la variante `default` del botón: no hace
                falta repintarlo con clases. */}
            <Button size="icon" aria-label="Agregar empresa a Sueldos">
              <Plus className="size-3.5" strokeWidth={2.2} />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Agregar empresa a Sueldos</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Agregar empresa a Sueldos</DialogTitle>
          <DialogDescription>
            La empresa pasa a liquidar sueldos y aparece en la tabla. No crea
            clientes nuevos: son las empresas ya cargadas en la plataforma.
          </DialogDescription>
        </DialogHeader>
        {candidatas.length === 0 ? (
          <p className="text-[13px] text-[var(--arca-ink-3)]">
            Todas las empresas del padrón ya liquidan sueldos.
          </p>
        ) : (
          <SearchableSelect
            options={candidatas.map((c) => ({
              value: c.id,
              label: `${c.razonSocial} · ${c.cuit}`,
            }))}
            value={elegida}
            onValueChange={setElegida}
            placeholder="Elegí la empresa"
            searchPlaceholder="Buscar por nombre o CUIT…"
            emptyMessage="No se encontraron empresas"
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!elegida || agregar.isPending}
            onClick={() => {
              agregar.mutate(elegida);
              setOpen(false);
              setElegida('');
            }}
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
