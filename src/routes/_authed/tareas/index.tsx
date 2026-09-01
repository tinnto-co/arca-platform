import { generateKeyBetween } from 'fractional-indexing';
import { useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TaskCard } from '@/components/tareas/TaskCard';
import { TaskDetailDialog } from '@/components/tareas/TaskDetailDialog';
import { BoardColumn } from '@/components/tareas/BoardColumn';
import { BoardHeader } from '@/components/tareas/BoardHeader';
import { BuscarTareas } from '@/components/tareas/BuscarTareas';
import { PageShell } from '@/components/shared/page-shell';
import {
  listTareas,
  listOrgMembers,
  listOrgRepresentatives,
  listColumnas,
  createColumna,
  updateColumna,
  deleteColumna,
  moverTarea,
  reorderTarea,
  autoGenerarTareas,
  COLORES_COLUMNA,
  TIPOS_TAREA,
  CLAVE_ARCHIVADAS,
} from '@/actions/tareas';
import type { TareaConDetalle, TipoTarea } from '@/components/tareas/utils';
import { cn } from '@/lib/utils';

/**
 * Los filtros son la única forma de recortar el tablero, así que la fuente de
 * verdad es la URL: un recorte se comparte pegando el link y sobrevive al
 * refresh. `tarea` abre el modal de detalle, también por link.
 */
interface Busqueda {
  periodo?: string;
  tipo?: TipoTarea;
  asignado?: string;
  empresa?: string;
  vence_hasta?: string;
  tarea?: string;
  archivadas?: boolean;
}

// Cada campo lleva su `.catch`: un parámetro basura en la URL no puede tumbar
// la pantalla, simplemente no filtra.
const esquemaBusqueda = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
  tipo: z.enum(TIPOS_TAREA).optional().catch(undefined),
  asignado: z.string().optional().catch(undefined),
  empresa: z.string().optional().catch(undefined),
  vence_hasta: z.string().optional().catch(undefined),
  tarea: z.string().uuid().optional().catch(undefined),
  archivadas: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/_authed/tareas/')({
  // Tipo de retorno explícito, como el resto de las rutas del proyecto: pasar
  // el schema de zod pelado deja el `useSearch()` en `any`.
  validateSearch: (s: Record<string, unknown>): Busqueda =>
    esquemaBusqueda.parse(s),
  component: TareasPage,
});

const SIN_COLUMNA = '__sin_columna__';

/** Un filtro vacío no viaja en la URL: `''` significa "sin filtrar". */
const oQuitar = (v: string) => (v === '' ? undefined : v);

// ─── Card arrastrable ────────────────────────────────────────────────────────

function CardArrastrable({
  tarea,
  seleccionada,
  onAbrir,
}: {
  tarea: TareaConDetalle;
  seleccionada: boolean;
  onAbrir: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tarea.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      // Mientras se arrastra queda el hueco de destino: la card viaja en el
      // DragOverlay, no acá.
      className={cn(
        'touch-none',
        isDragging &&
          'rounded-[var(--arca-r-md)] border border-dashed border-[var(--arca-border-strong)] bg-[rgba(30,52,96,0.03)] opacity-100 [&>*]:invisible'
      )}
    >
      <TaskCard tarea={tarea} seleccionada={seleccionada} onAbrir={onAbrir} />
    </div>
  );
}

/**
 * Clave fraccional para insertar en `insertIdx` dentro de una lista ya ordenada
 * (sin la tarjeta que se está moviendo).
 *
 * `generateKeyBetween` exige que los dos bordes sean claves válidas o `null`,
 * así que se busca la vecina más cercana que TENGA posición en cada dirección:
 * una tarea vieja sin backfillear no puede servir de borde. Devuelve `null` si
 * la clave no se puede generar, para no escribir una posición inválida.
 */
function posicionEntre(
  lista: TareaConDetalle[],
  insertIdx: number
): string | null {
  let antes: string | null = null;
  for (let i = insertIdx - 1; i >= 0; i--) {
    const pos = lista[i]?.posicion;
    if (pos != null) {
      antes = pos;
      break;
    }
  }
  let despues: string | null = null;
  for (let i = insertIdx; i < lista.length; i++) {
    const pos = lista[i]?.posicion;
    if (pos != null) {
      despues = pos;
      break;
    }
  }

  try {
    return generateKeyBetween(antes, despues);
  } catch {
    // Bordes incoherentes (antes >= despues). Pasa sólo si el cliente quedó con
    // datos viejos; el refetch posterior lo acomoda.
    return null;
  }
}

// ─── Página ──────────────────────────────────────────────────────────────────

function TareasPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  // Anotado a mano: el `useSearch()` generado por el router queda en `any`
  // hasta que se regenera el routeTree, y ese `any` se propaga a todos los
  // filtros sin que tsc diga nada.
  const search: Busqueda = Route.useSearch();

  const viendoArchivadas = search.archivadas === true;

  const [composerEn, setComposerEn] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [nuevaColumna, setNuevaColumna] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [aEliminar, setAEliminar] = useState<{
    id: string;
    nombre: string;
    tareas: number;
  } | null>(null);

  const filtros = {
    periodo: search.periodo ?? '',
    tipo: search.tipo ?? ('' as const),
    asignado: search.asignado ?? '',
    cliente: search.empresa ?? '',
    venceHasta: search.vence_hasta ?? '',
  };

  /** Escribe los filtros en la URL. `''` saca el parámetro. */
  const setFiltros = (p: Partial<typeof filtros>) => {
    void navigate({
      search: (prev: Busqueda) => ({
        ...prev,
        ...(p.periodo !== undefined && { periodo: oQuitar(p.periodo) }),
        ...(p.tipo !== undefined && { tipo: oQuitar(p.tipo) as TipoTarea }),
        ...(p.asignado !== undefined && { asignado: oQuitar(p.asignado) }),
        ...(p.cliente !== undefined && { empresa: oQuitar(p.cliente) }),
        ...(p.venceHasta !== undefined && {
          vence_hasta: oQuitar(p.venceHasta),
        }),
      }),
      replace: true,
    });
  };

  const abrirTarea = (id: string | undefined) =>
    void navigate({
      search: (prev: Busqueda) => ({ ...prev, tarea: id }),
      replace: true,
    });

  // ─── Datos ────────────────────────────────────────────────────────────────

  const { data: columnas = [], isLoading: cargandoCols } = useQuery({
    queryKey: ['tareas-columnas'],
    queryFn: () => listColumnas(),
  });

  const { data: miembros = [] } = useQuery({
    queryKey: ['tareas-miembros'],
    queryFn: () => listOrgMembers(),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['tareas-empresas'],
    queryFn: () => listOrgRepresentatives(),
  });

  const { data: tareas = [], isLoading: cargandoTareas } = useQuery({
    queryKey: [
      'tareas',
      filtros.periodo,
      filtros.tipo,
      filtros.asignado,
      filtros.cliente,
      filtros.venceHasta,
      viendoArchivadas,
    ],
    queryFn: () =>
      listTareas({
        data: {
          periodo: oQuitar(filtros.periodo),
          tipo: oQuitar(filtros.tipo) as TipoTarea | undefined,
          asignadoA: oQuitar(filtros.asignado),
          clienteId: oQuitar(filtros.cliente),
          vencimientoHasta: oQuitar(filtros.venceHasta),
          archivadas: viendoArchivadas || undefined,
        },
      }),
  });

  const cargando = cargandoCols || cargandoTareas;

  // El tablero muestra las columnas del estudio; el archivo, sólo Archivadas.
  // Es una columna real —la tienen todas las organizaciones— pero la maneja la
  // aplicación, así que nunca se ven las dos cosas juntas.
  const columnasVisibles = useMemo(
    () =>
      columnas.filter((c) =>
        viendoArchivadas
          ? c.clave === CLAVE_ARCHIVADAS
          : c.clave !== CLAVE_ARCHIVADAS
      ),
    [columnas, viendoArchivadas]
  );

  // Agrupa por columna. NO reordena: `listTareas` ya devuelve las tareas por
  // `posicion` con `collate "C"`, y ordenarlas de nuevo acá con parseFloat las
  // rompía — las claves fraccionales son texto ("a0", "Zz"), no números.
  const porColumna = useMemo(() => {
    const map: Record<string, TareaConDetalle[]> = { [SIN_COLUMNA]: [] };
    for (const col of columnas) map[col.id] = [];
    for (const t of tareas) {
      const key = t.columnaId ?? SIN_COLUMNA;
      if (map[key] !== undefined) map[key].push(t);
      else map[SIN_COLUMNA].push(t);
    }
    return map;
  }, [tareas, columnas]);

  const resumen = useMemo(() => {
    const finSemana = new Date();
    finSemana.setDate(finSemana.getDate() + 7);
    const empresasUnicas = new Set<string>();
    let venceSemana = 0;
    for (const t of tareas) {
      for (const c of t.clientes) empresasUnicas.add(c.clienteId);
      if (t.venceAt && new Date(t.venceAt) <= finSemana) venceSemana++;
    }
    return {
      tareas: tareas.length,
      empresas: empresasUnicas.size,
      venceSemana,
    };
  }, [tareas]);

  const tareaAbierta = tareas.find((t) => t.id === search.tarea) ?? null;

  // ─── Mutaciones ───────────────────────────────────────────────────────────

  const refrescar = () =>
    void queryClient.invalidateQueries({ queryKey: ['tareas'], exact: false });
  const refrescarCols = () =>
    void queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });

  const autogenerar = useMutation({
    mutationFn: () => {
      // Genera para el período que el tablero está mirando; sin filtro, el mes
      // en curso en hora argentina — cerca de fin de mes UTC ya va un día
      // adelante y generaría el período equivocado.
      const periodo =
        filtros.periodo ||
        new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Argentina/Buenos_Aires',
        })
          .format(new Date())
          .slice(0, 7);
      return autoGenerarTareas({ data: { periodo } });
    },
    onSuccess: (r) => {
      refrescar();
      // Los tres ceros distintos del ticket TIN-1411, cada uno con su mensaje:
      // que «no hay nada» y «está roto» no se vean iguales es el punto.
      if (r.creadas > 0) {
        toast.success(
          `${r.creadas} ${r.creadas === 1 ? 'tarea creada' : 'tareas creadas'} desde los vencimientos` +
            (r.sinCliente > 0
              ? ` — ${r.sinCliente} vencimientos sin cliente asociado`
              : '')
        );
      } else if (r.sinCliente > 0) {
        toast.warning(
          `Se encontraron vencimientos pero ${r.sinCliente} no se pudieron asociar a ningún cliente`
        );
      } else if (r.omitidas > 0) {
        toast.info('Todos los vencimientos del período ya tienen su tarea');
      } else {
        toast.info('No hay vencimientos para este período');
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al autogenerar'),
  });

  const mover = useMutation({
    mutationFn: (v: {
      id: string;
      columnaId: string | null;
      posicion?: string;
    }) => moverTarea({ data: v }),
    onSuccess: refrescar,
    onError: () => toast.error('No se pudo mover la tarea'),
  });

  const reordenar = useMutation({
    mutationFn: (v: { id: string; posicion: string }) =>
      reorderTarea({ data: v }),
    onSuccess: refrescar,
    onError: () => toast.error('No se pudo reordenar'),
  });

  const crearCol = useMutation({
    mutationFn: (nombre: string) => createColumna({ data: { nombre } }),
    onSuccess: () => {
      refrescarCols();
      setNuevaColumna(false);
      setNombreNuevo('');
    },
    onError: () => toast.error('No se pudo crear la columna'),
  });

  const editarCol = useMutation({
    mutationFn: (v: {
      id: string;
      nombre?: string;
      color?: (typeof COLORES_COLUMNA)[number];
    }) => updateColumna({ data: v }),
    onSuccess: refrescarCols,
    onError: () => toast.error('No se pudo actualizar la columna'),
  });

  const borrarCol = useMutation({
    mutationFn: (id: string) => deleteColumna({ data: { id } }),
    onSuccess: () => {
      refrescarCols();
      refrescar();
      setAEliminar(null);
      toast.success('Columna eliminada');
    },
    onError: () => toast.error('No se pudo eliminar la columna'),
  });

  // ─── Drag & drop ──────────────────────────────────────────────────────────

  const sensors = useSensors(
    // Un umbral de 6px: sin esto un click sobre la card empieza un arrastre y
    // el modal no abre nunca.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setArrastrando(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activa = tareas.find((t) => t.id === activeId);
    if (!activa) return;

    const origen = activa.columnaId ?? SIN_COLUMNA;

    // `overId` es otra tarjeta, o el id de la columna cuando se suelta en el vacío.
    const sobreTarea = tareas.find((t) => t.id === overId);
    const destino = sobreTarea ? (sobreTarea.columnaId ?? SIN_COLUMNA) : overId;
    if (porColumna[destino] === undefined) return;

    const columnaId = destino === SIN_COLUMNA ? null : destino;
    const lista = (porColumna[destino] ?? []).filter((t) => t.id !== activeId);

    let insertIdx: number;
    if (!sobreTarea) {
      insertIdx = lista.length;
    } else {
      const idx = lista.findIndex((t) => t.id === overId);
      if (idx === -1) return;
      if (origen === destino) {
        // En la misma columna, arrastrar hacia abajo inserta DESPUÉS de la
        // tarjeta de destino; hacia arriba, antes.
        const actual = porColumna[origen] ?? [];
        const bajando =
          actual.findIndex((t) => t.id === activeId) <
          actual.findIndex((t) => t.id === overId);
        insertIdx = bajando ? idx + 1 : idx;
      } else {
        insertIdx = idx;
      }
    }

    const posicion = posicionEntre(lista, insertIdx);
    if (posicion === null) return;

    if (origen !== destino) mover.mutate({ id: activeId, columnaId, posicion });
    else reordenar.mutate({ id: activeId, posicion });
  };

  const enArrastre = tareas.find((t) => t.id === arrastrando) ?? null;

  const defaultsComposer = {
    tipo: oQuitar(filtros.tipo) as TipoTarea | undefined,
    periodo: oQuitar(filtros.periodo),
  };

  const sinColumna = porColumna[SIN_COLUMNA] ?? [];
  const hayFiltros = Object.values(filtros).some(Boolean);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageShell variant="panel">
      <BoardHeader
        filtros={filtros}
        onFiltro={setFiltros}
        onLimpiar={() =>
          setFiltros({
            periodo: '',
            tipo: '',
            asignado: '',
            cliente: '',
            venceHasta: '',
          })
        }
        miembros={miembros}
        empresas={empresas}
        resumen={resumen}
        onBuscar={() => setBuscando(true)}
        onAutogenerar={() => autogenerar.mutate()}
        autogenerando={autogenerar.isPending}
        viendoArchivadas={viendoArchivadas}
        onVerArchivadas={(v) =>
          void navigate({
            search: (prev: Busqueda) => ({
              ...prev,
              archivadas: v || undefined,
            }),
            replace: true,
          })
        }
      />

      {cargando ? (
        <div className="flex flex-1 gap-[14px] overflow-x-auto px-7 pt-[18px] pb-[22px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex w-[264px] min-w-[264px] flex-col gap-[9px] self-start rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] p-[10px]"
            >
              <div className="h-4 w-24 animate-pulse rounded bg-[var(--arca-border)]" />
              {[0, 1, 2].map((j) => (
                <div
                  key={j}
                  className="h-[78px] animate-pulse rounded-[var(--arca-r-md)] bg-[var(--arca-surface)]"
                />
              ))}
            </div>
          ))}
        </div>
      ) : columnas.length === 0 && tareas.length === 0 && hayFiltros ? (
        <div className="px-7 pt-[18px]">
          <div className="grid place-items-center gap-3 rounded-[var(--arca-r-lg)] border border-dashed border-[var(--arca-border-strong)] py-14">
            <p className="text-[12.5px] text-[var(--arca-ink-3)]">
              No hay tareas con estos filtros
            </p>
            <button
              type="button"
              onClick={() =>
                setFiltros({
                  periodo: '',
                  tipo: '',
                  asignado: '',
                  cliente: '',
                  venceHasta: '',
                })
              }
              className="text-[11.5px] font-medium text-[var(--arca-navy-700)] hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e: DragStartEvent) =>
            setArrastrando(String(e.active.id))
          }
          onDragCancel={() => setArrastrando(null)}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-h-0 flex-1 snap-x snap-proximity gap-[14px] overflow-x-auto pt-[18px] pb-[22px]">
            {/* Sin columna: sólo si hay tareas ahí. No es una columna del
                estudio, es dónde caen las que perdieron la suya. */}
            {!viendoArchivadas && sinColumna.length > 0 && (
              <BoardColumn
                id={SIN_COLUMNA}
                columnaId={null}
                nombre="Sin columna"
                color="neutro"
                tareas={sinColumna}
                tareaAbierta={search.tarea ?? null}
                composerAbierto={composerEn === SIN_COLUMNA}
                filtrosDefault={defaultsComposer}
                editable={false}
                soloLectura={viendoArchivadas}
                onAbrirComposer={() => setComposerEn(SIN_COLUMNA)}
                onCerrarComposer={() => setComposerEn(null)}
                renderCard={(t) => (
                  <CardArrastrable
                    key={t.id}
                    tarea={t}
                    seleccionada={t.id === search.tarea}
                    onAbrir={() => abrirTarea(t.id)}
                  />
                )}
              />
            )}

            {columnasVisibles.map((col) => (
              <BoardColumn
                key={col.id}
                id={col.id}
                columnaId={col.id}
                nombre={col.nombre}
                color={col.color}
                tareas={porColumna[col.id] ?? []}
                tareaAbierta={search.tarea ?? null}
                composerAbierto={composerEn === col.id}
                filtrosDefault={defaultsComposer}
                editable={col.clave === null}
                soloLectura={viendoArchivadas}
                onAbrirComposer={() => setComposerEn(col.id)}
                onCerrarComposer={() => setComposerEn(null)}
                onRenombrar={(nombre) =>
                  editarCol.mutate({ id: col.id, nombre })
                }
                onColor={(color) => editarCol.mutate({ id: col.id, color })}
                onEliminar={() =>
                  setAEliminar({
                    id: col.id,
                    nombre: col.nombre,
                    tareas: (porColumna[col.id] ?? []).length,
                  })
                }
                renderCard={(t) => (
                  <CardArrastrable
                    key={t.id}
                    tarea={t}
                    seleccionada={t.id === search.tarea}
                    onAbrir={() => abrirTarea(t.id)}
                  />
                )}
              />
            ))}

            {/* Columna virtual */}
            {!viendoArchivadas && (
              <div className="w-[180px] min-w-[180px] self-start rounded-[var(--arca-r-lg)] border border-dashed border-[var(--arca-border-strong)] p-[11px]">
                {nuevaColumna ? (
                  <input
                    autoFocus
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    placeholder="Nombre"
                    aria-label="Nombre de la columna nueva"
                    className="w-full border-b border-dashed border-[var(--arca-border-strong)] bg-transparent pb-1 text-[12.5px] outline-none placeholder:text-[var(--arca-ink-4)]"
                    onBlur={() => {
                      const v = nombreNuevo.trim();
                      if (v) crearCol.mutate(v);
                      else setNuevaColumna(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        setNombreNuevo('');
                        setNuevaColumna(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setNuevaColumna(true)}
                    className="flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:text-[var(--arca-ink)]"
                  >
                    <Plus className="size-3.5" />
                    Crear columna
                  </button>
                )}
              </div>
            )}
          </div>

          {/* La card viaja acá para poder inclinarse sin deformar el hueco. */}
          <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
            {enArrastre && (
              <div className="w-[244px] rotate-[1.2deg] shadow-[var(--arca-shadow-md)]">
                <TaskCard tarea={enArrastre} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <BuscarTareas
        tareas={tareas}
        abierto={buscando}
        onAbrirChange={setBuscando}
        onElegir={abrirTarea}
      />

      {tareaAbierta && (
        <TaskDetailDialog
          tarea={tareaAbierta}
          open
          onOpenChange={(v) => !v && abrirTarea(undefined)}
        />
      )}

      <AlertDialog
        open={aEliminar !== null}
        onOpenChange={(v) => !v && setAEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la columna?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina «{aEliminar?.nombre}»{' '}
              {aEliminar && aEliminar.tareas > 0 ? (
                <>
                  y sus{' '}
                  <strong>
                    {aEliminar.tareas}{' '}
                    {aEliminar.tareas === 1 ? 'tarea' : 'tareas'}
                  </strong>
                  , con sus pasos y comentarios
                </>
              ) : (
                <>, que está vacía</>
              )}
              . Es la única forma de borrar tareas de a muchas y no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => aEliminar && borrarCol.mutate(aEliminar.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
