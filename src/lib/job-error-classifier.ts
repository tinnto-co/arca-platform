// PORTED FROM arca-scrapper/src/shared/error-classifier.ts — keep in sync manually.
// classifyStoredFailedReason agrega el mapeo de los mensajes "amigables" que el
// scrapper guarda en job.failed_reason (ver arca-scrapper/src/shared/friendly-error-messages.ts).

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
  captcha: 'Captcha',
  infrastructure: 'Infraestructura / conexión',
  selector_change: 'Cambio en página de AFIP',
  csv_not_found: 'Archivo CSV no encontrado',
  profile_not_found: 'Perfil no encontrado',
  unknown: 'Otro / desconocido',
};

export function classifyError(failedReason: string): ErrorClassification {
  if (
    /clave.*(incorrecto|incorrecta|inv[aá]lida?)/i.test(failedReason) ||
    /usuario.*(incorrecto|no existe)/i.test(failedReason) ||
    /cuil.*(incorrecto|inv[aá]lido?)/i.test(failedReason) ||
    /cuit.*(incorrecto|inv[aá]lido?)/i.test(failedReason) ||
    /cambiar.{0,10}contraseña/i.test(failedReason) ||
    /credenciales/i.test(failedReason) ||
    (/password/i.test(failedReason) && /incorrect|invalid|wrong/i.test(failedReason))
  ) {
    return { category: 'credentials', severity: 'critical', retryable: false };
  }

  if (/captcha/i.test(failedReason)) {
    return { category: 'captcha', severity: 'low', retryable: true };
  }

  if (/no se encontr[oó] el archivo csv/i.test(failedReason)) {
    return { category: 'csv_not_found', severity: 'medium', retryable: true };
  }

  if (/no se encontr[oó] el perfil/i.test(failedReason)) {
    return { category: 'profile_not_found', severity: 'high', retryable: false };
  }

  if (/waiting for selector/i.test(failedReason)) {
    return { category: 'selector_change', severity: 'high', retryable: false };
  }

  // Estado legítimo de AFIP: el contribuyente registra irregularidades (no reintentar).
  if (/registra irregularidades/i.test(failedReason)) {
    return { category: 'unknown', severity: 'low', retryable: false };
  }

  if (
    /connection (closed|reset|refused|failed)/i.test(failedReason) ||
    /websocket/i.test(failedReason) ||
    /session (closed|lost|expired)/i.test(failedReason) ||
    // Equivalentes en español (Portal IVA / ctacte / FES):
    /sesi[oó]n (vencida|expir)/i.test(failedReason) ||
    /error de ingreso/i.test(failedReason) ||
    /cookies rechazadas/i.test(failedReason) ||
    /redirigido al login/i.test(failedReason) ||
    /no autenticó/i.test(failedReason) ||
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

// Mensajes canónicos que getFriendlyFailedReason() guarda en job.failed_reason.
// Se matchea por prefijo porque son strings exactos generados por el scrapper.
const FRIENDLY_MESSAGE_CATEGORIES: { prefix: string; classification: ErrorClassification }[] = [
  {
    prefix: 'Usuario o clave de AFIP incorrectos',
    classification: { category: 'credentials', severity: 'critical', retryable: false },
  },
  {
    prefix: 'La operación tardó demasiado',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'No se pudo cargar la página de AFIP a tiempo',
    classification: { category: 'selector_change', severity: 'high', retryable: true },
  },
  {
    prefix: 'La sesión del navegador se cerró',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'La página se recargó o cerró',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'Problema de conexión con el servicio',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'Error de red al conectar con AFIP',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'El navegador se desconectó',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'Error del navegador durante el proceso',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'La sesión del navegador se interrumpió',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'La sesión de AFIP expiró',
    classification: { category: 'infrastructure', severity: 'medium', retryable: true },
  },
  {
    prefix: 'Cliente no encontrado en el sistema',
    classification: { category: 'profile_not_found', severity: 'high', retryable: false },
  },
  {
    prefix: 'El contribuyente registra irregularidades',
    classification: { category: 'unknown', severity: 'low', retryable: false },
  },
  {
    prefix: 'Ocurrió un error durante la ejecución',
    classification: { category: 'unknown', severity: 'medium', retryable: false },
  },
];

/**
 * Clasifica un failed_reason tal como está guardado en la DB: primero matchea
 * los mensajes amigables canónicos, y si no, cae a los patrones crudos.
 */
export function classifyStoredFailedReason(failedReason: string | null | undefined): ErrorClassification {
  const msg = String(failedReason ?? '').trim();
  if (!msg) return { category: 'unknown', severity: 'medium', retryable: false };

  for (const { prefix, classification } of FRIENDLY_MESSAGE_CATEGORIES) {
    if (msg.startsWith(prefix)) return classification;
  }

  return classifyError(msg);
}
