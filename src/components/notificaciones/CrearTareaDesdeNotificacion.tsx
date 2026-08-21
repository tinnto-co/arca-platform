'use client';

/**
 * Composer de tarea precargado desde una notificación.
 *
 * Todo lo que se puede deducir viene puesto y todo es editable antes de
 * confirmar: el punto es que crear la tarea sea un Enter, no un formulario.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  createTarea,
  listColumnas,
  listOrgMembers,
  TIPOS_TAREA,
} from '@/actions/tareas';
import { resolveNotification } from '@/actions/notification';
import { TIPO_LABELS } from '@/components/tareas/utils';
import type { TipoTarea } from '@/components/tareas/utils';
import { asuntoYPreview } from './utils';

interface Props {
  abierto: boolean;
  onAbrirChange: (v: boolean) => void;
  notificacion: {
    id: string;
    mensaje: string;
    aiResumen: string | null;
    venceAt: Date | string | null;
    categoria: string | null;
    clienteId: string | null;
    clienteRazonSocial: string | null;
  } | null;
  onCreada: (tareaId: string) => void;
}

/**
 * Categoría de la notificación → tipo de tarea. Las categorías las escribe el
 * scrapeo en texto libre, así que se compara en minúscula y lo que no cae en
 * ninguna va a `otro` en vez de inventar.
 */
function tipoDesdeCategoria(categoria: string | null): TipoTarea {
  const c = (categoria ?? '').toLowerCase();
  if (c.includes('iva')) return 'iva';
  if (c.includes('iibb') || c.includes('ingresos brutos')) return 'iibb';
  if (c.includes('sueldo') || c.includes('931')) return 'sueldos';
  if (c.includes('convenio')) return 'convenios';
  if (c.includes('ddjj') || c.includes('declaraci')) return 'ddjj';
  return 'otro';
}

const CAMPO =
  'w-full rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-[9px] py-[5px] text-left text-[12.5px] text-[var(--arca-ink)] outline-none transition-colors duration-[120ms] hover:border-[var(--arca-border-strong)] focus:border-[var(--arca-navy-600)]';
const LABEL =
  'text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase';

/**
 * El diálogo se remonta con `key` por notificación y por apertura, así los
 * valores deducidos son el estado inicial y no hace falta un efecto que los
 * empuje después del primer render.
 */
export function CrearTareaDesdeNotificacion(props: Props) {
  if (!props.notificacion) return null;
  return (
    <Formulario
      key={`${props.notificacion.id}:${String(props.abierto)}`}
      {...props}
      notificacion={props.notificacion}
    />
  );
}

function Formulario({
  abierto,
  onAbrirChange,
  notificacion,
  onCreada,
}: Props & { notificacion: NonNullable<Props['notificacion']> }) {
  const queryClient = useQueryClient();

  const inicial = asuntoYPreview(notificacion.mensaje, notificacion.aiResumen);

  const [titulo, setTitulo] = useState(inicial.asunto.slice(0, 80));
  const [tipo, setTipo] = useState<TipoTarea>(
    tipoDesdeCategoria(notificacion.categoria)
  );
  // `undefined` = todavía no se eligió, así el render cae a la primera columna
  // cuando llegan; `null` = elegida explícitamente "sin columna".
  const [columnaElegida, setColumnaElegida] = useState<
    string | null | undefined
  >(undefined);
  const [asignadoA, setAsignadoA] = useState<string | null>(null);
  const [vence, setVence] = useState<Date | undefined>(
    notificacion.venceAt ? new Date(notificacion.venceAt) : undefined
  );
  const [descripcion, setDescripcion] = useState(
    `${(inicial.preview !== '' ? inicial.preview : notificacion.mensaje).slice(0, 300)}\n\nDesde la notificación ${notificacion.id.slice(0, 8)}`
  );
  const [marcarResuelta, setMarcarResuelta] = useState(false);
  const [calendario, setCalendario] = useState(false);

  const { data: columnas = [] } = useQuery({
    queryKey: ['tareas-columnas'],
    queryFn: () => listColumnas(),
    enabled: abierto,
  });

  const { data: miembros = [] } = useQuery({
    queryKey: ['tareas-miembros'],
    queryFn: () => listOrgMembers(),
    enabled: abierto,
  });

  const columnaId =
    columnaElegida === undefined ? (columnas[0]?.id ?? null) : columnaElegida;

  const crear = useMutation({
    mutationFn: async () => {
      const tarea = await createTarea({
        data: {
          titulo: titulo.trim(),
          descripcion:
            descripcion.trim() !== '' ? descripcion.trim() : undefined,
          tipo,
          columnaId,
          asignadoA,
          venceAt: vence ? vence.toISOString() : null,
          notificacionId: notificacion.id,
          clienteIds: notificacion.clienteId ? [notificacion.clienteId] : [],
        },
      });
      if (marcarResuelta) {
        await resolveNotification({ data: { id: notificacion.id } });
      }
      return tarea;
    },
    onSuccess: (tarea) => {
      void queryClient.invalidateQueries({
        queryKey: ['tareas'],
        exact: false,
      });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notificacion-tareas'] });
      void queryClient.invalidateQueries({ queryKey: ['notificacion'] });
      onAbrirChange(false);

      const destino =
        columnas.find((c) => c.id === columnaId)?.nombre ?? 'el tablero';
      toast.success(`Tarea creada en ${destino}`, {
        action: tarea
          ? { label: 'Ver tarea', onClick: () => onCreada(tarea.id) }
          : undefined,
      });
    },
    onError: () => toast.error('No se pudo crear la tarea'),
  });

  const empresa = notificacion.clienteRazonSocial;

  return (
    <Dialog open={abierto} onOpenChange={onAbrirChange}>
      <DialogContent
        overlayClassName="bg-[rgba(18,19,26,0.38)]"
        className="flex max-h-[min(760px,90vh)] w-full max-w-[560px] flex-col gap-0 overflow-hidden rounded-[var(--arca-r-lg)] border-[var(--arca-border-strong)] bg-[var(--arca-surface)] p-0 shadow-[0_20px_50px_rgba(18,19,26,0.18)] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-[560px]"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--arca-border)] px-[22px] pt-[18px] pb-[14px] text-left">
          <DialogTitle className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            Crear tarea
          </DialogTitle>
          <DialogDescription className="text-[11.5px] text-[var(--arca-ink-3)]">
            {empresa
              ? `Desde la notificación de ${empresa}. Todo es editable.`
              : 'Desde la notificación. Todo es editable.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[22px] py-4">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Título</span>
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={CAMPO}
              placeholder="Título de la tarea"
            />
          </label>

          {empresa && (
            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Empresa</span>
              <p className="rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-[9px] py-[5px] text-[12.5px] text-[var(--arca-ink-2)]">
                {empresa}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Tipo</span>
              <DropdownMenu>
                <DropdownMenuTrigger className={CAMPO}>
                  {TIPO_LABELS[tipo]}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[150px]">
                  {TIPOS_TAREA.map((t) => (
                    <DropdownMenuItem
                      key={t}
                      className="text-[12.5px]"
                      onSelect={() => setTipo(t)}
                    >
                      {TIPO_LABELS[t]}
                      {t === tipo && (
                        <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Columna</span>
              <DropdownMenu>
                <DropdownMenuTrigger className={CAMPO}>
                  {columnas.find((c) => c.id === columnaId)?.nombre ??
                    'Sin columna'}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[170px]">
                  <DropdownMenuItem
                    className="text-[12.5px]"
                    onSelect={() => setColumnaElegida(null)}
                  >
                    Sin columna
                  </DropdownMenuItem>
                  {columnas.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      className="text-[12.5px]"
                      onSelect={() => setColumnaElegida(c.id)}
                    >
                      {c.nombre}
                      {c.id === columnaId && (
                        <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Asignado</span>
              <DropdownMenu>
                <DropdownMenuTrigger className={CAMPO}>
                  {miembros.find((m) => m.id === asignadoA)?.name ??
                    'Sin asignar'}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[190px]">
                  <DropdownMenuItem
                    className="text-[12.5px]"
                    onSelect={() => setAsignadoA(null)}
                  >
                    Sin asignar
                  </DropdownMenuItem>
                  {miembros.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      className="text-[12.5px]"
                      onSelect={() => setAsignadoA(m.id)}
                    >
                      {m.name}
                      {m.id === asignadoA && (
                        <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Vence</span>
              <Popover open={calendario} onOpenChange={setCalendario}>
                <PopoverTrigger
                  className={`${CAMPO} flex items-center gap-1.5`}
                >
                  <CalendarIcon className="size-3 text-[var(--arca-ink-4)]" />
                  <span className="tabular-nums">
                    {vence ? format(vence, 'dd/MM/yyyy') : 'Sin vencimiento'}
                  </span>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    locale={es}
                    defaultMonth={vence}
                    selected={vence}
                    onSelect={(d) => {
                      setVence(d);
                      setCalendario(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Descripción</span>
            <textarea
              rows={4}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className={`${CAMPO} resize-none leading-[1.55]`}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={marcarResuelta}
              onCheckedChange={(v) => setMarcarResuelta(v === true)}
            />
            <span className="text-[12.5px] text-[var(--arca-ink-2)]">
              Marcar la notificación como resuelta
            </span>
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--arca-border)] px-[22px] py-3">
          <button
            type="button"
            disabled={!titulo.trim() || crear.isPending}
            onClick={() => crear.mutate()}
            className="rounded-[var(--arca-r-md)] bg-[var(--arca-ink)] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors duration-[120ms] hover:bg-black disabled:opacity-40"
          >
            Crear tarea
          </button>
          <button
            type="button"
            onClick={() => onAbrirChange(false)}
            className="rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 py-1.5 text-[12.5px] text-[var(--arca-ink-2)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
