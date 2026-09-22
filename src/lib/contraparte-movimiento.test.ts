import { describe, expect, it } from 'vitest';
import {
  resolverContrapartes,
  type BusquedasContraparte,
  type ComprobanteCandidato,
  type ContraparteDelPadron,
  type MovimientoAResolver,
} from './contraparte-movimiento';

const EMPRESA = '30707920056';

const PADRON: ContraparteDelPadron[] = [
  {
    id: 'grupo-sur',
    docTipo: 'cuit',
    docNro: '30697293287',
    nombre: 'GRUPO SUR ARGENTINA SA',
  },
  { id: 'iosfa', docTipo: 'cuit', docNro: '30714292141', nombre: 'IOSFA' },
  {
    id: 'annoni',
    docTipo: 'dni',
    docNro: '25855720',
    nombre: 'ANNONI PABLO ESTEBAN',
  },
  { id: 'propia', docTipo: 'cuit', docNro: EMPRESA, nombre: 'ADMIP SRL' },
];

function busquedas(
  opts: { operan?: string[]; comprobantes?: ComprobanteCandidato[] } = {}
): BusquedasContraparte {
  return {
    porDocumento: (cuits, dnis) =>
      Promise.resolve(
        PADRON.filter(
          (p) =>
            (p.docTipo === 'cuit' && cuits.includes(p.docNro)) ||
            (p.docTipo === 'dni' && dnis.includes(p.docNro))
        )
      ),
    queOperanConLaEmpresa: (ids) =>
      Promise.resolve(
        new Set((opts.operan ?? []).filter((id) => ids.includes(id)))
      ),
    comprobantesPorImporte: () => Promise.resolve(opts.comprobantes ?? []),
  };
}

const mov = (m: Partial<MovimientoAResolver>): MovimientoAResolver => ({
  descripcion: null,
  importe: 1000,
  fecha: '2026-01-20',
  direccion: 'ingreso',
  categoria: 'transferencias',
  ...m,
});

describe('resolverContrapartes — por CUIT', () => {
  it('asigna la contraparte del CUIT suelto que está en el padrón', async () => {
    const [r] = await resolverContrapartes(
      [mov({ descripcion: 'TRANSFERENCIA 30697293287' })],
      EMPRESA,
      busquedas()
    );
    expect(r.contraparteId).toBe('grupo-sur');
    expect(r.contraparteTexto).toBe('GRUPO SUR ARGENTINA SA');
    expect(r.sugerida).toBeNull();
  });

  it('nunca asigna a la propia empresa (pago a AFIP con su CUIT)', async () => {
    const [r] = await resolverContrapartes(
      [
        mov({
          descripcion: 'Pago de servicios Imp.afip: 3070792005692401686',
          categoria: 'impuestos',
        }),
      ],
      EMPRESA,
      busquedas({ operan: ['propia'] })
    );
    expect(r.contraparteId).toBeNull();
  });

  it('un CUIT pegado a otros dígitos solo vale si opera con la empresa', async () => {
    const descripcion =
      'Pago a proveedores recibido Instituto de obra social de l 30714292141035453609';
    const [sinFacturas] = await resolverContrapartes(
      [mov({ descripcion })],
      EMPRESA,
      busquedas()
    );
    expect(sinFacturas.contraparteId).toBeNull();

    const [conFacturas] = await resolverContrapartes(
      [mov({ descripcion })],
      EMPRESA,
      busquedas({ operan: ['iosfa'] })
    );
    expect(conFacturas.contraparteId).toBe('iosfa');
  });

  it('encuentra a una persona por el DNI dentro de su CUIT', async () => {
    const [r] = await resolverContrapartes(
      [mov({ descripcion: 'TRANSFERENCIA 20258557205' })],
      EMPRESA,
      busquedas()
    );
    expect(r.contraparteId).toBe('annoni');
  });

  it('un CUIT que no está en el padrón queda como texto, sin asignar', async () => {
    const [r] = await resolverContrapartes(
      [
        mov({
          descripcion: 'TRANSFERENCIA 30615773383',
          categoria: 'impuestos',
        }),
      ],
      EMPRESA,
      busquedas()
    );
    expect(r.contraparteId).toBeNull();
    expect(r.contraparteTexto).toBe('CUIT 30-61577338-3');
  });
});

describe('resolverContrapartes — por importe exacto (sugerencia)', () => {
  const factura = (c: Partial<ComprobanteCandidato>): ComprobanteCandidato => ({
    id: 'f1',
    total: 248959.7,
    fechaEmision: '2026-01-22',
    direccion: 'emitido',
    contraparteId: 'mica',
    contraparteNombre: 'MICA SA',
    ...c,
  });
  const cobroMica = mov({
    descripcion: 'TR.NE4022353 MICA SA',
    importe: 248959.7,
    fecha: '2026-01-23',
  });

  it('sugiere cuando una sola contraparte tiene una factura con ese importe', async () => {
    const [r] = await resolverContrapartes(
      [cobroMica],
      EMPRESA,
      busquedas({ comprobantes: [factura({})] })
    );
    expect(r.contraparteId).toBeNull();
    expect(r.sugerida).toEqual({
      contraparteId: 'mica',
      nombre: 'MICA SA',
      motivo: 'importe_exacto',
      comprobanteIds: ['f1'],
    });
  });

  it('no sugiere si el importe coincide con facturas de dos contrapartes', async () => {
    const [r] = await resolverContrapartes(
      [cobroMica],
      EMPRESA,
      busquedas({
        comprobantes: [
          factura({}),
          factura({ id: 'f2', contraparteId: 'otra' }),
        ],
      })
    );
    expect(r.sugerida).toBeNull();
  });

  it('un cobro no se cruza con una factura recibida', async () => {
    const [r] = await resolverContrapartes(
      [cobroMica],
      EMPRESA,
      busquedas({ comprobantes: [factura({ direccion: 'recibido' })] })
    );
    expect(r.sugerida).toBeNull();
  });

  it('no sugiere si la descripción nombra a otra persona (casos reales)', async () => {
    const otra = factura({
      contraparteId: 'dermerdjian',
      contraparteNombre: 'DERMERDJIAN LIDIA BEATRIZ',
    });
    for (const descripcion of [
      'Transferencia realizada A montenegro horacio anto / var',
      'Compra con tarjeta de debito Merpago*shellbox - tarj nr',
      'Retiro en efvo por caja suc san cristobal',
    ]) {
      const [r] = await resolverContrapartes(
        [{ ...cobroMica, descripcion, categoria: 'varios' }],
        EMPRESA,
        busquedas({ comprobantes: [otra] })
      );
      expect(r.sugerida, descripcion).toBeNull();
    }
  });

  it('sugiere si la descripción no nombra a nadie', async () => {
    const [r] = await resolverContrapartes(
      [{ ...cobroMica, descripcion: 'TRANSFERENCIA INMEDIATA 0004521' }],
      EMPRESA,
      busquedas({ comprobantes: [factura({})] })
    );
    expect(r.sugerida?.contraparteId).toBe('mica');
  });

  it('no sugiere para impuestos ni fuera de la ventana de fechas', async () => {
    const [impuesto] = await resolverContrapartes(
      [{ ...cobroMica, categoria: 'impuestos' }],
      EMPRESA,
      busquedas({ comprobantes: [factura({})] })
    );
    expect(impuesto.sugerida).toBeNull();

    const [vieja] = await resolverContrapartes(
      [cobroMica],
      EMPRESA,
      busquedas({ comprobantes: [factura({ fechaEmision: '2025-11-01' })] })
    );
    expect(vieja.sugerida).toBeNull();
  });
});
