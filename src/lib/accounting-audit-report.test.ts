import { describe, expect, it } from 'vitest';
import {
  AUDIT_REPORT_DEFAULT,
  fechaLarga,
  fillAuditReport,
  missingVars,
  rangoAnexos,
  rangoNotas,
} from './accounting-audit-report';

const vars = {
  empresa: 'ADMIP SRL',
  cuit: '30-70792005-6',
  domicilio: 'Av. Jujuy N° 420 – Piso 9° Dpto. A',
  cierre: '31 de diciembre de 2025',
  ejercicio: '24',
  notas: '1 a 4',
  anexos: 'I a III',
  destinatario: 'Señores Socios',
  contador: 'Dr. I. Gustavo Sfintzi',
  matricula: 'Tomo 193 Folio 084',
  lugar: 'Ciudad Autónoma de Buenos Aires',
  fecha: '03 de mayo de 2026',
};

describe('reemplazo de variables', () => {
  it('reemplaza todas las apariciones, no solo la primera', () => {
    // "empresa" aparece diez veces en el informe del estudio.
    const r = fillAuditReport('{{empresa}} … {{empresa}} … {{empresa}}', vars);
    expect(r).toBe('ADMIP SRL … ADMIP SRL … ADMIP SRL');
  });

  it('tolera espacios adentro de las llaves', () => {
    expect(fillAuditReport('{{ empresa }}', vars)).toBe('ADMIP SRL');
  });

  it('deja a la vista una variable que no existe', () => {
    // Borrarla escondería el error justo en el documento que se firma.
    expect(fillAuditReport('Hola {{inventada}}', vars)).toBe(
      'Hola {{inventada}}'
    );
  });

  it('deja a la vista una variable conocida pero vacía', () => {
    expect(fillAuditReport('CUIT {{cuit}}', { ...vars, cuit: '' })).toBe(
      'CUIT {{cuit}}'
    );
  });

  it('no toca el texto que no tiene variables', () => {
    const t = 'Normas de auditoría RT N° 37 de la FACPCE.';
    expect(fillAuditReport(t, vars)).toBe(t);
  });
});

describe('aviso de variables sin completar', () => {
  it('lista las desconocidas y las vacías', () => {
    const t = '{{empresa}} {{inventada}} {{cuit}}';
    expect(missingVars(t, { ...vars, cuit: '' }).sort()).toEqual([
      'cuit',
      'inventada',
    ]);
  });

  it('no repite la misma variable dos veces', () => {
    expect(missingVars('{{x}} {{x}}', vars)).toEqual(['x']);
  });

  it('sin faltantes devuelve vacío', () => {
    expect(missingVars('{{empresa}} al {{cierre}}', vars)).toEqual([]);
  });
});

describe('formatos que usa el informe', () => {
  it('escribe la fecha como en el informe', () => {
    expect(fechaLarga(new Date(Date.UTC(2025, 11, 31)))).toBe(
      '31 de diciembre de 2025'
    );
    expect(fechaLarga(new Date(Date.UTC(2026, 4, 3)))).toBe(
      '03 de mayo de 2026'
    );
  });

  it('arma el rango de notas', () => {
    expect(rangoNotas(4)).toBe('1 a 4');
    expect(rangoNotas(1)).toBe('1');
    expect(rangoNotas(0)).toBe('');
  });

  it('arma el rango de anexos en romanos', () => {
    expect(rangoAnexos(3)).toBe('I a III');
    expect(rangoAnexos(1)).toBe('I');
    expect(rangoAnexos(0)).toBe('');
  });
});

describe('plantilla por defecto', () => {
  it('se completa entera con los datos de una empresa', () => {
    expect(missingVars(AUDIT_REPORT_DEFAULT, vars)).toEqual([]);
  });

  it('no lleva el lugar ni la fecha en el cuerpo', () => {
    // Van en sus campos: en el texto quedarían congelados al aplicarla.
    expect(AUDIT_REPORT_DEFAULT).not.toContain('{{lugar}}');
    expect(AUDIT_REPORT_DEFAULT).not.toContain('{{fecha}}');
  });

  it('una vez completa no quedan llaves sueltas', () => {
    expect(fillAuditReport(AUDIT_REPORT_DEFAULT, vars)).not.toContain('{{');
  });

  it('trae los párrafos que exige la RT 37', () => {
    const t = AUDIT_REPORT_DEFAULT;
    expect(t).toContain('Opinión');
    expect(t).toContain('Fundamento de la opinión');
    expect(t).toContain('Responsabilidad de la dirección');
    expect(t).toContain('Responsabilidad del auditor');
    expect(t).toContain('otros requerimientos legales');
    expect(t).toContain('RT N° 37');
  });
});
