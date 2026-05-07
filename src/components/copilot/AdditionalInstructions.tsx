'use client';

import { useCopilotAdditionalInstructions } from '@copilotkit/react-core';
import { useRouterState } from '@tanstack/react-router';

/**
 * Registers per-screen additional system-prompt instructions for the
 * CopilotBottomPanel. The hook auto-removes its instruction when the
 * component unmounts or when `available` flips to "disabled", so toggling
 * the route effectively swaps which rule is active.
 *
 * Instruction copy stays <200 chars and Spanish-rioplatense, and tells the
 * model HOW to use the existing useCopilotReadable context — never
 * hardcodes IDs/values that change per cliente/período.
 *
 * Tab-level instructions on /clients/$id are intentionally collapsed into
 * a single path-level instruction: el tab activo vive en estado de
 * componente (no en search params) y este registrar corre arriba de
 * <CopilotKit> sin acceso al `activeTab`. Si en el futuro se mueve el tab
 * a search params, separar este instruction en uno por tab.
 */
export function AdditionalInstructions() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const instructions = pickInstructions(pathname);

  useCopilotAdditionalInstructions(
    {
      instructions: instructions ?? '',
      available: instructions ? 'enabled' : 'disabled',
    },
    [instructions]
  );

  return null;
}

function pickInstructions(pathname: string): string | null {
  // Order matters: more specific routes first.
  if (/^\/clients\/[^/]+/.test(pathname)) {
    return 'En el cliente activo: el IVA se publica el 5to día hábil del mes siguiente. Priorizá deudas por vencimiento más próximo. Categorizá notificaciones AFIP: penalización > rechazo > informativa.';
  }
  if (pathname === '/clients') {
    return 'Si el usuario menciona un cliente por nombre, identificá el clientId del contexto del listado antes de invocar acciones. No inventes UUIDs.';
  }
  if (pathname === '/sueldos' || pathname.startsWith('/sueldos/')) {
    return 'Solo el mes anterior es liquidable. mesLiquidable está en el contexto. Si te piden liquidar otro mes, explicá la regla y ofrecé el mes correcto.';
  }
  if (pathname === '/notifications') {
    return 'Cuando el usuario marca una notificación como leída, invocá marcarNotificacionLeida con el id del contexto. Confirmá visualmente con el componente HITL.';
  }
  return null;
}
