import { describe, expect, it } from 'vitest';
import { parsearNotasDeHtml, limpiarTitulo } from './notas-word';

describe('limpiarTitulo', () => {
  it('saca la numeración que el sistema calcula por posición', () => {
    expect(limpiarTitulo('Nota 3. Bienes de cambio')).toBe('Bienes de cambio');
    expect(limpiarTitulo('NOTA 12 - Deudas fiscales')).toBe('Deudas fiscales');
    expect(limpiarTitulo('3) Caja y bancos')).toBe('Caja y bancos');
    expect(limpiarTitulo('1: Criterios')).toBe('Criterios');
  });

  it('deja los títulos que no traen número', () => {
    expect(limpiarTitulo('Bienes de cambio')).toBe('Bienes de cambio');
  });

  it('no confunde un número que es parte del título', () => {
    expect(limpiarTitulo('Ley 19.550')).toBe('Ley 19.550');
  });
});

describe('parsearNotasDeHtml', () => {
  it('lee el formato que produce nuestro propio export', () => {
    const notas = parsearNotasDeHtml(
      '<h2>Nota 1. Criterios de valuación</h2><p>Los EECC fueron preparados…</p>' +
        '<h2>Nota 2. Bienes de cambio</h2><p>Valuados a costo de reposición.</p>'
    );
    expect(notas).toHaveLength(2);
    expect(notas[0].titulo).toBe('Criterios de valuación');
    expect(notas[0].contenido).toBe('Los EECC fueron preparados…');
    expect(notas[1].titulo).toBe('Bienes de cambio');
  });

  it('junta varios párrafos en una sola nota', () => {
    const [n] = parsearNotasDeHtml(
      '<h1>Criterios</h1><p>Primero.</p><p>Segundo.</p><p>Tercero.</p>'
    );
    expect(n.contenido).toBe('Primero.\nSegundo.\nTercero.');
  });

  it('un párrafo vacío no abre una nota nueva', () => {
    const notas = parsearNotasDeHtml(
      '<h2>Criterios</h2><p>Antes.</p><p></p><p>Después.</p>'
    );
    expect(notas).toHaveLength(1);
    expect(notas[0].contenido).toContain('Antes.');
    expect(notas[0].contenido).toContain('Después.');
  });

  it('un documento sin encabezados entra como una nota sola', () => {
    // Preferible a decirle al usuario que su archivo no sirve.
    const notas = parsearNotasDeHtml('<p>Texto suelto.</p><p>Más texto.</p>');
    expect(notas).toHaveLength(1);
    expect(notas[0].titulo).toBe('Nota importada');
    expect(notas[0].contenido).toBe('Texto suelto.\nMás texto.');
  });

  it('el texto anterior al primer encabezado no se pierde', () => {
    const notas = parsearNotasDeHtml(
      '<p>NOTAS A LOS ESTADOS CONTABLES</p><h2>Nota 1. Criterios</h2><p>Cuerpo.</p>'
    );
    expect(notas).toHaveLength(1);
    expect(notas[0].contenido).toContain('NOTAS A LOS ESTADOS CONTABLES');
    expect(notas[0].contenido).toContain('Cuerpo.');
  });

  it('descarta encabezados vacíos en vez de crear notas fantasma', () => {
    const notas = parsearNotasDeHtml('<h2></h2><h2>Real</h2><p>Cuerpo.</p>');
    expect(notas).toHaveLength(1);
    expect(notas[0].titulo).toBe('Real');
  });

  it('una nota con título y sin cuerpo se conserva', () => {
    // El contador puede querer el título y escribir el cuerpo después.
    const notas = parsearNotasDeHtml('<h2>Hechos posteriores</h2>');
    expect(notas).toHaveLength(1);
    expect(notas[0].contenido).toBe('');
  });

  it('un documento vacío no devuelve nada', () => {
    expect(parsearNotasDeHtml('')).toHaveLength(0);
    expect(parsearNotasDeHtml('<p></p><p>   </p>')).toHaveLength(0);
  });
});

describe('detalles del formato de Word', () => {
  it('resuelve las entidades HTML', () => {
    const [n] = parsearNotasDeHtml(
      '<h2>Ventas &amp; servicios</h2><p>Saldo &lt; 100 &#8212; ver anexo.</p>'
    );
    expect(n.titulo).toBe('Ventas & servicios');
    expect(n.contenido).toBe('Saldo < 100 — ver anexo.');
  });

  it('saca el formato de adentro del párrafo', () => {
    const [n] = parsearNotasDeHtml(
      '<h2>T</h2><p>Los bienes se valúan a <strong>costo</strong> de <em>reposición</em>.</p>'
    );
    expect(n.contenido).toBe('Los bienes se valúan a costo de reposición.');
  });

  it('las viñetas entran como líneas', () => {
    const [n] = parsearNotasDeHtml(
      '<h2>Criterios</h2><ul><li>Uno</li><li>Dos</li></ul>'
    );
    expect(n.contenido).toBe('Uno\nDos');
  });

  it('el salto de línea de Word se conserva', () => {
    const [n] = parsearNotasDeHtml('<h2>T</h2><p>Primera<br />Segunda</p>');
    expect(n.contenido).toBe('Primera\nSegunda');
  });
});
