'use client';

import { useEffect, useState } from 'react';
import { CopilotChat } from '@copilotkit/react-ui';
import { useCopilotChat } from '@copilotkit/react-core';
import { TextMessage, Role } from '@copilotkit/runtime-client-gql';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  registerCopilotControl,
  setMessageCount,
  unregisterCopilotControl,
} from './copilot-control';
import { AttachmentBar } from './AttachmentBar';

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
  const { appendMessage } = useCopilotChat();

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
      ) as HTMLElement | null;
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
    ) as HTMLElement | null;
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
        height: '72vh',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
      }}
      aria-hidden={!open}
    >
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
            initial: '¿En qué puedo ayudarte?',
            placeholder: 'Preguntale al asistente…',
          }}
        />
      </div>
      <AttachmentBar />
    </div>
  );
}
