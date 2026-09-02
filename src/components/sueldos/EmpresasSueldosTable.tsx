/**
 * Portada de Sueldos: tabla de empresas.
 *
 * Reemplaza al estado vacío "Seleccioná una empresa", que obligaba a saber de
 * antemano qué empresa buscabas. Acá se ve el padrón entero con las señales que
 * importan para decidir por dónde empezar el mes.
 *
 * Muestra TODAS las empresas, no sólo las que liquidan: la tabla es también el
 * lugar donde se habilita el módulo para una empresa nueva.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  listEmpresasSueldos,
  toggleLiquidaSueldos,
  updateRazonSocial,
} from '@/actions/sueldos';

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
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['empresasSueldos'],
    queryFn: () => listEmpresasSueldos(),
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['empresasSueldos'] });
    queryClient.invalidateQueries({ queryKey: ['clientesSueldos'] });
  };

  const renombrar = useMutation({
    mutationFn: (v: { clientId: string; razonSocial: string }) =>
      updateRazonSocial({ data: v }),
    onSuccess: () => {
      setEditando(null);
      invalidar();
      toast.success('Nombre actualizado');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo renombrar'),
  });

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
      cell: ({ row }) => {
        const e = row.original;
        if (editando === e.id) {
          return (
            // stopPropagation: sin esto, editar abre la ficha de la empresa.
            <div
              className="flex items-center gap-1.5"
              onClick={(ev) => ev.stopPropagation()}
            >
              <Input
                autoFocus
                value={borrador}
                onChange={(ev) => setBorrador(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && borrador.trim())
                    renombrar.mutate({ clientId: e.id, razonSocial: borrador });
                  if (ev.key === 'Escape') setEditando(null);
                }}
                className="h-8 text-[13px]"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                disabled={!borrador.trim() || renombrar.isPending}
                onClick={() =>
                  renombrar.mutate({ clientId: e.id, razonSocial: borrador })
                }
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => setEditando(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 group/nombre min-w-0">
            <span className="font-medium truncate">{e.razonSocial}</span>
            <button
              aria-label={`Renombrar ${e.razonSocial}`}
              className="opacity-0 group-hover/nombre:opacity-100 transition-opacity shrink-0 text-[var(--arca-ink-4)] hover:text-[var(--arca-ink)]"
              onClick={(ev) => {
                ev.stopPropagation();
                setEditando(e.id);
                setBorrador(e.razonSocial);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      },
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
                ? 'text-[13px] font-medium text-[var(--arca-danger,#b3261e)]'
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
      id: 'liquidaSueldos',
      accessorFn: (r) => (r.liquidaSueldos ? 'si' : 'no'),
      header: 'Liquida sueldos',
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div onClick={(ev) => ev.stopPropagation()}>
            <Switch
              checked={e.liquidaSueldos}
              disabled={togglear.isPending}
              onCheckedChange={(v) =>
                togglear.mutate({ clientId: e.id, liquidaSueldos: v })
              }
              aria-label={`Liquida sueldos: ${e.razonSocial}`}
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.estado === 'activo' ? (
          <Badge variant="outline">Activo</Badge>
        ) : (
          <Badge variant="secondary">{row.original.estado}</Badge>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={empresas}
      isLoading={isLoading}
      // Sin buscador ni filtro propios: la empresa se busca en el selector
      // global del header, y quién liquida se ve ordenando por la columna.
      pagination
      pageSize={20}
      emptyMessage="No hay empresas cargadas"
      onRowClick={(row) => onSelect(row.id)}
    />
  );
}
