import { describe, expect, it } from 'vitest';
import {
  cargarModulo,
  esVersionVieja,
  MENSAJE_VERSION_VIEJA,
  VersionVieja,
} from './modulo-dinamico';

describe('esVersionVieja', () => {
  it('reconoce el error de Chrome, que es el que vio el estudio', () => {
    expect(
      esVersionVieja(
        new TypeError(
          'Failed to fetch dynamically imported module: https://contable.staging.tinnto.ai/assets/recibo-pdf-DKYIo-vp.js'
        )
      )
    ).toBe(true);
  });

  it('reconoce las variantes de Firefox y Safari', () => {
    expect(
      esVersionVieja(new TypeError('error loading dynamically imported module'))
    ).toBe(true);
    expect(
      esVersionVieja(new TypeError('Importing a module script failed.'))
    ).toBe(true);
  });

  it('no confunde un error del propio módulo', () => {
    expect(esVersionVieja(new Error('no se pudo generar el PDF'))).toBe(false);
    expect(esVersionVieja(new TypeError('x is not a function'))).toBe(false);
  });

  it('tolera que no sea un Error', () => {
    expect(esVersionVieja('Failed to fetch dynamically imported module')).toBe(
      true
    );
    expect(esVersionVieja(null)).toBe(false);
  });
});

describe('cargarModulo', () => {
  it('devuelve el módulo cuando carga bien', async () => {
    await expect(cargarModulo(async () => ({ hola: 1 }))).resolves.toEqual({
      hola: 1,
    });
  });

  it('traduce el chunk faltante a un mensaje que se entiende', async () => {
    const falla = () =>
      Promise.reject(
        new TypeError('Failed to fetch dynamically imported module: /a.js')
      );
    await expect(cargarModulo(falla)).rejects.toBeInstanceOf(VersionVieja);
    await expect(cargarModulo(falla)).rejects.toThrow(MENSAJE_VERSION_VIEJA);
  });

  it('deja pasar cualquier otro error tal cual', async () => {
    await expect(
      cargarModulo(() => Promise.reject(new Error('explotó el módulo')))
    ).rejects.toThrow('explotó el módulo');
  });
});
