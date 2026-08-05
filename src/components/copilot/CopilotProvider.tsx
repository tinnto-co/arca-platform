/**
 * Todo el subárbol de CopilotKit vive acá, aislado a propósito.
 *
 * Este archivo es el ÚNICO punto de entrada a `@copilotkit/*` desde el árbol de
 * React, y `_authed/route.tsx` lo carga con `React.lazy`. Así CopilotKit —que
 * arrastra streamdown → mermaid + shiki + katex, unos 2 MB de JS— queda en un
 * chunk aparte en vez del grafo de entrada, y solo se descarga cuando la
 * organización tiene el módulo `ai_agent` habilitado.
 *
 * Si vas a importar algo de `@copilotkit` desde otro lado, importalo desde un
 * componente que cuelgue de acá; si no, el árbol vuelve al bundle principal y
 * se pierde el corte.
 *
 * `CopilotAttachmentProvider` queda deliberadamente FUERA (en route.tsx): no
 * depende de CopilotKit y el `AgentInput` flotante lo consume, así que tiene
 * que estar montado también mientras este chunk todavía se está cargando.
 */
import { CopilotKit } from '@copilotkit/react-core';
import '@copilotkit/react-ui/styles.css';
import { CopilotActions } from './CopilotActions';
import { CopilotBottomPanel } from './CopilotBottomPanel';
import { FrontendTools } from './FrontendTools';
import { GlobalCopilotReadables } from './GlobalCopilotReadables';
import { VisiblePageReadable } from './VisiblePageReadable';

interface CopilotProviderProps {
  showBottomPanel: boolean;
  children: React.ReactNode;
}

export default function CopilotProvider({
  showBottomPanel,
  children,
}: CopilotProviderProps) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      showDevConsole={false}
      enableInspector={false}
    >
      <CopilotActions />
      <FrontendTools />
      <GlobalCopilotReadables />
      <VisiblePageReadable />
      {children}
      {showBottomPanel && <CopilotBottomPanel />}
    </CopilotKit>
  );
}
