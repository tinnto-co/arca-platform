/**
 * Extractos bancarios: PDF → cola → lectura en segundo plano → revisión →
 * movimientos persistidos (TIN-1634).
 *
 * Subir y leer están separados a propósito. `subirExtracto` guarda el archivo
 * y devuelve enseguida; la lectura la hace el worker de a varios en paralelo
 * (`extractos-worker.ts`), así el estudio puede tirar veinte extractos e irse
 * a hacer otra cosa. La extracción queda en `extracto_bancario`, no en la
 * memoria del navegador, y por eso la revisión es después y desde donde sea.
 *
 * La IA solo LEE (banco, saldos y cada movimiento); el cuadre
 * (inicial + ingresos − egresos = final) es nuestro, y nada llega a
 * `movimiento_bancario` sin que una persona confirme. El PDF queda en
 * documento/R2 como respaldo.
 */
import { randomUUID } from 'node:crypto';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as r2 from '@/lib/r2';
import {
  cliente,
  clienteCredencial,
  cuentaBancaria,
  documento,
  extractoBancario,
  movimientoBancario,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import {
  cuadreExtracto,
  idExternoDeMovimiento,
  monedaIso,
  type Cuadre,
} from '@/lib/extracto-calc';
import { type LecturaGuardable } from '@/lib/extracto-lectura';
import { despertarWorkerExtractos } from '@/lib/extractos-worker';
import { CATEGORIAS_MOVIMIENTO } from '@/lib/clasificar-movimiento';
import { resolverContrapartesDeCliente } from '@/lib/contraparte-movimiento-db';

/** Tope de tamaño del archivo subido. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Una cuenta leída, ya emparejada con la cuenta bancaria del sistema. */
export interface CuentaRevisable {
  numeroCuenta: string;
  cbu: string;
  tipo: string;
  moneda: string;
  saldoInicial: number;
  saldoFinal: number;
  cuadre: Cuadre;
  cuentaExistenteId: string | null;
  cuentaExistenteNombre: string | null;
  movimientos: {
    fecha: string;
    descripcion: string;
    importe: number;
    direccion: 'ingreso' | 'egreso';
    saldoPosterior?: number | null;
    categoria: string;
  }[];
}

const soloDigitos = (v: string) => v.replace(/\D/g, '');

/**
 * Empareja cada cuenta del PDF con las que la empresa ya tiene: por CBU, que
 * es único, y si no por número, ignorando separadores —el PDF y la carga a
 * mano nunca los escriben igual—. Lo que no matchea se crea al confirmar.
 */
async function reconocerCuentas(
  cuentas: LecturaGuardable['extraccion']['cuentas'],
  clienteId: string,
  orgId: string
): Promise<CuentaRevisable[]> {
  const existentes = await db
    .select({
      id: cuentaBancaria.id,
      banco: cuentaBancaria.banco,
      numero: cuentaBancaria.numero,
      cbu: cuentaBancaria.cbu,
      alias: cuentaBancaria.alias,
    })
    .from(cuentaBancaria)
    .where(
      and(
        eq(cuentaBancaria.orgId, orgId),
        eq(cuentaBancaria.clienteId, clienteId),
        eq(cuentaBancaria.activa, true)
      )
    );

  return cuentas.map((c) => {
    const cbu = soloDigitos(c.cbu);
    const numero = soloDigitos(c.numeroCuenta);
    const match = existentes.find((e) => {
      const mismoCbu =
        cbu !== '' && e.cbu != null && soloDigitos(e.cbu) === cbu;
      const mismoNumero =
        numero !== '' && e.numero != null && soloDigitos(e.numero) === numero;
      return mismoCbu || mismoNumero;
    });

    return {
      numeroCuenta: c.numeroCuenta,
      cbu: c.cbu,
      tipo: c.tipo,
      moneda: monedaIso(c.moneda),
      saldoInicial: c.saldoInicial,
      saldoFinal: c.saldoFinal,
      cuadre: cuadreExtracto(c.saldoInicial, c.saldoFinal, c.movimientos),
      cuentaExistenteId: match?.id ?? null,
      cuentaExistenteNombre: match
        ? `${match.banco}${match.alias ? ` · ${match.alias}` : ''}`
        : null,
      movimientos: c.movimientos,
    };
  });
}

/* ───────────────────────────── server fns ──────────────────────────────── */

/**
 * Sube un PDF y lo deja listo para extraer. No lee nada y no arranca nada:
 * guarda el archivo en R2, crea el `documento` de respaldo y deja la fila en
 * `cargado`. Devuelve enseguida, así subir veinte extractos son veinte
 * subidas rápidas y no veinte esperas de dos minutos.
 *
 * La lectura la pide `encolarExtractos`: subir y extraer son dos pasos a
 * propósito, para poder juntar la tanda en varias idas y venidas, revisarla y
 * recién entonces disparar.
 */
export const subirExtracto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      fileName: z.string().min(1),
      mimeType: z
        .string()
        .regex(
          /^(application\/pdf|image\/(png|jpe?g|webp))$/i,
          'Formato no soportado: PDF o imagen'
        ),
      base64Data: z.string().min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const buffer = Buffer.from(ctx.data.base64Data, 'base64');
    if (buffer.length > MAX_BYTES)
      throw new Error('El archivo no puede superar los 20 MB');

    const [cli] = await db
      .select({ id: cliente.id })
      .from(cliente)
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .limit(1);
    if (!cli) throw new Error('Empresa no encontrada');

    const [rel] = await db
      .select({ credencialId: clienteCredencial.credencialId })
      .from(clienteCredencial)
      .where(eq(clienteCredencial.clienteId, ctx.data.clienteId))
      .limit(1);
    if (!rel)
      throw new Error('La empresa no tiene una credencial de ARCA asociada');

    const documentoId = randomUUID();
    const storageKey = r2.documentKey({
      orgId,
      clienteId: ctx.data.clienteId,
      documentId: documentoId,
      extension: r2.extensionFor(ctx.data.fileName, ctx.data.mimeType),
    });
    try {
      await r2.upload(storageKey, buffer, ctx.data.mimeType);
    } catch (error) {
      console.error('[extractos] falló la subida a R2', { storageKey, error });
      throw new Error(
        'No se pudo guardar el archivo. Probá de nuevo en unos minutos.'
      );
    }

    await db.insert(documento).values({
      id: documentoId,
      orgId,
      credencialId: rel.credencialId,
      clienteId: ctx.data.clienteId,
      nombre: ctx.data.fileName,
      storageKey,
      mimeType: ctx.data.mimeType,
      tamanoBytes: buffer.length,
      checksum: r2.checksum(buffer),
      fuente: 'manual',
    });

    const [fila] = await db
      .insert(extractoBancario)
      .values({
        orgId,
        clienteId: ctx.data.clienteId,
        documentoId,
        nombreArchivo: ctx.data.fileName,
        estado: 'cargado',
      })
      .returning({ id: extractoBancario.id });

    return { id: fila.id, documentoId };
  });

/**
 * Manda a leer lo que está cargado: pasa las filas a `pendiente` —lo único
 * que el worker toma— y lo despierta. Es el botón "Extraer".
 *
 * Sin `ids` manda toda la tanda cargada de la empresa, que es el caso normal;
 * con `ids`, solo esos.
 */
export const encolarExtractos = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      ids: z.array(z.string().uuid()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const filas = await db
      .update(extractoBancario)
      .set({ estado: 'pendiente', error: null })
      .where(
        and(
          eq(extractoBancario.orgId, orgId),
          eq(extractoBancario.clienteId, ctx.data.clienteId),
          eq(extractoBancario.estado, 'cargado'),
          ctx.data.ids?.length
            ? inArray(extractoBancario.id, ctx.data.ids)
            : undefined
        )
      )
      .returning({ id: extractoBancario.id });

    if (filas.length > 0) despertarWorkerExtractos();
    return { encolados: filas.length };
  });

/**
 * La cola de un cliente: lo que falta leer, lo leído esperando revisión y lo
 * que falló. La UI la repregunta mientras haya algo en curso.
 *
 * `extraccion` no viaja en esta lista —son cientos de movimientos por fila— y
 * se pide aparte al abrir uno.
 */
export const listarExtractos = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      /** Por defecto no trae los ya resueltos, que son historial. */
      incluirCerrados: z.boolean().default(false),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const abiertos = [
      'cargado',
      'pendiente',
      'procesando',
      'extraido',
      'error',
    ] as const;

    return await db
      .select({
        id: extractoBancario.id,
        nombreArchivo: extractoBancario.nombreArchivo,
        estado: extractoBancario.estado,
        banco: extractoBancario.banco,
        periodoDesde: extractoBancario.periodoDesde,
        periodoHasta: extractoBancario.periodoHasta,
        cuentasDetectadas: extractoBancario.cuentasDetectadas,
        movimientosDetectados: extractoBancario.movimientosDetectados,
        cuadra: extractoBancario.cuadra,
        error: extractoBancario.error,
        intentos: extractoBancario.intentos,
        documentoId: extractoBancario.documentoId,
        createdAt: extractoBancario.createdAt,
      })
      .from(extractoBancario)
      .where(
        and(
          eq(extractoBancario.orgId, orgId),
          eq(extractoBancario.clienteId, ctx.data.clienteId),
          ctx.data.incluirCerrados
            ? undefined
            : inArray(extractoBancario.estado, [...abiertos])
        )
      )
      .orderBy(desc(extractoBancario.createdAt));
  });

/**
 * La lectura completa de un extracto de la cola, para revisarlo: las cuentas
 * con sus movimientos, su cuadre y a qué cuenta bancaria del sistema
 * corresponde cada una.
 */
export const getExtracto = createServerFn({ method: 'GET' })
  .validator(z.object({ extractoId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [fila] = await db
      .select({
        id: extractoBancario.id,
        clienteId: extractoBancario.clienteId,
        nombreArchivo: extractoBancario.nombreArchivo,
        estado: extractoBancario.estado,
        documentoId: extractoBancario.documentoId,
        error: extractoBancario.error,
        extraccion: sql<
          LecturaGuardable['extraccion'] | null
        >`${extractoBancario.extraccion}`,
      })
      .from(extractoBancario)
      .where(
        and(
          eq(extractoBancario.id, ctx.data.extractoId),
          eq(extractoBancario.orgId, orgId)
        )
      )
      .limit(1);

    if (!fila) throw new Error('Extracto no encontrado');
    if (!fila.extraccion) {
      return { ...fila, cuentas: [] as CuentaRevisable[] };
    }

    const cuentas = await reconocerCuentas(
      fila.extraccion.cuentas,
      fila.clienteId,
      orgId
    );
    return { ...fila, cuentas };
  });

/** Vuelve a encolar una lectura que falló. */
export const reintentarExtracto = createServerFn({ method: 'POST' })
  .validator(z.object({ extractoId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [fila] = await db
      .update(extractoBancario)
      .set({ estado: 'pendiente', intentos: 0, error: null })
      .where(
        and(
          eq(extractoBancario.id, ctx.data.extractoId),
          eq(extractoBancario.orgId, orgId),
          inArray(extractoBancario.estado, ['error', 'extraido'])
        )
      )
      .returning({ id: extractoBancario.id });

    if (!fila) throw new Error('Extracto no encontrado o ya está en proceso');
    despertarWorkerExtractos();
    return { ok: true };
  });

/** Saca un extracto de la cola sin importarlo. El PDF queda en documentos. */
export const descartarExtracto = createServerFn({ method: 'POST' })
  .validator(z.object({ extractoId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [fila] = await db
      .update(extractoBancario)
      .set({ estado: 'descartado' })
      .where(
        and(
          eq(extractoBancario.id, ctx.data.extractoId),
          eq(extractoBancario.orgId, orgId)
        )
      )
      .returning({ id: extractoBancario.id });

    if (!fila) throw new Error('Extracto no encontrado');
    return { ok: true };
  });

/**
 * Persiste el extracto revisado: PDF a R2 + movimientos deduplicados (el
 * idExterno estable hace que reimportar el mismo extracto no duplique).
 *
 * Toma TODAS las cuentas del extracto de una vez. Las que ya existen vienen
 * con su id; las nuevas se crean acá con los datos que el PDF ya trae, así un
 * consolidado se importa completo sin cargar cuentas a mano.
 */
export const confirmarExtracto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      extractoId: z.string().uuid(),
      banco: z.string().min(1),
      cuentas: z
        .array(
          z.object({
            /** Cuenta ya existente; si es null, se crea con los datos de acá. */
            cuentaBancariaId: z.string().uuid().nullable(),
            numeroCuenta: z.string(),
            cbu: z.string(),
            tipo: z.enum(['caja_ahorro', 'cuenta_corriente', 'otra']),
            moneda: z.string(),
            movimientos: z
              .array(
                z.object({
                  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                  descripcion: z.string(),
                  importe: z.number().positive(),
                  direccion: z.enum(['ingreso', 'egreso']),
                  saldoPosterior: z.number().nullable().optional(),
                  categoria: z.enum(CATEGORIAS_MOVIMIENTO),
                })
              )
              .min(1),
          })
        )
        .min(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    // El PDF ya está en R2 y su `documento` creado desde la subida: acá solo
    // se leen los movimientos que la persona revisó.
    const [extracto] = await db
      .select({
        id: extractoBancario.id,
        clienteId: extractoBancario.clienteId,
        documentoId: extractoBancario.documentoId,
        estado: extractoBancario.estado,
      })
      .from(extractoBancario)
      .where(
        and(
          eq(extractoBancario.id, ctx.data.extractoId),
          eq(extractoBancario.orgId, orgId)
        )
      )
      .limit(1);

    if (!extracto) throw new Error('Extracto no encontrado');
    if (extracto.estado === 'confirmado')
      throw new Error('Este extracto ya fue importado');

    const clienteId = extracto.clienteId;
    const documentoId = extracto.documentoId;

    // Las cuentas ya existentes tienen que ser de la org y de esta empresa.
    const idsElegidos = ctx.data.cuentas
      .map((c) => c.cuentaBancariaId)
      .filter((id): id is string => id !== null);
    if (idsElegidos.length > 0) {
      const propias = await db
        .select({ id: cuentaBancaria.id })
        .from(cuentaBancaria)
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, clienteId),
            inArray(cuentaBancaria.id, idsElegidos)
          )
        );
      if (propias.length !== new Set(idsElegidos).size)
        throw new Error('Alguna cuenta bancaria no corresponde a esta empresa');
    }

    let importados = 0;
    let salteados = 0;
    let cuentasCreadas = 0;

    for (const cta of ctx.data.cuentas) {
      // La cuenta que falta se crea con lo que el PDF ya dijo.
      let cuentaId = cta.cuentaBancariaId;
      if (!cuentaId) {
        const cbu = cta.cbu.replace(/\D/g, '');
        try {
          const [creada] = await db
            .insert(cuentaBancaria)
            .values({
              orgId,
              clienteId: clienteId,
              banco: ctx.data.banco,
              tipo: cta.tipo,
              numero: cta.numeroCuenta || null,
              cbu: cbu.length === 22 ? cbu : null,
              moneda: monedaIso(cta.moneda),
            })
            .returning({ id: cuentaBancaria.id });
          cuentaId = creada.id;
          cuentasCreadas++;
        } catch (error) {
          // El CBU es único en todo el sistema: si ya está, es de otra
          // empresa y hay que decirlo con nombre y apellido.
          console.error('[extractos] no se pudo crear la cuenta', { error });
          throw new Error(
            `No se pudo crear la cuenta ${cta.numeroCuenta || ctx.data.banco}. Puede que su CBU ya esté registrado en otra empresa.`
          );
        }
      }

      // idExterno estable por movimiento (ocurrencia distingue repetidos).
      const vistos = new Map<string, number>();
      const filas = cta.movimientos.map((m) => {
        const base = idExternoDeMovimiento(m, 0).slice(0, -2);
        const n = vistos.get(base) ?? 0;
        vistos.set(base, n + 1);
        return { ...m, idExterno: idExternoDeMovimiento(m, n) };
      });

      // Dedup contra lo ya importado en esa cuenta.
      const yaImportados = await db
        .select({ idExterno: movimientoBancario.idExterno })
        .from(movimientoBancario)
        .where(
          and(
            eq(movimientoBancario.cuentaBancariaId, cuentaId),
            inArray(
              movimientoBancario.idExterno,
              filas.map((f) => f.idExterno)
            )
          )
        );
      const ya = new Set(yaImportados.map((e) => e.idExterno));
      const nuevos = filas.filter((f) => !ya.has(f.idExterno));

      if (nuevos.length > 0) {
        // Con quién fue cada movimiento: el CUIT de la descripción se asigna,
        // el importe exacto de una factura queda como sugerencia.
        const contrapartes = await resolverContrapartesDeCliente(
          clienteId,
          nuevos.map((m) => ({
            descripcion: m.descripcion || null,
            importe: m.importe,
            fecha: m.fecha,
            direccion: m.direccion,
            categoria: m.categoria,
          }))
        );
        await db.insert(movimientoBancario).values(
          nuevos.map((m, i) => ({
            cuentaBancariaId: cuentaId,
            fecha: m.fecha,
            importe: m.importe.toFixed(2),
            direccion: m.direccion,
            descripcion: m.descripcion || null,
            saldoPosterior:
              m.saldoPosterior != null && m.saldoPosterior !== 0
                ? m.saldoPosterior.toFixed(2)
                : null,
            idExterno: m.idExterno,
            categoria: m.categoria,
            categoriaFuente: 'sistema',
            fuente: 'import' as const,
            contraparteId: contrapartes[i].contraparteId,
            contraparteTexto: contrapartes[i].contraparteTexto,
            datosCrudos: {
              documentoId,
              ...(contrapartes[i].sugerida && {
                contraparteSugerida: contrapartes[i].sugerida,
              }),
            },
          }))
        );
      }

      importados += nuevos.length;
      salteados += filas.length - nuevos.length;
    }

    // La fila sale de la cola: ya no hay nada que revisar en ella.
    await db
      .update(extractoBancario)
      .set({ estado: 'confirmado' })
      .where(eq(extractoBancario.id, extracto.id));

    return {
      importados,
      salteados,
      cuentas: ctx.data.cuentas.length,
      cuentasCreadas,
      documentoId,
    };
  });

/** Recategorizar a mano un movimiento (pisa al clasificador). */
export const recategorizarMovimiento = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      movimientoId: z.string().uuid(),
      categoria: z.enum(CATEGORIAS_MOVIMIENTO),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [fila] = await db
      .update(movimientoBancario)
      .set({ categoria: ctx.data.categoria, categoriaFuente: 'manual' })
      .where(
        and(
          eq(movimientoBancario.id, ctx.data.movimientoId),
          inArray(
            movimientoBancario.cuentaBancariaId,
            db
              .select({ id: cuentaBancaria.id })
              .from(cuentaBancaria)
              .where(eq(cuentaBancaria.orgId, orgId))
          )
        )
      )
      .returning({ id: movimientoBancario.id });
    if (!fila) throw new Error('Movimiento no encontrado');
    return { ok: true };
  });

/** Excluir/incluir un movimiento de la comparación Banco vs Facturación. */
export const excluirMovimiento = createServerFn({ method: 'POST' })
  .validator(
    z.object({ movimientoId: z.string().uuid(), excluido: z.boolean() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [fila] = await db
      .update(movimientoBancario)
      .set({ excluido: ctx.data.excluido })
      .where(
        and(
          eq(movimientoBancario.id, ctx.data.movimientoId),
          inArray(
            movimientoBancario.cuentaBancariaId,
            db
              .select({ id: cuentaBancaria.id })
              .from(cuentaBancaria)
              .where(eq(cuentaBancaria.orgId, orgId))
          )
        )
      )
      .returning({ id: movimientoBancario.id });
    if (!fila) throw new Error('Movimiento no encontrado');
    return { ok: true };
  });

/** Movimiento de ajuste manual (el saldo contable no coincide al cierre). */
export const agregarMovimientoManual = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      cuentaBancariaId: z.string().uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      descripcion: z.string().min(1),
      importe: z.number().positive(),
      direccion: z.enum(['ingreso', 'egreso']),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const [cta] = await db
      .select({ id: cuentaBancaria.id })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.id, ctx.data.cuentaBancariaId),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .limit(1);
    if (!cta) throw new Error('Cuenta no encontrada');
    await db.insert(movimientoBancario).values({
      cuentaBancariaId: ctx.data.cuentaBancariaId,
      fecha: ctx.data.fecha,
      importe: ctx.data.importe.toFixed(2),
      direccion: ctx.data.direccion,
      descripcion: ctx.data.descripcion,
      categoria: 'varios',
      categoriaFuente: 'manual',
      fuente: 'manual' as const,
    });
    return { ok: true };
  });
