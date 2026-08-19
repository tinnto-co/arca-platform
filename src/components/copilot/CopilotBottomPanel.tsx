'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CopilotChat } from '@copilotkit/react-ui';
import { useCopilotChat } from '@copilotkit/react-core';
import { TextMessage, Role } from '@copilotkit/runtime-client-gql';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  registerCopilotControl,
  setMessageCount,
  setPanelState,
  unregisterCopilotControl,
} from './copilot-control';
import { AttachmentBar } from './AttachmentBar';

const PANEL_HEIGHT_STORAGE_KEY = 'arca-copilot-panel-height-px';
const PANEL_DEFAULT_HEIGHT_VH = 45;
const PANEL_MIN_HEIGHT_PX = 240;
const PANEL_MAX_HEIGHT_RATIO = 0.92;

/**
 * Panel inferior que reemplaza al CopilotSidebar lateral. Vive como overlay
 * fixed anclado al fondo de la ventana, full-width, altura fija (55vh).
 *
 * Estado:
 * - colapsado (default): el panel está oculto (translate-y-full). El usuario
 *   interactúa con el AgentInput flotante, que dispara la apertura del panel.
 * - expandido: panel visible mostrando la conversación con generative UI.
 *
 * El AgentInput externo invoca `submitMessageToSidebar(text)` → este panel
 * registra el handler vía `registerCopilotControl(...)` y al recibirlo abre el
 * panel y appendea el mensaje. Los mensajes previos persisten al cerrar/abrir.
 */
export function CopilotBottomPanel() {
  const [open, setOpen] = useState(false);
  const [sidebarOffset, setSidebarOffset] = useState(0);
  const [panelHeightPx, setPanelHeightPx] = useState<number | null>(null);
  const heightRef = useRef<number>(0);
  const { appendMessage } = useCopilotChat();

  // Initialize panel height: read localStorage if present, otherwise default
  // to PANEL_DEFAULT_HEIGHT_VH of viewport. Clamp on every read so a stale
  // value from a tiny window doesn't persist.
  useEffect(() => {
    const maxAllowed = window.innerHeight * PANEL_MAX_HEIGHT_RATIO;
    const saved = window.localStorage.getItem(PANEL_HEIGHT_STORAGE_KEY);
    let next: number;
    if (saved) {
      const parsed = Number.parseInt(saved, 10);
      next = Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, PANEL_MIN_HEIGHT_PX), maxAllowed)
        : (window.innerHeight * PANEL_DEFAULT_HEIGHT_VH) / 100;
    } else {
      next = (window.innerHeight * PANEL_DEFAULT_HEIGHT_VH) / 100;
    }
    setPanelHeightPx(next);
    heightRef.current = next;
  }, []);

  // Publish open/height to the floating AgentInput so it can shift above the
  // panel instead of being covered.
  useEffect(() => {
    setPanelState({ open, height: panelHeightPx ?? 0 });
  }, [open, panelHeightPx]);

  // When the panel transitions to open, focus the CopilotChat textarea so the
  // user can keep typing without an extra click. Without this, focus stays on
  // wherever the user clicked last (the AgentInput, which we just unmounted —
  // resulting in keystrokes landing on document.body).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '.copilot-bottom-panel .copilotKitInput textarea'
      );
      textarea?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = heightRef.current;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      const deltaY = startY - ev.clientY;
      const maxAllowed = window.innerHeight * PANEL_MAX_HEIGHT_RATIO;
      const next = Math.min(
        Math.max(startHeight + deltaY, PANEL_MIN_HEIGHT_PX),
        maxAllowed
      );
      heightRef.current = next;
      setPanelHeightPx(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.localStorage.setItem(
        PANEL_HEIGHT_STORAGE_KEY,
        String(Math.round(heightRef.current))
      );
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  useEffect(() => {
    registerCopilotControl(
      (text: string) => {
        setOpen(true);
        // Mark the conversation as active so the floating AgentInput can
        // switch its placeholder to "Continuar conversación…". `useCopilotChat`
        // doesn't expose visibleMessages reliably outside the CopilotChat
        // subtree, so we publish a coarse count here as a signal.
        setMessageCount(1);
        void appendMessage(
          new TextMessage({ content: text, role: Role.User })
        );
      },
      () => setOpen(true)
    );
    return () => unregisterCopilotControl();
  }, [appendMessage]);

  // Track the app sidebar so the panel doesn't cover it. On mobile the
  // sidebar is an overlay (we don't offset). On desktop we use the sidebar's
  // right edge as the panel's left offset, which adapts to expand/collapse.
  useEffect(() => {
    const update = () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        setSidebarOffset(0);
        return;
      }
      const sb = document.querySelector(
        '[data-sidebar="sidebar"]'
      );
      if (!sb) {
        setSidebarOffset(0);
        return;
      }
      const rect = sb.getBoundingClientRect();
      setSidebarOffset(Math.max(0, rect.right));
    };

    update();
    const sb = document.querySelector(
      '[data-sidebar="sidebar"]'
    );
    const ro = new ResizeObserver(update);
    if (sb) ro.observe(sb);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      className={cn(
        'copilot-bottom-panel fixed right-0 bottom-0 z-40 flex flex-col border-t border-l border-border bg-background shadow-2xl transition-[transform,left] duration-200',
        !open && 'pointer-events-none'
      )}
      style={{
        left: sidebarOffset,
        height: panelHeightPx ?? `${PANEL_DEFAULT_HEIGHT_VH}vh`,
        transform: open ? 'translateY(0)' : 'translateY(100%)',
      }}
      aria-hidden={!open}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar asistente"
        onPointerDown={handleResizeStart}
        className="absolute top-0 left-0 right-0 h-1.5 -translate-y-1/2 cursor-ns-resize group"
      >
        <div className="h-full w-full transition-colors group-hover:bg-[#139ed9]/40" />
      </div>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#139ed9]" />
          <h2 className="text-sm font-semibold">Asistente Arca</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar asistente"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 min-h-0">
        <CopilotChat
          labels={{
            placeholder: 'Preguntale al asistente…',
          }}
        />
      </div>
      <AttachmentBar />
    </div>
  );
}
