/**
 * Delegaciones de servicios de AFIP por (cliente, credencial) — los estados
 * los escribe el scraper en `cliente_credencial.delegaciones_afip`.
 */
export const SERVICIO_AFIP_LABEL: Record<string, string> = {
  mis_comprobantes: 'Mis Comprobantes',
  ctacte: 'Cuentas Tributarias',
  portal_iva: 'Portal IVA',
  domicilio_fiscal: 'Domicilio Fiscal Electrónico',
};

/** La solapa de la ficha donde el servicio faltante se hace visible. */
export const SERVICIO_AFIP_TAB: Record<string, string> = {
  mis_comprobantes: 'facturas',
  ctacte: 'deudas',
  portal_iva: 'iva',
  domicilio_fiscal: 'notificaciones',
};
