'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CopilotChat } from '@copilotkit/react-ui';
import { useCopilotChat } from '@copilotkit/react-core';
import { TextMessage, Role } from '@copilotkit/runtime-client-gql';
import { PanelRightClose, TextCursorInput, X } from 'lucide-react';
import { OrbeAsistente } from '@/components/agent/orbe';
import { useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  guardarModo,
  leerModo,
  suscribirModo,
  registerCopilotControl,
  setMessageCount,
  setPanelState,
  setPensando,
  unregisterCopilotControl,
} from './copilot-control';
import { AttachmentBar } from './AttachmentBar';
import { INSTRUCCIONES_ASISTENTE } from './instrucciones';

const CLAVE_ANCHO = 'arca-copilot-panel-ancho-px';
const ANCHO_DEFAULT = 420;
const ANCHO_MIN = 340;
/** Tope duro: más ancho que esto el panel deja de ser un panel y le come la
    pantalla a las tablas, que es lo que el asistente está mirando. */
const ANCHO_MAX = 560;
const ANCHO_MAX_RATIO = 0.45;

function anchoMaximo() {
  return Math.max(
    ANCHO_MIN,
    Math.min(ANCHO_MAX, window.innerWidth * ANCHO_MAX_RATIO)
  );
}

/**
 * Asistente acoplado al borde derecho, como el panel de un IDE.
 *
 * No flota por encima de la aplicación: es un hermano flex del contenido
 * dentro del `SidebarProvider`, así que al abrirse **empuja** la pantalla en
 * vez de taparla. El ancho se arrastra desde el borde izquierdo y se recuerda.
 *
 * Al abrirlo colapsa el menú lateral —en un ancho de escritorio no entran los
 * dos paneles sin ahogar el contenido— y al cerrarlo lo devuelve como estaba,
 * pero sólo si fue él quien lo colapsó: si el usuario ya trabajaba con el menú
 * cerrado, se respeta.
 *
 * En mobile no hay lugar para acoplar nada: ahí se comporta como una hoja a
 * pantalla completa.
 *
 * El `AgentInput` flotante sigue siendo la puerta de entrada: registra sus
 * handlers vía `registerCopilotControl(...)`, abre el panel y le pasa el
 * mensaje. La conversación persiste al cerrar y volver a abrir.
 */
export function CopilotSidePanel() {
  const [abierto, setAbierto] = useState(false);
  const [ancho, setAncho] = useState(ANCHO_DEFAULT);
  const anchoRef = useRef(ANCHO_DEFAULT);
  const { appendMessage, isLoading } = useCopilotChat();
  const { isMobile, open: menuAbierto, setOpen: setMenuAbierto } = useSidebar();
  // Suscrito y no leído al vuelo: si el modo cambia con el panel montado, la
  // cabecera tiene que enterarse.
  const modo = useSyncExternalStore(
    suscribirModo,
    leerModo,
    () => 'barra' as const
  );

  // Si el menú lo colapsamos nosotros, lo devolvemos al cerrar. Si ya estaba
  // colapsado, no tocamos nada.
  const menuColapsadoPorNosotros = useRef(false);

  // El ancho guardado se re-acota contra la ventana actual: un valor de un
  // monitor grande no puede dejar la aplicación sin lugar en un portátil.
  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_ANCHO);
    const parseado = guardado ? Number.parseInt(guardado, 10) : Number.NaN;
    const proximo = Number.isFinite(parseado)
      ? Math.min(Math.max(parseado, ANCHO_MIN), anchoMaximo())
      : ANCHO_DEFAULT;
    setAncho(proximo);
    anchoRef.current = proximo;

    const alRedimensionar = () => {
      const acotado = Math.min(anchoRef.current, anchoMaximo());
      if (acotado === anchoRef.current) return;
      anchoRef.current = acotado;
      setAncho(acotado);
    };
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  // La barra flotante se esconde cuando el panel está abierto.
  useEffect(() => {
    setPanelState({ open: abierto, height: 0 });
  }, [abierto]);

  useEffect(() => {
    setPensando(isLoading);
  }, [isLoading]);

  // Menú lateral: colapsar al abrir, restaurar al cerrar.
  useEffect(() => {
    if (isMobile) return;
    if (abierto) {
      if (menuAbierto) {
        menuColapsadoPorNosotros.current = true;
        setMenuAbierto(false);
      }
      return;
    }
    if (menuColapsadoPorNosotros.current) {
      menuColapsadoPorNosotros.current = false;
      setMenuAbierto(true);
    }
    // `menuAbierto` no va en las dependencias a propósito: si el usuario vuelve
    // a abrir el menú con el panel abierto, es su decisión y no la revertimos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, isMobile, setMenuAbierto]);

  // Al abrir, el cursor va al textarea del chat: si no, las teclas caen en el
  // `AgentInput` que acabamos de desmontar y se pierden.
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>(
          '.copilot-panel .copilotKitInput textarea'
        )
        ?.focus();
    }, 220);
    return () => clearTimeout(t);
  }, [abierto]);

  const empezarResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const xInicial = e.clientX;
    const anchoInicial = anchoRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const alMover = (ev: PointerEvent) => {
      // El panel crece hacia la izquierda: el delta va invertido.
      const proximo = Math.min(
        Math.max(anchoInicial + (xInicial - ev.clientX), ANCHO_MIN),
        anchoMaximo()
      );
      anchoRef.current = proximo;
      setAncho(proximo);
    };
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.localStorage.setItem(
        CLAVE_ANCHO,
        String(Math.round(anchoRef.current))
      );
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
  }, []);

  useEffect(() => {
    registerCopilotControl(
      (texto: string) => {
        setAbierto(true);
        // Marca la conversación como activa para que la barra flotante cambie
        // su placeholder. `useCopilotChat` no expone `visibleMessages` de forma
        // confiable fuera del árbol de `CopilotChat`, así que publicamos un
        // conteo grueso como señal.
        setMessageCount(1);
        void appendMessage(
          new TextMessage({ content: texto, role: Role.User })
        );
      },
      () => setAbierto(true)
    );
    return () => unregisterCopilotControl();
  }, [appendMessage]);

  const contenido = (
    <div
      className="relative flex h-full flex-col bg-[var(--arca-surface)]"
      style={{ width: isMobile ? '100%' : ancho }}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--arca-border)] bg-[var(--arca-surface)] px-3 py-2.5">
        {/* El orbe con el símbolo: la misma firma que en el sidebar */}
        <span className="relative grid size-[30px] shrink-0 place-items-center">
          <OrbeAsistente size={30} pensando={isLoading} />
          <img
            src="/brand/ordo-symbol-mono-white.svg"
            alt=""
            className="absolute size-[15px]"
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
            Asistente
          </div>
          <div className="truncate text-[11.5px] text-[var(--arca-ink-3)]">
            {isLoading ? 'Pensando…' : 'Orddo · Suite Contable'}
          </div>
        </div>
        {/* Con el asistente en modo orbe, la barra de consulta queda sin puerta
            de entrada: el orbe abre este panel. Ésta es esa puerta. */}
        {modo === 'fab' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  guardarModo('barra');
                  setAbierto(false);
                }}
                aria-label="Volver a la barra de consulta"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-bg)] hover:text-[var(--arca-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-accent-ring)]"
              >
                <TextCursorInput className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Volver a la barra de consulta
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el asistente"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-bg)] hover:text-[var(--arca-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-accent-ring)]"
            >
              {isMobile ? (
                <X className="size-4" />
              ) : (
                <PanelRightClose className="size-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Cerrar el asistente</TooltipContent>
        </Tooltip>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* El ícono de enviar es el que trae CopilotKit: una flecha al alza de
            trazo 1.5, que es justo la que usa la barra flotante. */}
        <CopilotChat
          instructions={INSTRUCCIONES_ASISTENTE}
          labels={{ placeholder: 'Preguntale al asistente…' }}
        />
      </div>
      <AttachmentBar />
    </div>
  );

  // Una sola rama para las dos formas: devolver árboles distintos según el
  // breakpoint desmontaría `CopilotChat` al cruzarlo y se perdería el hilo.
  return (
    <aside
      aria-label="Asistente"
      aria-hidden={!abierto}
      className={cn(
        'copilot-panel overflow-hidden',
        isMobile
          ? 'fixed inset-0 z-50 transition-transform duration-200'
          : 'relative z-30 shrink-0 border-l border-[var(--arca-border)] transition-[width] duration-200 ease-out',
        !abierto && 'pointer-events-none',
        !abierto && !isMobile && 'border-l-0'
      )}
      style={
        isMobile
          ? { transform: abierto ? 'none' : 'translateY(100%)' }
          : { width: abierto ? ancho : 0 }
      }
    >
      {/* Manija de ancho. La línea se pinta al pasar el cursor; el área
          sensible es más ancha que la línea para poder agarrarla. */}
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar el asistente"
          onPointerDown={empezarResize}
          className="group absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize"
        >
          <div className="mx-auto h-full w-px transition-colors duration-[120ms] group-hover:bg-[var(--arca-accent)]" />
        </div>
      )}
      {contenido}
    </aside>
  );
}
