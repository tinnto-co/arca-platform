import { describe, expect, it } from 'vitest';
import { friendlyFailedReason } from './job-error-classifier';

describe('friendlyFailedReason', () => {
  it('sin mensaje devuelve null', () => {
    expect(friendlyFailedReason(null)).toBeNull();
    expect(friendlyFailedReason(undefined)).toBeNull();
    expect(friendlyFailedReason('   ')).toBeNull();
  });

  it('los mensajes canónicos del scrapper pasan tal cual', () => {
    const msg = 'Usuario o clave de AFIP incorrectos. Verificá la credencial.';
    expect(friendlyFailedReason(msg)).toBe(msg);
    const timeout = 'La operación tardó demasiado y fue cancelada.';
    expect(friendlyFailedReason(timeout)).toBe(timeout);
  });

  it('el mensaje interno del reaper nunca llega al usuario', () => {
    const out = friendlyFailedReason(
      'Job colgado (reaper): estado pending, sin avance'
    );
    expect(out).not.toContain('reaper');
    expect(out).not.toContain('pending');
    expect(out).toBe(
      'La actualización anterior quedó a medias y se canceló. Volvé a intentar.'
    );
  });

  it('los errores técnicos en inglés se traducen por categoría', () => {
    expect(
      friendlyFailedReason('TimeoutError: waiting for selector `#btnIngresar`')
    ).toBe('AFIP cambió su página y la actualización no pudo completarse.');
    expect(friendlyFailedReason('net::ERR_CONNECTION_RESET at ...')).toBe(
      'La actualización se interrumpió por un problema de conexión. Reintentá en unos minutos.'
    );
  });

  it('cualquier otro texto cae en el genérico, nunca en el crudo', () => {
    const out = friendlyFailedReason(
      'TypeError: Cannot read properties of undefined'
    );
    expect(out).toBe(
      'La última actualización no pudo completarse. Reintentá en unos minutos.'
    );
  });
});
