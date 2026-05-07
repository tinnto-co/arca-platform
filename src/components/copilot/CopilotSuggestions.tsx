'use client';

import { useCopilotChatSuggestions } from '@copilotkit/react-ui';
import { useRouterState } from '@tanstack/react-router';

/**
 * Registers per-screen contextual chat suggestions for the CopilotBottomPanel.
 * Re-evaluates whenever the active pathname changes. Returns null — purely
 * side-effectful via the hook.
 *
 * The actual data the model uses to draft suggestions comes from
 * `useCopilotReadable` registrations on each page; the `instructions` here
 * tell the model WHAT to suggest given that context.
 */
export function CopilotSuggestions() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const instructions = pickInstructions(pathname);

  useCopilotChatSuggestions(
    {
      instructions: instructions ?? '',
      available: instructions ? 'enabled' : 'disabled',
      minSuggestions: 3,
      maxSuggestions: 4,
    },
    [instructions]
  );

  return null;
}

function pickInstructions(pathname: string): string | null {
  // Order matters: more specific routes first.
  if (/^\/clients\/[^/]+/.test(pathname)) {
    return 'Sugerí 3-4 prompts contextuales al cliente activo: cómo está este cliente (resumen de salud), resumen IVA del último período, deudas vencidas pendientes, marcar notificaciones AFIP informativas como leídas. Usá el contexto del cliente expuesto en pantalla; no inventes datos.';
  }
  if (pathname === '/clients') {
    return 'Sugerí 3-4 prompts útiles sobre la lista de clientes: identificar clientes con errores recientes, ranking de facturación del mes, búsqueda multi-criterio (CUIT/nombre/condición), total de clientes activos. Usá el contexto del listado visible.';
  }
  if (pathname === '/sueldos' || pathname.startsWith('/sueldos/')) {
    return 'Sugerí 3-4 prompts sobre la liquidación del cliente activo en /sueldos: resumen de la última liquidación (mesLiquidable), comparar totales con el mes anterior, validar fórmulas de conceptos, listar empleados sin convenio asignado.';
  }
  if (pathname === '/notifications') {
    return 'Sugerí 3 prompts sobre notificaciones AFIP: priorizar las urgentes (penalización/rechazo), marcar las informativas como leídas en lote, resumen de notificaciones por cliente.';
  }
  if (pathname === '/vencimientos') {
    return 'Sugerí 3 prompts sobre vencimientos fiscales: vencimientos en los próximos 7 días, agrupar por tipo de impuesto, total estimado a pagar en el período visible.';
  }
  if (pathname === '/') {
    return 'Sugerí 3 prompts útiles para ver el resumen del estudio desde el dashboard: KPIs principales del mes, deudas vencidas críticas, próximos vencimientos por impuesto.';
  }
  return null;
}
