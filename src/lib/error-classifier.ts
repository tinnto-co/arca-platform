export type ErrorCategory =
  | 'credentials'
  | 'captcha'
  | 'infrastructure'
  | 'selector_change'
  | 'csv_not_found'
  | 'profile_not_found'
  | 'unknown';

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
}

export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  credentials: 'Credenciales inválidas',
  captcha: 'Error de CAPTCHA',
  infrastructure: 'Error de infraestructura',
  selector_change: 'AFIP cambió la interfaz',
  csv_not_found: 'CSV no encontrado',
  profile_not_found: 'Perfil no encontrado',
  unknown: 'Error desconocido',
};

export function classifyError(failedReason: string): ErrorClassification {
  // Credentials
  if (
    /clave.*(incorrecto|incorrecta|inv[aá]lida?)/i.test(failedReason) ||
    /usuario.*(incorrecto|no existe)/i.test(failedReason) ||
    /cuil.*(incorrecto|inv[aá]lido?)/i.test(failedReason) ||
    /cuit.*(incorrecto|inv[aá]lido?)/i.test(failedReason) ||
    /cambiar contraseña/i.test(failedReason) ||
    /credenciales/i.test(failedReason) ||
    (/password/i.test(failedReason) &&
      /incorrect|invalid|wrong/i.test(failedReason))
  ) {
    return { category: 'credentials', severity: 'critical', retryable: false };
  }

  // Captcha
  if (/captcha/i.test(failedReason)) {
    return { category: 'captcha', severity: 'low', retryable: true };
  }

  // CSV not found
  if (/no se encontr[oó] el archivo csv/i.test(failedReason)) {
    return { category: 'csv_not_found', severity: 'medium', retryable: true };
  }

  // Profile not found
  if (/no se encontr[oó] el perfil/i.test(failedReason)) {
    return { category: 'profile_not_found', severity: 'high', retryable: false };
  }

  // Selector change (AFIP changed UI)
  if (/waiting for selector/i.test(failedReason)) {
    return { category: 'selector_change', severity: 'high', retryable: false };
  }

  // Infrastructure errors
  if (
    /connection (closed|reset|refused|failed)/i.test(failedReason) ||
    /websocket/i.test(failedReason) ||
    /session (closed|lost|expired)/i.test(failedReason) ||
    /frame (detached|was detached)/i.test(failedReason) ||
    /navigation timeout/i.test(failedReason) ||
    /timeout.*exceeded/i.test(failedReason) ||
    /net::(err_|connection)/i.test(failedReason) ||
    /target closed/i.test(failedReason) ||
    /page crashed/i.test(failedReason) ||
    /protocol error/i.test(failedReason) ||
    /context was destroyed/i.test(failedReason) ||
    /execution context/i.test(failedReason)
  ) {
    return { category: 'infrastructure', severity: 'medium', retryable: true };
  }

  return { category: 'unknown', severity: 'medium', retryable: false };
}
