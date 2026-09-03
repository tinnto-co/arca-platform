/**
 * Agenda del período: los vencimientos agrupados por día (o por tipo).
 * Los del mismo trámite y día se compactan en un ítem ("5 empresas").
 * El chip ámbar cuenta lo vigente sin tarea y "Autogenerar" lo cubre,
 * con confirmación que lista qué se va a crear.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { autoGenerarTareas } from '@/actions/tareas';
import type { getInicio } from '@/actions/inicio';
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
import {
  colorAvatar,
  diaLargo,
  enDias,
  iniciales,
  nombreDeConcepto,
  nombreDeImpuesto,
  tileDeImpuesto,
} from './compartido';

type Datos = Awaited<ReturnType<typeof getInicio>>;
type Vencimiento = Datos['vencimientos'][number];

const VISIBLES_POR_DEFECTO = 8;

interface ItemAgenda {
  clave: string;
  venceAt: string;
  impuesto: string;
  concepto: string;
  filas: Vencimiento[];
  asignados: string[];
  sinTarea: boolean;
  completado: boolean;
}

/** Un trámite que vence el mismo día para varias empresas es UN ítem. */
function compactar(vencimientos: Vencimiento[]): ItemAgenda[] {
  const porClave = new Map<string, ItemAgenda>();
  for (const v of vencimientos) {
    const clave = `${v.venceAt}|${v.impuesto}|${v.concepto}`;
    let item = porClave.get(clave);
    if (!item) {
      item = {
        clave,
        venceAt: v.venceAt,
        impuesto: v.impuesto,
        concepto: v.concepto,
        filas: [],
        asignados: [],
        sinTarea: false,
        completado: true,
      };
      porClave.set(clave, item);
    }
    item.filas.push(v);
    if (v.asignadoNombre && !item.asignados.includes(v.asignadoNombre))
      item.asignados.push(v.asignadoNombre);
    if (!v.tareaId && !v.completado) item.sinTarea = true;
    if (!v.completado) item.completado = false;
  }
  return [...porClave.values()];
}

function subDeItem(item: ItemAgenda) {
  const concepto = nombreDeConcepto(item.concepto);
  if (item.filas.length > 2)
    return {
      texto: `${concepto} · ${item.filas.length} empresas`,
      mono: false,
    };
  const nombres = item.filas.map((f) => f.clienteNombre ?? f.cuit);
  const esCuit = item.filas.some((f) => !f.clienteNombre);
  return { texto: nombres.join(' · '), mono: esCuit };
}

function Avatares({ nombres }: { nombres: string[] }) {
  const visibles = nombres.slice(0, 3);
  const resto = nombres.length - visibles.length;
  if (nombres.length === 0) return null;
  return (
    <span className="flex items-center">
      {visibles.map((n, i) => (
        <span
          key={n}
          className="size-[22px] rounded-full border-2 border-white text-white text-[9px] font-semibold flex items-center justify-center"
          style={{
            background: colorAvatar(n),
            marginLeft: i > 0 ? -7 : 0,
          }}
          title={n}
        >
          {iniciales(n)}
        </span>
      ))}
      {resto > 0 && (
        <span
          className="size-[22px] rounded-full border-2 border-white text-[9px] font-semibold flex items-center justify-center"
          style={{
            background: 'var(--arca-surface-2)',
            color: 'var(--arca-ink-3)',
            marginLeft: -7,
          }}
        >
          +{resto}
        </span>
      )}
    </span>
  );
}

export function AgendaCard({
  datos,
  hoy,
  filtro,
}: {
  datos: Datos;
  hoy: Date;
  /** Rango elegido en la franja de días, o null. */
  filtro: [string, string] | null;
}) {
  const [porTipo, setPorTipo] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const queryClient = useQueryClient();

  const items = useMemo(() => {
    const filas = filtro
      ? datos.vencimientos.filter(
          (v) => v.venceAt >= filtro[0] && v.venceAt <= filtro[1]
        )
      : datos.vencimientos;
    return compactar(filas);
  }, [datos.vencimientos, filtro]);

  // Grupos: por día (default) o por tipo de trámite.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { titulo: string; items: ItemAgenda[] }>();
    for (const item of items) {
      const clave = porTipo ? item.impuesto : item.venceAt;
      let g = mapa.get(clave);
      if (!g) {
        g = {
          titulo: porTipo
            ? nombreDeImpuesto(item.impuesto)
            : diaLargo(item.venceAt),
          items: [],
        };
        mapa.set(clave, g);
      }
      g.items.push(item);
    }
    return [...mapa.values()];
  }, [items, porTipo]);

  const generar = useMutation({
    mutationFn: () => autoGenerarTareas(),
    onSuccess: (r) => {
      if (r.creadas > 0 || r.itemsAgregados > 0) {
        const partes = [];
        if (r.creadas > 0)
          partes.push(
            `${r.creadas} tarea${r.creadas !== 1 ? 's' : ''} creada${r.creadas !== 1 ? 's' : ''}`
          );
        if (r.itemsAgregados > 0)
          partes.push(
            `${r.itemsAgregados} vencimiento${r.itemsAgregados !== 1 ? 's' : ''} cubierto${r.itemsAgregados !== 1 ? 's' : ''}`
          );
        toast.success(partes.join(' · '));
      } else {
        toast.info('Todos los vencimientos vigentes ya tienen su tarea');
      }
      if (r.sinCliente > 0) {
        toast.info(
          `${r.sinCliente} vencimiento${r.sinCliente !== 1 ? 's' : ''} de CUITs sin cliente quedaron en la columna «Sin cliente» del tablero`
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['inicio'] });
      void queryClient.invalidateQueries({ queryKey: ['tareas'] });
      // La corrida puede haber creado la columna «Sin cliente» del tablero.
      void queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : 'No se pudieron generar las tareas'
      ),
  });

  const limite = verTodos || filtro ? Infinity : VISIBLES_POR_DEFECTO;
  let mostrados = 0;

  return (
    <div
      className="bg-white border rounded-[14px] overflow-hidden"
      style={{ borderColor: 'var(--arca-border)' }}
    >
      {/* Head */}
      <div
        className="flex items-center justify-between gap-3 border-b"
        style={{ padding: '16px 20px 14px', borderColor: 'var(--arca-border)' }}
      >
        <h2
          className="text-[15px] font-semibold"
          style={{ fontFamily: 'var(--ff-display)', color: 'var(--arca-ink)' }}
        >
          Agenda
        </h2>
        <div className="flex items-center gap-1.5">
          {datos.resumen.vencidos > 0 && (
            <Link
              to="/vencimientos"
              className="text-[11px] font-medium rounded-[20px]"
              style={{
                background: 'var(--arca-accent-neg-bg)',
                color: 'var(--arca-accent-neg-fg)',
                padding: '4px 10px',
              }}
            >
              {datos.resumen.vencidos} vencido
              {datos.resumen.vencidos !== 1 ? 's' : ''}
            </Link>
          )}
          {datos.sinTarea.length > 0 && (
            <span
              className="flex items-center gap-1.5 text-[11px] font-medium rounded-[20px]"
              style={{
                background: 'var(--arca-accent-warn-bg)',
                color: 'var(--arca-accent-warn-fg)',
                padding: '3px 4px 3px 10px',
              }}
            >
              {datos.sinTarea.length} sin tarea
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={generar.isPending}
                className="bg-white border rounded-[20px] text-[11px] font-semibold cursor-pointer transition-colors duration-150 hover:bg-[var(--arca-surface-2)] inline-flex items-center gap-1"
                style={{
                  borderColor: 'var(--arca-border-strong)',
                  color: 'var(--arca-ink)',
                  padding: '3px 9px',
                }}
              >
                {generar.isPending && (
                  <Loader2 size={11} className="animate-spin" />
                )}
                Autogenerar
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => setPorTipo((v) => !v)}
            aria-pressed={porTipo}
            className="text-[11px] font-medium rounded-[20px] border cursor-pointer transition-colors duration-150"
            style={{
              background: porTipo ? 'var(--arca-ink)' : 'var(--arca-surface-2)',
              borderColor: porTipo ? 'var(--arca-ink)' : 'var(--arca-border)',
              color: porTipo ? '#fff' : 'var(--arca-ink-3)',
              padding: '4px 10px',
            }}
          >
            Agrupar por tipo
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      {items.length === 0 ? (
        <p
          className="text-[12.5px] text-center"
          style={{ color: 'var(--arca-ink-4)', padding: '32px 20px' }}
        >
          {filtro
            ? 'No hay vencimientos ese día'
            : 'No hay vencimientos en el período'}
        </p>
      ) : (
        grupos.map((grupo) => {
          if (mostrados >= limite) return null;
          const visibles = grupo.items.slice(0, limite - mostrados);
          mostrados += visibles.length;
          const totalVencs = grupo.items.reduce(
            (s, i) => s + i.filas.length,
            0
          );
          const tipos = new Set(grupo.items.map((i) => i.impuesto)).size;
          return (
            <div key={grupo.titulo}>
              <div
                className="flex items-baseline gap-2 border-b"
                style={{
                  padding: '10px 20px',
                  background: 'var(--arca-surface-2)',
                  borderColor: 'var(--arca-border)',
                }}
              >
                <span
                  className="text-[12.5px] font-semibold"
                  style={{ color: 'var(--arca-ink)' }}
                >
                  {grupo.titulo}
                </span>
                <span
                  className="text-[11.5px]"
                  style={{ color: 'var(--arca-ink-4)' }}
                >
                  {totalVencs} vencimiento{totalVencs !== 1 ? 's' : ''}
                  {!porTipo && tipos > 1
                    ? ` · ${tipos} tipos`
                    : !porTipo
                      ? ' · 1 tipo'
                      : ''}
                </span>
              </div>
              {visibles.map((item) => {
                const tile = tileDeImpuesto(item.impuesto);
                const sub = subDeItem(item);
                return (
                  <div
                    key={item.clave}
                    className="flex items-center justify-between gap-4 border-b transition-colors duration-150 hover:bg-[var(--arca-surface-2)]"
                    style={{
                      padding: '14px 20px',
                      borderColor: 'var(--arca-border)',
                      opacity: item.completado ? 0.55 : 1,
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="size-7 rounded-[7px] text-[10px] font-semibold flex items-center justify-center shrink-0"
                        style={{ background: tile.bg, color: tile.fg }}
                      >
                        {tile.codigo}
                      </span>
                      <div className="min-w-0">
                        <div
                          className="text-[13.5px] font-semibold truncate"
                          style={{ color: 'var(--arca-ink)' }}
                        >
                          {nombreDeImpuesto(item.impuesto)}
                        </div>
                        <div
                          className={`text-[11.5px] truncate${sub.mono ? ' font-mono text-[11px]' : ''}`}
                          style={{ color: 'var(--arca-ink-3)' }}
                        >
                          {sub.texto}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <Avatares nombres={item.asignados} />
                      {item.sinTarea && (
                        <span
                          className="text-[10.5px] font-medium rounded-[20px]"
                          style={{
                            background: 'var(--arca-accent-warn-bg)',
                            color: 'var(--arca-accent-warn-fg)',
                            padding: '3px 8px',
                          }}
                        >
                          sin tarea
                        </span>
                      )}
                      <span
                        className="text-[12px] tabular-nums"
                        style={{ color: 'var(--arca-ink-4)' }}
                      >
                        {enDias(item.venceAt, hoy)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {/* Foot */}
      <div
        className="flex items-center justify-between border-t"
        style={{
          padding: '12px 20px',
          background: 'var(--arca-surface-2)',
          borderColor: 'var(--arca-border)',
          marginTop: -1,
        }}
      >
        <span className="text-[11.5px]" style={{ color: 'var(--arca-ink-3)' }}>
          Mostrando {Math.min(mostrados, items.length)} de {items.length} del
          período
        </span>
        {!verTodos && items.length > VISIBLES_POR_DEFECTO && !filtro ? (
          <button
            type="button"
            onClick={() => setVerTodos(true)}
            className="text-[12px] font-medium cursor-pointer hover:underline"
            style={{ color: 'var(--arca-ink)' }}
          >
            Ver los {items.length} →
          </button>
        ) : (
          <Link
            to="/vencimientos"
            className="text-[12px] font-medium hover:underline"
            style={{ color: 'var(--arca-ink)' }}
          >
            Ver calendario completo →
          </Link>
        )}
      </div>

      {/* Confirmación de Autogenerar: qué se va a crear, antes de crearlo. */}
      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Crear {datos.sinTarea.length} tarea
              {datos.sinTarea.length !== 1 ? 's' : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Una por cada vencimiento vigente sin tarea, en la primera columna
              del tablero:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-[40vh] overflow-y-auto text-[12.5px] divide-y divide-[var(--arca-border)]">
            {datos.sinTarea.slice(0, 12).map((v) => (
              <li key={v.id} className="py-1.5 flex justify-between gap-3">
                <span className="truncate" style={{ color: 'var(--arca-ink)' }}>
                  {nombreDeImpuesto(v.impuesto)}
                  <span style={{ color: 'var(--arca-ink-4)' }}>
                    {' · '}
                    {v.clienteNombre}
                  </span>
                </span>
                <span
                  className="tabular-nums shrink-0"
                  style={{ color: 'var(--arca-ink-3)' }}
                >
                  {enDias(v.venceAt, hoy)}
                </span>
              </li>
            ))}
            {datos.sinTarea.length > 12 && (
              <li className="py-1.5" style={{ color: 'var(--arca-ink-4)' }}>
                … y {datos.sinTarea.length - 12} más
              </li>
            )}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => generar.mutate()}>
              Crear tareas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
