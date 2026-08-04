import { describe, expect, it } from 'vitest';
import {
  defaultNoteLayout,
  noteNumberOf,
  numberNotes,
  sectionLabel,
  type LayoutEntry,
} from './accounting-document';

const notas = [
  { id: 'n-1', title: 'Notas generales' },
  { id: 'n-2', title: 'Políticas contables' },
  { id: 'n-3', title: 'Hechos posteriores' },
];

describe('orden por defecto', () => {
  it('deja las notas del contador primero y la composición al final', () => {
    expect(defaultNoteLayout(notas)).toEqual([
      'note:n-1',
      'note:n-2',
      'note:n-3',
      'composicion',
    ]);
  });
});

describe('numeración', () => {
  it('numera por posición, no por orden de carga', () => {
    const layout: LayoutEntry[] = [
      'note:n-2',
      'note:n-1',
      'composicion',
      'note:n-3',
    ];
    expect(numberNotes(layout, notas).map((n) => [n.number, n.title])).toEqual([
      [1, 'Políticas contables'],
      [2, 'Notas generales'],
      [3, 'Composición de los principales rubros'],
      [4, 'Hechos posteriores'],
    ]);
  });

  it('la composición de rubros deja de ser siempre la Nota 3', () => {
    // Era el choque original: el bloque decía "Nota 3" en duro y la tercera
    // nota del contador también.
    const primero = numberNotes(['composicion', ...notas.map((n) => `note:${n.id}` as LayoutEntry)], notas);
    expect(noteNumberOf(primero, 'composicion')).toBe(1);

    const ultimo = numberNotes(defaultNoteLayout(notas), notas);
    expect(noteNumberOf(ultimo, 'composicion')).toBe(4);
  });

  it('no hay dos notas con el mismo número', () => {
    const nums = numberNotes(defaultNoteLayout(notas), notas).map(
      (n) => n.number
    );
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('marca cuáles son del sistema', () => {
    const r = numberNotes(defaultNoteLayout(notas), notas);
    expect(r.filter((n) => n.isSystem).map((n) => n.entry)).toEqual([
      'composicion',
    ]);
  });
});

describe('el layout guardado tolera que las notas cambien', () => {
  it('una nota borrada desaparece sin dejar hueco en la numeración', () => {
    const layout: LayoutEntry[] = [
      'note:n-1',
      'note:n-2',
      'note:n-3',
      'composicion',
    ];
    const r = numberNotes(layout, [notas[0], notas[2]]);
    expect(r.map((n) => [n.number, n.title])).toEqual([
      [1, 'Notas generales'],
      [2, 'Hechos posteriores'],
      [3, 'Composición de los principales rubros'],
    ]);
  });

  it('una nota nueva se agrega al final en vez de perderse', () => {
    const layout: LayoutEntry[] = ['note:n-1', 'composicion'];
    const r = numberNotes(layout, notas);
    expect(r.map((n) => n.title)).toEqual([
      'Notas generales',
      'Composición de los principales rubros',
      'Políticas contables',
      'Hechos posteriores',
    ]);
  });

  it('un layout vacío equivale al orden por defecto', () => {
    expect(numberNotes([], notas)).toEqual(
      numberNotes(defaultNoteLayout(notas), notas)
    );
  });

  it('una entrada repetida en el layout no duplica la nota', () => {
    const r = numberNotes(['note:n-1', 'note:n-1', 'composicion'], notas);
    expect(r.filter((n) => n.entry === 'note:n-1')).toHaveLength(1);
  });

  it('una sección que no se numera como nota se ignora', () => {
    const r = numberNotes(['esp', 'note:n-1', 'anexo_i'], notas);
    expect(r.map((n) => n.entry)).not.toContain('esp');
    expect(r.map((n) => n.entry)).not.toContain('anexo_i');
  });
});

describe('rótulos de las secciones', () => {
  it('usa el del contador cuando lo puso', () => {
    // El estudio llama "Anexo I" al costo de mercadería vendida, no a bienes
    // de uso: por eso el rótulo no se puede deducir.
    expect(sectionLabel('anexo_cmv', { anexo_cmv: 'Anexo I' })).toBe('Anexo I');
    expect(sectionLabel('anexo_i', { anexo_i: 'Anexo de Bienes de Uso' })).toBe(
      'Anexo de Bienes de Uso'
    );
  });

  it('cae al propuesto si está vacío o en blanco', () => {
    expect(sectionLabel('anexo_ii')).toBe('Anexo II · Gastos por función');
    expect(sectionLabel('anexo_ii', { anexo_ii: '   ' })).toBe(
      'Anexo II · Gastos por función'
    );
  });

  it('el título de la composición sigue al rótulo', () => {
    const r = numberNotes(defaultNoteLayout(notas), notas, {
      composicion: 'Composición de rubros',
    });
    expect(r.find((n) => n.isSystem)?.title).toBe('Composición de rubros');
  });
});
